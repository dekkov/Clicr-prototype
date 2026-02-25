# Future Fix Tracker

Issues that are known but deferred. Run `/future-fix` at the end of any session to append new findings.

---

## [2026-02-24] Onboarding — business_members upsert has no error check

**File:** `app/onboarding/actions.ts` ~line 135
**Risk:** Low (admin client rarely fails)
**Impact:** If the upsert fails silently, the user has an orphaned business with no OWNER membership. They'll hit RLS blocks everywhere in the dashboard.
**Fix:** Destructure the error and throw it:
```typescript
const { error: memError } = await supabaseAdmin.from('business_members').upsert({...});
if (memError) throw memError;
```

---

## [2026-02-24] Schema — current_step default is 'ACCOUNT_CREATED' (string) but code expects integers

**File:** `migrations/001_schema.sql` ~line 290
**Risk:** Low with current code paths
**Impact:** Any row created without explicitly setting `current_step` gets the default `'ACCOUNT_CREATED'`. `Number('ACCOUNT_CREATED')` = `NaN` — no step handler matches, silent redirect loop in onboarding.
**Fix:** Either change schema default to `2`, or change column type to `INTEGER` in a new migration:
```sql
ALTER TABLE onboarding_progress
  ALTER COLUMN current_step TYPE INTEGER USING current_step::INTEGER,
  ALTER COLUMN current_step SET DEFAULT 2;
```

---
