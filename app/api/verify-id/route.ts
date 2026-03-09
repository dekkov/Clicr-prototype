import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parseAAMVA } from '@/lib/aamva';
import { generateIdentityHash } from '@/lib/identity-hash';
import { getAuthenticatedUser } from '@/lib/api-auth';

interface ScanRequest {
    scan_data: string;
    business_id: string;
    venue_id: string;
    area_id: string;
}

export async function POST(request: Request) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { scan_data, business_id, venue_id, area_id } = await request.json();

        // Verify user is a member of the requested business
        const { data: membership } = await supabaseAdmin
            .from('business_members')
            .select('id')
            .eq('user_id', user.id)
            .eq('business_id', business_id)
            .limit(1)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 1. Parse
        let parsed;
        try {
            parsed = parseAAMVA(scan_data);
        } catch (e) {
            return NextResponse.json({ success: false, error: 'Failed to parse ID data' }, { status: 400 });
        }

        const now = new Date();
        const age = parsed.age || 0;
        const isExpired = parsed.isExpired;
        const dob = parsed.dateOfBirth;

        // 2. Check Bans (Server-side Authoritative) — identity matching via hashed ID + region
        const issuingState = parsed.state || '';
        const idNumber = parsed.idNumber || '';
        const identityHash = (issuingState && idNumber && dob)
            ? generateIdentityHash(issuingState, idNumber, dob)
            : null;

        let banResult = null;
        if (identityHash) {
            const { data: hashMatches } = await supabaseAdmin
                .from('banned_persons')
                .select('id')
                .eq('business_id', business_id)
                .eq('identity_token_hash', identityHash);
            if (hashMatches?.length) {
                for (const p of hashMatches) {
                    const { data: banRow } = await supabaseAdmin.rpc('check_ban_status', {
                        p_business_id: business_id,
                        p_patron_id: p.id,
                        p_venue_id: venue_id
                    });
                    const row = Array.isArray(banRow) ? banRow[0] : banRow;
                    if (row?.is_banned) {
                        banResult = row;
                        break;
                    }
                }
            }
        }
        // Fallback: legacy plain-text match for records without identity_token_hash
        if (!banResult && idNumber) {
            const last4 = idNumber.slice(-4);
            const { data: legacyMatches } = await supabaseAdmin
                .from('banned_persons')
                .select('id')
                .eq('business_id', business_id)
                .eq('id_number_last4', last4)
                .eq('issuing_state_or_country', issuingState);
            if (legacyMatches?.length) {
                for (const p of legacyMatches) {
                    const { data: banRow } = await supabaseAdmin.rpc('check_ban_status', {
                        p_business_id: business_id,
                        p_patron_id: p.id,
                        p_venue_id: venue_id
                    });
                    const row = Array.isArray(banRow) ? banRow[0] : banRow;
                    if (row?.is_banned) {
                        banResult = row;
                        break;
                    }
                }
            }
        }

        // 3. Logic
        let status = 'ACCEPTED';
        let message = 'Welcome';

        if (age < 21) {
            status = 'DENIED';
            message = 'Under 21';
        } else if (isExpired) {
            status = 'DENIED'; // or WARN
            message = 'ID Expired';
        }

        if (banResult) {
            status = 'DENIED';
            message = 'Banned';
        }

        // 4. Record Scan (with identity_token_hash for spec compliance)
        const scanEvent: Record<string, unknown> = {
            business_id,
            venue_id,
            area_id,
            scan_result: status,
            age,
            age_band: age >= 21 ? '21+' : 'Under 21',
            sex: parsed.sex || 'U',
            zip_code: parsed.postalCode || '00000',
            first_name: parsed.firstName,
            last_name: parsed.lastName,
            dob,
            id_number_last4: idNumber ? idNumber.slice(-4) : null,
            issuing_state: issuingState,
            id_type: 'DRIVERS_LICENSE',
        };
        if (identityHash) scanEvent.identity_token_hash = identityHash;

        await supabaseAdmin.from('id_scans').insert(scanEvent);

        // 5. Auto-Add to Count (Atomic RPC)
        if (status === 'ACCEPTED') {
            await supabaseAdmin.rpc('apply_occupancy_delta', {
                p_area_id: area_id,
                p_delta: 1,
                p_source: 'auto_scan',
                p_device_id: null
            });
        }

        return NextResponse.json({
            success: true,
            data: {
                status,
                message,
                age,
                dob,
                name: `${parsed.firstName} ${parsed.lastName}`,
                expiration: parsed.expirationDate
            }
        });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
