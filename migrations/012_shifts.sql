-- ============================================================================
-- CLICR V4 — Migration 012: Shifts / Sessions for audit trail
-- ============================================================================
-- Staff starts a shift at a venue/area. Used for audit trail and reporting
-- (who scanned, when, where). Events and scans can be attributed to a shift.
-- ============================================================================

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

CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts (user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_venue ON shifts (venue_id);
CREATE INDEX IF NOT EXISTS idx_shifts_started ON shifts (started_at);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY shifts_select ON shifts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM business_members bm
            WHERE bm.business_id = shifts.business_id
            AND bm.user_id = auth.uid()
        )
    );

CREATE POLICY shifts_insert ON shifts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY shifts_update ON shifts FOR UPDATE
    USING (auth.uid() = user_id);

-- Add shift_id to occupancy_events
ALTER TABLE occupancy_events ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_occupancy_events_shift ON occupancy_events (shift_id);

-- Add shift_id to id_scans
ALTER TABLE id_scans ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_id_scans_shift ON id_scans (shift_id);

-- Update apply_occupancy_delta to accept optional shift_id
CREATE OR REPLACE FUNCTION apply_occupancy_delta(
    p_area_id         UUID,
    p_delta           INTEGER,
    p_source          TEXT DEFAULT 'manual',
    p_device_id       UUID DEFAULT NULL,
    p_gender          TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_shift_id        UUID DEFAULT NULL
)
RETURNS TABLE(new_occupancy INTEGER, event_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_occ      INTEGER;
    v_event_id     UUID;
    v_flow_type    TEXT;
    v_business_id  UUID;
    v_venue_id     UUID;
BEGIN
    v_flow_type := CASE WHEN p_delta > 0 THEN 'IN' ELSE 'OUT' END;

    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM occupancy_events WHERE idempotency_key = p_idempotency_key) THEN
            SELECT a.current_occupancy, oe.id INTO v_new_occ, v_event_id
            FROM areas a
            JOIN occupancy_events oe ON oe.idempotency_key = p_idempotency_key
            WHERE a.id = p_area_id;
            RETURN QUERY SELECT v_new_occ, v_event_id;
            RETURN;
        END IF;
    END IF;

    SELECT current_occupancy + p_delta, business_id, venue_id
    INTO v_new_occ, v_business_id, v_venue_id
    FROM areas WHERE id = p_area_id FOR UPDATE;

    v_new_occ := GREATEST(v_new_occ, 0);

    UPDATE areas SET current_occupancy = v_new_occ, updated_at = now() WHERE id = p_area_id;

    INSERT INTO occupancy_events (
        business_id, venue_id, area_id, device_id,
        user_id, delta, flow_type, event_type, source,
        gender, idempotency_key, shift_id
    )
    VALUES (
        v_business_id, v_venue_id, p_area_id, p_device_id,
        auth.uid(), p_delta, v_flow_type,
        CASE WHEN p_source = 'auto_scan' THEN 'AUTO_SCAN' ELSE 'TAP' END,
        p_source, p_gender, p_idempotency_key, p_shift_id
    )
    RETURNING id INTO v_event_id;

    RETURN QUERY SELECT v_new_occ, v_event_id;
END;
$$;
