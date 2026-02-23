-- ============================================================================
-- CLICR V4 — PRODUCTION SCHEMA
-- Migration: 001_schema.sql
-- Description: Core tables for businesses, venues, areas, devices, events,
--              scans, bans, snapshots, and audit logging.
-- ============================================================================

-- Enable UUID generation
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
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. BUSINESS MEMBERS (RBAC junction)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_members (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL, -- references auth.users(id) implicitly
    role          TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('OWNER', 'ADMIN', 'SUPERVISOR', 'USER')),
    invited_email TEXT,
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
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
    status                      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    capacity_max                INTEGER,
    capacity_enforcement_mode   TEXT NOT NULL DEFAULT 'WARN_ONLY'
                                    CHECK (capacity_enforcement_mode IN ('WARN_ONLY', 'HARD_STOP', 'MANAGER_OVERRIDE')),
    last_reset_at               TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. AREAS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS areas (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venue_id          UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    area_type         TEXT NOT NULL DEFAULT 'MAIN'
                          CHECK (area_type IN ('ENTRY', 'MAIN', 'PATIO', 'VIP', 'BAR', 'EVENT_SPACE', 'OTHER')),
    capacity_max      INTEGER,
    counting_mode     TEXT NOT NULL DEFAULT 'MANUAL'
                          CHECK (counting_mode IN ('MANUAL', 'AUTO_FROM_SCANS', 'BOTH')),
    is_active         BOOLEAN NOT NULL DEFAULT true,
    sort_order        INTEGER DEFAULT 0,
    last_reset_at     TIMESTAMPTZ,
    deleted_at        TIMESTAMPTZ, -- soft delete
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. DEVICES (formerly "clicrs")
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
    direction_mode    TEXT NOT NULL DEFAULT 'bidirectional'
                          CHECK (direction_mode IN ('in_only', 'out_only', 'bidirectional')),
    button_config     JSONB DEFAULT '{"label_a": "GUEST IN", "label_b": "GUEST OUT"}'::jsonb,
    scan_enabled      BOOLEAN NOT NULL DEFAULT false,
    status            TEXT NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE', 'INACTIVE', 'LOST', 'MAINTENANCE')),
    last_seen_at      TIMESTAMPTZ,
    firmware_version  TEXT,
    deleted_at        TIMESTAMPTZ, -- soft delete
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. OCCUPANCY SNAPSHOTS (source of truth for current state)
-- One row per business+venue+area. Updated atomically by RPC.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS occupancy_snapshots (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    venue_id            UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    area_id             UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    current_occupancy   INTEGER NOT NULL DEFAULT 0,
    last_reset_at       TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, venue_id, area_id)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. OCCUPANCY EVENTS (immutable append-only log)
-- Every tap, scan, bulk adjustment, reset generates an event.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS occupancy_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    venue_id        UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    area_id         UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    device_id       UUID REFERENCES devices(id) ON DELETE SET NULL,
    user_id         UUID, -- auth.users ref
    delta           INTEGER NOT NULL, -- +1, -1, +N, -N
    flow_type       TEXT NOT NULL CHECK (flow_type IN ('IN', 'OUT')),
    event_type      TEXT NOT NULL DEFAULT 'TAP'
                        CHECK (event_type IN ('TAP', 'SCAN', 'BULK', 'RESET', 'AUTO_SCAN')),
    gender          TEXT CHECK (gender IN ('M', 'F', NULL)),
    source          TEXT DEFAULT 'manual', -- 'manual', 'scan', 'bulk', 'auto_scan'
    idempotency_key TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 8. ID SCANS (immutable log)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS id_scans (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    venue_id        UUID REFERENCES venues(id) ON DELETE SET NULL,
    area_id         UUID REFERENCES areas(id) ON DELETE SET NULL,
    device_id       UUID REFERENCES devices(id) ON DELETE SET NULL,
    scan_result     TEXT NOT NULL CHECK (scan_result IN ('ACCEPTED', 'DENIED', 'PENDING')),
    age             INTEGER,
    age_band        TEXT, -- 'Under 21', '21-25', '26-30', '31-40', '41+'
    sex             TEXT, -- 'M', 'F', 'U'
    zip_code        TEXT,
    first_name      TEXT, -- PII: encrypt in production v2
    last_name       TEXT,
    dob             TEXT, -- YYYYMMDD or ISO date
    id_number_last4 TEXT,
    issuing_state   TEXT,
    id_type         TEXT DEFAULT 'DRIVERS_LICENSE',
    city            TEXT,
    state           TEXT,
    is_fake         BOOLEAN DEFAULT false,
    deny_reason     TEXT, -- 'UNDERAGE', 'EXPIRED', 'BANNED', 'FAKE_ID'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 9. BANNED PERSONS (identity registry)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banned_persons (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id             UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    first_name              TEXT NOT NULL,
    last_name               TEXT NOT NULL,
    date_of_birth           DATE,
    id_type                 TEXT DEFAULT 'DRIVERS_LICENSE',
    id_number_last4         TEXT,
    issuing_state_or_country TEXT,
    aliases                 TEXT[],
    notes_private           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 10. PATRON BANS (active ban records linked to persons)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patron_bans (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    banned_person_id        UUID NOT NULL REFERENCES banned_persons(id) ON DELETE CASCADE,
    business_id             UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    status                  TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'REMOVED')),
    ban_type                TEXT NOT NULL DEFAULT 'PERMANENT' CHECK (ban_type IN ('TEMPORARY', 'PERMANENT')),
    start_datetime          TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_datetime            TIMESTAMPTZ, -- null = permanent
    reason_category         TEXT NOT NULL,
    reason_notes            TEXT,
    incident_report_number  TEXT,
    applies_to_all_locations BOOLEAN NOT NULL DEFAULT true,
    location_ids            UUID[] DEFAULT '{}',
    created_by_user_id      UUID NOT NULL,
    removed_by_user_id      UUID,
    removed_reason          TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 11. BAN AUDIT LOGS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ban_audit_logs (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ban_id            UUID NOT NULL REFERENCES patron_bans(id) ON DELETE CASCADE,
    action            TEXT NOT NULL CHECK (action IN ('CREATED', 'UPDATED', 'EXTENDED', 'EXPIRED', 'REMOVED', 'REINSTATED')),
    performed_by_user_id UUID NOT NULL,
    details_json      JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 12. BAN ENFORCEMENT EVENTS (scan-time blocks)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ban_enforcement_events (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ban_id            UUID NOT NULL REFERENCES patron_bans(id) ON DELETE CASCADE,
    location_id       UUID, -- venue where enforcement happened
    device_id         UUID,
    scanner_user_id   UUID NOT NULL,
    result            TEXT NOT NULL CHECK (result IN ('BLOCKED', 'WARNED', 'ALLOWED_OVERRIDE')),
    override_reason   TEXT,
    notes             TEXT,
    person_snapshot_name TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 13. TURNAROUNDS (re-entries tracked separately)
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
-- 14. AUDIT LOGS (system-wide: resets, deletes, config changes)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    action            TEXT NOT NULL, -- 'RESET_COUNTS', 'DELETE_DEVICE', 'UPDATE_VENUE', 'BAN_CREATED', etc.
    performed_by_user_id UUID NOT NULL,
    target_type       TEXT, -- 'VENUE', 'AREA', 'DEVICE', 'BAN'
    target_id         UUID,
    details_json      JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 15. APP ERRORS (client-side error logging)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_errors (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id   UUID REFERENCES businesses(id) ON DELETE SET NULL,
    user_id       UUID,
    feature       TEXT NOT NULL,
    message       TEXT NOT NULL,
    payload       JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 16. ONBOARDING PROGRESS (optional)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_progress (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL UNIQUE,
    business_id     UUID REFERENCES businesses(id) ON DELETE SET NULL,
    current_step    TEXT NOT NULL DEFAULT 'ACCOUNT_CREATED',
    completed_steps TEXT[] DEFAULT '{}',
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
