'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { IDScanEvent } from '@/lib/types';
import { ParsedID } from '@/lib/aamva';
import { logError } from '@/lib/core/errors';

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
    // NOTE (V1/V2): supabaseAdmin bypasses RLS. This route should eventually use a session
    // client enforcing row-level security, or delegate to MUTATIONS.recordScan().
    const businessId = await getBusinessId(venueId);

    // C3: business_id is NOT NULL in id_scans — abort early if it can't be resolved
    if (!businessId) {
        logError('scan:submitScanAction', 'Could not resolve business_id for venue', { venueId });
        return null;
    }

    // 0. SERVER-SIDE BAN CHECK using patron_bans + banned_persons
    let finalStatus = result.status === 'DENIED' ? 'DENIED' : 'ACCEPTED';

    const last4 = rawDetails.idNumber ? rawDetails.idNumber.slice(-4) : null;
    if (last4 && businessId) {
        const { data: matchedPersons } = await supabaseAdmin
            .from('banned_persons')
            .select('id')
            .eq('id_number_last4', last4)
            .eq('issuing_state_or_country', issuingState)
            .eq('business_id', businessId);

        if (matchedPersons && matchedPersons.length > 0) {
            for (const person of matchedPersons) {
                const { data: banResult } = await supabaseAdmin.rpc('check_ban_status', {
                    p_business_id: businessId,
                    p_patron_id: person.id,
                    p_venue_id: venueId
                });
                // D1: handle both RETURNS TABLE (array) and RETURNS jsonb (object) – migration conflict
                const banRow = Array.isArray(banResult) ? banResult[0] : banResult;
                if (banRow?.is_banned) {
                    console.log("SERVER ACTION: DETECTED BAN HIT for person", person.id);
                    finalStatus = 'BANNED';
                    break;
                }
            }
        }
    }

    // 1. Construct the scan record for id_scans
    // C2: scan_result CHECK only allows 'ACCEPTED'|'DENIED'|'WARNED'|'ERROR'; BANNED maps to DENIED
    const scanEvent = {
        business_id: businessId,
        venue_id: venueId,
        scan_result: finalStatus === 'BANNED' ? 'DENIED' : finalStatus,
        age: rawDetails.age || 0,
        age_band: getAgeBand(rawDetails.age || 0),
        sex: rawDetails.sex || 'U',
        zip_code: rawDetails.postalCode || '',

        // PII
        first_name: rawDetails.firstName || null,
        last_name: rawDetails.lastName || null,
        dob: rawDetails.dateOfBirth || null,
        id_number_last4: rawDetails.idNumber ? rawDetails.idNumber.slice(-4) : null,
        issuing_state: issuingState,
        id_type: 'DRIVERS_LICENSE',
    };

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
