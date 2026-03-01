# Multi-Business Support & Onboarding Redesign
**Date:** 2026-02-28
**Branch:** `worktree-add-business-venues`
**Status:** Complete — 11 commits, all tasks reviewed and approved

---

## What Changed

### Bug Fixes (pre-existing, found during this session)

**Add Venue button broken (`/venues/new`)**
- Root cause 1: `case 'ADD_VENUE':` was missing from the POST `/api/sync` switch → hit `default` → 400 "Invalid action" → venue never persisted → FK chain broken for subsequent area/clicr inserts.
- Root cause 2: IDs generated with `Math.random().toString(36).substring(7)` (e.g. `"3hs7d2k"`) but Supabase schema has `UUID PRIMARY KEY` for venues, areas, and devices.
- Fix: Added `ADD_VENUE` case to `route.ts`. Changed all three ID generators in `venues/new/page.tsx` to `crypto.randomUUID()`.

**`UPDATE_BUSINESS` silently dropped**
- The POST handler never had a `case 'UPDATE_BUSINESS':` — any call (e.g. setting org name in `/venues/new`) hit `default` and returned 400. Optimistic state made the UI appear to work until the next poll reset it.
- Fix: Added the case — resolves `business_id` from `business_members`, updates Supabase, returns updated state.

---

### Part A — Multi-Business Support

**`lib/store.tsx`**
- Added `businesses: Business[]` and `activeBusiness: Business | null` to `AppState`
- Added `selectBusiness()`, `clearBusiness()` actions
- `activeBusinessIdRef` ref tracks active business for polling — all `GET /api/sync` calls include `?businessId=` when a business is active
- Auto-selects single business on first load
- Two bugs found and fixed in review:
  - `activeBusinessIdRef` was not written during auto-select → subsequent polls were unscoped. Fixed by writing the ref synchronously before `setState`.
  - `clearBusiness()` was undone by the next poll (auto-select fired again). Fixed with `userClearedRef = useRef(false)` sentinel — set on `clearBusiness()`, cleared on `selectBusiness()`.

**`app/api/sync/route.ts` (GET)**
- Now accepts `?businessId=` query param
- Fetches ALL `business_members` for the user (was `.limit(1).single()`)
- Validates `?businessId=` against user's actual memberships before accepting (IDOR fix — unvalidated param could have injected another business's venue IDs into the visibility scope)
- Returns `businesses: allBusinesses` in all response paths

**`app/(authenticated)/dashboard/page.tsx`**
- Shows business picker grid when `businesses.length > 1 && !activeBusiness`
- Auto-redirects to `/onboarding/setup` when `businesses.length === 0 && !business` — guarded on `currentUser.id` being set so a network error on first load doesn't falsely redirect existing users
- "← Switch Business" button calls `clearBusiness()` when multiple businesses exist
- `InlineSetup` component removed

---

### Part B — Onboarding Redesign

**`utils/supabase/middleware.ts`**
Added `!path.startsWith('/onboarding/setup')` to `isWizardRoute` so the new page passes through instead of redirecting to `/dashboard`.

**`app/onboarding/setup/page.tsx`** (new file)
4-step client-side wizard:

| Step | Required | Action |
|------|----------|--------|
| Business | Yes | `createInitialBusiness()` server action |
| Venue | Skippable | `addVenue()` store action |
| Areas | Skippable | `addArea()` store action (repeatable) |
| Clicrs | Skippable | `addClicr()` store action (repeatable) |

- All IDs via `crypto.randomUUID()`
- `parseInt` calls use radix + `|| 0` NaN guard
- "Skip for now" on any optional step goes directly to `/dashboard`

**`app/(authenticated)/dashboard/_components/GettingStartedChecklist.tsx`**
- Venue checklist item `href` changed from `null` to `/venues/new`

**`needsSetup` on dashboard**
Changed from `!business || venues.length === 0` → `!business`. Checklist now shows whenever business exists (even with no venues), so users who skip the venue step in onboarding still see the progress tracker.

---

## Key Design Decisions

**IDOR prevention:** `?businessId=` is validated against `business_members` before use. Invalid/foreign IDs silently fall back to the user's first membership (no data leak, though this causes a brief UI mismatch — noted as a known limitation).

**`clearBusiness()` sentinel:** Using `userClearedRef` (not state) avoids a race where clearing state triggers a re-render and the auto-select `??` fallback immediately re-selects. Refs are synchronous and escape React's stale-closure batching.

**`business_id` in onboarding venue step:** The wizard passes `business?.id ?? ''` which may be empty immediately after business creation (store hasn't polled yet). This is safe because `ADD_VENUE` in the POST handler resolves `business_id` server-side from `business_members` and ignores the client-supplied field. The optimistic local state has empty `business_id` for ~2 seconds until polling reconciles.

**Realtime subscriptions:** No changes needed. The subscription `useEffect` has `[state.business?.id]` as its dependency — `selectBusiness()` sets `state.business`, which automatically tears down the old channel and re-subscribes to the new business.

---

## Files Modified

| File | Type |
|------|------|
| `lib/store.tsx` | Modified |
| `app/api/sync/route.ts` | Modified |
| `app/(authenticated)/dashboard/page.tsx` | Modified |
| `app/(authenticated)/dashboard/_components/GettingStartedChecklist.tsx` | Modified |
| `app/(authenticated)/venues/new/page.tsx` | Modified (bug fix) |
| `utils/supabase/middleware.ts` | Modified |
| `app/onboarding/setup/page.tsx` | Created |

---

## Known Limitations / Future Work

- When `?businessId=` is invalid (foreign business), the API silently falls back to the user's first business. The client's `activeBusinessIdRef` keeps the invalid ID, so every subsequent poll repeats the silent fallback. Proper fix: API returns 403 or empty-business response for unrecognized IDs, and client clears `activeBusinessIdRef`.
- No persistence of the selected business across sessions (by design — each session starts with the picker).
- `clearBusiness()` does not immediately clear venue/area/clicr data from state — those stale values persist until the next poll (~2 seconds). Not a correctness issue since the API returns unscoped data on the next poll.
