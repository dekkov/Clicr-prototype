import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export type HeatmapData = Record<number, Record<number, number>>;

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!rateLimit(`heatmap:${user.id}`, 20, 60_000)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { data: membership, error: memberError } = await supabaseAdmin
        .from('business_members')
        .select('business_id')
        .eq('user_id', user.id)
        .single();

    if (memberError || !membership) {
        return NextResponse.json({ error: 'No business found' }, { status: 403 });
    }

    const { data: business } = await supabaseAdmin
        .from('businesses')
        .select('last_reset_at')
        .eq('id', membership.business_id)
        .single();

    let query = supabaseAdmin
        .from('occupancy_events')
        .select('created_at')
        .eq('business_id', membership.business_id)
        .gt('delta', 0);

    if (business?.last_reset_at) {
        query = query.gte('created_at', business.last_reset_at);
    }

    const { data: events, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const heatmap: HeatmapData = {};
    for (const e of events ?? []) {
        const d = new Date(e.created_at);
        const day = d.getDay();
        const hour = d.getHours();
        if (!heatmap[day]) heatmap[day] = {};
        heatmap[day][hour] = (heatmap[day][hour] ?? 0) + 1;
    }

    return NextResponse.json(
        { heatmap },
        { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' } }
    );
}
