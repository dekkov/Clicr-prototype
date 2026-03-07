import { NextResponse } from 'next/server';
import { CountEvent, IDScanEvent, User, Clicr, Area, Venue } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createInitialDBData, isUserBanned, type DBData } from '@/lib/sync-data';

export const dynamic = 'force-dynamic';

async function hydrateData(data: DBData): Promise<DBData> {
    data.business = null;

    try {
        const [
            { data: sbVenues },
            { data: sbAreas },
        ] = await Promise.all([
            supabaseAdmin.from('venues').select('*'),
            supabaseAdmin.from('areas').select('*'),
        ]);

        if (sbVenues) {
            data.venues = sbVenues.map((v: any) => ({
                id: v.id,
                business_id: v.business_id,
                name: v.name,
                address_line1: v.address_line1 || undefined,
                address_line2: v.address_line2 || undefined,
                city: v.city || undefined,
                state: v.state || undefined,
                postal_code: v.postal_code || undefined,
                country: v.country || 'US',
                timezone: v.timezone || 'UTC',
                status: v.status || 'ACTIVE',
                capacity_enforcement_mode: v.capacity_enforcement_mode || 'WARN_ONLY',
                total_capacity: v.capacity_max || undefined,
                current_occupancy: v.current_occupancy ?? 0,
                last_reset_at: v.last_reset_at || undefined,
                created_at: v.created_at || new Date().toISOString(),
                updated_at: v.updated_at || new Date().toISOString(),
            }));
        }

        if (sbAreas) {
            data.areas = sbAreas.map((a: any) => ({
                id: a.id,
                venue_id: a.venue_id,
                business_id: a.business_id,
                name: a.name,
                default_capacity: a.capacity_max,
                parent_area_id: a.parent_area_id,
                current_occupancy: a.current_occupancy ?? 0,
                last_reset_at: a.last_reset_at || undefined,
                area_type: a.area_type || 'MAIN',
                counting_mode: a.counting_mode || 'MANUAL',
                is_active: a.is_active ?? true,
                shift_mode: a.shift_mode || 'MANUAL',
                auto_reset_time: a.auto_reset_time || undefined,
                auto_reset_timezone: a.auto_reset_timezone || undefined,
                created_at: a.created_at || new Date().toISOString(),
                updated_at: a.updated_at || new Date().toISOString()
            }));
        }

        const { data: occEvents } = await supabaseAdmin
            .from('occupancy_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (occEvents) {
            data.events = occEvents.map((e: any) => ({
                id: e.id,
                venue_id: e.venue_id,
                area_id: e.area_id || '',
                clicr_id: e.device_id || '',
                user_id: 'system',
                business_id: e.business_id,
                timestamp: new Date(e.created_at ?? e.timestamp).getTime(),
                delta: e.delta,
                flow_type: e.flow_type as any,
                event_type: e.event_type as any,
                gender: e.gender ?? undefined,
            }));
        }

        const { data: scans, error: scanError } = await supabaseAdmin
            .from('id_scans')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (!scanError && scans) {
            data.scanEvents = scans.map((s: any) => ({
                ...s,
                timestamp: new Date(s.created_at).getTime()
            })) as IDScanEvent[];
        }

        const { data: devices, error: devError } = await supabaseAdmin
            .from('devices')
            .select('*');

        if (!devError && devices) {
            devices.forEach((d: any) => {
                const exists = data.clicrs.find(c => c.id === d.id);
                if (!exists && d.device_type === 'COUNTER') {
                    data.clicrs.push({
                        id: d.id,
                        area_id: d.area_id || null,
                        venue_id: d.venue_id || undefined,
                        is_venue_counter: d.is_venue_counter ?? false,
                        name: d.name,
                        current_count: 0,
                        flow_mode: d.direction_mode === 'in_only' ? 'IN_ONLY' : d.direction_mode === 'out_only' ? 'OUT_ONLY' : 'BIDIRECTIONAL',
                        active: d.status === 'ACTIVE',
                        button_config: d.button_config || {
                            left: { label: 'IN', delta: 1, color: 'green' },
                            right: { label: 'OUT', delta: -1, color: 'red' }
                        }
                    });
                }
            });

            data.clicrs = data.clicrs.map((c: Clicr) => {
                const match = devices.find((d: any) => d.id === c.id);
                if (match) {
                    return {
                        ...c,
                        name: match.name,
                        area_id: match.area_id ?? null,
                        venue_id: match.venue_id || c.venue_id,
                        is_venue_counter: match.is_venue_counter ?? c.is_venue_counter ?? false,
                        button_config: match.button_config || c.button_config
                    };
                }
                return c;
            });
        }
    } catch (err) {
        console.error("[API] Supabase Hydration Failed:", err);
    }
    return data;
}

async function buildSyncResponse(
    userId: string,
    userEmail: string,
    requestedBusinessId: string | null,
    requestedVenueId: string | null
): Promise<Record<string, any>> {
    const data = createInitialDBData();
    const hydrated = await hydrateData(data);

    let user: User = {
        id: userId,
        name: userEmail.split('@')[0],
        email: userEmail,
        role: 'OWNER',
        assigned_venue_ids: [],
        assigned_area_ids: [],
        assigned_clicr_ids: []
    };

    try {
        await supabaseAdmin.from('profiles').upsert({
            id: userId,
            email: userEmail,
            role: 'OWNER',
            full_name: userEmail.split('@')[0]
        });
    } catch { /* ignore */ }

    let allBusinesses: any[] = [];
    let activeBizId: string | null = null;
    let allBizIds: string[] = [];

    const { data: memberships } = await supabaseAdmin
        .from('business_members')
        .select('business_id, role, assigned_venue_ids, assigned_area_ids')
        .eq('user_id', userId);

    if (memberships && memberships.length > 0) {
        allBizIds = memberships.map((m: any) => m.business_id);

        if (requestedBusinessId && allBizIds.includes(requestedBusinessId)) {
            activeBizId = requestedBusinessId;
        } else if (allBizIds.length === 1) {
            activeBizId = allBizIds[0];
        }

        const { data: bizRows } = await supabaseAdmin
            .from('businesses')
            .select('*')
            .in('id', allBizIds);

        if (bizRows) {
            allBusinesses = bizRows.map((b: any) => ({
                id: b.id,
                name: b.name,
                timezone: b.timezone || 'UTC',
                settings: b.settings || { refresh_interval_sec: 5, capacity_thresholds: [80, 90, 100], reset_rule: 'MANUAL' }
            }));
        }

        const activeBiz = allBusinesses.find(b => b.id === activeBizId);
        if (activeBiz) hydrated.business = activeBiz;

        const activeMembership = memberships.find((m: any) => m.business_id === activeBizId) || memberships[0];
        const memRole = (activeMembership?.role || 'OWNER') as string;
        const memVenueIds = (activeMembership?.assigned_venue_ids || []) as string[];
        const memAreaIds = (activeMembership?.assigned_area_ids || []) as string[];

        user.role = memRole as User['role'];

        const bizVenueIds = hydrated.venues.filter(v => v.business_id === (activeBizId || activeMembership?.business_id)).map(v => v.id);

        if (memRole === 'OWNER' || memRole === 'ADMIN' || memRole === 'ANALYST') {
            user.assigned_venue_ids = bizVenueIds;
            user.assigned_area_ids = hydrated.areas.filter(a => bizVenueIds.includes(a.venue_id)).map(a => a.id);
        } else if (memRole === 'MANAGER') {
            user.assigned_venue_ids = memVenueIds.length > 0
                ? memVenueIds.filter((id: string) => bizVenueIds.includes(id))
                : bizVenueIds;
            user.assigned_area_ids = hydrated.areas.filter(a => user.assigned_venue_ids.includes(a.venue_id)).map(a => a.id);
        } else {
            user.assigned_area_ids = memAreaIds;
            user.assigned_venue_ids = memAreaIds.length > 0
                ? [...new Set(hydrated.areas.filter(a => memAreaIds.includes(a.id)).map(a => a.venue_id))]
                : [];
        }
    }

    const bizVenuesForActive = activeBizId
        ? hydrated.venues.filter(v => v.business_id === activeBizId).map(v => v.id)
        : hydrated.venues.filter(v => allBizIds.includes(v.business_id)).map(v => v.id);

    let visibleVenueIds: string[];
    let visibleAreaIds: string[];

    if (user.role === 'STAFF') {
        visibleAreaIds = user.assigned_area_ids || [];
        visibleVenueIds = visibleAreaIds.length > 0
            ? [...new Set(hydrated.areas.filter(a => visibleAreaIds.includes(a.id)).map(a => a.venue_id))]
            : [];
    } else if (user.role === 'MANAGER' && (user.assigned_venue_ids?.length ?? 0) > 0) {
        visibleVenueIds = user.assigned_venue_ids.filter((id: string) => bizVenuesForActive.includes(id));
        if (requestedVenueId && visibleVenueIds.includes(requestedVenueId)) {
            visibleVenueIds = [requestedVenueId];
        }
        visibleAreaIds = hydrated.areas.filter(a => visibleVenueIds.includes(a.venue_id)).map(a => a.id);
    } else {
        visibleVenueIds = bizVenuesForActive;
        visibleAreaIds = hydrated.areas.filter(a => visibleVenueIds.includes(a.venue_id)).map(a => a.id);
    }

    const filteredVenues = hydrated.venues.filter(v => visibleVenueIds.includes(v.id));
    const filteredAreas = hydrated.areas.filter(a => visibleAreaIds.includes(a.id));
    const filteredClicrs = hydrated.clicrs.filter(c =>
        (c.is_venue_counter && c.venue_id && visibleVenueIds.includes(c.venue_id)) ||
        (c.area_id && visibleAreaIds.includes(c.area_id))
    );

    const latestResetAt = Math.max(0, ...filteredAreas.map(a => a.last_reset_at ? new Date(a.last_reset_at).getTime() : 0));
    const filteredEvents = hydrated.events.filter(e =>
        visibleVenueIds.includes(e.venue_id) && (!latestResetAt || e.timestamp > latestResetAt)
    );
    const filteredScans = hydrated.scanEvents.filter(s =>
        visibleVenueIds.includes(s.venue_id) && (!latestResetAt || s.timestamp > latestResetAt)
    );

    const memberUserIds = new Set<string>([userId]);
    if (allBizIds.length > 0) {
        const { data: members } = await supabaseAdmin
            .from('business_members')
            .select('user_id, assigned_venue_ids, assigned_area_ids')
            .in('business_id', allBizIds);
        (members || []).forEach((m: any) => memberUserIds.add(m.user_id));
    }

    const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, email, full_name')
        .in('id', [...memberUserIds]);

    const usersList: User[] = (profiles || []).map((p: any) => ({
        id: p.id,
        name: p.full_name || p.email?.split('@')[0] || 'Unknown',
        email: p.email || '',
        role: p.id === userId ? user.role : 'STAFF',
        assigned_venue_ids: [],
        assigned_area_ids: [],
        assigned_clicr_ids: []
    }));

    const filteredUsers = usersList;

    let teamMemberCount = 0;
    if (activeBizId) {
        const { count } = await supabaseAdmin
            .from('business_members')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', activeBizId);
        teamMemberCount = count ?? 0;
    }

    return {
        ...hydrated,
        businesses: allBusinesses,
        venues: filteredVenues,
        areas: filteredAreas,
        clicrs: filteredClicrs,
        events: filteredEvents,
        scanEvents: filteredScans,
        users: filteredUsers,
        currentUser: user,
        teamMemberCount
    };
}

export async function GET(request: Request) {
    const userId = request.headers.get('x-user-id');
    const userEmail = request.headers.get('x-user-email');
    const url = new URL(request.url);
    const requestedBusinessId = url.searchParams.get('businessId');
    const requestedVenueId = url.searchParams.get('venueId');

    if (userId && userEmail) {
        const response = await buildSyncResponse(userId, userEmail, requestedBusinessId, requestedVenueId);
        return NextResponse.json(response);
    }

    const data = createInitialDBData();
    const hydrated = await hydrateData(data);
    return NextResponse.json({ ...hydrated, businesses: [] });
}

export async function POST(request: Request) {
    const body = await request.json();
    const { action, payload } = body;
    const userId = request.headers.get('x-user-id');
    const userEmail = request.headers.get('x-user-email') || '';

    const getBusinessId = async () => {
        if (!userId) return null;
        const { data: m } = await supabaseAdmin.from('business_members').select('business_id').eq('user_id', userId).limit(1).single();
        return m?.business_id ?? null;
    };

    try {
        switch (action) {
            case 'RECORD_EVENT': {
                const event = payload as CountEvent;
                const hasAreaId = event.area_id && typeof event.area_id === 'string';
                const hasVenueId = (event as any).venue_id && typeof (event as any).venue_id === 'string';
                if (!hasAreaId && !hasVenueId) {
                    return NextResponse.json({ error: 'area_id or venue_id is required for RECORD_EVENT' }, { status: 400 });
                }
                const banned = await isUserBanned(supabaseAdmin, event.user_id, event.venue_id);
                if (banned) return NextResponse.json({ error: 'User is banned' }, { status: 403 });

                let eventBizId = event.business_id;
                if (!eventBizId && userId) eventBizId = await getBusinessId();
                if (!eventBizId) return NextResponse.json({ error: 'Could not resolve business_id for event' }, { status: 400 });

                if (hasAreaId) {
                    const { data: areaRow, error: areaErr } = await supabaseAdmin
                        .from('areas')
                        .select('id, business_id')
                        .eq('id', event.area_id!)
                        .single();
                    if (areaErr || !areaRow) {
                        return NextResponse.json({ error: 'Area not found or invalid area_id' }, { status: 400 });
                    }
                    if (areaRow.business_id !== eventBizId) {
                        return NextResponse.json({ error: 'Area does not belong to your business' }, { status: 403 });
                    }
                }

                const deviceId = (event as any).clicr_id;
                const rpcParams: Record<string, unknown> = {
                    p_delta: event.delta,
                    p_source: event.event_type === 'SCAN' ? 'scan' : event.event_type === 'AUTO_SCAN' ? 'auto_scan' : 'manual',
                    p_device_id: deviceId || null,
                    p_gender: event.gender || null,
                    p_idempotency_key: event.idempotency_key || null,
                };
                if (hasAreaId) {
                    rpcParams.p_area_id = event.area_id;
                } else {
                    rpcParams.p_venue_id = (event as any).venue_id;
                }
                console.log('[sync] RECORD_EVENT RPC params:', JSON.stringify(rpcParams));
                const { error: rpcError } = await supabaseAdmin.rpc('apply_occupancy_delta', rpcParams);
                if (rpcError) {
                    console.error('[sync] RECORD_EVENT RPC error:', JSON.stringify(rpcError));
                    return NextResponse.json({ error: rpcError.message || 'Failed to record event', details: rpcError }, { status: 500 });
                }
                break;
            }

            case 'RECORD_SCAN': {
                const scan = payload as IDScanEvent;
                let scanBizId: string | null = null;
                if (userId) scanBizId = await getBusinessId();
                try {
                    await supabaseAdmin.from('id_scans').insert({
                        business_id: scanBizId || scan.business_id,
                        venue_id: scan.venue_id,
                        scan_result: scan.scan_result,
                        age: scan.age,
                        sex: scan.sex,
                        zip_code: scan.zip_code,
                        first_name: scan.first_name,
                        last_name: scan.last_name,
                        dob: scan.dob,
                        id_number_last4: scan.id_number_last4,
                        issuing_state: scan.issuing_state,
                        city: scan.city,
                        shift_id: (scan as any).shift_id || null,
                        identity_token_hash: (scan as any).identity_token_hash || null
                    });
                } catch (e) { console.error("Scan Persistence Failed", e); }
                break;
            }

            case 'RESET_COUNTS': {
                const resetBizId = await getBusinessId();
                if (resetBizId) {
                    let areasToReset: string[] = [];
                    if (body.venue_id) {
                        const { data: venueAreas } = await supabaseAdmin
                            .from('areas')
                            .select('id')
                            .eq('venue_id', body.venue_id)
                            .eq('business_id', resetBizId);
                        areasToReset = (venueAreas || []).map((a: any) => a.id);
                    } else {
                        const { data: bizAreas } = await supabaseAdmin
                            .from('areas')
                            .select('id')
                            .eq('business_id', resetBizId);
                        areasToReset = (bizAreas || []).map((a: any) => a.id);
                    }

                    for (const areaId of areasToReset) {
                        const { data: area, error: areaReadErr } = await supabaseAdmin
                            .from('areas')
                            .select('current_occupancy, venue_id')
                            .eq('id', areaId)
                            .single();

                        if (areaReadErr) continue;

                        const currentVal = area?.current_occupancy ?? 0;
                        if (currentVal !== 0) {
                            await supabaseAdmin.from('occupancy_events').insert({
                                business_id: resetBizId,
                                venue_id: area?.venue_id || null,
                                area_id: areaId,
                                delta: -currentVal,
                                flow_type: 'OUT',
                                event_type: 'RESET',
                                source: 'reset',
                                user_id: userId || null,
                            });
                        }

                        await supabaseAdmin.from('areas')
                            .update({ current_occupancy: 0, last_reset_at: new Date().toISOString() })
                            .eq('id', areaId);
                    }
                }
                break;
            }

            case 'START_SHIFT': {
                const { venue_id, area_id, business_id } = payload as { venue_id: string; area_id?: string; business_id: string };
                if (!userId || !venue_id || !business_id) return NextResponse.json({ error: 'Missing user or venue' }, { status: 400 });
                const { data: shift, error: shiftErr } = await supabaseAdmin.from('shifts').insert({
                    user_id: userId,
                    business_id,
                    venue_id,
                    area_id: area_id || null,
                }).select('id').single();
                if (shiftErr) throw shiftErr;
                return NextResponse.json({ shift_id: shift?.id });
            }

            case 'END_SHIFT': {
                const { shift_id } = payload as { shift_id: string };
                if (!userId || !shift_id) return NextResponse.json({ error: 'Missing shift_id' }, { status: 400 });
                const { error: endErr } = await supabaseAdmin.from('shifts')
                    .update({ ended_at: new Date().toISOString() })
                    .eq('id', shift_id)
                    .eq('user_id', userId);
                if (endErr) throw endErr;
                return NextResponse.json({ success: true });
            }

            case 'RECORD_TURNAROUND': {
                const turnaround = payload as any;
                let bizId = turnaround.business_id;
                if (!bizId && userId) bizId = await getBusinessId();
                if (!bizId) return NextResponse.json({ error: 'Could not resolve business_id' }, { status: 400 });
                await supabaseAdmin.from('turnarounds').insert({
                    business_id: bizId,
                    venue_id: turnaround.venue_id || null,
                    area_id: turnaround.area_id || null,
                    device_id: turnaround.device_id || null,
                    count: turnaround.count,
                    reason: turnaround.reason || null,
                    created_by: userId || turnaround.created_by
                });
                return NextResponse.json({ success: true });
            }

            case 'ADD_USER':
            case 'UPDATE_USER':
            case 'REMOVE_USER':
                break;

            case 'DELETE_ACCOUNT':
                if (payload.id) {
                    await supabaseAdmin.auth.admin.deleteUser(payload.id);
                    await supabaseAdmin.from('profiles').delete().eq('id', payload.id);
                }
                break;

            case 'ADD_CLICR': {
                const newClicr = payload as Clicr;
                const clicrBizId = await getBusinessId();
                if (!clicrBizId) return NextResponse.json({ error: 'Could not resolve business_id for ADD_CLICR' }, { status: 400 });
                const { error } = await supabaseAdmin.from('devices').insert({
                    id: newClicr.id,
                    business_id: clicrBizId,
                    area_id: newClicr.area_id ?? null,
                    venue_id: newClicr.venue_id ?? null,
                    is_venue_counter: newClicr.is_venue_counter ?? false,
                    name: newClicr.name,
                    device_type: 'COUNTER',
                    direction_mode: newClicr.flow_mode === 'IN_ONLY' ? 'in_only' : newClicr.flow_mode === 'OUT_ONLY' ? 'out_only' : 'bidirectional',
                    status: (newClicr.active ?? true) ? 'ACTIVE' : 'INACTIVE',
                    button_config: newClicr.button_config || { label_a: 'GUEST IN', label_b: 'GUEST OUT' }
                });
                if (error) return NextResponse.json({ error: `Database Insert Failed: ${error.message}` }, { status: 500 });
                break;
            }

            case 'ADD_VENUE': {
                const newVenue = payload as Venue;
                let venueBizId = newVenue.business_id || null;
                if (!venueBizId && userId) venueBizId = await getBusinessId();
                if (!venueBizId) return NextResponse.json({ error: 'Could not resolve business_id for ADD_VENUE' }, { status: 400 });
                const { error } = await supabaseAdmin.from('venues').insert({
                    id: newVenue.id,
                    business_id: venueBizId,
                    name: newVenue.name,
                    city: newVenue.city || null,
                    state: newVenue.state || null,
                    timezone: newVenue.timezone || 'America/New_York',
                    status: newVenue.status || 'ACTIVE',
                    capacity_max: newVenue.default_capacity_total ?? null,
                    capacity_enforcement_mode: newVenue.capacity_enforcement_mode || 'WARN_ONLY',
                });
                if (error) return NextResponse.json({ error: `Database Insert Failed: ${error.message}` }, { status: 500 });
                break;
            }

            case 'UPDATE_VENUE': {
                const venue = payload as Venue;
                await supabaseAdmin.from('venues').update({
                    name: venue.name,
                    capacity_max: venue.total_capacity ?? venue.default_capacity_total ?? null,
                    capacity_enforcement_mode: venue.capacity_enforcement_mode,
                    status: venue.status
                }).eq('id', venue.id);
                break;
            }

            case 'UPDATE_AREA': {
                const areaPayload = payload as Area;
                await supabaseAdmin.from('areas').update({
                    name: areaPayload.name,
                    capacity_max: areaPayload.default_capacity ?? areaPayload.capacity_max,
                    area_type: areaPayload.area_type,
                    counting_mode: areaPayload.counting_mode,
                    shift_mode: areaPayload.shift_mode ?? 'MANUAL',
                    auto_reset_time: areaPayload.auto_reset_time ?? null,
                    auto_reset_timezone: areaPayload.auto_reset_timezone ?? null,
                }).eq('id', areaPayload.id);
                break;
            }

            case 'DELETE_AREA': {
                const { id } = payload as { id: string };
                await supabaseAdmin.from('areas').delete().eq('id', id);
                break;
            }

            case 'ADD_AREA': {
                const newArea = payload as Area;
                const areaBizId = await getBusinessId();
                if (!areaBizId) return NextResponse.json({ error: 'Could not resolve business_id for ADD_AREA' }, { status: 400 });
                const { error } = await supabaseAdmin.from('areas').insert({
                    id: newArea.id,
                    venue_id: newArea.venue_id,
                    business_id: areaBizId,
                    name: newArea.name,
                    area_type: newArea.area_type || 'MAIN',
                    capacity_max: newArea.default_capacity ?? (newArea as any).capacity_max ?? null,
                    counting_mode: newArea.counting_mode || 'MANUAL',
                    is_active: newArea.is_active ?? true,
                });
                if (error) return NextResponse.json({ error: `Database Insert Failed: ${error.message}` }, { status: 500 });
                break;
            }

            case 'UPDATE_CLICR': {
                const clicrPayload = payload as Clicr;
                await supabaseAdmin.from('devices').update({
                    name: clicrPayload.name,
                    button_config: clicrPayload.button_config || null,
                    direction_mode: clicrPayload.direction_mode || 'bidirectional',
                }).eq('id', clicrPayload.id);
                break;
            }

            case 'DELETE_CLICR': {
                const delPayload = payload as { id: string };
                const { error } = await supabaseAdmin.from('devices')
                    .update({ deleted_at: new Date().toISOString() })
                    .eq('id', delPayload.id);
                if (error) return NextResponse.json({ error: `Delete Failed: ${error.message}` }, { status: 500 });
                break;
            }

            case 'UPDATE_BUSINESS': {
                const { business_id: _bid, ...updateFields } = payload;
                const businessId = payload.business_id || await getBusinessId();
                if (businessId) {
                    await supabaseAdmin.from('businesses').update(updateFields).eq('id', businessId);
                }
                break;
            }

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        if (userId && userEmail) {
            const { data: postMembership } = await supabaseAdmin
                .from('business_members')
                .select('business_id')
                .eq('user_id', userId)
                .limit(1)
                .single();

            const requestedBusinessId = postMembership?.business_id ?? null;
            const response = await buildSyncResponse(userId, userEmail, requestedBusinessId, null);
            return NextResponse.json(response);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("API Error", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
