-- ============================================================================
-- CLICR V4 — Migration 006: Add FK constraints to auth.users with CASCADE
-- ============================================================================
-- 001_schema.sql defined user_id columns without actual FK constraints.
-- This migration adds them so deleting a user from auth.users automatically
-- cleans up their personal data.
--
-- STRATEGY:
--   ON DELETE CASCADE  → personal/session data that belongs to the user
--   ON DELETE SET NULL → audit/history records that should be kept
-- ============================================================================

-- onboarding_progress: belongs entirely to the user → cascade
ALTER TABLE onboarding_progress
    ADD CONSTRAINT fk_onboarding_progress_user
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- business_members: membership row belongs to the user → cascade
ALTER TABLE business_members
    ADD CONSTRAINT fk_business_members_user
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- app_errors: keep for debugging, just null out the user ref
ALTER TABLE app_errors
    ADD CONSTRAINT fk_app_errors_user
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- id_scans: historical record, keep it
ALTER TABLE id_scans
    ADD CONSTRAINT fk_id_scans_user
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
