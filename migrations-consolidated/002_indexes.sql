-- ============================================================================
-- CLICR V4 — CONSOLIDATED INDEXES
-- Consolidated from: 002, 011, 012, 013, 015, 019, 020
-- ============================================================================

-- ── OCCUPANCY EVENTS ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_occupancy_events_business_created
    ON occupancy_events (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_occupancy_events_venue_created
    ON occupancy_events (venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_occupancy_events_area_created
    ON occupancy_events (area_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_occupancy_events_business_venue_area
    ON occupancy_events (business_id, venue_id, area_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_occupancy_events_idempotency
    ON occupancy_events (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_occupancy_events_shift
    ON occupancy_events (shift_id);

-- Partial index for heatmap aggregation (entry events only)
CREATE INDEX IF NOT EXISTS idx_occupancy_events_business_created_entries
    ON occupancy_events (business_id, created_at)
    WHERE delta > 0;

-- ── ID SCANS ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_id_scans_business_created
    ON id_scans (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_id_scans_venue_created
    ON id_scans (venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_id_scans_area_created
    ON id_scans (area_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_id_scans_name_dob
    ON id_scans (business_id, last_name, first_name, dob);

CREATE INDEX IF NOT EXISTS idx_id_scans_shift
    ON id_scans (shift_id);

CREATE INDEX IF NOT EXISTS idx_id_scans_identity_hash
    ON id_scans (business_id, identity_token_hash)
    WHERE identity_token_hash IS NOT NULL;

-- ── VENUES ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_venues_business
    ON venues (business_id);

-- ── AREAS ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_areas_venue
    ON areas (venue_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_areas_business
    ON areas (business_id) WHERE deleted_at IS NULL;

-- ── DEVICES ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_devices_area
    ON devices (area_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_devices_business
    ON devices (business_id) WHERE deleted_at IS NULL;

-- ── DEVICE COUNTER LABELS ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dcl_device_id
    ON device_counter_labels (device_id);

-- ── BANS ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_patron_bans_business_status
    ON patron_bans (business_id, status);

CREATE INDEX IF NOT EXISTS idx_patron_bans_person
    ON patron_bans (banned_person_id);

CREATE INDEX IF NOT EXISTS idx_banned_persons_business_name
    ON banned_persons (business_id, last_name, first_name);

CREATE INDEX IF NOT EXISTS idx_banned_persons_identity_hash
    ON banned_persons (business_id, identity_token_hash)
    WHERE identity_token_hash IS NOT NULL;

-- ── BUSINESS MEMBERS ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_business_members_user
    ON business_members (user_id);

-- ── AUDIT LOGS ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_logs_business_created
    ON audit_logs (business_id, created_at DESC);

-- ── APP ERRORS ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_app_errors_business_created
    ON app_errors (business_id, created_at DESC);

-- ── TURNAROUNDS ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_turnarounds_business_created
    ON turnarounds (business_id, created_at DESC);

-- ── SHIFTS ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_shifts_user
    ON shifts (user_id);

CREATE INDEX IF NOT EXISTS idx_shifts_venue
    ON shifts (venue_id);

CREATE INDEX IF NOT EXISTS idx_shifts_started
    ON shifts (started_at);

-- ── SUPPORT TICKETS ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_support_tickets_user
    ON support_tickets (user_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_business
    ON support_tickets (business_id);

-- ── NIGHT LOGS ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_night_logs_biz_date
    ON night_logs (business_id, business_date DESC);
