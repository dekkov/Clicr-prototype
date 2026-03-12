import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getAutoDateLabel } from '@/lib/business-day';

type ResetType = 'OPERATIONAL' | 'NIGHT_AUTO' | 'NIGHT_MANUAL';

export async function POST(request: Request) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { business_id } = body;
        const reset_type: ResetType = body.reset_type ?? 'OPERATIONAL';
        const provided_business_date: string | undefined = body.business_date;

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

        // ── Night Reset: aggregate and write night_logs before zeroing ──────────
        let nightLog: Record<string, unknown> | null = null;

        if (reset_type === 'NIGHT_AUTO' || reset_type === 'NIGHT_MANUAL') {
            // Fetch business for last_reset_at, timezone, and reset_time
            const { data: business, error: bizError } = await supabaseAdmin
                .from('businesses')
                .select('last_reset_at, created_at, timezone, settings')
                .eq('id', business_id)
                .single();

            if (bizError) throw bizError;

            const period_start: string = business.last_reset_at ?? business.created_at;
            const timezone: string = business.timezone ?? 'UTC';
            const resetTime: string = business.settings?.reset_time ?? '05:00';

            const business_date: string = provided_business_date
                ?? getAutoDateLabel(new Date(), resetTime, timezone);

            // Fetch all venues for this business
            const { data: venues, error: venuesError } = await supabaseAdmin
                .from('venues')
                .select('id')
                .eq('business_id', business_id);

            if (venuesError) throw venuesError;

            // Fetch all areas for this business
            const { data: allAreas, error: allAreasError } = await supabaseAdmin
                .from('areas')
                .select('id, venue_id')
                .eq('business_id', business_id);

            if (allAreasError) throw allAreasError;

            // ── Aggregate occupancy_events ────────────────────────────────────────
            const { data: occEvents, error: occError } = await supabaseAdmin
                .from('occupancy_events')
                .select('venue_id, area_id, delta, flow_type, created_at')
                .eq('business_id', business_id)
                .gte('created_at', period_start)
                .lt('created_at', resetAt)
                .order('created_at', { ascending: true });

            if (occError) throw occError;

            // ── Aggregate id_scans ────────────────────────────────────────────────
            const { data: scanEvents, error: scanError } = await supabaseAdmin
                .from('id_scans')
                .select('venue_id, area_id, scan_result')
                .eq('business_id', business_id)
                .gte('created_at', period_start)
                .lt('created_at', resetAt);

            if (scanError) throw scanError;

            // ── Aggregate turnarounds ─────────────────────────────────────────────
            const { data: turnaroundEvents, error: taError } = await supabaseAdmin
                .from('turnarounds')
                .select('venue_id, area_id, count')
                .eq('business_id', business_id)
                .gte('created_at', period_start)
                .lt('created_at', resetAt);

            if (taError) throw taError;

            // ── Build per-area aggregates ─────────────────────────────────────────
            type AreaStats = {
                total_in: number;
                total_out: number;
                turnarounds: number;
                scans_total: number;
                scans_accepted: number;
                scans_denied: number;
                peak_occupancy: number;
                venue_id: string;
            };

            const areaStats: Record<string, AreaStats> = {};

            for (const area of (allAreas ?? [])) {
                areaStats[area.id] = {
                    total_in: 0,
                    total_out: 0,
                    turnarounds: 0,
                    scans_total: 0,
                    scans_accepted: 0,
                    scans_denied: 0,
                    peak_occupancy: 0,
                    venue_id: area.venue_id,
                };
            }

            // Occupancy events → total_in, total_out + replay for peak
            const areaOccupancySequence: Record<string, number[]> = {};
            for (const ev of (occEvents ?? [])) {
                const aId = ev.area_id;
                if (!aId || !areaStats[aId]) continue;
                if (ev.flow_type === 'IN') {
                    areaStats[aId].total_in += ev.delta;
                } else {
                    areaStats[aId].total_out += Math.abs(ev.delta);
                }
                if (!areaOccupancySequence[aId]) areaOccupancySequence[aId] = [];
                areaOccupancySequence[aId].push(ev.delta);
            }

            // Replay to compute peak per area
            for (const [aId, deltas] of Object.entries(areaOccupancySequence)) {
                let running = 0;
                let peak = 0;
                for (const d of deltas) {
                    running += d;
                    if (running < 0) running = 0;
                    if (running > peak) peak = running;
                }
                areaStats[aId].peak_occupancy = peak;
            }

            // ID scan events
            for (const ev of (scanEvents ?? [])) {
                const aId = ev.area_id;
                if (!aId || !areaStats[aId]) continue;
                areaStats[aId].scans_total += 1;
                if (ev.scan_result === 'ACCEPTED') areaStats[aId].scans_accepted += 1;
                if (ev.scan_result === 'DENIED') areaStats[aId].scans_denied += 1;
            }

            // Turnaround events
            for (const ev of (turnaroundEvents ?? [])) {
                const aId = ev.area_id;
                if (!aId || !areaStats[aId]) continue;
                areaStats[aId].turnarounds += ev.count ?? 1;
            }

            // ── Build per-venue totals ────────────────────────────────────────────
            type VenueStats = {
                total_in: number;
                total_out: number;
                turnarounds: number;
                scans_total: number;
                scans_accepted: number;
                scans_denied: number;
                peak_occupancy: number;
            };

            const venueStats: Record<string, VenueStats> = {};
            for (const v of (venues ?? [])) {
                venueStats[v.id] = {
                    total_in: 0,
                    total_out: 0,
                    turnarounds: 0,
                    scans_total: 0,
                    scans_accepted: 0,
                    scans_denied: 0,
                    peak_occupancy: 0,
                };
            }

            for (const [, stats] of Object.entries(areaStats)) {
                const vs = venueStats[stats.venue_id];
                if (!vs) continue;
                vs.total_in += stats.total_in;
                vs.total_out += stats.total_out;
                vs.turnarounds += stats.turnarounds;
                vs.scans_total += stats.scans_total;
                vs.scans_accepted += stats.scans_accepted;
                vs.scans_denied += stats.scans_denied;
                // Venue peak is sum of area peaks (approximate)
                vs.peak_occupancy += stats.peak_occupancy;
            }

            // ── Build night_logs rows ─────────────────────────────────────────────
            const nightLogRows: Array<{
                business_id: string;
                venue_id: string;
                area_id: string | null;
                business_date: string;
                period_start: string;
                reset_at: string;
                total_in: number;
                total_out: number;
                turnarounds: number;
                scans_total: number;
                scans_accepted: number;
                scans_denied: number;
                peak_occupancy: number;
                reset_type: 'NIGHT_AUTO' | 'NIGHT_MANUAL';
            }> = [];

            // Venue-level rows (area_id = null)
            for (const [venueId, stats] of Object.entries(venueStats)) {
                nightLogRows.push({
                    business_id,
                    venue_id: venueId,
                    area_id: null,
                    business_date,
                    period_start,
                    reset_at: resetAt,
                    total_in: stats.total_in,
                    total_out: stats.total_out,
                    turnarounds: stats.turnarounds,
                    scans_total: stats.scans_total,
                    scans_accepted: stats.scans_accepted,
                    scans_denied: stats.scans_denied,
                    peak_occupancy: stats.peak_occupancy,
                    reset_type,
                });
            }

            // Area-level rows
            for (const [areaId, stats] of Object.entries(areaStats)) {
                nightLogRows.push({
                    business_id,
                    venue_id: stats.venue_id,
                    area_id: areaId,
                    business_date,
                    period_start,
                    reset_at: resetAt,
                    total_in: stats.total_in,
                    total_out: stats.total_out,
                    turnarounds: stats.turnarounds,
                    scans_total: stats.scans_total,
                    scans_accepted: stats.scans_accepted,
                    scans_denied: stats.scans_denied,
                    peak_occupancy: stats.peak_occupancy,
                    reset_type,
                });
            }

            if (nightLogRows.length > 0) {
                const { error: insertError } = await supabaseAdmin
                    .from('night_logs')
                    .insert(nightLogRows);

                if (insertError) {
                    console.error('[reset] Night log insert error:', insertError.message);
                    // Non-fatal: continue with reset
                }
            }

            // Summary data for Day Summary card (venue totals)
            nightLog = {
                business_date,
                period_start,
                reset_at: resetAt,
                reset_type,
                venues: Object.fromEntries(
                    Object.entries(venueStats).map(([id, s]) => [id, s])
                ),
            };
        }

        // ── Zero all counts (existing logic) ─────────────────────────────────────
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

        return NextResponse.json({
            success: true,
            areasReset: (areas || []).length,
            resetAt,
            nightLog,
            results,
        });

    } catch (e: any) {
        console.error('[reset] API failed:', e instanceof Error ? e.message : 'Unknown error');
        return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
    }
}
