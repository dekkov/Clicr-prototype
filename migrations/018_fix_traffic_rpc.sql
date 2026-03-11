-- migrations/018_fix_traffic_rpc.sql
-- Fix: align get_traffic_totals return columns with what the API expects

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
