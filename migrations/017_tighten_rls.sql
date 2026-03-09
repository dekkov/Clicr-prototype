-- Migration 017: Tighten overly permissive RLS policies
-- Replaces USING (true) policies with proper business_id scoping
-- Depends on: is_member_of() and has_role_in() functions from 004_rls.sql
--
-- Context: The Supabase dashboard may have created permissive policies
-- ("Enable read for authenticated", "Enable all for authenticated") that
-- use USING(true), allowing any authenticated user to read/write across
-- all businesses. This migration drops those and ensures proper scoping.

-- ── Occupancy Events ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Enable read for authenticated" ON occupancy_events;

CREATE POLICY "occupancy_events_select_member"
    ON occupancy_events FOR SELECT
    TO authenticated
    USING (is_member_of(business_id));

-- ── Occupancy Snapshots ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Enable all for authenticated" ON occupancy_snapshots;

CREATE POLICY "occupancy_snapshots_select_member"
    ON occupancy_snapshots FOR SELECT
    TO authenticated
    USING (is_member_of(business_id));

CREATE POLICY "occupancy_snapshots_insert_member"
    ON occupancy_snapshots FOR INSERT
    TO authenticated
    WITH CHECK (is_member_of(business_id));

CREATE POLICY "occupancy_snapshots_update_admin"
    ON occupancy_snapshots FOR UPDATE
    TO authenticated
    USING (has_role_in(business_id, 'ADMIN'));

CREATE POLICY "occupancy_snapshots_delete_admin"
    ON occupancy_snapshots FOR DELETE
    TO authenticated
    USING (has_role_in(business_id, 'ADMIN'));
