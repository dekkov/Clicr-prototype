-- ============================================================================
-- CLICR V4 — Migration 005: Fix onboarding RLS bootstrap deadlock
-- ============================================================================
-- PROBLEM: business_members INSERT policy requires has_role_in(business_id, 'ADMIN').
-- During onboarding, the creating user has no membership yet, so the insert is
-- blocked — a chicken-and-egg deadlock that prevents any new business from being created.
--
-- FIX: Add a SECURITY DEFINER trigger that automatically creates an OWNER
-- membership row whenever a new business is inserted. This runs inside the same
-- transaction as the INSERT, so RLS on subsequent venue inserts passes correctly.
-- ============================================================================

CREATE OR REPLACE FUNCTION create_owner_membership_on_business_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO business_members (business_id, user_id, role)
    VALUES (NEW.id, auth.uid(), 'OWNER')
    ON CONFLICT (business_id, user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_business_created ON businesses;
CREATE TRIGGER on_business_created
    AFTER INSERT ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION create_owner_membership_on_business_insert();
