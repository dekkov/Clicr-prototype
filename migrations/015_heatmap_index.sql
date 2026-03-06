-- ============================================================================
-- CLICR V4 — HEATMAP INDEX
-- Migration: 015_heatmap_index.sql
-- Description: Partial index on occupancy_events for fast historical heatmap
--              aggregation — filters to entry events (delta > 0) and indexes
--              by business_id and created_at.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_occupancy_events_business_created_entries
    ON occupancy_events (business_id, created_at)
    WHERE delta > 0;
