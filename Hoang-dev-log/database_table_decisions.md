# Database Table Decisions
**Date:** 2026-02-24
**Author:** Hoang
**Topic:** Why 16 tables? Is this over-engineered?

---

## Background

When reviewing the canonical schema (`migrations/001_schema.sql`), the question came up:
> "Is having 16 tables normal, or is this over-engineering?"

Short answer: **No, it is not over-engineered.** 12 of the 16 tables are doing distinct, necessary work. 4 are useful-but-deferrable. The `supabase/migrations/` folder (34 conflicting files) was the actual over-engineering — not the schema itself.

---

## The Rule for Splitting Tables

Split into separate tables when data has a **different purpose, shape, or lifetime**. Merging tables that serve different purposes causes performance problems, data duplication, or both.

---

## Table Groups & Decisions

### Group 1 — Core Hierarchy (5 tables) ✅ All essential

```
businesses → business_members → venues → areas → devices
```

Standard structure for any multi-tenant SaaS. Every app with "organizations, users, and locations" needs this. None of these can be merged without breaking something:
- A venue is not an area
- A device is not a venue
- A user's role (business_members) is not the same as the user's identity (auth.users)

---

### Group 2 — The Counting Engine (2 tables) ✅ Both essential

```
occupancy_snapshots   ← "what is the count RIGHT NOW?"
occupancy_events      ← "what happened, and when?"
```

This looks redundant but answers **two completely different questions** with different access patterns:

| Question | Table Used | Query Type |
|---|---|---|
| Live occupancy display | `occupancy_snapshots` | Single row read — O(1) |
| "Entries between 9pm–2am" report | `occupancy_events` | Range scan + aggregate |

If merged into one table, every real-time count display would require summing thousands of rows — too slow for a live counter. This pattern (current state + immutable history) is called **event sourcing** and is used by banks, stock tickers, inventory systems, and any high-volume real-time app.

Both tables are written atomically inside the `apply_occupancy_delta` RPC, so they are always in sync.

---

### Group 3 — ID Scanning (1 table) ✅ Essential

```
id_scans   ← every scan result and demographic data
```

One table, one purpose: the immutable compliance record and analytics source for the scanning feature. No split needed.

---

### Group 4 — Ban System (2 core + 2 audit tables)

```
banned_persons   ← WHO is banned (identity: name, DOB, ID last4)    ✅ Essential
patron_bans      ← the ban record (when, why, which venues, status)  ✅ Essential
ban_audit_logs          ← who added/changed/removed a ban            ⏳ Deferrable
ban_enforcement_events  ← every time a banned person was scanned     ⏳ Deferrable
```

**Why split `banned_persons` and `patron_bans`?**

A person's *identity* (name, DOB, ID number) is separate from the *ban decision* (which venue, start/end dates, reason). The same person could have:
- Multiple bans over time
- A ban at one location but not another
- A temporary ban that expires, then a new permanent one

If merged into one table, you'd duplicate the person's identity data on every ban record and couldn't share a single identity match across venues.

The two audit tables (`ban_audit_logs`, `ban_enforcement_events`) are useful for legal compliance and analytics but are not needed for core ban functionality. Deferred to a later release.

---

### Group 5 — System Support (3 tables)

```
onboarding_progress  ← setup wizard state per user          ✅ Essential (while onboarding exists)
audit_logs           ← who reset counts, changed config     ⏳ Deferrable
app_errors           ← server errors logged to DB           ⏳ Deferrable (could use Sentry)
```

`onboarding_progress` is needed as long as the onboarding flow exists — it tracks where each user is in setup.

`audit_logs` is a compliance/ops tool (who ran a reset, who deleted a device). Useful for accountability but not critical for day-one operation.

`app_errors` logs errors to the database for monitoring. A third-party service (Sentry, Datadog) could replace this, so it's deferrable.

---

### Group 6 — One Questionable Table

```
turnarounds   ← re-entries tracked separately   ⚠️ Possibly premature
```

Re-entry tracking is a niche use case. This data could live inside `occupancy_events` using a specific `event_type` flag rather than a separate table. Unless there is a concrete feature already built around `turnarounds`, this table is premature.

**Recommendation:** Revisit when the re-entry tracking feature is actively being built. If it's not referenced in any UI or RPC, consider removing it from the schema.

---

## Final Scorecard

| Table | Status | Reason |
|---|---|---|
| `businesses` | ✅ Essential | Core multi-tenancy |
| `business_members` | ✅ Essential | RBAC / user roles |
| `venues` | ✅ Essential | Physical locations |
| `areas` | ✅ Essential | Zones within venues |
| `devices` | ✅ Essential | Counter/scanner hardware |
| `occupancy_snapshots` | ✅ Essential | Live count (O(1) read) |
| `occupancy_events` | ✅ Essential | History, reporting, audit |
| `id_scans` | ✅ Essential | Compliance + analytics |
| `banned_persons` | ✅ Essential | Identity registry |
| `patron_bans` | ✅ Essential | Active ban records |
| `onboarding_progress` | ✅ Essential | Setup wizard state |
| `ban_audit_logs` | ⏳ Deferrable | Legal compliance, v2 |
| `app_errors` | ⏳ Deferrable | Could use Sentry |
| `audit_logs` | ⏳ Deferrable | Ops accountability, v2 |
| `ban_enforcement_events` | ⏳ Deferrable | Pure analytics, v2 |
| `turnarounds` | ⚠️ Questionable | May be premature |

**12 essential. 3 deferrable. 1 to revisit.**

---

## Context: Why the supabase/migrations/ Folder Was the Problem

The schema itself was not over-engineered. The migration management was. `supabase/migrations/` contained 34 files with:
- 7 duplicate prefix numbers (unpredictable execution order)
- Conflicting RPC definitions (same function defined 3 different ways)
- References to non-existent tables (`bans`, `patrons`, `scan_events`)
- Wrong column names (`total_capacity` vs `capacity_max`)

**Decision:** `supabase/migrations/` is archived and will not be run. The canonical source of truth is `migrations/` (4 clean files in order).

See `2026-02-23-db-discrepancy-fixes.md` for the full audit of code-vs-schema discrepancies that resulted from the `supabase/migrations/` chaos.

---

## Reference: What "Normal" Looks Like

| App Type | Typical Table Count |
|---|---|
| Simple blog | 5–10 |
| This app (venue management SaaS) | 16 |
| E-commerce (Shopify-scale) | 40+ |
| Healthcare / compliance app | 100+ |

16 is lean for what this product does.
