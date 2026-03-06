-- migrations/015_heatmap_index.sql
-- Index to speed up historical entry queries used by the heatmap endpoint.
CREATE INDEX IF NOT EXISTS idx_count_events_biz_ts_entries
  ON count_events(business_id, timestamp)
  WHERE delta > 0;
