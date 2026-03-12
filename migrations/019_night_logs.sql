-- Fix: add missing last_reset_at column to businesses table.
-- The reset API writes to this column but it was never in the DDL.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMPTZ;

-- Night logs: per-period metrics snapshot, written on Night Reset.
-- Multiple logs per date are allowed (e.g., manual advance + auto-reset).
CREATE TABLE IF NOT EXISTS night_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
    business_date DATE NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    reset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    total_in INT NOT NULL DEFAULT 0,
    total_out INT NOT NULL DEFAULT 0,
    turnarounds INT NOT NULL DEFAULT 0,
    scans_total INT NOT NULL DEFAULT 0,
    scans_accepted INT NOT NULL DEFAULT 0,
    scans_denied INT NOT NULL DEFAULT 0,
    peak_occupancy INT NOT NULL DEFAULT 0,
    reset_type TEXT NOT NULL CHECK (reset_type IN ('NIGHT_AUTO', 'NIGHT_MANUAL')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_night_logs_biz_date
    ON night_logs (business_id, business_date DESC);

-- RLS
ALTER TABLE night_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY night_logs_read ON night_logs
    FOR SELECT USING (
        business_id IN (
            SELECT business_id FROM business_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY night_logs_write ON night_logs
    FOR INSERT WITH CHECK (
        business_id IN (
            SELECT business_id FROM business_members
            WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN')
        )
    );
