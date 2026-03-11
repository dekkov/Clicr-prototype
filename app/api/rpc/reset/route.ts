import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/api-auth';

export async function POST(request: Request) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { business_id } = await request.json();

        if (!business_id) {
            return NextResponse.json({ error: 'business_id required' }, { status: 400 });
        }

        const { data: membership } = await supabaseAdmin
            .from('business_members')
            .select('role')
            .eq('user_id', user.id)
            .eq('business_id', business_id)
            .limit(1)
            .single();

        if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
            return NextResponse.json({ error: 'Forbidden: ADMIN role required' }, { status: 403 });
        }

        const resetAt = new Date().toISOString();

        const { data: areas, error: areasError } = await supabaseAdmin
            .from('areas')
            .select('id, current_occupancy, venue_id')
            .eq('business_id', business_id);

        if (areasError) throw areasError;

        const results = [];
        for (const area of (areas || [])) {
            const currentVal = area.current_occupancy || 0;

            if (currentVal !== 0) {
                const { error: eventError } = await supabaseAdmin
                    .from('occupancy_events')
                    .insert({
                        business_id,
                        venue_id: area.venue_id,
                        area_id: area.id,
                        delta: -currentVal,
                        flow_type: 'OUT',
                        event_type: 'RESET',
                        source: 'reset',
                        user_id: user.id,
                    });

                if (eventError) console.error('[reset] Event error:', eventError.message);
            }

            results.push({ areaId: area.id, previousOccupancy: currentVal });
        }

        if (areas && areas.length > 0) {
            const areaIds = areas.map((a: any) => a.id);
            await supabaseAdmin
                .from('areas')
                .update({ current_occupancy: 0, last_reset_at: resetAt })
                .in('id', areaIds);
        }

        await supabaseAdmin
            .from('venues')
            .update({ current_occupancy: 0, last_reset_at: resetAt })
            .eq('business_id', business_id);

        // Note: device/clicr current_count is not a DB column — it's computed client-side.
        // The client's resetCounts() optimistic update already zeros current_count in UI state.

        await supabaseAdmin
            .from('businesses')
            .update({ last_reset_at: resetAt })
            .eq('id', business_id);

        return NextResponse.json({ success: true, areasReset: (areas || []).length, resetAt, results });

    } catch (e: any) {
        console.error('[reset] API failed:', e instanceof Error ? e.message : 'Unknown error');
        return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
    }
}
