/**
 * Guest identity hashing for spec compliance.
 * "Must support identity matching via hashed ID number + issuing region"
 * Uses HMAC-SHA256 with salt for deterministic, non-reversible matching.
 */

import crypto from 'crypto';

function getSalt(): string {
    const salt = process.env.ID_HASH_SALT;
    if (!salt) {
        throw new Error('ID_HASH_SALT environment variable is required. Generate one with: openssl rand -hex 32');
    }
    return salt;
}

export function generateIdentityHash(
    issuingState: string,
    idNumber: string,
    dob: string
): string {
    const state = (issuingState || '').toUpperCase().trim();
    const number = (idNumber || '').toUpperCase().trim();
    const dobNorm = (dob || '').replace(/[^0-9]/g, '').substring(0, 8);
    const input = `${state}:${number}:${dobNorm}`;
    return crypto.createHmac('sha256', getSalt()).update(input).digest('hex');
}
