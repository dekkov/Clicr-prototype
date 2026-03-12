import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/api-auth';

export async function POST(request: Request) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { business_id, venue_id, area_id, start_ts, end_ts } = await request.json();

        if (!business_id) {
            return NextResponse.json({ error: 'Business ID required' }, { status: 400 });
        }

        // Verify user is a member of the requested business
        const { data: membership } = await supabaseAdmin
            .from('business_members')
            .select('id')
            .eq('user_id', user.id)
            .eq('business_id', business_id)
            .limit(1)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Validate Timestamps (Required for correctness)
        let start = start_ts ? new Date(start_ts).toISOString() : new Date(Date.now() - 86400000).toISOString();
        const end = end_ts ? new Date(end_ts).toISOString() : new Date().toISOString();

        // Resolve the area's real business_id and clamp start to last_reset_at.
        // The client may send a stale/mismatched business_id; the area table is authoritative.
        let resolvedBusinessId = business_id;
        try {
            let query = supabaseAdmin.from('areas').select('business_id, last_reset_at');
            if (area_id) query = query.eq('id', area_id);
            else if (venue_id) query = query.eq('venue_id', venue_id);
            else query = query.eq('business_id', business_id);
            const { data: areaRows } = await query;
            if (areaRows?.length) {
                resolvedBusinessId = areaRows[0].business_id || business_id;
                const latestReset = Math.max(0, ...areaRows.map((a: any) => a.last_reset_at ? new Date(a.last_reset_at).getTime() : 0));
                if (latestReset && new Date(latestReset).toISOString() > start) {
                    start = new Date(latestReset).toISOString();
                }
            }
        } catch { /* best-effort — fall through with client-provided business_id */ }

        // Venue-direct query (venue counter with no area): only events where area_id IS NULL.
        // The generic RPC includes all events for the venue (area + venue-direct) which over-counts.
        if (venue_id && !area_id) {
            let q = supabaseAdmin
                .from('occupancy_events')
                .select('flow_type, delta')
                .eq('business_id', resolvedBusinessId)
                .eq('venue_id', venue_id)
                .is('area_id', null)
                .neq('event_type', 'RESET')
                .gte('created_at', start)
                .lte('created_at', end);

            const { data: rows, error: qErr } = await q;
            if (qErr) throw new Error(qErr.message);

            const totalIn = (rows ?? []).filter(r => r.flow_type === 'IN').reduce((s, r) => s + Math.abs(r.delta), 0);
            const totalOut = (rows ?? []).filter(r => r.flow_type === 'OUT').reduce((s, r) => s + Math.abs(r.delta), 0);
            return NextResponse.json({
                total_in: totalIn,
                total_out: totalOut,
                net_delta: totalIn - totalOut,
                event_count: (rows ?? []).length,
                period: { start, end },
                source: 'venue_direct'
            });
        }

        const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('get_traffic_totals', {
            p_business_id: resolvedBusinessId,
            p_venue_id: venue_id || null,
            p_area_id: area_id || null,
            p_start_ts: start,
            p_end_ts: end
        });

        if (rpcError) {
            console.error("[traffic] RPC error:", rpcError.message);
            throw new Error(rpcError.message);
        }

        if (rpcData && rpcData.length > 0) {
            const row = rpcData[0];
            return NextResponse.json({
                total_in: Number(row.total_in || 0),
                total_out: Number(row.total_out || 0),
                net_delta: Number(row.net_delta || 0),
                event_count: Number(row.event_count || 0),
                period: { start, end },
                source: 'rpc_core'
            });
        }

        return NextResponse.json({
            total_in: 0,
            total_out: 0,
            net_delta: 0,
            event_count: 0,
            source: 'rpc_core_empty'
        });

    } catch (e) {
        console.error("[traffic] API error:", e instanceof Error ? e.message : "Unknown error");
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
