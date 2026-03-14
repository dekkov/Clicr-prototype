'use server';

import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parseAAMVA, isExpired, getAge } from '@/lib/scanning/aamva-parser';
import { buildEnforcementEvent, validateOverrideInput } from '@/lib/ban-utils';
import { hasMinRole } from '@/lib/permissions';
import { checkAreaCapacity } from '@/lib/capacity-utils';
import { shouldBlockForPause } from '@/lib/pause-utils';
import crypto from 'crypto';

// --- Types ---

export type ScanResult = {
    outcome: 'ACCEPTED' | 'DENIED';
    reason?: 'UNDERAGE' | 'EXPIRED' | 'BANNED' | 'INVALID_FORMAT' | 'VERIFICATION_FAILED' | 'AREA_AT_CAPACITY' | 'AREA_AT_CAPACITY_OVERRIDE_REQUIRED';
    data: {
        firstName: string | null;
        lastName: string | null;
        age: number | null;
        gender: string | null;
        dob: string | null; // Masked or partial if needed, but we pass full back to UI for session view usually
        expirationDate: string | null;
        issuingState: string | null;
    };
    banDetails?: {
        reason: string;
        notes?: string;
        period: string; // "Permanent" or date
    };
    enforcementEventId?: string;
    areaId?: string;
};

export type ScanPayload = {
    raw: string;
    venueId: string;
    areaId?: string; // Optional
    deviceId?: string; // Optional
};

// --- Helpers ---

function generateIdentityHash(state: string, number: string, dob: string): string {
    const salt = process.env.ID_HASH_SALT || 'fallback_salt_do_not_use_in_prod';
    const input = `${state.toUpperCase().trim()}:${number.toUpperCase().trim()}:${dob.trim()}`;
    return crypto.createHmac('sha256', salt).update(input).digest('hex');
}

// --- Actions ---

export async function processScan(payload: ScanPayload): Promise<{ success: boolean; result?: ScanResult; error?: string }> {
    try {
        // 1. Auth Check (Standard User)
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: 'Unauthorized' };

        // Get Business ID
        // Optimized: assume user has claim or we fetch it quick. For now, fetch.
        const { data: member } = await supabase.from('business_members')
            .select('business_id, business:businesses(settings)')
            .eq('user_id', user.id)
            .single();

        if (!member) return { success: false, error: 'No business membership found.' };
        const businessId = member.business_id;
        const settings = (member.business as any)?.settings || {};
        const ageThreshold = settings.age_threshold || 21;

        // 1b. Pause Check
        if (shouldBlockForPause(settings)) {
            return { success: false, error: 'Scanning is currently paused.' };
        }

        // 2. Parse
        let parsed = parseAAMVA(payload.raw);

        // Basic Validation
        if (!parsed.idNumber || !parsed.issuingState || !parsed.dob) {
            // Fallback: Try simpler barcode parse or return error
            // For now, strict AAMVA
            return {
                success: false, result: {
                    outcome: 'DENIED',
                    reason: 'INVALID_FORMAT',
                    data: { ...parsed, age: null }
                }
            };
        }

        // 3. Compute Hash
        const identityHash = generateIdentityHash(parsed.issuingState, parsed.idNumber, parsed.dob);

        // 4. Check Bans — identity matching via hashed ID + region (banned_persons + patron_bans)
        let hasBusinessBan = false;
        let hasVenueBan = false;
        let activeBan: any = null;

        const { data: hashMatches } = await supabaseAdmin
            .from('banned_persons')
            .select('id')
            .eq('business_id', businessId)
            .eq('identity_token_hash', identityHash);

        if (hashMatches?.length) {
            for (const p of hashMatches) {
                const { data: banResult } = await supabaseAdmin.rpc('check_ban_status', {
                    p_business_id: businessId,
                    p_patron_id: p.id,
                    p_venue_id: payload.venueId
                });
                const row = Array.isArray(banResult) ? banResult[0] : banResult;
                if (row?.is_banned) {
                    hasBusinessBan = hasBusinessBan || !row.venue_id;
                    hasVenueBan = hasVenueBan || !!row.venue_id;
                    activeBan = row;
                    break;
                }
            }
        }

        // 5. Log enforcement event if a ban was found
        let enforcementEventId: string | undefined;
        if (activeBan) {
            const enfEvent = buildEnforcementEvent({
                banId: activeBan.ban_id,
                venueId: payload.venueId,
                deviceId: payload.deviceId ?? null,
                userId: user.id,
                firstName: parsed.firstName,
                lastName: parsed.lastName,
            });
            const { data: insertedEnf } = await supabaseAdmin
                .from('ban_enforcement_events')
                .insert(enfEvent)
                .select('id')
                .single();
            enforcementEventId = insertedEnf?.id;
        }

        // 6. Determine Outcome
        let outcome: 'ACCEPTED' | 'DENIED' = 'ACCEPTED';
        let reason: any = undefined;

        const age = getAge(parsed.dob);
        const expired = isExpired(parsed.expirationDate);

        if (hasBusinessBan || hasVenueBan) {
            outcome = 'DENIED';
            reason = 'BANNED';
        } else if (age !== null && age < ageThreshold) {
            outcome = 'DENIED';
            reason = 'UNDERAGE';
        } else if (expired) {
            outcome = 'DENIED';
            reason = 'EXPIRED';
        }

        // 7. Log Scan (id_scans with identity_token_hash for spec compliance)
        await supabaseAdmin.from('id_scans').insert({
            business_id: businessId,
            venue_id: payload.venueId,
            area_id: payload.areaId || null,
            device_id: payload.deviceId || null,
            scan_result: outcome,
            deny_reason: reason,
            age,
            sex: parsed.gender || 'U',
            zip_code: parsed.postalCode || '',
            first_name: parsed.firstName,
            last_name: parsed.lastName,
            dob: parsed.dob,
            id_number_last4: parsed.idNumber ? parsed.idNumber.slice(-4) : null,
            issuing_state: parsed.issuingState,
            identity_token_hash: identityHash
        });

        // 8. Auto-Increment Occupancy (if Accepted and Area specified)
        if (outcome === 'ACCEPTED' && payload.areaId) {
            const { data: areaData } = await supabaseAdmin
                .from('areas')
                .select('capacity_max, current_occupancy, capacity_enforcement_mode')
                .eq('id', payload.areaId)
                .single();

            if (areaData) {
                const capCheck = checkAreaCapacity(
                    areaData.current_occupancy ?? 0,
                    areaData.capacity_max ?? 0,
                    areaData.capacity_enforcement_mode
                );
                if (!capCheck.allowed) {
                    return {
                        success: true,
                        result: {
                            outcome: 'DENIED' as const,
                            reason: capCheck.overrideAvailable ? 'AREA_AT_CAPACITY_OVERRIDE_REQUIRED' as const : 'AREA_AT_CAPACITY' as const,
                            data: {
                                firstName: parsed.firstName,
                                lastName: parsed.lastName,
                                age,
                                gender: parsed.gender,
                                dob: parsed.dob,
                                expirationDate: parsed.expirationDate,
                                issuingState: parsed.issuingState,
                            },
                        },
                    };
                }
            }
        }

        if (outcome === 'ACCEPTED') {
            const autoAdd = true; // TODO: Fetch from settings
            if (autoAdd && payload.areaId) {
                // Use User Client (supabase) to trigger RPC, ensuring proper permissions and snapshot updates
                const { error: rpcError } = await supabase.rpc('apply_occupancy_delta', {
                    p_area_id: payload.areaId,
                    p_delta: 1,
                    p_source: 'scan',
                    p_device_id: payload.deviceId
                });

                if (rpcError) {
                    console.error("Auto-Add Occupancy Failed:", rpcError);
                    // Don't fail the scan, just log
                }
            }
        }

        // 9. Return Result
        return {
            success: true,
            result: {
                outcome,
                reason,
                data: {
                    firstName: parsed.firstName,
                    lastName: parsed.lastName,
                    age,
                    gender: parsed.gender,
                    dob: parsed.dob,
                    expirationDate: parsed.expirationDate,
                    issuingState: parsed.issuingState
                },
                banDetails: activeBan ? {
                    reason: activeBan.reason || 'Unspecified',
                    notes: activeBan.notes,
                    period: activeBan.end_at ? `Until ${new Date(activeBan.end_at).toLocaleDateString()}` : 'Permanent'
                } : undefined,
                enforcementEventId,
                areaId: payload.areaId,
            }
        };

    } catch (err: any) {
        console.error("[Process Scan] Error:", err);
        return { success: false, error: err.message };
    }
}

export async function banPatron(scanId: string | null, manualData: any | null, banDetails: any) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: 'Unauthorized' };

        let identityHash: string | null = null;
        let businessId = '';
        let firstName = 'Unknown';
        let lastName = 'Unknown';
        let dob: string | null = null;
        let idNumberLast4 = '';
        let issuingState = '';

        if (scanId) {
            const { data: scan } = await supabaseAdmin
                .from('id_scans')
                .select('identity_token_hash, business_id, first_name, last_name, dob, id_number_last4, issuing_state')
                .eq('id', scanId)
                .single();

            if (!scan) return { success: false, error: 'Scan record not found' };
            businessId = scan.business_id;
            identityHash = scan.identity_token_hash;
            firstName = scan.first_name || 'Unknown';
            lastName = scan.last_name || 'Unknown';
            dob = scan.dob;
            idNumberLast4 = scan.id_number_last4 || '';
            issuingState = scan.issuing_state || '';

        } else if (manualData) {
            const { data: member } = await supabase.from('business_members').select('business_id').eq('user_id', user.id).single();
            if (!member) return { success: false, error: 'No business' };
            businessId = member.business_id;

            const { state, idNumber, dob: manualDob } = manualData;
            if (!state || !idNumber || !manualDob) return { success: false, error: 'Missing ID details' };

            identityHash = generateIdentityHash(state, idNumber, manualDob);
            dob = manualDob.replace(/[^0-9]/g, '').substring(0, 8);
            idNumberLast4 = idNumber.slice(-4);
            issuingState = state;
        } else {
            return { success: false, error: 'Either scanId or manualData required' };
        }

        // Find or create banned_person (identity_token_hash for spec compliance)
        let personId: string;
        const dobDate = dob && dob.length >= 8 ? `${dob.slice(0, 4)}-${dob.slice(4, 6)}-${dob.slice(6, 8)}` : null;

        if (identityHash) {
            const { data: existing } = await supabaseAdmin
                .from('banned_persons')
                .select('id')
                .eq('business_id', businessId)
                .eq('identity_token_hash', identityHash)
                .limit(1)
                .single();

            if (existing) {
                personId = existing.id;
            } else {
                const { data: inserted, error: insErr } = await supabaseAdmin.from('banned_persons').insert({
                    business_id: businessId,
                    first_name: firstName,
                    last_name: lastName,
                    date_of_birth: dobDate,
                    id_number_last4: idNumberLast4 || null,
                    issuing_state_or_country: issuingState || null,
                    identity_token_hash: identityHash
                }).select('id').single();
                if (insErr) throw insErr;
                personId = inserted!.id;
            }
        } else {
            const { data: inserted, error: insErr } = await supabaseAdmin.from('banned_persons').insert({
                business_id: businessId,
                first_name: firstName,
                last_name: lastName,
                date_of_birth: dobDate,
                id_number_last4: idNumberLast4 || null,
                issuing_state_or_country: issuingState || null
            }).select('id').single();
            if (insErr) throw insErr;
            personId = inserted!.id;
        }

        const { data: banRow, error: banErr } = await supabaseAdmin.from('patron_bans').insert({
            banned_person_id: personId,
            business_id: businessId,
            status: 'ACTIVE',
            ban_type: banDetails.duration === 'PERMANENT' ? 'PERMANENT' : 'TEMPORARY',
            end_datetime: banDetails.duration === 'PERMANENT' ? null : banDetails.endDate,
            reason_category: banDetails.reason || 'OTHER',
            reason_notes: banDetails.notes || null,
            applies_to_all_locations: banDetails.scope !== 'VENUE',
            location_ids: banDetails.scope === 'VENUE' && banDetails.venueId ? [banDetails.venueId] : [],
            created_by_user_id: user.id
        }).select('id').single();

        if (banErr) throw banErr;

        await supabaseAdmin.from('ban_audit_logs').insert({
            ban_id: banRow!.id,
            action: 'CREATED',
            performed_by_user_id: user.id,
            details_json: { hash_preview: identityHash?.substring(0, 8), ...banDetails }
        });

        return { success: true };
    } catch (err: any) {
        console.error("Ban Error", err);
        return { success: false, error: err.message };
    }
}

export async function overrideBan(
    enforcementEventId: string,
    areaId: string,
    reason: string,
    notes: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: 'Not authenticated' };

        const { data: member } = await supabaseAdmin
            .from('business_members')
            .select('role')
            .eq('user_id', user.id)
            .single();
        if (!member || !hasMinRole(member.role, 'MANAGER')) {
            return { success: false, error: 'Insufficient permissions' };
        }

        const validation = validateOverrideInput({ enforcementEventId, areaId, reason, notes });
        if (!validation.valid) return { success: false, error: validation.error };

        const { error: updateErr } = await supabaseAdmin
            .from('ban_enforcement_events')
            .update({
                result: 'ALLOWED_OVERRIDE',
                override_reason: reason,
                notes: notes || null,
            })
            .eq('id', enforcementEventId);
        if (updateErr) return { success: false, error: updateErr.message };

        // Use user client for RPC, consistent with processScan pattern
        const { error: rpcErr } = await supabase.rpc('apply_occupancy_delta', {
            p_area_id: areaId,
            p_delta: 1,
            p_source: 'scan',
            p_device_id: null,
        });
        if (rpcErr) return { success: false, error: rpcErr.message };

        return { success: true };
    } catch (err: any) {
        console.error("[Override Ban] Error:", err);
        return { success: false, error: err.message };
    }
}
