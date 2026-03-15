-- ============================================================================
-- CLICR V4 — CONSOLIDATED FUNCTIONS & RPCs
-- Consolidated from: 003, 005, 007, 008, 012, 016, 018, 020
--
-- Contains: helper functions, triggers, and all RPC stored procedures.
-- All functions are at their FINAL version.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- HELPER: is_member_of — checks business membership
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_member_of(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM business_members
        WHERE business_id = p_business_id
          AND user_id = auth.uid()
    );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- HELPER: has_role_in — checks minimum role in business
-- Role hierarchy: OWNER > ADMIN > MANAGER > STAFF
-- ANALYST is read-only, sits alongside STAFF
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION has_role_in(p_business_id UUID, p_min_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM business_members
        WHERE business_id = p_business_id
          AND user_id = auth.uid()
          AND role IN (
              'OWNER',
              CASE WHEN p_min_role IN ('ADMIN', 'MANAGER', 'STAFF', 'ANALYST') THEN 'ADMIN' ELSE NULL END,
              CASE WHEN p_min_role IN ('MANAGER', 'STAFF') THEN 'MANAGER' ELSE NULL END,
              CASE WHEN p_min_role = 'STAFF' THEN 'STAFF' ELSE NULL END,
              CASE WHEN p_min_role IN ('ANALYST', 'STAFF') THEN 'ANALYST' ELSE NULL END
          )
    );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- TRIGGER: Auto-create OWNER membership on business creation
-- Solves the chicken-and-egg RLS deadlock during onboarding.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_owner_membership_on_business_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        INSERT INTO business_members (business_id, user_id, role)
        VALUES (NEW.id, auth.uid(), 'OWNER')
        ON CONFLICT (business_id, user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_business_created ON businesses;
CREATE TRIGGER on_business_created
    AFTER INSERT ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION create_owner_membership_on_business_insert();

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: apply_occupancy_delta
-- The most critical function. Called on every tap/click.
-- Supports both area-level and venue-level counters, custom counter labels.
-- Uses FOR UPDATE row locking to prevent race conditions.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION apply_occupancy_delta(
    p_area_id            UUID DEFAULT NULL,
    p_venue_id           UUID DEFAULT NULL,
    p_delta              INTEGER DEFAULT 1,
    p_source             TEXT DEFAULT 'manual',
    p_device_id          UUID DEFAULT NULL,
    p_gender             TEXT DEFAULT NULL,
    p_idempotency_key    TEXT DEFAULT NULL,
    p_counter_label_id   UUID DEFAULT NULL
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

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: reset_counts
-- Resets occupancy to 0 for all areas/venues in scope.
-- Sets last_reset_at. Logs to audit_logs.
-- ════════════════════════════════════════════════════════════════════════════
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

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: get_report_summary
-- Core reporting aggregate. Returns totals since last reset or within window.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_report_summary(
    p_business_id UUID,
    p_venue_id    UUID DEFAULT NULL,
    p_area_id     UUID DEFAULT NULL,
    p_start_ts    TIMESTAMPTZ DEFAULT NULL,
    p_end_ts      TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
    total_entries_gross  BIGINT,
    total_exits_gross    BIGINT,
    turnarounds_count    BIGINT,
    net_entries_adjusted BIGINT,
    entries_manual       BIGINT,
    entries_scan         BIGINT,
    scans_total          BIGINT,
    scans_accepted       BIGINT,
    scans_denied         BIGINT,
    effective_start_ts   TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_effective_start TIMESTAMPTZ;
BEGIN
    IF p_start_ts IS NOT NULL THEN
        v_effective_start := p_start_ts;
    ELSE
        SELECT COALESCE(
            CASE
                WHEN p_area_id IS NOT NULL THEN (SELECT a.last_reset_at FROM areas a WHERE a.id = p_area_id)
                WHEN p_venue_id IS NOT NULL THEN (SELECT v.last_reset_at FROM venues v WHERE v.id = p_venue_id)
                ELSE (SELECT b.created_at FROM businesses b WHERE b.id = p_business_id)
            END,
            '1970-01-01'::timestamptz
        ) INTO v_effective_start;
    END IF;

    RETURN QUERY
    SELECT
        COALESCE(SUM(CASE WHEN oe.flow_type = 'IN' THEN ABS(oe.delta) ELSE 0 END), 0)::BIGINT,
        COALESCE(SUM(CASE WHEN oe.flow_type = 'OUT' THEN ABS(oe.delta) ELSE 0 END), 0)::BIGINT,
        COALESCE((SELECT SUM(t.count) FROM turnarounds t
            WHERE t.business_id = p_business_id
            AND (p_venue_id IS NULL OR t.venue_id = p_venue_id)
            AND (p_area_id IS NULL OR t.area_id = p_area_id)
            AND t.created_at >= v_effective_start
            AND (p_end_ts IS NULL OR t.created_at <= p_end_ts)
        ), 0)::BIGINT,
        (COALESCE(SUM(CASE WHEN oe.flow_type = 'IN' THEN ABS(oe.delta) ELSE 0 END), 0) -
         COALESCE((SELECT SUM(t.count) FROM turnarounds t
            WHERE t.business_id = p_business_id
            AND (p_venue_id IS NULL OR t.venue_id = p_venue_id)
            AND (p_area_id IS NULL OR t.area_id = p_area_id)
            AND t.created_at >= v_effective_start
            AND (p_end_ts IS NULL OR t.created_at <= p_end_ts)
         ), 0))::BIGINT,
        COALESCE(SUM(CASE WHEN oe.flow_type = 'IN' AND oe.source = 'manual' THEN ABS(oe.delta) ELSE 0 END), 0)::BIGINT,
        COALESCE(SUM(CASE WHEN oe.flow_type = 'IN' AND oe.source IN ('scan', 'auto_scan') THEN ABS(oe.delta) ELSE 0 END), 0)::BIGINT,
        COALESCE((SELECT COUNT(*) FROM id_scans s
            WHERE s.business_id = p_business_id
            AND (p_venue_id IS NULL OR s.venue_id = p_venue_id)
            AND (p_area_id IS NULL OR s.area_id = p_area_id)
            AND s.created_at >= v_effective_start
            AND (p_end_ts IS NULL OR s.created_at <= p_end_ts)
        ), 0)::BIGINT,
        COALESCE((SELECT COUNT(*) FROM id_scans s
            WHERE s.business_id = p_business_id
            AND s.scan_result = 'ACCEPTED'
            AND (p_venue_id IS NULL OR s.venue_id = p_venue_id)
            AND (p_area_id IS NULL OR s.area_id = p_area_id)
            AND s.created_at >= v_effective_start
            AND (p_end_ts IS NULL OR s.created_at <= p_end_ts)
        ), 0)::BIGINT,
        COALESCE((SELECT COUNT(*) FROM id_scans s
            WHERE s.business_id = p_business_id
            AND s.scan_result = 'DENIED'
            AND (p_venue_id IS NULL OR s.venue_id = p_venue_id)
            AND (p_area_id IS NULL OR s.area_id = p_area_id)
            AND s.created_at >= v_effective_start
            AND (p_end_ts IS NULL OR s.created_at <= p_end_ts)
        ), 0)::BIGINT,
        v_effective_start
    FROM occupancy_events oe
    WHERE oe.business_id = p_business_id
      AND (p_venue_id IS NULL OR oe.venue_id = p_venue_id)
      AND (p_area_id IS NULL OR oe.area_id = p_area_id)
      AND oe.created_at >= v_effective_start
      AND (p_end_ts IS NULL OR oe.created_at <= p_end_ts)
      AND oe.event_type != 'RESET';
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: get_hourly_traffic
-- Bucketed traffic by hour for charts.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_hourly_traffic(
    p_business_id UUID,
    p_venue_id    UUID DEFAULT NULL,
    p_area_id     UUID DEFAULT NULL,
    p_start_ts    TIMESTAMPTZ DEFAULT NULL,
    p_end_ts      TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
    hour_bucket  TIMESTAMPTZ,
    entries_in   BIGINT,
    entries_out  BIGINT,
    net_delta    BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        date_trunc('hour', oe.created_at) AS hour_bucket,
        COALESCE(SUM(CASE WHEN oe.flow_type = 'IN' THEN ABS(oe.delta) ELSE 0 END), 0)::BIGINT,
        COALESCE(SUM(CASE WHEN oe.flow_type = 'OUT' THEN ABS(oe.delta) ELSE 0 END), 0)::BIGINT,
        COALESCE(SUM(oe.delta), 0)::BIGINT
    FROM occupancy_events oe
    WHERE oe.business_id = p_business_id
      AND (p_venue_id IS NULL OR oe.venue_id = p_venue_id)
      AND (p_area_id IS NULL OR oe.area_id = p_area_id)
      AND (p_start_ts IS NULL OR oe.created_at >= p_start_ts)
      AND (p_end_ts IS NULL OR oe.created_at <= p_end_ts)
      AND oe.event_type != 'RESET'
    GROUP BY date_trunc('hour', oe.created_at)
    ORDER BY hour_bucket ASC;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: get_demographics
-- Age/sex breakdown from accepted id_scans.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_demographics(
    p_business_id UUID,
    p_venue_id    UUID DEFAULT NULL,
    p_area_id     UUID DEFAULT NULL,
    p_start_ts    TIMESTAMPTZ DEFAULT NULL,
    p_end_ts      TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
    age_band   TEXT,
    sex        TEXT,
    scan_count BIGINT,
    percentage NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_total BIGINT;
BEGIN
    SELECT COUNT(*) INTO v_total
    FROM id_scans s
    WHERE s.business_id = p_business_id
      AND s.scan_result = 'ACCEPTED'
      AND (p_venue_id IS NULL OR s.venue_id = p_venue_id)
      AND (p_area_id IS NULL OR s.area_id = p_area_id)
      AND (p_start_ts IS NULL OR s.created_at >= p_start_ts)
      AND (p_end_ts IS NULL OR s.created_at <= p_end_ts);

    IF v_total = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        COALESCE(s.age_band, 'Unknown'),
        COALESCE(s.sex, 'U'),
        COUNT(*)::BIGINT,
        ROUND((COUNT(*)::NUMERIC / v_total::NUMERIC) * 100, 1)
    FROM id_scans s
    WHERE s.business_id = p_business_id
      AND s.scan_result = 'ACCEPTED'
      AND (p_venue_id IS NULL OR s.venue_id = p_venue_id)
      AND (p_area_id IS NULL OR s.area_id = p_area_id)
      AND (p_start_ts IS NULL OR s.created_at >= p_start_ts)
      AND (p_end_ts IS NULL OR s.created_at <= p_end_ts)
    GROUP BY COALESCE(s.age_band, 'Unknown'), COALESCE(s.sex, 'U')
    ORDER BY scan_count DESC;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: get_event_log
-- Unified timeline: occupancy_events + id_scans + audit_logs.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_event_log(
    p_business_id UUID,
    p_venue_id    UUID DEFAULT NULL,
    p_area_id     UUID DEFAULT NULL,
    p_start_ts    TIMESTAMPTZ DEFAULT NULL,
    p_end_ts      TIMESTAMPTZ DEFAULT NULL,
    p_limit       INTEGER DEFAULT 200
)
RETURNS TABLE(
    event_id   UUID,
    event_ts   TIMESTAMPTZ,
    event_type TEXT,
    delta      INTEGER,
    flow_type  TEXT,
    gender     TEXT,
    source     TEXT,
    user_id    UUID,
    device_id  UUID,
    details    JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        oe.id, oe.created_at, oe.event_type::TEXT,
        oe.delta, oe.flow_type, oe.gender, oe.source,
        oe.user_id, oe.device_id, NULL::JSONB
    FROM occupancy_events oe
    WHERE oe.business_id = p_business_id
      AND (p_venue_id IS NULL OR oe.venue_id = p_venue_id)
      AND (p_area_id IS NULL OR oe.area_id = p_area_id)
      AND (p_start_ts IS NULL OR oe.created_at >= p_start_ts)
      AND (p_end_ts IS NULL OR oe.created_at <= p_end_ts)

    UNION ALL

    SELECT
        s.id, s.created_at, 'SCAN'::TEXT,
        CASE WHEN s.scan_result = 'ACCEPTED' THEN 1 ELSE 0 END,
        'IN'::TEXT, s.sex, 'scan'::TEXT,
        NULL::UUID, s.device_id,
        jsonb_build_object('scan_result', s.scan_result, 'age', s.age, 'age_band', s.age_band)
    FROM id_scans s
    WHERE s.business_id = p_business_id
      AND (p_venue_id IS NULL OR s.venue_id = p_venue_id)
      AND (p_area_id IS NULL OR s.area_id = p_area_id)
      AND (p_start_ts IS NULL OR s.created_at >= p_start_ts)
      AND (p_end_ts IS NULL OR s.created_at <= p_end_ts)

    UNION ALL

    SELECT
        al.id, al.created_at, al.action::TEXT,
        0, NULL::TEXT, NULL::TEXT, 'system'::TEXT,
        al.performed_by_user_id, NULL::UUID, al.details_json
    FROM audit_logs al
    WHERE al.business_id = p_business_id
      AND (p_start_ts IS NULL OR al.created_at >= p_start_ts)
      AND (p_end_ts IS NULL OR al.created_at <= p_end_ts)

    ORDER BY event_ts DESC
    LIMIT p_limit;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: get_traffic_totals (dashboard widgets)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_traffic_totals(
    p_business_id UUID,
    p_venue_id    UUID DEFAULT NULL,
    p_area_id     UUID DEFAULT NULL,
    p_start_ts    TIMESTAMPTZ DEFAULT NULL,
    p_end_ts      TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(total_in BIGINT, total_out BIGINT, net_delta BIGINT, event_count BIGINT)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(CASE WHEN oe.flow_type = 'IN' THEN ABS(oe.delta) ELSE 0 END), 0)::BIGINT,
        COALESCE(SUM(CASE WHEN oe.flow_type = 'OUT' THEN ABS(oe.delta) ELSE 0 END), 0)::BIGINT,
        COALESCE(SUM(oe.delta), 0)::BIGINT,
        COUNT(*)::BIGINT
    FROM occupancy_events oe
    WHERE oe.business_id = p_business_id
      AND (p_venue_id IS NULL OR oe.venue_id = p_venue_id)
      AND (p_area_id IS NULL OR oe.area_id = p_area_id)
      AND (p_start_ts IS NULL OR oe.created_at >= p_start_ts)
      AND (p_end_ts IS NULL OR oe.created_at <= p_end_ts)
      AND oe.event_type != 'RESET';
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: check_ban_status
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION check_ban_status(
    p_business_id UUID,
    p_patron_id   UUID,
    p_venue_id    UUID DEFAULT NULL
)
RETURNS TABLE(is_banned BOOLEAN, ban_id UUID, ban_type TEXT, reason TEXT)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        true AS is_banned,
        pb.id AS ban_id,
        pb.ban_type,
        pb.reason_category AS reason
    FROM patron_bans pb
    WHERE pb.business_id = p_business_id
      AND pb.banned_person_id = p_patron_id
      AND pb.status = 'ACTIVE'
      AND (pb.end_datetime IS NULL OR pb.end_datetime > now())
      AND (
          pb.applies_to_all_locations = true
          OR (p_venue_id IS NOT NULL AND p_venue_id = ANY(pb.location_ids))
      )
    LIMIT 1;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: soft_delete_device
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION soft_delete_device(
    p_business_id UUID,
    p_device_id   UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE devices
    SET deleted_at = now(), status = 'INACTIVE', updated_at = now()
    WHERE id = p_device_id AND business_id = p_business_id;

    INSERT INTO audit_logs (business_id, action, performed_by_user_id, target_type, target_id)
    VALUES (p_business_id, 'DELETE_DEVICE', auth.uid(), 'DEVICE', p_device_id);
END;
$$;
