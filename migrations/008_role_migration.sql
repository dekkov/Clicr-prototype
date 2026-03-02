-- ============================================================================
-- CLICR V4 — Migration 006: Role system migration
-- ============================================================================
-- Migrates from (OWNER, ADMIN, SUPERVISOR, USER) to
-- (OWNER, ADMIN, MANAGER, STAFF, ANALYST) to match the V4 RBAC spec.
--
-- Mapping:
--   SUPERVISOR → MANAGER (venue operations + banning)
--   USER       → STAFF   (door operations only)
--   (new)      → ANALYST (read-only reporting)
-- ============================================================================

-- 1. Migrate existing role values
UPDATE business_members SET role = 'MANAGER' WHERE role = 'SUPERVISOR';
UPDATE business_members SET role = 'STAFF'   WHERE role = 'USER';

-- 2. Replace CHECK constraint
ALTER TABLE business_members DROP CONSTRAINT IF EXISTS business_members_role_check;
ALTER TABLE business_members
    ADD CONSTRAINT business_members_role_check
    CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'STAFF', 'ANALYST'));

ALTER TABLE business_members ALTER COLUMN role SET DEFAULT 'STAFF';

-- 3. Rewrite has_role_in() for the new hierarchy
--    OWNER > ADMIN > MANAGER > STAFF  (operational chain)
--    ANALYST is read-only: only passes when min_role = 'ANALYST' or 'STAFF'
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
              -- OWNER always passes
              'OWNER',
              -- ADMIN passes for ADMIN, MANAGER, STAFF, ANALYST
              CASE WHEN p_min_role IN ('ADMIN', 'MANAGER', 'STAFF', 'ANALYST') THEN 'ADMIN' ELSE NULL END,
              -- MANAGER passes for MANAGER, STAFF
              CASE WHEN p_min_role IN ('MANAGER', 'STAFF') THEN 'MANAGER' ELSE NULL END,
              -- STAFF passes only for STAFF
              CASE WHEN p_min_role = 'STAFF' THEN 'STAFF' ELSE NULL END,
              -- ANALYST passes for ANALYST or STAFF (read access)
              CASE WHEN p_min_role IN ('ANALYST', 'STAFF') THEN 'ANALYST' ELSE NULL END
          )
    );
$$;

-- 4. Update RLS policies that referenced old roles
-- Areas/devices update: was SUPERVISOR, now MANAGER
DROP POLICY IF EXISTS areas_update ON areas;
CREATE POLICY areas_update ON areas FOR UPDATE
    USING (has_role_in(business_id, 'MANAGER'));

DROP POLICY IF EXISTS devices_update ON devices;
CREATE POLICY devices_update ON devices FOR UPDATE
    USING (has_role_in(business_id, 'MANAGER'));

-- Banned persons / patron bans: was SUPERVISOR, now MANAGER
DROP POLICY IF EXISTS bp_insert ON banned_persons;
CREATE POLICY bp_insert ON banned_persons FOR INSERT
    WITH CHECK (has_role_in(business_id, 'MANAGER'));

DROP POLICY IF EXISTS bp_update ON banned_persons;
CREATE POLICY bp_update ON banned_persons FOR UPDATE
    USING (has_role_in(business_id, 'MANAGER'));

DROP POLICY IF EXISTS pb_insert ON patron_bans;
CREATE POLICY pb_insert ON patron_bans FOR INSERT
    WITH CHECK (has_role_in(business_id, 'MANAGER'));

DROP POLICY IF EXISTS pb_update ON patron_bans;
CREATE POLICY pb_update ON patron_bans FOR UPDATE
    USING (has_role_in(business_id, 'MANAGER'));

-- 5. Add logo_url to businesses
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 6. Add board_views table
CREATE TABLE IF NOT EXISTS board_views (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    device_ids  UUID[] NOT NULL DEFAULT '{}',
    labels      JSONB DEFAULT '{}',
    created_by  UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE board_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY bv_select ON board_views FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY bv_insert ON board_views FOR INSERT
    WITH CHECK (is_member_of(business_id));

CREATE POLICY bv_update ON board_views FOR UPDATE
    USING (has_role_in(business_id, 'MANAGER'));

CREATE POLICY bv_delete ON board_views FOR DELETE
    USING (has_role_in(business_id, 'ADMIN'));
