import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Initialize Admin Client
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { business_id, scope, target_id, user_id } = body;

        console.log(`[RESET] Request received`, { business_id, scope, target_id });

        if (!business_id || !scope || !target_id) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // 1. Resolve Areas to Reset
        let areasToReset: string[] = [];

        if (scope === 'AREA') {
            areasToReset = [target_id];
        } else if (scope === 'VENUE') {
            const { data: areas, error } = await supabaseAdmin
                .from('areas')
                .select('id')
                .eq('venue_id', target_id);

            if (error) throw error;
            areasToReset = areas.map(a => a.id);
        } else if (scope === 'BUSINESS') {
            const { data: areas, error } = await supabaseAdmin
                .from('areas')
                .select('id')
                .eq('business_id', business_id);

            if (error) throw error;
            areasToReset = areas.map(a => a.id);
        }

        if (areasToReset.length === 0) {
            return NextResponse.json({ message: "No areas found to reset" });
        }

        console.log(`[RESET] Resetting ${areasToReset.length} areas:`, areasToReset);

        // 2. Perform Reset Transactionally (or pseudo-transactionally)
        // We iterate because we need to know the 'current_occupancy' to calculate the negative delta for the event log
        const results = [];

        for (const areaId of areasToReset) {
            // A. Get Current Occupancy
            const { data: area } = await supabaseAdmin
                .from('areas')
                .select('current_occupancy, venue_id')
                .eq('id', areaId)
                .single();

            const currentVal = area?.current_occupancy || 0;

            if (currentVal !== 0) {
                // B. Insert Reset Event (Audit Trail)
                const { error: eventError } = await supabaseAdmin
                    .from('occupancy_events')
                    .insert({
                        business_id,
                        venue_id: area?.venue_id,
                        area_id: areaId,
                        delta: -currentVal,
                        flow_type: 'OUT',
                        event_type: 'RESET',
                        source: 'reset',
                        user_id: user_id || null,
                    });

                if (eventError) console.error("Error logging reset event", eventError);
            }

            // C. Zero the area's count (source of truth)
            const { error: areaError } = await supabaseAdmin
                .from('areas')
                .update({
                    current_occupancy: 0,
                    last_reset_at: new Date().toISOString()
                })
                .eq('id', areaId);

            if (areaError) console.error("Error updating area", areaError);

            results.push({ areaId, success: !areaError });
        }

        return NextResponse.json({ success: true, results });

    } catch (e: any) {
        console.error("Reset API Failed", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
