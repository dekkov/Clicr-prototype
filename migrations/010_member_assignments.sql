-- ============================================================================
-- CLICR V4 — Migration 010: Member venue/area assignments
-- ============================================================================
-- Adds assigned_venue_ids and assigned_area_ids to business_members for
-- role-based scoping: MANAGER restricted to venues, STAFF to areas.
-- OWNER/ADMIN/ANALYST use business_id (full business access).
-- ============================================================================

ALTER TABLE business_members ADD COLUMN IF NOT EXISTS assigned_venue_ids UUID[] DEFAULT '{}';
ALTER TABLE business_members ADD COLUMN IF NOT EXISTS assigned_area_ids UUID[] DEFAULT '{}';
