-- ============================================================================
-- Migration 007: Fix get_report_summary RPC
--
-- Problem fixed:
--   occupancy_events was missing the `source` column when the DB was
--   bootstrapped from manual_rpc_install.sql or manual_traffic_rpc.sql
--   (neither includes the `source` column). get_report_summary references
--   oe.source, causing every dashboard stats load to fail.
--
-- NOTE: The function remains STABLE (not SECURITY DEFINER) so that
--   row-level security continues to enforce multi-tenant isolation.
--   Authenticated users can only read data for businesses they belong to,
--   enforced by the existing events_select / scans_select / turnarounds_select
--   RLS policies (is_member_of(business_id)).
-- ============================================================================

-- 1. Add `source` column to occupancy_events if it doesn't already exist.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'occupancy_events' AND column_name = 'source'
    ) THEN
        ALTER TABLE occupancy_events ADD COLUMN source TEXT DEFAULT 'manual';
    END IF;
END $$;

-- 2. Recreate get_report_summary preserving STABLE (RLS stays active).
--    The only change from 003_rpcs.sql is that the source column now exists.
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

-- 3. Grant EXECUTE to authenticated users
GRANT EXECUTE ON FUNCTION get_report_summary(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
