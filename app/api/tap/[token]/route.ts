import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

async function lookupDevice(token: string) {
    const { data, error } = await supabaseAdmin
        .from('devices')
        .select('id, name, area_id, business_id, direction_mode, button_config')
        .eq('button_config->>tap_token', token)
        .is('deleted_at', null)
        .single();

    if (error || !data) return null;
    return data;
}

// GET — return device info for the tap page to display
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;
    const device = await lookupDevice(token);
    if (!device) {
        return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
    }

    // Look up venue_id from the area
    const { data: area } = await supabaseAdmin
        .from('areas')
        .select('venue_id')
        .eq('id', device.area_id)
        .single();

    return NextResponse.json({
        name: device.name,
        direction_mode: device.direction_mode ?? 'bidirectional',
        venue_id: area?.venue_id ?? null,
    });
}

// POST — record a tap event
export async function POST(
    req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;
    const { direction } = await req.json() as { direction: 'IN' | 'OUT' };

    if (direction !== 'IN' && direction !== 'OUT') {
        return NextResponse.json({ error: 'direction must be IN or OUT' }, { status: 400 });
    }

    const device = await lookupDevice(token);
    if (!device) {
        return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
    }

    // Look up venue_id from the area
    const { data: area } = await supabaseAdmin
        .from('areas')
        .select('venue_id')
        .eq('id', device.area_id)
        .single();

    if (!area?.venue_id) {
        return NextResponse.json({ error: 'Device not assigned to a venue' }, { status: 422 });
    }

    const delta = direction === 'IN' ? 1 : -1;

    const { error: rpcError } = await supabaseAdmin.rpc('apply_occupancy_delta', {
        p_business_id: device.business_id,
        p_venue_id: area.venue_id,
        p_area_id: device.area_id,
        p_delta: delta,
        p_source: 'manual',
        p_device_id: null,
        p_gender: null,
        p_idempotency_key: `tap-${token}-${Date.now()}`,
    });

    if (rpcError) {
        console.error('[tap] RPC error:', rpcError);
        return NextResponse.json({ error: 'Failed to record tap' }, { status: 500 });
    }

    return NextResponse.json({ success: true, delta });
}
