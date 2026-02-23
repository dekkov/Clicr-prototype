-- ============================================================================
-- CLICR V4 — INDEXES
-- Migration: 002_indexes.sql
-- Description: Performance indexes for all high-read tables.
-- ============================================================================

-- ── OCCUPANCY EVENTS (hottest table — queried constantly for reporting) ──
CREATE INDEX IF NOT EXISTS idx_occupancy_events_business_created
    ON occupancy_events (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_occupancy_events_venue_created
    ON occupancy_events (venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_occupancy_events_area_created
    ON occupancy_events (area_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_occupancy_events_business_venue_area
    ON occupancy_events (business_id, venue_id, area_id, created_at DESC);

-- For idempotency dedup
CREATE INDEX IF NOT EXISTS idx_occupancy_events_idempotency
    ON occupancy_events (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- ── ID SCANS ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_id_scans_business_created
    ON id_scans (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_id_scans_venue_created
    ON id_scans (venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_id_scans_area_created
    ON id_scans (area_id, created_at DESC);

-- For ban lookups during scanning
CREATE INDEX IF NOT EXISTS idx_id_scans_name_dob
    ON id_scans (business_id, last_name, first_name, dob);

-- ── OCCUPANCY SNAPSHOTS (unique compound key is already indexed via UNIQUE constraint) ──
-- Additional index for venue-level aggregation
CREATE INDEX IF NOT EXISTS idx_occupancy_snapshots_venue
    ON occupancy_snapshots (venue_id);

CREATE INDEX IF NOT EXISTS idx_occupancy_snapshots_business
    ON occupancy_snapshots (business_id);

-- ── VENUES ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_venues_business
    ON venues (business_id);

-- ── AREAS ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_areas_venue
    ON areas (venue_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_areas_business
    ON areas (business_id) WHERE deleted_at IS NULL;

-- ── DEVICES ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_devices_area
    ON devices (area_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_devices_business
    ON devices (business_id) WHERE deleted_at IS NULL;

-- ── BANS ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_patron_bans_business_status
    ON patron_bans (business_id, status);

CREATE INDEX IF NOT EXISTS idx_patron_bans_person
    ON patron_bans (banned_person_id);

CREATE INDEX IF NOT EXISTS idx_banned_persons_business_name
    ON banned_persons (business_id, last_name, first_name);

-- ── BUSINESS MEMBERS ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_business_members_user
    ON business_members (user_id);

-- ── AUDIT LOGS ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_logs_business_created
    ON audit_logs (business_id, created_at DESC);

-- ── APP ERRORS ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_app_errors_business_created
    ON app_errors (business_id, created_at DESC);

-- ── TURNAROUNDS ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_turnarounds_business_created
    ON turnarounds (business_id, created_at DESC);
