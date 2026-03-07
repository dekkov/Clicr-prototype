-- ============================================================================
-- Migration: 016_venue_counter_clicr.sql
-- Description: Add venue counter clicr support, remove VENUE_DOOR area type,
--              fix 403 RPC error.
-- ============================================================================

-- 1. Add current_occupancy to venues
ALTER TABLE venues
    ADD COLUMN IF NOT EXISTS current_occupancy INTEGER NOT NULL DEFAULT 0;

-- 2. Add is_venue_counter flag to devices
ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS is_venue_counter BOOLEAN NOT NULL DEFAULT false;

-- 3. Make occupancy_events.area_id nullable (venue counter events have no area)
ALTER TABLE occupancy_events
    ALTER COLUMN area_id DROP NOT NULL;

-- 4. Clean up existing VENUE_DOOR areas (and their events) BEFORE dropping constraint
DELETE FROM occupancy_events WHERE area_id IN (
    SELECT id FROM areas WHERE area_type = 'VENUE_DOOR'
);
DELETE FROM areas WHERE area_type = 'VENUE_DOOR';

-- 5. Remove VENUE_DOOR from area_type CHECK constraint (safe now that rows are gone)
ALTER TABLE areas
    DROP CONSTRAINT IF EXISTS areas_area_type_check;
ALTER TABLE areas
    ADD CONSTRAINT areas_area_type_check
    CHECK (area_type IN ('ENTRY', 'MAIN', 'PATIO', 'VIP', 'BAR', 'EVENT_SPACE', 'OTHER'));

-- 6. Drop OLD overloads of apply_occupancy_delta before recreating
--    CREATE OR REPLACE won't replace when param list differs — it creates a second overload.
--    PostgREST (PGRST203) can't resolve ambiguous overloads, so we must drop the old signatures.
DROP FUNCTION IF EXISTS apply_occupancy_delta(UUID, INTEGER, TEXT, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS apply_occupancy_delta(UUID, INTEGER, TEXT, UUID, TEXT, TEXT, UUID);
CREATE OR REPLACE FUNCTION apply_occupancy_delta(
    p_area_id         UUID DEFAULT NULL,
    p_venue_id        UUID DEFAULT NULL,
    p_delta           INTEGER DEFAULT 1,
    p_source          TEXT DEFAULT 'manual',
    p_device_id       UUID DEFAULT NULL,
    p_gender          TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
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

    -- Idempotency check
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM occupancy_events
            WHERE idempotency_key = p_idempotency_key
        ) THEN
            IF p_area_id IS NOT NULL THEN
                SELECT a.current_occupancy, oe.id
                INTO v_new_occ, v_event_id
                FROM areas a
                JOIN occupancy_events oe ON oe.idempotency_key = p_idempotency_key
                WHERE a.id = p_area_id;
            ELSE
                SELECT v.current_occupancy, oe.id
                INTO v_new_occ, v_event_id
                FROM venues v
                JOIN occupancy_events oe ON oe.idempotency_key = p_idempotency_key
                WHERE v.id = p_venue_id;
            END IF;
            RETURN QUERY SELECT v_new_occ, v_event_id;
            RETURN;
        END IF;
    END IF;

    IF p_area_id IS NOT NULL THEN
        -- AREA-LEVEL tap (existing behavior)
        SELECT current_occupancy + p_delta, business_id, venue_id
        INTO v_new_occ, v_business_id, v_venue_id
        FROM areas
        WHERE id = p_area_id
        FOR UPDATE;

        v_new_occ := GREATEST(v_new_occ, 0);

        UPDATE areas
        SET current_occupancy = v_new_occ, updated_at = now()
        WHERE id = p_area_id;
    ELSIF p_venue_id IS NOT NULL THEN
        -- VENUE-LEVEL tap (new: venue counter clicr)
        SELECT current_occupancy + p_delta, business_id
        INTO v_new_occ, v_business_id
        FROM venues
        WHERE id = p_venue_id
        FOR UPDATE;

        v_venue_id := p_venue_id;
        v_new_occ := GREATEST(v_new_occ, 0);

        UPDATE venues
        SET current_occupancy = v_new_occ, updated_at = now()
        WHERE id = p_venue_id;
    ELSE
        RAISE EXCEPTION 'Either p_area_id or p_venue_id must be provided';
    END IF;

    -- Insert the immutable event log entry (area_id nullable for venue taps)
    INSERT INTO occupancy_events (
        business_id, venue_id, area_id, device_id,
        user_id, delta, flow_type, event_type, source,
        gender, idempotency_key
    )
    VALUES (
        v_business_id, v_venue_id, p_area_id, p_device_id,
        auth.uid(), p_delta, v_flow_type,
        CASE WHEN p_source = 'auto_scan' THEN 'AUTO_SCAN' ELSE 'TAP' END,
        p_source, p_gender, p_idempotency_key
    )
    RETURNING id INTO v_event_id;

    RETURN QUERY SELECT v_new_occ, v_event_id;
END;
$$;

-- 7. Update reset_counts to also reset venue occupancy
CREATE OR REPLACE FUNCTION reset_counts(
    p_scope       TEXT,
    p_business_id UUID,
    p_venue_id    UUID DEFAULT NULL,
    p_area_id     UUID DEFAULT NULL,
    p_reason      TEXT DEFAULT NULL
)
RETURNS TABLE(areas_reset INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reset_ts   TIMESTAMPTZ := now();
    v_count      INTEGER := 0;
BEGIN
    IF p_scope = 'AREA' AND p_area_id IS NOT NULL THEN
        UPDATE areas
        SET current_occupancy = 0, last_reset_at = v_reset_ts, updated_at = v_reset_ts
        WHERE business_id = p_business_id AND id = p_area_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    ELSIF p_scope = 'VENUE' AND p_venue_id IS NOT NULL THEN
        UPDATE areas
        SET current_occupancy = 0, last_reset_at = v_reset_ts, updated_at = v_reset_ts
        WHERE business_id = p_business_id AND venue_id = p_venue_id;

        UPDATE venues
        SET current_occupancy = 0, last_reset_at = v_reset_ts
        WHERE id = p_venue_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    ELSE
        UPDATE areas
        SET current_occupancy = 0, last_reset_at = v_reset_ts, updated_at = v_reset_ts
        WHERE business_id = p_business_id;

        UPDATE venues
        SET current_occupancy = 0, last_reset_at = v_reset_ts
        WHERE business_id = p_business_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
    END IF;

    INSERT INTO audit_logs (business_id, action, performed_by_user_id, target_type, target_id, details_json)
    VALUES (
        p_business_id,
        'RESET_COUNTS',
        auth.uid(),
        p_scope,
        COALESCE(p_area_id, p_venue_id, p_business_id),
        jsonb_build_object('scope', p_scope, 'reason', p_reason, 'areas_reset', v_count)
    );

    RETURN QUERY SELECT v_count, v_reset_ts;
END;
$$;
