import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
    try {
        const { business_id, venue_id, area_id, start_ts, end_ts } = await request.json();

        if (!business_id) {
            return NextResponse.json({ error: 'Business ID required' }, { status: 400 });
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

        const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('get_traffic_totals', {
            p_business_id: resolvedBusinessId,
            p_venue_id: venue_id || null,
            p_area_id: area_id || null,
            p_start_ts: start,
            p_end_ts: end
        });

        if (rpcError) {
            console.error("RPC Error", rpcError);
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
        console.error("Traffic API Error", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
