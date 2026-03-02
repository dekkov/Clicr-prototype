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

    return NextResponse.json({
        name: device.name,
        direction_mode: device.direction_mode ?? 'bidirectional',
    });
}

// POST — record a tap event
export async function POST(
    req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;

    // NOTE: This endpoint is public and has no server-side rate limiting.
    // For production use, configure rate limiting at the CDN/proxy layer (e.g. Vercel, Cloudflare).
    let body: { direction?: unknown; details?: unknown };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { direction } = body;

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

    const delta = (direction as 'IN' | 'OUT') === 'IN' ? 1 : -1;

    const { error: rpcError } = await supabaseAdmin.rpc('apply_occupancy_delta', {
        p_business_id: device.business_id,
        p_venue_id: area.venue_id,
        p_area_id: device.area_id,
        p_delta: delta,
        p_source: 'manual',
        p_device_id: device.id,
        p_gender: null,
        // null = no deduplication; each tap is a distinct event.
        // Client-side buttons are disabled during the request to prevent double-taps.
        p_idempotency_key: null,
    });

    if (rpcError) {
        console.error('[tap] RPC error:', rpcError);
        return NextResponse.json({ error: 'Failed to record tap' }, { status: 500 });
    }

    // Optionally create a scan record when client details are provided (IN taps only)
    if (direction === 'IN') {
        const details = body.details as { name?: string; dob?: string; gender?: string } | undefined;
        if (details && (details.name || details.dob || details.gender)) {
            const nameTrimmed = (details.name || '').trim();
            const spaceIdx = nameTrimmed.indexOf(' ');
            const firstName = spaceIdx >= 0 ? nameTrimmed.slice(0, spaceIdx) : nameTrimmed || null;
            const lastName = spaceIdx >= 0 ? nameTrimmed.slice(spaceIdx + 1) : null;
            const dobMs = details.dob ? new Date(details.dob).getTime() : NaN;
            const age = !isNaN(dobMs)
                ? Math.floor((Date.now() - dobMs) / 3.15576e10)
                : null;

            await supabaseAdmin.from('id_scans').insert({
                business_id: device.business_id,
                venue_id: area.venue_id,
                scan_result: 'ACCEPTED',
                age: age ?? null,
                sex: details.gender === 'M' ? 'M' : details.gender === 'F' ? 'F' : 'U',
                zip_code: null,
                first_name: firstName,
                last_name: lastName,
                dob: details.dob || null,
            }).then(({ error }) => {
                if (error) console.warn('[tap] scan record insert failed:', error.message);
            });
        }
    }

    return NextResponse.json({ success: true, delta });
}
