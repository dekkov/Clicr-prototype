# CLICR V4 — Codebase Audit

**Date:** 2026-03-15

---

## Architecture Overview

The app follows a **dual-mode adapter pattern**: a `DataClient` interface (49 methods) with `LocalAdapter` for demo mode (localStorage). Production mode bypasses the adapter entirely, using **API routes** (`/api/sync`, `/api/rpc/*`, `/api/reports/*`) that call Supabase directly.

**Stack**: Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, Supabase (Postgres + Auth + Channels), Framer Motion, Recharts, jsPDF, xlsx, html5-qrcode, Playwright.

**State**: Single `AppContext` in `lib/store.tsx` manages all state with optimistic updates, 30-second safety-net polling, and Supabase Channels for real-time occupancy sync. POST mutations return lean `{ success: true }` responses; store functions call `refreshState()` (GET) after successful writes. Three ref-based guards (`isWritingRef`, `isResettingRef`, `lastRealtimeTsRef`) prevent race conditions between optimistic writes, polling, and real-time updates.

**Data Hierarchy**: Business > Venue > Area > Device > Events (append-only)

---

## Feature Implementation Status

### Fully Implemented

| Feature | Brief Requirement | Implementation |
|---------|------------------|----------------|
| **Dashboard** | KPIs, venue cards, live occupancy | Calendar heatmap, pause/resume, auto-reset timer, trend indicators |
| **Counting (Tap)** | +1/-1, multi-button, optimistic UI | `applyOccupancyDelta` RPC with idempotency keys, `FOR UPDATE` row lock, floor at 0 |
| **Board View** | Up to 4-5 counters on one screen | Responsive grid, custom labels per tile, fullscreen, auto-boards per area |
| **ID Scanning** | Camera + Bluetooth | PDF417 parsing via `lib/aamva.ts`, camera (html5-qrcode), Bluetooth (keyboard wedge, 600ms debounce) |
| **Banning** | Create/revoke, scope, audit trail | TEMPORARY/PERMANENT, venue/org scope, audit logs, enforcement events, identity hash matching |
| **Guest Directory** | Searchable scanned IDs | Search by name/last4, state filter, compliance engine (CCPA/GDPA), ban button |
| **Reports** | Nightly recap, hourly traffic, demographics | Calendar grid heatmap, hourly charts, age/gender breakdowns, comparison mode, Excel export |
| **RBAC** | 5 roles with route guards | OWNER/ADMIN/MANAGER/STAFF/ANALYST with `hasMinRole()`, route protection, nav filtering |
| **Venue/Area CRUD** | Create, edit, manage | Multi-step wizards, tabbed detail pages, capacity rules per venue/area |
| **Clicr Management** | Create, labels, assign to areas | Custom counter labels, venue-level counters, area-level counters |
| **Reset** | Atomic, night logs, last_reset_at | Server-side aggregation into `night_logs`, peak replay, atomic zero |
| **Auto-Reset** | Scheduled daily reset | Timezone-aware (`useAutoReset` hook), multi-tab race prevention, server verification |
| **Capacity Enforcement** | WARN_ONLY, HARD_STOP, MANAGER_OVERRIDE | UI enforcement + database schema, per-venue and per-area |
| **Real-time Sync** | Multi-device, live occupancy | Supabase Channels + 30s safety-net polling + staleness guards |
| **Team Management** | Invite, roles, assignments | Invite by email, assign venues/areas, edit roles |
| **Auth** | Login, signup, onboarding | Supabase Auth, onboarding wizard, business setup flow |
| **Multi-business** | Switch between businesses | Business selector in sidebar, localStorage persistence |

### Partially Implemented

| Feature | Brief Requirement | Gap |
|---------|------------------|-----|
| **Exports** | CSV/Excel/PDF | Excel (XLSX) works. PDF available via jsPDF but no polished template. CSV not prominently surfaced. |
| **NFC Scanner** | External scanner support | UI exists, backend stubbed (capability flag only) |
| **Scanning Settings** | Configure scan method | Settings page is placeholder |
| **Ban Policies Settings** | `/settings/ban-policies` | Route exists but minimal |
| **Shift Management** | Start/end shift, audit trail | Logic exists in store (`startShift`/`endShift`) but UI is minimal; no shift history or shift-scoped reporting |
| **Compliance Engine** | CCPA/GDPA PII rules | Basic rules in `lib/compliance.ts`; no auto-deletion scheduler |
| **Day-over-Day Comparison** | Compare Fri vs Sat | Comparison mode exists but limited to two-date side-by-side |

### Not Implemented

| Feature | Brief Requirement | Notes |
|---------|------------------|-------|
| **Offline Event Queue** | Queue events locally, sync when back online | No service worker, no localStorage queue, no retry logic. Network loss = lost taps. |
| **Scanner Disconnect Recovery** | Fallback camera without losing session | No detection/fallback mechanism |
| **Duplicate Scan Prevention** | Configurable re-scan window | No dedup window on rapid re-scans of same ID |
| **Door Throughput Metric** | Guests/hour on live dashboard | Dashboard shows totals but no live throughput rate |
| **Active Device Heartbeat** | Online/offline per device | UI shows badges but no heartbeat mechanism; status is cosmetic |
| **Lock Capacity** | Manager locks venue at current occupancy | No lock button or mechanism |
| **Per-Area Pause** | Granular pause beyond business-wide | Pause is business-wide only (`settings.is_paused`) |
| **Board View Reporting** | Break out counts by label/stream | Labels recorded (`counter_label_id` on events) but reports don't filter/group by label |
| **Guest Notes/Tags** | Manager adds notes to guest profiles | Guest directory is read-only from scan data |

---

## Robustness Assessment

### Strong Points

| Area | Details |
|------|---------|
| **Idempotency** | Server-side `idempotency_key` check in RPC with `FOR UPDATE` row lock prevents duplicate taps |
| **Concurrency Control** | Counter-based write lock + realtime staleness guard + reset blocker |
| **Database Design** | 22 migrations (or 4 consolidated), comprehensive indexes, append-only events, soft deletes, RLS per table |
| **RLS (Multi-tenant)** | Every table isolated by `business_id` via Row-Level Security policies |
| **Atomic RPCs** | `apply_occupancy_delta` and `reset_counts` use `FOR UPDATE` locks |
| **Auto-reset** | Timezone-aware, multi-tab race prevention, server verification before firing |

### Critical Gaps

| Area | Risk | Details |
|------|------|---------|
| **No Offline Support** | HIGH | A door losing WiFi for 30 seconds loses all taps. No queue, no retry. |
| **No Error Boundaries** | MEDIUM | React error in any component crashes the whole page. No `error.tsx` files found. |
| **Server-Side Capacity Not Enforced** | MEDIUM | HARD_STOP is client-only. Direct API call can exceed capacity. |
| **Rate Limiting In-Memory Only** | LOW | All API routes enforce per-user rate limits via `lib/rate-limit.ts`, but the store is in-memory (resets on deploy). Swap to Redis/Upstash for persistence. |
| **No CSP Headers** | LOW | No Content-Security-Policy in middleware. |

---

## Scalability Assessment

| Dimension | Assessment |
|-----------|-----------|
| **Data Model** | Good. Append-only events scale horizontally. Indexes on `(business_id, created_at DESC)` cover hot queries. |
| **Query Performance** | Moderate. Reports scan events since `last_reset_at` (one night, typically 100-5000 rows). Fine for current scale. |
| **Real-time** | Good for small scale. Supabase Channels per business. At 100+ concurrent devices per business, channel bandwidth may need attention. |
| **Polling** | Good. 30-second safety-net polling. Supabase Channels handle real-time occupancy. CRUD mutations trigger explicit `refreshState()` (GET). |
| **API Design** | `/api/sync` cleanly separates reads (GET) from writes (POST). GET hydrates full state via `buildSyncResponse()`. POST dispatches mutations and returns lean `{ success: true }` — no redundant re-query. |
| **Bundle Size** | Not optimized. No dynamic imports beyond Next.js defaults. jsPDF + xlsx bundled eagerly. |
| **Client State** | `AppState` loads all events, scans, bans into memory. Venues with 10K+ events/night may hit memory pressure. |

### Recommendations

1. **Event pagination** — server-side aggregation (already exists via RPCs) should be the only path for reports. Never send raw events to client.
2. **Night log archival** — events older than `last_reset_at` should be archived from the hot table.
3. **Bundle splitting** — dynamic-import jsPDF and xlsx so they only load on the reports page.
4. **Error boundaries** — add `error.tsx` files to critical route segments to contain component crashes.

---

## Testing Coverage

| Category | Files | Tests | Notes |
|----------|-------|-------|-------|
| Unit tests | 25 in `__tests__/` | 184 | Core logic, AAMVA parsing, scan evaluation, compliance, rate limiting, calendar utils, identity hashing, time window |
| E2E tests | 2 Playwright files | — | auth setup + reports calendar only |
| API route tests | 0 | 0 | `/api/sync`, `/api/rpc/reset`, `/api/verify-id` untested |
| Store tests | 0 | 0 | Optimistic updates, concurrency guards untested |
| Component tests | 0 | 0 | No React component tests |

---

## Core Architecture Details

### DataClient Interface (49 methods)

| Category | Methods |
|----------|---------|
| Auth | `signUp`, `signIn`, `signOut`, `getSession` |
| Business | `createBusiness`, `getBusinessesForUser`, `updateBusiness` |
| Venues | `createVenue`, `updateVenue`, `listVenues` |
| Areas | `createArea`, `updateArea`, `listAreas` |
| Devices | `createDevice`, `updateDevice`, `deleteDevice`, `listDevices` |
| Counting | `applyOccupancyDelta`, `getSnapshots`, `getTrafficTotals`, `resetCounts` |
| Scanning | `logScan`, `listScans` |
| Bans | `createBan`, `listBans`, `updateBan`, `checkBanStatus` |
| Reporting | `getReportSummary`, `getHourlyTraffic`, `getDemographics`, `getEventLog` |
| Real-time | `subscribeToSnapshots?`, `subscribeToEvents?` (optional) |

### API Routes

| Route | Purpose |
|-------|---------|
| `GET /api/sync` | State hydration (full state response via `buildSyncResponse()`) |
| `POST /api/sync` | Write dispatch — returns lean `{ success: true }` (RECORD_EVENT, RECORD_SCAN, etc.) |
| `POST /api/rpc/reset` | Atomic reset with night log aggregation |
| `POST /api/rpc/traffic` | Traffic totals for a scope + time window |
| `POST /api/reports/aggregate` | Daily report metrics + hourly breakdown |
| `POST /api/reports/heatmap` | Time-of-day distribution data |
| `POST /api/reports/venue-events` | Paginated event log for export |
| `POST /api/verify-id` | Parse ID scan, check bans, log result |
| `GET /api/auth/signout` | Clear Supabase session |
| `POST /api/upload/logo` | Business logo upload (2MB, PNG/JPEG/WEBP) |
| `POST /api/log-error` | Client-side error ingestion |

### Database Schema

**Incremental migrations** (`migrations/`, 22 files — run in order for existing databases):

| # | File | Purpose |
|---|------|---------|
| 001 | `schema.sql` | Core tables |
| 002 | `indexes.sql` | Performance indexes |
| 003 | `rpcs.sql` | Stored procedures (apply_occupancy_delta, reset_counts, etc.) |
| 004 | `rls.sql` | Row-level security policies |
| 005-017 | Various | Schema evolution (onboarding, cascades, roles, shifts, identity hash, etc.) |
| 018 | `fix_traffic_rpc.sql` | Traffic RPC fix |
| 019 | `night_logs.sql` | Night log table + aggregation |
| 020 | `custom_counter_labels.sql` | Device counter labels |
| 021 | `area_capacity_enforcement.sql` | Per-area capacity enforcement mode |
| 022 | `cleanup_dead_objects.sql` | Remove phantom/unused tables, functions, columns |

**Consolidated migrations** (`migrations-consolidated/`, 4 files — for fresh installs only):

| # | File | Purpose |
|---|------|---------|
| 001 | `schema.sql` | All 19 tables in final state |
| 002 | `indexes.sql` | All indexes |
| 003 | `functions.sql` | Helper functions, triggers, and all 9 RPCs |
| 004 | `rls.sql` | RLS enable + all policies for all tables |

### Key RPC Functions

| RPC | Purpose |
|-----|---------|
| `apply_occupancy_delta` | Row-locked atomic counting with idempotency |
| `reset_counts` | Transactional reset with audit log |
| `get_report_summary` | Server-side aggregation (totals, peaks, demographics) |
| `get_traffic_totals` | Lightweight totals for dashboard |
| `check_ban_status` | Ban lookup with venue scope check |

---

## V4 "Definition of Done" Status

| Criterion (from Full Brief) | Status |
|-----------------------------|--------|
| Onboard venue end-to-end in ~10 minutes | PASS |
| Door staff full shift with camera OR Bluetooth | PARTIAL (works online; no offline resilience or scanner disconnect recovery) |
| Live occupancy across multiple clickers | PASS |
| Reporting per night, exportable (CSV minimum) | PARTIAL (Excel works; CSV not surfaced; PDF minimal) |
| Guest directory searchable + tied to scan history | PASS |
| Bans enforceable at scan-time with audit trail | PASS |
| RBAC works (staff can't access admin) | PASS |
| Board View: 4-5 counters, labels for reporting | PARTIAL (board view works; label-based report breakdowns not implemented) |
