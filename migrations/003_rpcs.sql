-- ============================================================================
-- CLICR V4 — RPC FUNCTIONS
-- Migration: 003_rpcs.sql
-- Description: Atomic stored procedures for counting, reporting, and resets.
--
-- WHY RPCs:
-- 1. apply_occupancy_delta MUST be atomic — no race conditions on rapid taps
-- 2. Reporting aggregations run server-side to avoid transferring raw events
-- 3. Reset is a multi-table operation that must be transactional
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- apply_occupancy_delta
-- The most critical function in the system.
-- Called on every tap/click. Must be fast, atomic, and idempotent-safe.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION apply_occupancy_delta(
    p_business_id UUID,
    p_venue_id    UUID,
    p_area_id     UUID,
    p_delta       INTEGER,
    p_source      TEXT DEFAULT 'manual',
    p_device_id   UUID DEFAULT NULL,
    p_gender      TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE(new_occupancy INTEGER, event_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_snapshot_id UUID;
    v_new_occ    INTEGER;
    v_event_id   UUID;
    v_flow_type  TEXT;
BEGIN
    -- Determine flow type from delta sign
    v_flow_type := CASE WHEN p_delta > 0 THEN 'IN' ELSE 'OUT' END;

    -- Idempotency check
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM occupancy_events
            WHERE idempotency_key = p_idempotency_key
        ) THEN
            -- Return existing values (idempotent retry)
            SELECT os.current_occupancy, oe.id
            INTO v_new_occ, v_event_id
            FROM occupancy_snapshots os
            JOIN occupancy_events oe ON oe.idempotency_key = p_idempotency_key
            WHERE os.business_id = p_business_id
              AND os.venue_id = p_venue_id
              AND os.area_id = p_area_id;

            RETURN QUERY SELECT v_new_occ, v_event_id;
            RETURN;
        END IF;
    END IF;

    -- UPSERT snapshot row (SELECT FOR UPDATE to prevent race conditions)
    INSERT INTO occupancy_snapshots (business_id, venue_id, area_id, current_occupancy)
    VALUES (p_business_id, p_venue_id, p_area_id, 0)
    ON CONFLICT (business_id, venue_id, area_id) DO NOTHING;

    -- Lock and update
    SELECT id, current_occupancy + p_delta
    INTO v_snapshot_id, v_new_occ
    FROM occupancy_snapshots
    WHERE business_id = p_business_id
      AND venue_id = p_venue_id
      AND area_id = p_area_id
    FOR UPDATE;

    -- Floor at 0 (occupancy can never go negative)
    v_new_occ := GREATEST(v_new_occ, 0);

    UPDATE occupancy_snapshots
    SET current_occupancy = v_new_occ,
        updated_at = now()
    WHERE id = v_snapshot_id;

    -- Insert the immutable event log entry
    INSERT INTO occupancy_events (
        business_id, venue_id, area_id, device_id,
        user_id, delta, flow_type, event_type, source,
        gender, idempotency_key
    )
    VALUES (
        p_business_id, p_venue_id, p_area_id, p_device_id,
        auth.uid(), p_delta, v_flow_type,
        CASE WHEN p_source = 'auto_scan' THEN 'AUTO_SCAN' ELSE 'TAP' END,
        p_source, p_gender, p_idempotency_key
    )
    RETURNING id INTO v_event_id;

    RETURN QUERY SELECT v_new_occ, v_event_id;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- reset_counts
-- Resets occupancy to 0 for all areas in scope. Sets last_reset_at.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reset_counts(
    p_scope       TEXT,  -- 'BUSINESS', 'VENUE', 'AREA'
    p_business_id UUID,
    p_venue_id    UUID DEFAULT NULL,
    p_area_id     UUID DEFAULT NULL,
    p_reason      TEXT DEFAULT NULL
)
RETURNS TABLE(areas_reset INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_reset_ts   TIMESTAMPTZ := now();
    v_count      INTEGER := 0;
BEGIN
    -- Reset snapshots
    IF p_scope = 'AREA' AND p_area_id IS NOT NULL THEN
        UPDATE occupancy_snapshots
        SET current_occupancy = 0, last_reset_at = v_reset_ts, updated_at = v_reset_ts
        WHERE business_id = p_business_id AND area_id = p_area_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;

        UPDATE areas SET last_reset_at = v_reset_ts WHERE id = p_area_id;

    ELSIF p_scope = 'VENUE' AND p_venue_id IS NOT NULL THEN
        UPDATE occupancy_snapshots
        SET current_occupancy = 0, last_reset_at = v_reset_ts, updated_at = v_reset_ts
        WHERE business_id = p_business_id AND venue_id = p_venue_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;

        UPDATE venues SET last_reset_at = v_reset_ts WHERE id = p_venue_id;
        UPDATE areas SET last_reset_at = v_reset_ts WHERE venue_id = p_venue_id;

    ELSE -- BUSINESS scope
        UPDATE occupancy_snapshots
        SET current_occupancy = 0, last_reset_at = v_reset_ts, updated_at = v_reset_ts
        WHERE business_id = p_business_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;

        UPDATE venues SET last_reset_at = v_reset_ts WHERE business_id = p_business_id;
        UPDATE areas SET last_reset_at = v_reset_ts WHERE business_id = p_business_id;
    END IF;

    -- Audit log
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

-- ────────────────────────────────────────────────────────────────────────────
-- get_report_summary
-- Core reporting aggregate. Returns totals since last reset or within window.
-- ────────────────────────────────────────────────────────────────────────────
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
    -- Determine effective start: use last_reset_at if no explicit start given
    IF p_start_ts IS NOT NULL THEN
        v_effective_start := p_start_ts;
    ELSE
        -- Find the most recent reset for the scope
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
        -- Entries (IN events)
        COALESCE(SUM(CASE WHEN oe.flow_type = 'IN' THEN ABS(oe.delta) ELSE 0 END), 0)::BIGINT AS total_entries_gross,
        -- Exits (OUT events)
        COALESCE(SUM(CASE WHEN oe.flow_type = 'OUT' THEN ABS(oe.delta) ELSE 0 END), 0)::BIGINT AS total_exits_gross,
        -- Turnarounds
        COALESCE((SELECT SUM(t.count) FROM turnarounds t
            WHERE t.business_id = p_business_id
            AND (p_venue_id IS NULL OR t.venue_id = p_venue_id)
            AND (p_area_id IS NULL OR t.area_id = p_area_id)
            AND t.created_at >= v_effective_start
            AND (p_end_ts IS NULL OR t.created_at <= p_end_ts)
        ), 0)::BIGINT AS turnarounds_count,
        -- Net adjusted = gross entries - turnarounds
        (COALESCE(SUM(CASE WHEN oe.flow_type = 'IN' THEN ABS(oe.delta) ELSE 0 END), 0) -
         COALESCE((SELECT SUM(t.count) FROM turnarounds t
            WHERE t.business_id = p_business_id
            AND (p_venue_id IS NULL OR t.venue_id = p_venue_id)
            AND (p_area_id IS NULL OR t.area_id = p_area_id)
            AND t.created_at >= v_effective_start
            AND (p_end_ts IS NULL OR t.created_at <= p_end_ts)
         ), 0))::BIGINT AS net_entries_adjusted,
        -- Manual entries
        COALESCE(SUM(CASE WHEN oe.flow_type = 'IN' AND oe.source = 'manual' THEN ABS(oe.delta) ELSE 0 END), 0)::BIGINT AS entries_manual,
        -- Scan entries
        COALESCE(SUM(CASE WHEN oe.flow_type = 'IN' AND oe.source IN ('scan', 'auto_scan') THEN ABS(oe.delta) ELSE 0 END), 0)::BIGINT AS entries_scan,
        -- Scan totals (from id_scans table)
        COALESCE((SELECT COUNT(*) FROM id_scans s
            WHERE s.business_id = p_business_id
            AND (p_venue_id IS NULL OR s.venue_id = p_venue_id)
            AND (p_area_id IS NULL OR s.area_id = p_area_id)
            AND s.created_at >= v_effective_start
            AND (p_end_ts IS NULL OR s.created_at <= p_end_ts)
        ), 0)::BIGINT AS scans_total,
        COALESCE((SELECT COUNT(*) FROM id_scans s
            WHERE s.business_id = p_business_id
            AND s.scan_result = 'ACCEPTED'
            AND (p_venue_id IS NULL OR s.venue_id = p_venue_id)
            AND (p_area_id IS NULL OR s.area_id = p_area_id)
            AND s.created_at >= v_effective_start
            AND (p_end_ts IS NULL OR s.created_at <= p_end_ts)
        ), 0)::BIGINT AS scans_accepted,
        COALESCE((SELECT COUNT(*) FROM id_scans s
            WHERE s.business_id = p_business_id
            AND s.scan_result = 'DENIED'
            AND (p_venue_id IS NULL OR s.venue_id = p_venue_id)
            AND (p_area_id IS NULL OR s.area_id = p_area_id)
            AND s.created_at >= v_effective_start
            AND (p_end_ts IS NULL OR s.created_at <= p_end_ts)
        ), 0)::BIGINT AS scans_denied,
        v_effective_start AS effective_start_ts
    FROM occupancy_events oe
    WHERE oe.business_id = p_business_id
      AND (p_venue_id IS NULL OR oe.venue_id = p_venue_id)
      AND (p_area_id IS NULL OR oe.area_id = p_area_id)
      AND oe.created_at >= v_effective_start
      AND (p_end_ts IS NULL OR oe.created_at <= p_end_ts)
      AND oe.event_type != 'RESET';
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- get_hourly_traffic
-- Returns bucketed traffic by hour for charts.
-- ────────────────────────────────────────────────────────────────────────────
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
        COALESCE(SUM(CASE WHEN oe.flow_type = 'IN' THEN ABS(oe.delta) ELSE 0 END), 0)::BIGINT AS entries_in,
        COALESCE(SUM(CASE WHEN oe.flow_type = 'OUT' THEN ABS(oe.delta) ELSE 0 END), 0)::BIGINT AS entries_out,
        COALESCE(SUM(oe.delta), 0)::BIGINT AS net_delta
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

-- ────────────────────────────────────────────────────────────────────────────
-- get_demographics
-- Age/sex breakdown from id_scans for a given scope and time window.
-- ────────────────────────────────────────────────────────────────────────────
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
    -- Count total scans for percentage calculation
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
        COALESCE(s.age_band, 'Unknown') AS age_band,
        COALESCE(s.sex, 'U') AS sex,
        COUNT(*)::BIGINT AS scan_count,
        ROUND((COUNT(*)::NUMERIC / v_total::NUMERIC) * 100, 1) AS percentage
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

-- ────────────────────────────────────────────────────────────────────────────
-- get_event_log
-- Unified timeline view of all activity within scope. Combines:
-- occupancy_events, id_scans, audit_logs (resets), turnarounds
-- ────────────────────────────────────────────────────────────────────────────
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
    -- Occupancy events
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

    -- ID Scans
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

    -- Audit logs (resets, config changes)
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

-- ────────────────────────────────────────────────────────────────────────────
-- get_traffic_totals (simplified version for dashboard widgets)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_traffic_totals(
    p_business_id UUID,
    p_venue_id    UUID DEFAULT NULL,
    p_area_id     UUID DEFAULT NULL,
    p_start_ts    TIMESTAMPTZ DEFAULT NULL,
    p_end_ts      TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(total_in BIGINT, total_out BIGINT, net BIGINT)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(CASE WHEN oe.flow_type = 'IN' THEN ABS(oe.delta) ELSE 0 END), 0)::BIGINT,
        COALESCE(SUM(CASE WHEN oe.flow_type = 'OUT' THEN ABS(oe.delta) ELSE 0 END), 0)::BIGINT,
        COALESCE(SUM(oe.delta), 0)::BIGINT
    FROM occupancy_events oe
    WHERE oe.business_id = p_business_id
      AND (p_venue_id IS NULL OR oe.venue_id = p_venue_id)
      AND (p_area_id IS NULL OR oe.area_id = p_area_id)
      AND (p_start_ts IS NULL OR oe.created_at >= p_start_ts)
      AND (p_end_ts IS NULL OR oe.created_at <= p_end_ts)
      AND oe.event_type != 'RESET';
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- check_ban_status
-- ────────────────────────────────────────────────────────────────────────────
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

    -- If no rows returned, client checks empty result = not banned
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- soft_delete_device
-- ────────────────────────────────────────────────────────────────────────────
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
