/**
 * Guest identity hashing for spec compliance.
 * "Must support identity matching via hashed ID number + issuing region"
 * Uses HMAC-SHA256 with salt for deterministic, non-reversible matching.
 */

import crypto from 'crypto';

const SALT = process.env.ID_HASH_SALT || 'fallback_salt_do_not_use_in_prod';

export function generateIdentityHash(
    issuingState: string,
    idNumber: string,
    dob: string
): string {
    const state = (issuingState || '').toUpperCase().trim();
    const number = (idNumber || '').toUpperCase().trim();
    const dobNorm = (dob || '').replace(/[^0-9]/g, '').substring(0, 8);
    const input = `${state}:${number}:${dobNorm}`;
    return crypto.createHmac('sha256', SALT).update(input).digest('hex');
}
