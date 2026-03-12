-- migrations/020_custom_counter_labels.sql
-- Custom counter labels per device + remove direction_mode

BEGIN;

-- 1. Create device_counter_labels table
CREATE TABLE IF NOT EXISTS device_counter_labels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    position    SMALLINT NOT NULL DEFAULT 0,
    color       TEXT,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dcl_device_id ON device_counter_labels(device_id);

-- RLS (join through devices to get business_id, use is_member_of helper from migration 004)
ALTER TABLE device_counter_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY dcl_select ON device_counter_labels FOR SELECT
    TO authenticated
    USING (device_id IN (SELECT id FROM devices WHERE is_member_of(business_id)));

CREATE POLICY dcl_insert ON device_counter_labels FOR INSERT
    TO authenticated
    WITH CHECK (device_id IN (SELECT id FROM devices WHERE is_member_of(business_id)));

CREATE POLICY dcl_update ON device_counter_labels FOR UPDATE
    TO authenticated
    USING (device_id IN (SELECT id FROM devices WHERE has_role_in(business_id, 'MANAGER')));

CREATE POLICY dcl_delete ON device_counter_labels FOR DELETE
    TO authenticated
    USING (device_id IN (SELECT id FROM devices WHERE has_role_in(business_id, 'ADMIN')));

-- 2. Drop direction_mode from devices (removes NOT NULL, DEFAULT, CHECK in one step)
ALTER TABLE devices DROP COLUMN IF EXISTS direction_mode;

-- 3. Add counter_label_id to occupancy_events
ALTER TABLE occupancy_events
    ADD COLUMN IF NOT EXISTS counter_label_id UUID REFERENCES device_counter_labels(id) ON DELETE SET NULL;

-- 4. Backfill: insert 1 "General" label for each existing device that has no labels
INSERT INTO device_counter_labels (id, device_id, label, position)
SELECT gen_random_uuid(), d.id, 'General', 0
FROM devices d
WHERE NOT EXISTS (
    SELECT 1 FROM device_counter_labels dcl WHERE dcl.device_id = d.id
);

-- 5. Update apply_occupancy_delta RPC — drop the EXACT live signature from migration 016,
--    then recreate with counter_label_id parameter added.
--    Live signature: (UUID, UUID, INTEGER, TEXT, UUID, TEXT, TEXT) from migration 016 lines 37-44
DROP FUNCTION IF EXISTS apply_occupancy_delta(UUID, UUID, INTEGER, TEXT, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION apply_occupancy_delta(
    p_area_id            UUID DEFAULT NULL,
    p_venue_id           UUID DEFAULT NULL,
    p_delta              INTEGER DEFAULT 1,
    p_source             TEXT DEFAULT 'manual',
    p_device_id          UUID DEFAULT NULL,
    p_gender             TEXT DEFAULT NULL,  -- kept for backward compat, no longer written by app
    p_idempotency_key    TEXT DEFAULT NULL,
    p_counter_label_id   UUID DEFAULT NULL   -- NEW: references device_counter_labels.id
)
RETURNS TABLE(new_occupancy INTEGER, event_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_occ      INTEGER;
    v_event_id     UUID;
    v_flow_type    TEXT;
    v_business_id  UUID;
    v_venue_id     UUID;
BEGIN
    v_flow_type := CASE WHEN p_delta > 0 THEN 'IN' ELSE 'OUT' END;

    -- Idempotency guard
    IF p_idempotency_key IS NOT NULL THEN
        PERFORM 1 FROM occupancy_events WHERE idempotency_key = p_idempotency_key;
        IF FOUND THEN
            RETURN QUERY SELECT 0::INTEGER, '00000000-0000-0000-0000-000000000000'::UUID;
            RETURN;
        END IF;
    END IF;

    v_event_id := gen_random_uuid();

    -- Resolve business_id from device
    IF p_device_id IS NOT NULL THEN
        SELECT business_id INTO v_business_id FROM devices WHERE id = p_device_id;
    END IF;

    -- Resolve venue_id for venue counters (area_id is null)
    v_venue_id := p_venue_id;
    IF p_area_id IS NULL AND p_venue_id IS NOT NULL THEN
        -- Venue-level counter
        UPDATE venues SET current_occupancy = GREATEST(0, COALESCE(current_occupancy, 0) + p_delta)
        WHERE id = p_venue_id;
        SELECT current_occupancy INTO v_new_occ FROM venues WHERE id = p_venue_id;
    ELSIF p_area_id IS NOT NULL THEN
        -- Area-level counter
        IF v_venue_id IS NULL THEN
            SELECT venue_id INTO v_venue_id FROM areas WHERE id = p_area_id;
        END IF;
        UPDATE areas SET current_occupancy = GREATEST(0, COALESCE(current_occupancy, 0) + p_delta)
        WHERE id = p_area_id;
        SELECT current_occupancy INTO v_new_occ FROM areas WHERE id = p_area_id;
    END IF;

    -- Insert occupancy event with counter_label_id
    INSERT INTO occupancy_events (
        id, business_id, venue_id, area_id, device_id, delta, flow_type,
        source, gender, idempotency_key, counter_label_id, created_at
    ) VALUES (
        v_event_id, v_business_id, v_venue_id, p_area_id, p_device_id, p_delta, v_flow_type,
        p_source, p_gender, p_idempotency_key, p_counter_label_id, now()
    );

    RETURN QUERY SELECT COALESCE(v_new_occ, 0), v_event_id;
END;
$$;

-- 6. reset_counts does NOT need changes for this feature.
--    The existing signature (TEXT, UUID, UUID, UUID, TEXT) RETURNS TABLE(areas_reset, reset_at)
--    from migration 016 works as-is. Counter labels don't affect reset behavior.

COMMIT;
