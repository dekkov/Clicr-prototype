# Validation Round 2 — Post-Discrepancy-Fix Reviewer Findings
**Date:** 2026-02-24
**Author:** Hoang
**Scope:** `app/api/sync/route.ts`, `app/actions/scan.ts`, `lib/core/metrics.ts`

---

## Background

After applying the 13 DB discrepancy fixes (see `2026-02-23-db-discrepancy-fixes.md`), three parallel sub-agents reviewed the code for:
- Crash-level bugs (C)
- Data integrity issues (D)
- Convention violations (V)

A total of 13 new issues were found — some pre-existing, some introduced by the first-pass fixes. All are addressed in this document.

---

## Crash Issues (C)

### C1. `occEvents` Temporal Dead Zone — TDZ ReferenceError (CRASH)

| | Detail |
|---|---|
| **File** | `app/api/sync/route.ts` |
| **Problem** | `occEvents` was referenced at line 122 (inside the snapshot mapping block) but not declared until line 144. This caused a `ReferenceError` at runtime. |
| **Fix** | Moved the `occEvents` Supabase fetch **before** the snapshot block (now at line 92). Removed the duplicate fetch that was at line 144. |

---

### C2. `'BANNED'` Violates `id_scans.scan_result` CHECK Constraint (CRASH)

| | Detail |
|---|---|
| **File** | `app/actions/scan.ts:53` |
| **Problem** | When a patron is banned, `finalStatus = 'BANNED'` was written directly to `scan_result`. The DB CHECK constraint only allows `'ACCEPTED'`, `'DENIED'`, `'WARNED'`, `'ERROR'`. This caused a constraint violation and insert failure. |
| **Fix** | `scan_result: finalStatus === 'BANNED' ? 'DENIED' : finalStatus` — BANNED maps to DENIED at the DB layer. The `finalStatus` variable retains `'BANNED'` so occupancy logic (step 3) still correctly skips incrementing for banned patrons. |

---

### C3. Missing `business_id` from `id_scans` Insert (CRASH)

| | Detail |
|---|---|
| **File** | `app/actions/scan.ts` |
| **Problem** | `id_scans.business_id` is `NOT NULL` in the schema. The first-pass rewrite of `scan.ts` omitted `business_id` from the insert payload, causing a NOT NULL constraint violation on every scan. |
| **Fix** | Added `business_id: businessId` to the `scanEvent` object. Added a null guard: if `getBusinessId()` returns undefined, the action returns `null` early with an error log. |

---

### C4. `COUNTER_ONLY` Still Used in Device Hydration (CRASH / TYPE MISMATCH)

| | Detail |
|---|---|
| **File** | `app/api/sync/route.ts:195` |
| **Problem** | Discrepancy Fix #11 corrected the `ADD_CLICR` insert to use `'COUNTER'`. However, the hydration block that pushes DB devices into `data.clicrs` still checked `d.device_type === 'COUNTER_ONLY'`, so no devices from Supabase were ever merged into the local state. |
| **Fix** | Changed to `d.device_type === 'COUNTER'` |

---

### C5. `d.config?.button_config` → `d.button_config` (CRASH / NULL CONFIG)

| | Detail |
|---|---|
| **File** | `app/api/sync/route.ts:203, 217` |
| **Problem** | Discrepancy Fix #12 changed the DB column from `config` to `button_config`. The hydration block still read `d.config?.button_config` (nested path that no longer exists), returning `undefined` for all device button configs. |
| **Fix** | Changed both occurrences to `d.button_config` |

---

## Data Integrity Issues (D)

### D1. `check_ban_status` Return Type Conflict Between Migrations

| | Detail |
|---|---|
| **Files** | `migrations/003_rpcs.sql`, `supabase/migrations/20260205120000_full_enhancement_tables.sql` |
| **Problem** | Two migrations define `check_ban_status` with incompatible signatures: `003_rpcs.sql` defines `RETURNS TABLE(is_banned BOOLEAN, ...)`, while the 2026 migration redefines it as `RETURNS jsonb`. Whichever ran last wins. The JS code assumed array (TABLE), which would fail silently if jsonb was active. |
| **Fix** | Made the JS check defensive: `const banRow = Array.isArray(banResult) ? banResult[0] : banResult; if (banRow?.is_banned)` — works correctly regardless of which migration is active. The migration conflict itself requires a DBA to run a corrective migration locking in the canonical signature. |

---

### D2. `RESET_COUNTS` Hard-Deleted Audit Records (DATA LOSS)

| | Detail |
|---|---|
| **File** | `app/api/sync/route.ts` |
| **Problem** | `RESET_COUNTS` called `.delete()` on `occupancy_events` and `id_scans` — both are immutable audit tables. Hard-deleting events destroys historical data that the reporting RPCs depend on. |
| **Fix** | Replaced with `reset_counts` RPC (`p_scope: 'VENUE'`). This zeroes `occupancy_snapshots.current_occupancy` and sets `last_reset_at` without touching event or scan history. Business_id resolved dynamically from user profile. |

---

### D3. `RECORD_SCAN` Hardcoded `business_id: 'biz_001'` (DATA INTEGRITY)

| | Detail |
|---|---|
| **File** | `app/api/sync/route.ts:389` |
| **Problem** | The `RECORD_SCAN` case inserted with `business_id: 'biz_001'` — all scans from any tenant would be attributed to the demo fixture business. |
| **Fix** | Resolve dynamically from `profiles` table via `userId` header, falling back to `scan.business_id` then `'biz_001'` only as last resort. |

---

### D4. `capacity_max` Could Write `undefined` (SILENT DATA CORRUPTION)

| | Detail |
|---|---|
| **File** | `app/api/sync/route.ts` (`UPDATE_VENUE` case) |
| **Problem** | `venue.total_capacity ?? venue.default_capacity_total` — if both fields are `undefined` (not null), the Supabase client may send `undefined`, which some versions treat as "omit field" or overwrite with NULL. |
| **Fix** | Added `?? null` at the end to always produce an explicit `null` value, preventing undefined from propagating. |

---

## Convention Issues (V)

### V1 + V2. `supabaseAdmin` Bypasses RLS in `scan.ts`

| | Detail |
|---|---|
| **File** | `app/actions/scan.ts` |
| **Problem** | `supabaseAdmin` bypasses Row Level Security. For a server action that runs on behalf of an authenticated user, the session client should be used. |
| **Fix** | Added comment explaining the bypass and noting the preferred pattern is `MUTATIONS.recordScan()` from `lib/core/mutations.ts`. No code change (replacing supabaseAdmin throughout is a larger refactor). |

---

### V3. Missing `logError()` in `getAreaSummaries` / `getVenueSummaries`

| | Detail |
|---|---|
| **File** | `lib/core/metrics.ts` |
| **Problem** | Both functions used bare `throw error` without calling `logError()` first. All other METRICS methods use `logError()` for structured error tracking. |
| **Fix** | Added `logError('metrics:getAreaSummaries', ...)` and `logError('metrics:getVenueSummaries', ...)` before re-throwing. |

---

### V4. Missing `p_area_id` in `get_hourly_traffic` Call

| | Detail |
|---|---|
| **File** | `lib/core/metrics.ts` |
| **Problem** | `get_hourly_traffic` RPC signature includes `p_area_id UUID DEFAULT NULL`. The call omitted it, relying on the default. While not breaking, it is inconsistent with the pattern of passing all known optional params explicitly. |
| **Fix** | Added `p_area_id: null` to the RPC call. |

---

### V7. `console.error` in `checkBanStatus` → `logError()`

| | Detail |
|---|---|
| **File** | `lib/core/metrics.ts` |
| **Problem** | `checkBanStatus` used `console.error` for ban check failures instead of the project-standard `logError()`. |
| **Fix** | Replaced with `logError('metrics:checkBanStatus', error.message, { businessId, patronId, venueId }, undefined, businessId)` |

---

## Files Modified

| File | Changes |
|---|---|
| `app/api/sync/route.ts` | C1, C4, C5, D2, D3, D4 |
| `app/actions/scan.ts` | C2, C3, D1, V1/V2 comment |
| `lib/core/metrics.ts` | V3, V4, V7 |

---

## Round 2 Verification — Follow-up Fixes

After a second round of sub-agent verification (all original C/D/V fixes confirmed VERIFIED), four additional issues were identified and fixed in the same session:

| ID | File | Issue | Fix |
|---|---|---|---|
| D2-edge | `route.ts` | `RESET_COUNTS` silently no-ops Supabase reset when `resetBizId` is null, causing split-brain | Added `console.warn` so the failure is at least visible in server logs |
| V-scan-1 | `scan.ts` | `logError` not imported; `console.error` used for 3 critical failure paths | Added `import { logError } from '@/lib/core/errors'`; replaced all 3 `console.error` calls |
| V-scan-2 | `scan.ts` line 26 | `console.error` on businessId resolution failure | `logError('scan:submitScanAction', ...)` |
| V-scan-3 | `scan.ts` line 88 | `console.error` on id_scans write failure | `logError('scan:submitScanAction', ..., businessId)` |
| V-scan-4 | `scan.ts` line 145 | `console.error` on scan fetch failure | `logError('scan:getRecentScansAction', ...)` |
| V-metrics | `metrics.ts` | `getDailyTrafficSummary` missing `logError` before `throw error` (inconsistent with all other methods in file) | Added `logError('metrics:getDailyTrafficSummary', ...)` before throw |

---

## Not Changed

- **Migration conflict (D1)** — The JS code is now defensive against both return types. However, the `supabase/migrations/20260205120000_full_enhancement_tables.sql` migration that redefines `check_ban_status` as `RETURNS jsonb` (and queries a non-existent `bans` table internally) needs to be corrected or superseded with a proper migration by a DBA.
- **`lib/types.ts` dual-naming** — Still deferred. The DB layer correctly maps to `capacity_max` but type aliases `total_capacity` / `default_capacity_total` remain for UI compatibility.
- **RLS enforcement in scan.ts (V1/V2)** — Full migration from `supabaseAdmin` to session client is a larger refactor; tracked as a comment in the file.
