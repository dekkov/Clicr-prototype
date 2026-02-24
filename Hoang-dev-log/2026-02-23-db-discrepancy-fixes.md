# DB Discrepancy Fixes
**Date:** 2026-02-23
**Author:** Hoang
**Scope:** `app/api/sync/route.ts`, `app/actions/scan.ts`, `lib/core/metrics.ts`

---

## Background

An audit comparing application code against the production schema (`migrations/001_schema.sql`, `003_rpcs.sql`) found 13 discrepancies. Every Supabase call in the codebase was checked against what the DB actually defines. All fixes apply **Option A: make code match the migrations**, since migrations are the authoritative production schema.

---

## Discrepancies Found & Fixed

### 1. Wrong RPC name: `process_occupancy_event` (CRASH)

| | Detail |
|---|---|
| **Files** | `app/api/sync/route.ts:361`, `app/actions/scan.ts:105` |
| **Problem** | Called `supabaseAdmin.rpc('process_occupancy_event', {...})` — this RPC does not exist |
| **Root cause** | Correct RPC is `apply_occupancy_delta` (defined in `migrations/003_rpcs.sql:17`) |
| **Fix** | Replaced with `apply_occupancy_delta`. Remapped params: removed `p_user_id`, `p_flow_type`, `p_event_type`, `p_session_id`; added `p_source` (derived from `event_type`), `p_gender`, `p_idempotency_key` |

**`apply_occupancy_delta` correct params:**
```ts
{
    p_business_id, p_venue_id, p_area_id,
    p_delta,
    p_source: 'manual' | 'scan' | 'auto_scan',
    p_device_id: null,       // optional UUID
    p_gender: null,          // optional
    p_idempotency_key: null  // optional
}
```

---

### 2. Missing RPCs in `lib/core/metrics.ts` (CRASH)

Three RPC calls referenced functions never defined in migrations:

| Called | Replaced with |
|---|---|
| `get_area_summaries` | Direct query: `occupancy_snapshots` joined to `areas` filtered by `venue_id` |
| `get_venue_summaries` | Direct query: `occupancy_snapshots` joined to `venues` filtered by `business_id` |
| `get_daily_traffic_summary` | `get_hourly_traffic` RPC (returns per-hour buckets; callers can aggregate by day) |

---

### 3. Wrong table: `scan_events` → `id_scans` (CRASH)

| | Detail |
|---|---|
| **Files** | `route.ts:174,390,415`, `scan.ts:65,141` |
| **Problem** | All scan reads/writes used `scan_events` table which does not exist in schema |
| **Actual table** | `id_scans` (defined in `migrations/001_schema.sql:148`) |
| **Fix** | Replaced all `.from('scan_events')` with `.from('id_scans')` |

---

### 4. Wrong table: `scan_logs` removed (SILENT FAIL)

| | Detail |
|---|---|
| **File** | `app/actions/scan.ts:82` |
| **Problem** | Duplicate write to `scan_logs` table which does not exist |
| **Fix** | Removed the entire `scan_logs` block. The `id_scans` insert in step 2 is the canonical record |

---

### 5. Wrong table: `bans` → `banned_persons` + `check_ban_status` RPC (CRASH)

| | Detail |
|---|---|
| **File** | `app/actions/scan.ts:30` |
| **Problem** | Ban check queried a `bans` table with `id_hash` and `active` columns — neither the table nor those columns exist |
| **Actual schema** | `banned_persons` (identity registry) + `patron_bans` (active bans) + `check_ban_status` RPC |
| **Fix** | Look up `banned_persons` by `id_number_last4` + `issuing_state_or_country` + `business_id`, then call `check_ban_status` RPC for each match |

Also removed the `createHash` / `idHash` variable which was only used for the removed `bans` query.

---

### 6. Wrong column: `timestamp` → `created_at` on `occupancy_events` (CRASH / NULL)

| | Detail |
|---|---|
| **Files** | `route.ts:147,160` |
| **Problem** | `.order('timestamp', ...)` and reading `e.timestamp` — `occupancy_events` has no `timestamp` column, only `created_at` |
| **Fix** | Changed to `.order('created_at', ...)` and `new Date(e.created_at).getTime()` |

Same issue applied to `id_scans` in `scan.ts:143,158,160` — fixed to use `created_at`.

---

### 7. Wrong column: `venues.total_capacity` → `capacity_max` (SILENT NULL)

| | Detail |
|---|---|
| **Files** | `route.ts:39` (read), `route.ts:486` (write) |
| **Problem** | Hydration read `v.total_capacity`; update wrote `total_capacity:` — DB column is `capacity_max` |
| **Fix** | Read: `v.capacity_max`. Write: `capacity_max: venue.total_capacity ?? venue.default_capacity_total` |

---

### 8. Wrong column: `areas.capacity` → `capacity_max` (SILENT NULL)

| | Detail |
|---|---|
| **Files** | `route.ts:55` (read), `route.ts:502` (write) |
| **Problem** | Hydration read `a.capacity`; update wrote `capacity:` — DB column is `capacity_max` |
| **Fix** | Read: `a.capacity_max`. Write: `capacity_max: areaPayload.default_capacity ?? areaPayload.capacity_max` |

---

### 9. Wrong field: `devices.pairing_code` — column does not exist (SILENT FAIL)

| | Detail |
|---|---|
| **File** | `route.ts:464` |
| **Problem** | `ADD_CLICR` insert included `pairing_code: newClicr.command || null` — no such column in `devices` |
| **Fix** | Removed `pairing_code` from insert |

---

### 10. Wrong field: `devices.is_active` → `status` (SILENT FAIL)

| | Detail |
|---|---|
| **File** | `route.ts:466` |
| **Problem** | Insert used `is_active: true` — `devices` has `status TEXT CHECK (IN ('ACTIVE','INACTIVE','LOST','MAINTENANCE'))` not a boolean `is_active` |
| **Fix** | `status: (newClicr.active ?? true) ? 'ACTIVE' : 'INACTIVE'` |

---

### 11. Wrong value: `device_type: 'COUNTER_ONLY'` → `'COUNTER'` (CONSTRAINT VIOLATION)

| | Detail |
|---|---|
| **File** | `route.ts:465` |
| **Problem** | Insert used `'COUNTER_ONLY'` but DB CHECK constraint only allows `'COUNTER'`, `'SCANNER'`, `'COMBO'` |
| **Fix** | Changed to `device_type: 'COUNTER'` |

---

### 12. Wrong field: `devices.config` → `button_config` (SILENT NULL)

| | Detail |
|---|---|
| **File** | `route.ts:467` |
| **Problem** | Insert used `config: { button_config: ... }` — column is `button_config JSONB`, not `config` |
| **Fix** | `button_config: newClicr.button_config \|\| { label_a: 'GUEST IN', label_b: 'GUEST OUT' }` |

---

### 13. `scan.ts` return uses `data.timestamp` → `data.created_at` (NaN timestamp)

| | Detail |
|---|---|
| **File** | `app/actions/scan.ts:129` |
| **Problem** | `new Date(data.timestamp).getTime()` — `id_scans` has no `timestamp`, so `data.timestamp` is `undefined` → returns `NaN` |
| **Fix** | `new Date(data.created_at).getTime()` |

---

## Files Modified

| File | Changes |
|---|---|
| `app/api/sync/route.ts` | Fixes #1, #6, #7, #8, #9, #10, #11, #12 + scan table fixes |
| `app/actions/scan.ts` | Fixes #1, #3, #4, #5, #13 |
| `lib/core/metrics.ts` | Fixes #2 |

## Not Changed

- **`profiles` table references** — `profiles` is not in migrations but likely exists as a manually managed Supabase Auth trigger table. Left untouched pending confirmation.
- **`lib/types.ts` dual-naming** (`total_capacity` / `default_capacity_total` / `capacity_max`) — types were not changed to avoid breaking UI components that reference these fields. The DB write/read layer now correctly maps to `capacity_max`; type cleanup is a separate refactor.
