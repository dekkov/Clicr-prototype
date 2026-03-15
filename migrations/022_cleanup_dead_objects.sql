-- 022_cleanup_dead_objects.sql
-- Remove unused database objects identified during codebase audit (2026-03-14).
--
-- What's removed and why:
--   occupancy_snapshots    — Never created in 001_schema.sql. Occupancy is stored
--                            directly on areas.current_occupancy. Phantom indexes,
--                            RLS policies, and triggers reference a non-existent table.
--   view_area_details      — Depends on occupancy_snapshots; never used in app code.
--   process_occupancy_event — Legacy RPC from manual install; replaced by apply_occupancy_delta.
--   add_occupancy_delta     — Legacy wrapper from manual install; same replacement.
--   ensure_snapshot_on_area_create / trg_create_snapshot — Trigger that inserts into
--                            occupancy_snapshots; dead since that table doesn't exist.
--   exec_sql               — SECURITY DEFINER function that executes arbitrary SQL.
--                            Only used by a legacy admin route. Security risk.
--   onboarding_progress    — Only referenced by /debug pages; not used in production.
--   devices.firmware_version — Column defined in schema but never read or written.

-- ==========================================
-- 1. Drop phantom occupancy_snapshots objects
-- ==========================================

-- Drop trigger first (references the function)
DROP TRIGGER IF EXISTS trg_create_snapshot ON areas;

-- Drop the trigger function
DROP FUNCTION IF EXISTS ensure_snapshot_on_area_create();

-- Drop view that depends on occupancy_snapshots
DROP VIEW IF EXISTS view_area_details;

-- Drop indexes on the phantom table (IF EXISTS handles missing table gracefully)
DROP INDEX IF EXISTS idx_occupancy_snapshots_venue;
DROP INDEX IF EXISTS idx_occupancy_snapshots_business;

-- Drop RLS policies (these silently succeed even if table doesn't exist)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'occupancy_snapshots') THEN
        EXECUTE 'DROP POLICY IF EXISTS "snapshots_select" ON occupancy_snapshots';
        EXECUTE 'DROP POLICY IF EXISTS "snapshots_insert" ON occupancy_snapshots';
        EXECUTE 'DROP POLICY IF EXISTS "snapshots_update" ON occupancy_snapshots';
        EXECUTE 'DROP POLICY IF EXISTS "occupancy_snapshots_select_member" ON occupancy_snapshots';
        EXECUTE 'DROP POLICY IF EXISTS "occupancy_snapshots_insert_member" ON occupancy_snapshots';
        EXECUTE 'DROP POLICY IF EXISTS "occupancy_snapshots_update_admin" ON occupancy_snapshots';
        EXECUTE 'DROP POLICY IF EXISTS "occupancy_snapshots_delete_admin" ON occupancy_snapshots';
        EXECUTE 'DROP POLICY IF EXISTS "Enable read for authenticated" ON occupancy_snapshots';
        EXECUTE 'DROP POLICY IF EXISTS "Enable all for authenticated" ON occupancy_snapshots';
        EXECUTE 'DROP POLICY IF EXISTS "Allow read authenticated" ON occupancy_snapshots';
        EXECUTE 'DROP TABLE occupancy_snapshots CASCADE';
    END IF;
END $$;

-- ==========================================
-- 2. Drop legacy RPC functions
-- ==========================================

-- Legacy manual install functions (replaced by apply_occupancy_delta in 003_rpcs.sql)
DROP FUNCTION IF EXISTS process_occupancy_event(uuid, uuid, uuid, text, uuid, int, text, text, text);
DROP FUNCTION IF EXISTS add_occupancy_delta(uuid, uuid, uuid, text, int, text);

-- Dangerous arbitrary SQL executor
DROP FUNCTION IF EXISTS exec_sql(text);

-- ==========================================
-- 3. Drop unused tables
-- ==========================================

DROP TABLE IF EXISTS onboarding_progress CASCADE;

-- ==========================================
-- 4. Drop unused columns
-- ==========================================

ALTER TABLE devices DROP COLUMN IF EXISTS firmware_version;
