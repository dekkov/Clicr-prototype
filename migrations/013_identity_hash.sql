-- ============================================================================
-- CLICR V4 — Guest Identity Hashing (Spec Compliance)
-- Migration: 013_identity_hash.sql
-- Description: Add identity_token_hash for spec-compliant identity matching
--              via hashed ID number + issuing region (not plain text).
-- ============================================================================

-- Add identity_token_hash to banned_persons
ALTER TABLE banned_persons ADD COLUMN IF NOT EXISTS identity_token_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_banned_persons_identity_hash
    ON banned_persons (business_id, identity_token_hash)
    WHERE identity_token_hash IS NOT NULL;

-- Add identity_token_hash to id_scans
ALTER TABLE id_scans ADD COLUMN IF NOT EXISTS identity_token_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_id_scans_identity_hash
    ON id_scans (business_id, identity_token_hash)
    WHERE identity_token_hash IS NOT NULL;
