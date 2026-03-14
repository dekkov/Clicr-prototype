ALTER TABLE areas
  ADD COLUMN IF NOT EXISTS capacity_enforcement_mode TEXT
  DEFAULT 'WARN_ONLY'
  CHECK (capacity_enforcement_mode IN ('WARN_ONLY', 'HARD_STOP', 'MANAGER_OVERRIDE'));

COMMENT ON COLUMN areas.capacity_enforcement_mode IS
  'Controls behavior when area reaches capacity_max: WARN_ONLY (alert only), HARD_STOP (block entry), MANAGER_OVERRIDE (require manager confirm)';
