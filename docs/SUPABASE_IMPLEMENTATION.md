# CLICR V4 — Supabase Implementation Guide

## 1. Tables Overview

| # | Table | Purpose | RLS | Mutable? |
|---|-------|---------|-----|----------|
| 1 | `businesses` | Multi-tenant root | ✅ | Update only |
| 2 | `business_members` | RBAC junction (user ↔ business) | ✅ | CRUD |
| 3 | `venues` | Physical locations | ✅ | CRUD |
| 4 | `areas` | Sub-zones within venues | ✅ | CRUD (soft delete) |
| 5 | `devices` | Counting hardware / software points | ✅ | CRUD (soft delete) |
| 6 | `occupancy_snapshots` | Source of truth for current occupancy | ✅ | Via RPC only |
| 7 | `occupancy_events` | Immutable event log | ✅ | **Append only** |
| 8 | `id_scans` | Immutable scan log (PII) | ✅ | **Append only** |
| 9 | `banned_persons` | Identity registry for bans | ✅ | CRUD |
| 10 | `patron_bans` | Active ban records | ✅ | CRUD |
| 11 | `ban_audit_logs` | Ban change history | ✅ | Append only |
| 12 | `ban_enforcement_events` | Scan-time blocks | ✅ | Append only |
| 13 | `turnarounds` | Re-entry tracking | ✅ | Append only |
| 14 | `audit_logs` | System audit trail | ✅ | Append only |
| 15 | `app_errors` | Client error logging | ✅ | Append only |
| 16 | `onboarding_progress` | Setup wizard state | ✅ | CRUD |

---

## 2. Primary Keys & Foreign Keys

All primary keys are `UUID DEFAULT uuid_generate_v4()`.

Key relationships:
```
businesses ──1:N──> venues ──1:N──> areas ──1:N──> devices
     │                │               │
     └──1:N──> business_members      │
     │                                │
     └──1:N──> occupancy_snapshots ←──┘
     │         (unique: biz+venue+area)
     │
     └──1:N──> occupancy_events
     └──1:N──> id_scans
     └──1:N──> banned_persons ──1:N──> patron_bans ──1:N──> ban_audit_logs
```

---

## 3. RLS Policies (Member-Scoped)

### Core Pattern

Every table with a `business_id` column uses the `is_member_of(business_id)` function:

```sql
CREATE POLICY venues_select ON venues FOR SELECT
    USING (is_member_of(business_id));
```

This function checks:
```sql
EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = p_business_id
      AND user_id = auth.uid()
)
```

### Role Escalation

Destructive operations use `has_role_in(business_id, 'ADMIN')`:
- DELETE venues/areas/devices → OWNER only
- CREATE bans → SUPERVISOR+
- Team management → ADMIN+
- Business settings → ADMIN+

### Important: No Silent Empty Arrays

If a user queries a table they don't have access to, Supabase returns an **empty result set** by default (RLS silently filters). To surface permission errors explicitly:

```typescript
// In SupabaseAdapter, after any query:
const { data, error, count } = await supabase.from('venues').select('*', { count: 'exact' });
if (count === 0 && !error) {
    // Could be empty OR permission denied — check business_members separately
    const { data: membership } = await supabase
        .from('business_members')
        .select('role')
        .eq('business_id', businessId)
        .eq('user_id', userId)
        .single();

    if (!membership) {
        throw new Error('ACCESS_DENIED: Not a member of this business');
    }
}
```

---

## 4. RPCs and Why

### Why RPCs Instead of Direct Table Writes?

1. **Atomicity**: `apply_occupancy_delta` uses `SELECT FOR UPDATE` to lock the snapshot row. Without this, two simultaneous taps could read the same occupancy, both increment by 1, and write the same value — losing one tap.

2. **Transaction boundaries**: `reset_counts` must update snapshots, set `last_reset_at` on venues AND areas, and insert an audit log — all atomically.

3. **Performance**: `get_report_summary` runs server-side aggregation instead of transferring thousands of raw events to the client.

4. **Security**: RPCs use `SECURITY DEFINER` where needed, bypassing RLS for internal operations while maintaining external security.

### RPC Reference

| RPC | Input | Returns | Notes |
|-----|-------|---------|-------|
| `apply_occupancy_delta` | business_id, venue_id, area_id, delta, source, device_id | `{new_occupancy, event_id}` | Row-locked. Floors at 0. Idempotent if key provided. |
| `reset_counts` | scope, business_id, venue_id?, area_id?, reason? | `{areas_reset, reset_at}` | Updates snapshots + last_reset_at + audit_log |
| `get_report_summary` | business_id, venue_id?, area_id?, start_ts?, end_ts? | See type | Uses last_reset_at as default start |
| `get_hourly_traffic` | business_id, venue_id?, area_id?, start_ts?, end_ts? | `[{hour, in, out, net}]` | date_trunc('hour') grouping |
| `get_demographics` | business_id, venue_id?, area_id?, start_ts?, end_ts? | `[{age_band, sex, count, %}]` | ACCEPTED scans only |
| `get_event_log` | business_id, venue_id?, area_id?, start_ts?, end_ts?, limit? | unified timeline | UNION of events + scans + audits |
| `get_traffic_totals` | business_id, venue_id?, area_id?, start_ts?, end_ts? | `{total_in, total_out, net}` | Lightweight dashboard widget |
| `check_ban_status` | business_id, patron_id, venue_id? | `{is_banned, ban_id, ban_type}` | Checks active bans including location scope |
| `soft_delete_device` | business_id, device_id | void | Sets deleted_at, logs audit |

---

## 5. How "Reset" Works

### The Reset Flow

```
User clicks "Reset All Counts"
    → DataClient.resetCounts({ businessId, venueId? })
        → RPC reset_counts(scope, business_id, venue_id?, area_id?)
            → UPDATE occupancy_snapshots SET current_occupancy = 0, last_reset_at = NOW()
            → UPDATE venues SET last_reset_at = NOW()
            → UPDATE areas SET last_reset_at = NOW()
            → INSERT INTO audit_logs (action: 'RESET_COUNTS')
            → RETURN { areas_reset, reset_at }
```

### Since-Reset Window

After reset, all reporting functions use `last_reset_at` as the default start time:

```sql
-- In get_report_summary:
IF p_start_ts IS NULL THEN
    v_effective_start := (SELECT last_reset_at FROM areas WHERE id = p_area_id);
END IF;

-- Now aggregate only events AFTER the reset
WHERE oe.created_at >= v_effective_start
```

This means:
- Events before reset still exist in the database (they're immutable)
- But they're excluded from "current session" totals
- Historical reporting can query any time window by passing explicit start/end

---

## 6. What Must NEVER Happen

### ❌ Snapback to 0

**Problem**: Polling returns stale data with occupancy=0, overwriting optimistic local state.

**Prevention**:
```typescript
// In store.tsx / AppProvider:
if (isWritingRef.current) {
    console.log("Skipping sync update due to active write");
    return; // Don't overwrite optimistic state during a write
}
```

**Additional safeguards**:
- Use `keepPreviousData: true` in any data fetching (React Query pattern)
- Never render `0` as a fallback — use loading state instead
- Always prefer the **returned value from RPC writes** over subsequent polls

### ❌ Mock Data in Authenticated Flows

**Problem**: Demo/seed data appears in production for logged-in users.

**Prevention**:
```typescript
// Guard in any component that renders fixture data:
if (process.env.NEXT_PUBLIC_APP_MODE !== 'demo') {
    return null; // Don't render mock data
}
```

The `INITIAL_USER`, `INITIAL_VENUES`, etc. in `lib/db.ts` should ONLY be loaded when `APP_MODE=demo`.

### ❌ Double-Counting from Concurrent Taps

**Prevention**: The `apply_occupancy_delta` RPC uses `SELECT FOR UPDATE` row locking:
```sql
SELECT id, current_occupancy + p_delta
INTO v_snapshot_id, v_new_occ
FROM occupancy_snapshots
WHERE business_id = ... AND area_id = ...
FOR UPDATE;  -- ← Blocks concurrent transactions
```

### ❌ Negative Occupancy

**Prevention**: `GREATEST(v_new_occ, 0)` in the RPC ensures occupancy never goes below 0.

---

## 7. Supabase Realtime Configuration

### Enable Realtime on Tables

In Supabase Dashboard → Database → Replication:
- Enable replication for: `occupancy_snapshots`, `occupancy_events`, `id_scans`
- Do NOT enable for: `audit_logs`, `app_errors` (unnecessary overhead)

### Channel Architecture

```
Client                          Supabase
  │                                │
  ├── subscribe(snapshots:biz_001) │
  │   ────────────────────────────►│
  │                                │  occupancy_snapshots UPDATE
  │   ◄────────────────────────────┤  { area_id, current_occupancy }
  │                                │
  ├── subscribe(events:biz_001)    │
  │   ────────────────────────────►│
  │                                │  occupancy_events INSERT
  │   ◄────────────────────────────┤  { delta, flow_type, area_id }
  │                                │
```

### Performance Notes

- Use **business_id filter** on channels to prevent cross-tenant leakage
- Debounce dashboard updates (200ms) to avoid UI thrashing
- For the counter view: process updates immediately (no debounce)
- Maximum recommended channels per client: 3-5
