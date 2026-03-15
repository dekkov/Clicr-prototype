-- ============================================================================
-- CLICR V4 — CONSOLIDATED ROW LEVEL SECURITY
-- Consolidated from: 004, 005, 008, 011, 012, 017, 019, 020
--
-- All policies are at their FINAL version.
-- Depends on: is_member_of() and has_role_in() from 003_functions.sql
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- ENABLE RLS ON ALL TABLES
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE businesses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_counter_labels   ENABLE ROW LEVEL SECURITY;
ALTER TABLE occupancy_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE id_scans                ENABLE ROW LEVEL SECURITY;
ALTER TABLE banned_persons          ENABLE ROW LEVEL SECURITY;
ALTER TABLE patron_bans             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ban_audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ban_enforcement_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnarounds             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_errors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_views             ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE night_logs              ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════════
-- BUSINESSES
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY businesses_select ON businesses FOR SELECT
    USING (is_member_of(id));

CREATE POLICY businesses_update ON businesses FOR UPDATE
    USING (has_role_in(id, 'ADMIN'));

CREATE POLICY businesses_insert ON businesses FOR INSERT
    WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- BUSINESS MEMBERS
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY bm_select ON business_members FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY bm_insert ON business_members FOR INSERT
    WITH CHECK (has_role_in(business_id, 'ADMIN'));

CREATE POLICY bm_update ON business_members FOR UPDATE
    USING (has_role_in(business_id, 'ADMIN'));

CREATE POLICY bm_delete ON business_members FOR DELETE
    USING (has_role_in(business_id, 'OWNER'));

-- ════════════════════════════════════════════════════════════════════════════
-- VENUES
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY venues_select ON venues FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY venues_insert ON venues FOR INSERT
    WITH CHECK (is_member_of(business_id));

CREATE POLICY venues_update ON venues FOR UPDATE
    USING (has_role_in(business_id, 'ADMIN'));

CREATE POLICY venues_delete ON venues FOR DELETE
    USING (has_role_in(business_id, 'OWNER'));

-- ════════════════════════════════════════════════════════════════════════════
-- AREAS
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY areas_select ON areas FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY areas_insert ON areas FOR INSERT
    WITH CHECK (is_member_of(business_id));

CREATE POLICY areas_update ON areas FOR UPDATE
    USING (has_role_in(business_id, 'MANAGER'));

CREATE POLICY areas_delete ON areas FOR DELETE
    USING (has_role_in(business_id, 'ADMIN'));

-- ════════════════════════════════════════════════════════════════════════════
-- DEVICES
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY devices_select ON devices FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY devices_insert ON devices FOR INSERT
    WITH CHECK (is_member_of(business_id));

CREATE POLICY devices_update ON devices FOR UPDATE
    USING (has_role_in(business_id, 'MANAGER'));

CREATE POLICY devices_delete ON devices FOR DELETE
    USING (has_role_in(business_id, 'ADMIN'));

-- ════════════════════════════════════════════════════════════════════════════
-- DEVICE COUNTER LABELS
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY dcl_select ON device_counter_labels FOR SELECT
    TO authenticated
    USING (device_id IN (SELECT id FROM devices WHERE is_member_of(business_id)));

CREATE POLICY dcl_insert ON device_counter_labels FOR INSERT
    TO authenticated
    WITH CHECK (device_id IN (SELECT id FROM devices WHERE is_member_of(business_id)));

CREATE POLICY dcl_update ON device_counter_labels FOR UPDATE
    TO authenticated
    USING (device_id IN (SELECT id FROM devices WHERE has_role_in(business_id, 'MANAGER')));

CREATE POLICY dcl_delete ON device_counter_labels FOR DELETE
    TO authenticated
    USING (device_id IN (SELECT id FROM devices WHERE has_role_in(business_id, 'ADMIN')));

-- ════════════════════════════════════════════════════════════════════════════
-- OCCUPANCY EVENTS (append-only)
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY occupancy_events_select_member ON occupancy_events FOR SELECT
    TO authenticated
    USING (is_member_of(business_id));

CREATE POLICY events_insert ON occupancy_events FOR INSERT
    WITH CHECK (is_member_of(business_id));

-- ════════════════════════════════════════════════════════════════════════════
-- ID SCANS
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY scans_select ON id_scans FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY scans_insert ON id_scans FOR INSERT
    WITH CHECK (is_member_of(business_id));

-- ════════════════════════════════════════════════════════════════════════════
-- BANNED PERSONS
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY bp_select ON banned_persons FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY bp_insert ON banned_persons FOR INSERT
    WITH CHECK (has_role_in(business_id, 'MANAGER'));

CREATE POLICY bp_update ON banned_persons FOR UPDATE
    USING (has_role_in(business_id, 'MANAGER'));

-- ════════════════════════════════════════════════════════════════════════════
-- PATRON BANS
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY pb_select ON patron_bans FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY pb_insert ON patron_bans FOR INSERT
    WITH CHECK (has_role_in(business_id, 'MANAGER'));

CREATE POLICY pb_update ON patron_bans FOR UPDATE
    USING (has_role_in(business_id, 'MANAGER'));

-- ════════════════════════════════════════════════════════════════════════════
-- BAN AUDIT LOGS & ENFORCEMENT
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY bal_select ON ban_audit_logs FOR SELECT
    USING (EXISTS(
        SELECT 1 FROM patron_bans pb
        WHERE pb.id = ban_audit_logs.ban_id
          AND is_member_of(pb.business_id)
    ));

CREATE POLICY bal_insert ON ban_audit_logs FOR INSERT
    WITH CHECK (true);

CREATE POLICY bee_select ON ban_enforcement_events FOR SELECT
    USING (EXISTS(
        SELECT 1 FROM patron_bans pb
        WHERE pb.id = ban_enforcement_events.ban_id
          AND is_member_of(pb.business_id)
    ));

CREATE POLICY bee_insert ON ban_enforcement_events FOR INSERT
    WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- TURNAROUNDS
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY turnarounds_select ON turnarounds FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY turnarounds_insert ON turnarounds FOR INSERT
    WITH CHECK (is_member_of(business_id));

-- ════════════════════════════════════════════════════════════════════════════
-- AUDIT LOGS
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY al_select ON audit_logs FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY al_insert ON audit_logs FOR INSERT
    WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- APP ERRORS
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY ae_select ON app_errors FOR SELECT
    USING (
        business_id IS NULL
        OR is_member_of(business_id)
    );

CREATE POLICY ae_insert ON app_errors FOR INSERT
    WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- BOARD VIEWS
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY bv_select ON board_views FOR SELECT
    USING (is_member_of(business_id));

CREATE POLICY bv_insert ON board_views FOR INSERT
    WITH CHECK (is_member_of(business_id));

CREATE POLICY bv_update ON board_views FOR UPDATE
    USING (has_role_in(business_id, 'MANAGER'));

CREATE POLICY bv_delete ON board_views FOR DELETE
    USING (has_role_in(business_id, 'ADMIN'));

-- ════════════════════════════════════════════════════════════════════════════
-- SHIFTS
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY shifts_select ON shifts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM business_members bm
            WHERE bm.business_id = shifts.business_id
            AND bm.user_id = auth.uid()
        )
    );

CREATE POLICY shifts_insert ON shifts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY shifts_update ON shifts FOR UPDATE
    USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- SUPPORT TICKETS
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY st_insert ON support_tickets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY st_select ON support_tickets FOR SELECT
    USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- NIGHT LOGS
-- ════════════════════════════════════════════════════════════════════════════
CREATE POLICY night_logs_read ON night_logs FOR SELECT
    USING (
        business_id IN (
            SELECT business_id FROM business_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY night_logs_write ON night_logs FOR INSERT
    WITH CHECK (
        business_id IN (
            SELECT business_id FROM business_members
            WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN')
        )
    );
