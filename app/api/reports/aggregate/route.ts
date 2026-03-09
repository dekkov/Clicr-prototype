import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/api-auth';

export async function POST(req: Request) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { businessId, date } = await req.json();

        const { data: membership } = await supabaseAdmin
            .from('business_members')
            .select('id')
            .eq('user_id', user.id)
            .eq('business_id', businessId)
            .limit(1)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 1. Fetch all raw events for the day
        // In production, use proper timezone framing (start of day to end of day in business TZ)
        const startOfDay = `${date}T00:00:00`;
        const endOfDay = `${date}T23:59:59`;

        const { data: events, error } = await supabaseAdmin
            .from('occupancy_events')
            .select('*')
            .eq('business_id', businessId)
            .gte('timestamp', startOfDay)
            .lte('timestamp', endOfDay)
            .order('timestamp', { ascending: true });

        if (error) throw error;
        if (!events || events.length === 0) {
            return NextResponse.json({ message: 'No events found for date', count: 0 });
        }

        // 2. Compute Aggregates
        let peakOccupancy = 0;
        let currentOccupancy = 0;
        let totalEntries = 0;
        let totalExits = 0;

        // Hourly buckets (0-23)
        const hourlyTraffic = new Array(24).fill(0).map(() => ({ entries: 0, exits: 0, peak: 0 }));

        events.forEach(event => {
            const hour = new Date(event.timestamp).getHours();

            if (event.direction === 'IN' || event.flow_type === 'IN') {
                currentOccupancy += event.delta;
                totalEntries += event.delta;
                hourlyTraffic[hour].entries += event.delta;
            } else {
                currentOccupancy -= Math.abs(event.delta);
                totalExits += Math.abs(event.delta);
                hourlyTraffic[hour].exits += Math.abs(event.delta);
            }

            if (currentOccupancy > peakOccupancy) peakOccupancy = currentOccupancy;

            // Update hourly peak
            if (currentOccupancy > hourlyTraffic[hour].peak) {
                hourlyTraffic[hour].peak = currentOccupancy;
            }
        });

        // 3. Store Result (Upsert into a reporting table - schema to be added)
        // For now, we return the computed JSON which the frontend can cache or display
        const reportPayload = {
            date,
            generated_at: new Date().toISOString(),
            metrics: {
                total_entries: totalEntries,
                total_exits: totalExits,
                peak_occupancy: peakOccupancy,
                closing_occupancy: currentOccupancy
            },
            hourly_breakdown: hourlyTraffic.map((h, i) => ({
                hour: i,
                ...h
            }))
        };

        return NextResponse.json({ success: true, report: reportPayload });

    } catch (error) {
        console.error('[REPORTING_JOB_ERROR]', error instanceof Error ? error.message : 'Unknown error');
        return NextResponse.json({ success: false, error: 'Aggregation failed' }, { status: 500 });
    }
}
