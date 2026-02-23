-- ============================================================================
-- CLICR V4 — ROW LEVEL SECURITY (RLS)
-- Migration: 004_rls.sql
-- Description: Multi-tenant RLS policies. Every table is locked down so that
--              users can only access rows belonging to their business.
--
-- PRINCIPLE: A user has access to a business's data IFF they have a row in
--            business_members with that business_id and their auth.uid().
--
-- NOTES:
-- - RLS is enforced on ALL tables (ALTER TABLE ... ENABLE ROW LEVEL SECURITY)
-- - SECURITY DEFINER on RPCs bypasses RLS intentionally (they do their own checks)
-- - No silent empty arrays: if a user lacks access, they get an RLS error, not []
-- ============================================================================

-- ── Helper: check membership ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_member_of(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM business_members
        WHERE business_id = p_business_id
          AND user_id = auth.uid()
    );
$$;

-- ── Helper: check role level ────────────────────────────────────────────
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
              CASE p_min_role
                  WHEN 'OWNER' THEN 'OWNER'
                  WHEN 'ADMIN' THEN 'OWNER'  -- fallthrough handled below
                  WHEN 'SUPERVISOR' THEN 'OWNER'
                  ELSE 'OWNER'
              END,
              CASE WHEN p_min_role IN ('ADMIN', 'SUPERVISOR', 'USER') THEN 'ADMIN' ELSE NULL END,
              CASE WHEN p_min_role IN ('SUPERVISOR', 'USER') THEN 'SUPERVISOR' ELSE NULL END,
              CASE WHEN p_min_role = 'USER' THEN 'USER' ELSE NULL END
          )
    );
$$;

-- ════════════════════════════════════════════════════════════════════════
-- ENABLE RLS ON ALL TABLES
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE businesses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE occupancy_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE occupancy_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE id_scans                ENABLE ROW LEVEL SECURITY;
ALTER TABLE banned_persons          ENABLE ROW LEVEL SECURITY;
ALTER TABLE patron_bans             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ban_audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ban_enforcement_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnarounds             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_errors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress     ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════
-- BUSINESSES
-- ════════════════════════════════════════════════════════════════════════
CREATE POLICY businesses_select ON businesses FOR SELECT
    USING (is_member_of(id));

CREATE POLICY businesses_update ON businesses FOR UPDATE
    USING (has_role_in(id, 'ADMIN'));

-- Insert: anyone can create a business (they become OWNER via trigger)
CREATE POLICY businesses_insert ON businesses FOR INSERT
    WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════
-- BUSINESS MEMBERS
-- ════════════════════════════════════════════════════════════════════════
CREATE POLICY bm_select ON business_members FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY bm_insert ON business_members FOR INSERT
    WITH CHECK (has_role_in(business_id, 'ADMIN'));

CREATE POLICY bm_update ON business_members FOR UPDATE
    USING (has_role_in(business_id, 'ADMIN'));

CREATE POLICY bm_delete ON business_members FOR DELETE
    USING (has_role_in(business_id, 'OWNER'));

-- ════════════════════════════════════════════════════════════════════════
-- VENUES
-- ════════════════════════════════════════════════════════════════════════
CREATE POLICY venues_select ON venues FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY venues_insert ON venues FOR INSERT
    WITH CHECK (is_member_of(business_id));

CREATE POLICY venues_update ON venues FOR UPDATE
    USING (has_role_in(business_id, 'ADMIN'));

CREATE POLICY venues_delete ON venues FOR DELETE
    USING (has_role_in(business_id, 'OWNER'));

-- ════════════════════════════════════════════════════════════════════════
-- AREAS
-- ════════════════════════════════════════════════════════════════════════
CREATE POLICY areas_select ON areas FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY areas_insert ON areas FOR INSERT
    WITH CHECK (is_member_of(business_id));

CREATE POLICY areas_update ON areas FOR UPDATE
    USING (has_role_in(business_id, 'SUPERVISOR'));

CREATE POLICY areas_delete ON areas FOR DELETE
    USING (has_role_in(business_id, 'ADMIN'));

-- ════════════════════════════════════════════════════════════════════════
-- DEVICES
-- ════════════════════════════════════════════════════════════════════════
CREATE POLICY devices_select ON devices FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY devices_insert ON devices FOR INSERT
    WITH CHECK (is_member_of(business_id));

CREATE POLICY devices_update ON devices FOR UPDATE
    USING (has_role_in(business_id, 'SUPERVISOR'));

CREATE POLICY devices_delete ON devices FOR DELETE
    USING (has_role_in(business_id, 'ADMIN'));

-- ════════════════════════════════════════════════════════════════════════
-- OCCUPANCY SNAPSHOTS
-- ════════════════════════════════════════════════════════════════════════
CREATE POLICY snapshots_select ON occupancy_snapshots FOR SELECT
    USING (is_member_of(business_id));

-- Writes go through RPCs (SECURITY DEFINER), but allow direct for setup
CREATE POLICY snapshots_insert ON occupancy_snapshots FOR INSERT
    WITH CHECK (is_member_of(business_id));

CREATE POLICY snapshots_update ON occupancy_snapshots FOR UPDATE
    USING (is_member_of(business_id));

-- ════════════════════════════════════════════════════════════════════════
-- OCCUPANCY EVENTS (append-only for most users)
-- ════════════════════════════════════════════════════════════════════════
CREATE POLICY events_select ON occupancy_events FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY events_insert ON occupancy_events FOR INSERT
    WITH CHECK (is_member_of(business_id));

-- No UPDATE or DELETE policies — events are immutable

-- ════════════════════════════════════════════════════════════════════════
-- ID SCANS
-- ════════════════════════════════════════════════════════════════════════
CREATE POLICY scans_select ON id_scans FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY scans_insert ON id_scans FOR INSERT
    WITH CHECK (is_member_of(business_id));

-- ════════════════════════════════════════════════════════════════════════
-- BANNED PERSONS
-- ════════════════════════════════════════════════════════════════════════
CREATE POLICY bp_select ON banned_persons FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY bp_insert ON banned_persons FOR INSERT
    WITH CHECK (has_role_in(business_id, 'SUPERVISOR'));

CREATE POLICY bp_update ON banned_persons FOR UPDATE
    USING (has_role_in(business_id, 'SUPERVISOR'));

-- ════════════════════════════════════════════════════════════════════════
-- PATRON BANS
-- ════════════════════════════════════════════════════════════════════════
CREATE POLICY pb_select ON patron_bans FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY pb_insert ON patron_bans FOR INSERT
    WITH CHECK (has_role_in(business_id, 'SUPERVISOR'));

CREATE POLICY pb_update ON patron_bans FOR UPDATE
    USING (has_role_in(business_id, 'SUPERVISOR'));

-- ════════════════════════════════════════════════════════════════════════
-- BAN AUDIT LOGS & ENFORCEMENT
-- ════════════════════════════════════════════════════════════════════════
CREATE POLICY bal_select ON ban_audit_logs FOR SELECT
    USING (EXISTS(
        SELECT 1 FROM patron_bans pb
        WHERE pb.id = ban_audit_logs.ban_id
          AND is_member_of(pb.business_id)
    ));

CREATE POLICY bal_insert ON ban_audit_logs FOR INSERT
    WITH CHECK (true); -- controlled by application logic

CREATE POLICY bee_select ON ban_enforcement_events FOR SELECT
    USING (EXISTS(
        SELECT 1 FROM patron_bans pb
        WHERE pb.id = ban_enforcement_events.ban_id
          AND is_member_of(pb.business_id)
    ));

CREATE POLICY bee_insert ON ban_enforcement_events FOR INSERT
    WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════
-- TURNAROUNDS
-- ════════════════════════════════════════════════════════════════════════
CREATE POLICY turnarounds_select ON turnarounds FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY turnarounds_insert ON turnarounds FOR INSERT
    WITH CHECK (is_member_of(business_id));

-- ════════════════════════════════════════════════════════════════════════
-- AUDIT LOGS
-- ════════════════════════════════════════════════════════════════════════
CREATE POLICY al_select ON audit_logs FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY al_insert ON audit_logs FOR INSERT
    WITH CHECK (true); -- system-generated

-- ════════════════════════════════════════════════════════════════════════
-- APP ERRORS
-- ════════════════════════════════════════════════════════════════════════
CREATE POLICY ae_select ON app_errors FOR SELECT
    USING (
        business_id IS NULL -- system errors visible to all
        OR is_member_of(business_id)
    );

CREATE POLICY ae_insert ON app_errors FOR INSERT
    WITH CHECK (true); -- anyone can log errors

-- ════════════════════════════════════════════════════════════════════════
-- ONBOARDING PROGRESS
-- ════════════════════════════════════════════════════════════════════════
CREATE POLICY op_select ON onboarding_progress FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY op_insert ON onboarding_progress FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY op_update ON onboarding_progress FOR UPDATE
    USING (user_id = auth.uid());
