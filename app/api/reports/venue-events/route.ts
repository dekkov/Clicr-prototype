import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get('venueId');
    const from = searchParams.get('from'); // ISO string
    const to = searchParams.get('to');     // ISO string

    if (!venueId || !from || !to) {
        return NextResponse.json({ error: 'venueId, from, to are required' }, { status: 400 });
    }

    const [{ data: events, error: evErr }, { data: scans }] = await Promise.all([
        supabaseAdmin
            .from('occupancy_events')
            .select('*')
            .eq('venue_id', venueId)
            .gte('created_at', from)
            .lte('created_at', to)
            .order('created_at', { ascending: true }),
        supabaseAdmin
            .from('id_scans')
            .select('*')
            .eq('venue_id', venueId)
            .gte('created_at', from)
            .lte('created_at', to)
            .order('created_at', { ascending: true }),
    ]);

    if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 });

    const mappedEvents = (events ?? []).map((e: any) => ({
        id: e.id,
        venue_id: e.venue_id,
        area_id: e.area_id || '',
        clicr_id: e.device_id || '',
        user_id: e.user_id || 'system',
        business_id: e.business_id,
        timestamp: new Date(e.created_at ?? e.timestamp).getTime(),
        delta: e.delta,
        flow_type: e.flow_type,
        event_type: e.event_type,
        gender: e.gender ?? undefined,
    }));

    const mappedScans = (scans ?? []).map((s: any) => ({
        ...s,
        timestamp: new Date(s.created_at).getTime(),
    }));

    return NextResponse.json({ events: mappedEvents, scans: mappedScans });
}
