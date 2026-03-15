-- ============================================================================
-- CLICR V4 — CONSOLIDATED SCHEMA
-- Consolidated from: 001, 006, 008, 009, 010, 011, 012, 013, 014, 016,
--                     019, 020, 021, 022
--
-- This file represents the FINAL state of all tables.
-- Run on a fresh database only. For existing databases, use the original
-- incremental migrations in migrations/.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ────────────────────────────────────────────────────────────────────────────
-- 1. BUSINESSES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS businesses (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          TEXT NOT NULL,
    timezone      TEXT NOT NULL DEFAULT 'America/New_York',
    settings      JSONB NOT NULL DEFAULT '{
        "refresh_interval_sec": 5,
        "capacity_thresholds": [80, 90, 100],
        "reset_rule": "MANUAL"
    }'::jsonb,
    logo_url      TEXT,
    last_reset_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. BUSINESS MEMBERS (RBAC junction)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_members (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role                TEXT NOT NULL DEFAULT 'STAFF'
                            CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'STAFF', 'ANALYST')),
    invited_email       TEXT,
    assigned_venue_ids  UUID[] DEFAULT '{}',
    assigned_area_ids   UUID[] DEFAULT '{}',
    joined_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, user_id)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. VENUES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venues (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id                 UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name                        TEXT NOT NULL,
    address_line1               TEXT,
    address_line2               TEXT,
    city                        TEXT,
    state                       TEXT,
    postal_code                 TEXT,
    country                     TEXT DEFAULT 'US',
    timezone                    TEXT NOT NULL DEFAULT 'America/New_York',
    status                      TEXT NOT NULL DEFAULT 'ACTIVE'
                                    CHECK (status IN ('ACTIVE', 'INACTIVE')),
    capacity_max                INTEGER,
    capacity_enforcement_mode   TEXT NOT NULL DEFAULT 'WARN_ONLY'
                                    CHECK (capacity_enforcement_mode IN ('WARN_ONLY', 'HARD_STOP', 'MANAGER_OVERRIDE')),
    current_occupancy           INTEGER NOT NULL DEFAULT 0,
    last_reset_at               TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. AREAS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS areas (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venue_id                    UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    business_id                 UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name                        TEXT NOT NULL,
    area_type                   TEXT NOT NULL DEFAULT 'MAIN'
                                    CHECK (area_type IN ('ENTRY', 'MAIN', 'PATIO', 'VIP', 'BAR', 'EVENT_SPACE', 'OTHER')),
    capacity_max                INTEGER,
    capacity_enforcement_mode   TEXT DEFAULT 'WARN_ONLY'
                                    CHECK (capacity_enforcement_mode IN ('WARN_ONLY', 'HARD_STOP', 'MANAGER_OVERRIDE')),
    counting_mode               TEXT NOT NULL DEFAULT 'MANUAL'
                                    CHECK (counting_mode IN ('MANUAL', 'AUTO_FROM_SCANS', 'BOTH')),
    is_active                   BOOLEAN NOT NULL DEFAULT true,
    sort_order                  INTEGER DEFAULT 0,
    current_occupancy           INTEGER NOT NULL DEFAULT 0,
    last_reset_at               TIMESTAMPTZ,
    shift_mode                  TEXT NOT NULL DEFAULT 'MANUAL'
                                    CHECK (shift_mode IN ('AUTO', 'MANUAL')),
    auto_reset_time             TEXT,
    auto_reset_timezone         TEXT,
    deleted_at                  TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. DEVICES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    venue_id          UUID REFERENCES venues(id) ON DELETE SET NULL,
    area_id           UUID REFERENCES areas(id) ON DELETE SET NULL,
    name              TEXT NOT NULL,
    device_type       TEXT NOT NULL DEFAULT 'COUNTER'
                          CHECK (device_type IN ('COUNTER', 'SCANNER', 'COMBO')),
    serial_number     TEXT,
    button_config     JSONB DEFAULT '{"label_a": "GUEST IN", "label_b": "GUEST OUT"}'::jsonb,
    scan_enabled      BOOLEAN NOT NULL DEFAULT false,
    is_venue_counter  BOOLEAN NOT NULL DEFAULT false,
    status            TEXT NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE', 'INACTIVE', 'LOST', 'MAINTENANCE')),
    last_seen_at      TIMESTAMPTZ,
    deleted_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. DEVICE COUNTER LABELS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_counter_labels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    position    SMALLINT NOT NULL DEFAULT 0,
    color       TEXT,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. OCCUPANCY EVENTS (immutable append-only log)
-- NOTE: current_occupancy is stored directly on areas (no snapshots table).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS occupancy_events (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    venue_id          UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    area_id           UUID REFERENCES areas(id) ON DELETE CASCADE,
    device_id         UUID REFERENCES devices(id) ON DELETE SET NULL,
    user_id           UUID,
    delta             INTEGER NOT NULL,
    flow_type         TEXT NOT NULL CHECK (flow_type IN ('IN', 'OUT')),
    event_type        TEXT NOT NULL DEFAULT 'TAP'
                          CHECK (event_type IN ('TAP', 'SCAN', 'BULK', 'RESET', 'AUTO_SCAN')),
    gender            TEXT CHECK (gender IN ('M', 'F', NULL)),
    source            TEXT DEFAULT 'manual',
    idempotency_key   TEXT,
    shift_id          UUID,
    counter_label_id  UUID REFERENCES device_counter_labels(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 8. ID SCANS (immutable log)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS id_scans (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    venue_id            UUID REFERENCES venues(id) ON DELETE SET NULL,
    area_id             UUID REFERENCES areas(id) ON DELETE SET NULL,
    device_id           UUID REFERENCES devices(id) ON DELETE SET NULL,
    user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    scan_result         TEXT NOT NULL CHECK (scan_result IN ('ACCEPTED', 'DENIED', 'PENDING')),
    age                 INTEGER,
    age_band            TEXT,
    sex                 TEXT,
    zip_code            TEXT,
    first_name          TEXT,
    last_name           TEXT,
    dob                 TEXT,
    id_number_last4     TEXT,
    issuing_state       TEXT,
    id_type             TEXT DEFAULT 'DRIVERS_LICENSE',
    city                TEXT,
    state               TEXT,
    is_fake             BOOLEAN DEFAULT false,
    deny_reason         TEXT,
    identity_token_hash TEXT,
    shift_id            UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 9. BANNED PERSONS (identity registry)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banned_persons (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id              UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    first_name               TEXT NOT NULL,
    last_name                TEXT NOT NULL,
    date_of_birth            DATE,
    id_type                  TEXT DEFAULT 'DRIVERS_LICENSE',
    id_number_last4          TEXT,
    issuing_state_or_country TEXT,
    aliases                  TEXT[],
    notes_private            TEXT,
    identity_token_hash      TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 10. PATRON BANS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patron_bans (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    banned_person_id         UUID NOT NULL REFERENCES banned_persons(id) ON DELETE CASCADE,
    business_id              UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    status                   TEXT NOT NULL DEFAULT 'ACTIVE'
                                 CHECK (status IN ('ACTIVE', 'EXPIRED', 'REMOVED')),
    ban_type                 TEXT NOT NULL DEFAULT 'PERMANENT'
                                 CHECK (ban_type IN ('TEMPORARY', 'PERMANENT')),
    start_datetime           TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_datetime             TIMESTAMPTZ,
    reason_category          TEXT NOT NULL,
    reason_notes             TEXT,
    incident_report_number   TEXT,
    applies_to_all_locations BOOLEAN NOT NULL DEFAULT true,
    location_ids             UUID[] DEFAULT '{}',
    created_by_user_id       UUID NOT NULL,
    removed_by_user_id       UUID,
    removed_reason           TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 11. BAN AUDIT LOGS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ban_audit_logs (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ban_id               UUID NOT NULL REFERENCES patron_bans(id) ON DELETE CASCADE,
    action               TEXT NOT NULL
                             CHECK (action IN ('CREATED', 'UPDATED', 'EXTENDED', 'EXPIRED', 'REMOVED', 'REINSTATED')),
    performed_by_user_id UUID NOT NULL,
    details_json         JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 12. BAN ENFORCEMENT EVENTS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ban_enforcement_events (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ban_id               UUID NOT NULL REFERENCES patron_bans(id) ON DELETE CASCADE,
    location_id          UUID,
    device_id            UUID,
    scanner_user_id      UUID NOT NULL,
    result               TEXT NOT NULL
                             CHECK (result IN ('BLOCKED', 'WARNED', 'ALLOWED_OVERRIDE')),
    override_reason      TEXT,
    notes                TEXT,
    person_snapshot_name TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 13. TURNAROUNDS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS turnarounds (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    venue_id        UUID REFERENCES venues(id),
    area_id         UUID REFERENCES areas(id),
    device_id       UUID REFERENCES devices(id),
    count           INTEGER NOT NULL DEFAULT 1,
    reason          TEXT,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 14. AUDIT LOGS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id          UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    action               TEXT NOT NULL,
    performed_by_user_id UUID NOT NULL,
    target_type          TEXT,
    target_id            UUID,
    details_json         JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 15. APP ERRORS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_errors (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id   UUID REFERENCES businesses(id) ON DELETE SET NULL,
    user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    feature       TEXT NOT NULL,
    message       TEXT NOT NULL,
    payload       JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 16. BOARD VIEWS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_views (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    device_ids  UUID[] NOT NULL DEFAULT '{}',
    labels      JSONB DEFAULT '{}',
    created_by  UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 17. SHIFTS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL,
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    venue_id        UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    area_id         UUID REFERENCES areas(id) ON DELETE SET NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add shift FK to occupancy_events and id_scans (after shifts table exists)
ALTER TABLE occupancy_events
    ADD CONSTRAINT fk_occupancy_events_shift
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL;

ALTER TABLE id_scans
    ADD CONSTRAINT fk_id_scans_shift
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 18. SUPPORT TICKETS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    subject         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    priority        TEXT NOT NULL DEFAULT 'MEDIUM'
                        CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    category        TEXT NOT NULL
                        CHECK (category IN ('TECHNICAL', 'BILLING', 'FEATURE_REQUEST', 'OTHER', 'COMPLIANCE')),
    messages        JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 19. NIGHT LOGS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS night_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    venue_id        UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    area_id         UUID REFERENCES areas(id) ON DELETE SET NULL,
    business_date   DATE NOT NULL,
    period_start    TIMESTAMPTZ NOT NULL,
    reset_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    total_in        INT NOT NULL DEFAULT 0,
    total_out       INT NOT NULL DEFAULT 0,
    turnarounds     INT NOT NULL DEFAULT 0,
    scans_total     INT NOT NULL DEFAULT 0,
    scans_accepted  INT NOT NULL DEFAULT 0,
    scans_denied    INT NOT NULL DEFAULT 0,
    peak_occupancy  INT NOT NULL DEFAULT 0,
    reset_type      TEXT NOT NULL CHECK (reset_type IN ('NIGHT_AUTO', 'NIGHT_MANUAL')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
