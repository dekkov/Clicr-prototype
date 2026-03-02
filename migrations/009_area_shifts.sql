-- ============================================================================
-- CLICR V4 — Migration 007: Area-level shift management
-- ============================================================================
-- Moves auto-reset configuration from per-device (clicr.button_config) to
-- per-area. Each area can be AUTO (scheduled daily reset) or MANUAL
-- (operator presses "Start Shift").
-- ============================================================================

ALTER TABLE areas ADD COLUMN IF NOT EXISTS shift_mode TEXT NOT NULL DEFAULT 'MANUAL'
    CHECK (shift_mode IN ('AUTO', 'MANUAL'));

ALTER TABLE areas ADD COLUMN IF NOT EXISTS auto_reset_time TEXT;       -- e.g. '09:00' (24h)
ALTER TABLE areas ADD COLUMN IF NOT EXISTS auto_reset_timezone TEXT;   -- e.g. 'America/New_York'
