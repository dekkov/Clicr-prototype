'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { IDScanEvent } from '@/lib/types';
import { ParsedID } from '@/lib/aamva';
import { logError } from '@/lib/core/errors';
import { generateIdentityHash } from '@/lib/identity-hash';

export type ScanResult = {
    status: 'ACCEPTED' | 'DENIED' | 'WARNED' | 'ERROR';
    message: string;
};

export async function submitScanAction(
    venueId: string,
    result: ScanResult,
    rawDetails: ParsedID
): Promise<IDScanEvent | null> {
    console.log("SERVER ACTION: submitScanAction started for venue:", venueId);

    const issuingState = rawDetails.state || 'Unknown';
    const businessId = await getBusinessId(venueId);

    if (!businessId) {
        logError('scan:submitScanAction', 'Could not resolve business_id for venue', { venueId });
        return null;
    }

    // 0. SERVER-SIDE BAN CHECK — identity matching via hashed ID + region (spec compliance)
    let finalStatus = result.status === 'DENIED' ? 'DENIED' : 'ACCEPTED';
    const dob = rawDetails.dateOfBirth || '';
    const idNumber = rawDetails.idNumber || '';
    const identityHash = (issuingState && idNumber && dob)
        ? generateIdentityHash(issuingState, idNumber, dob)
        : null;

    const checkBanForPerson = async (personId: string) => {
        const { data: banResult } = await supabaseAdmin.rpc('check_ban_status', {
            p_business_id: businessId,
            p_patron_id: personId,
            p_venue_id: venueId
        });
        const banRow = Array.isArray(banResult) ? banResult[0] : banResult;
        return !!banRow?.is_banned;
    };

    if (identityHash) {
        const { data: hashMatches } = await supabaseAdmin
            .from('banned_persons')
            .select('id')
            .eq('business_id', businessId)
            .eq('identity_token_hash', identityHash);
        if (hashMatches?.length) {
            for (const p of hashMatches) {
                if (await checkBanForPerson(p.id)) {
                    finalStatus = 'BANNED';
                    break;
                }
            }
        }
    }
    // Fallback: legacy plain-text match
    if (finalStatus !== 'BANNED' && idNumber) {
        const last4 = idNumber.slice(-4);
        const { data: legacyMatches } = await supabaseAdmin
            .from('banned_persons')
            .select('id')
            .eq('business_id', businessId)
            .eq('id_number_last4', last4)
            .eq('issuing_state_or_country', issuingState);
        if (legacyMatches?.length) {
            for (const p of legacyMatches) {
                if (await checkBanForPerson(p.id)) {
                    finalStatus = 'BANNED';
                    break;
                }
            }
        }
    }

    // 1. Construct the scan record for id_scans (with identity_token_hash for spec compliance)
    const scanEvent: Record<string, unknown> = {
        business_id: businessId,
        venue_id: venueId,
        scan_result: finalStatus === 'BANNED' ? 'DENIED' : finalStatus,
        age: rawDetails.age || 0,
        age_band: getAgeBand(rawDetails.age || 0),
        sex: rawDetails.sex || 'U',
        zip_code: rawDetails.postalCode || '',
        first_name: rawDetails.firstName || null,
        last_name: rawDetails.lastName || null,
        dob: rawDetails.dateOfBirth || null,
        id_number_last4: idNumber ? idNumber.slice(-4) : null,
        issuing_state: issuingState,
        id_type: 'DRIVERS_LICENSE',
    };
    if (identityHash) (scanEvent as any).identity_token_hash = identityHash;

    // 2. Persist to id_scans
    const { data, error } = await supabaseAdmin
        .from('id_scans')
        .insert([scanEvent])
        .select()
        .single();

    if (error) {
        logError('scan:submitScanAction', `Write to id_scans failed: ${error.message}`, { venueId, businessId }, undefined, businessId);
        throw new Error(`Failed to save scan: ${error.message}`);
    }

    // 3. If accepted, increment occupancy atomically
    try {
        if (businessId && finalStatus === 'ACCEPTED') {
            const { data: areaData } = await supabaseAdmin
                .from('areas')
                .select('id')
                .eq('venue_id', venueId)
                .limit(1)
                .single();

            if (areaData?.id) {
                await supabaseAdmin.rpc('apply_occupancy_delta', {
                    p_business_id: businessId,
                    p_venue_id: venueId,
                    p_area_id: areaData.id,
                    p_delta: 1,
                    p_source: 'scan'
                });
            } else {
                console.warn(`[Scan] No area found for venue ${venueId} - skipping occupancy increment`);
            }
        }
    } catch (e) {
        console.warn("[Scan] Could not increment occupancy (non-fatal):", e);
    }

    return {
        ...data,
        scan_result: finalStatus,
        timestamp: new Date(data.created_at).getTime()
    } as IDScanEvent;
}

// Helper to avoid repetitive lookups if possible, but for Safety we fetch fresh
async function getBusinessId(venueId: string) {
    const { data } = await supabaseAdmin.from('venues').select('business_id').eq('id', venueId).single();
    return data?.business_id;
}

export async function getRecentScansAction(venueId?: string): Promise<IDScanEvent[]> {
    let query = supabaseAdmin
        .from('id_scans')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

    if (venueId) {
        query = query.eq('venue_id', venueId);
    }

    const { data, error } = await query;

    if (error) {
        logError('scan:getRecentScansAction', error.message, { venueId });
        return [];
    }

    return data.map((d) => ({
        ...d,
        timestamp: new Date(d.created_at).getTime()
    }));
}

function getAgeBand(age: number): string {
    if (age < 18) return 'Under 18';
    if (age < 21) return '18-20';
    if (age < 25) return '21-24';
    if (age < 30) return '25-29';
    if (age < 40) return '30-39';
    return '40+';
}
