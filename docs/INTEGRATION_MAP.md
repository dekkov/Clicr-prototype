# CLICR V4 — Integration Map

## Purpose

This document maps **every function in the existing prototype** to its corresponding **DataClient method**. A developer implementing the SupabaseAdapter should use this as a checklist.

---

## 1. Store Functions → DataClient Methods

The current data layer lives in `lib/store.tsx` (AppProvider). Here's the exact mapping:

| AppProvider Method | DataClient Method | Migration Notes |
|---|---|---|
| `recordEvent(event)` | `applyOccupancyDelta(payload)` | Convert CountEvent shape to DeltaPayload. Use returned `newOccupancy` for UI. |
| `recordScan(scan)` | `logScan(businessId, scanPayload)` | Flatten IDScanEvent to ScanPayload format. |
| `resetCounts(venueId?)` | `resetCounts(scope)` | Convert optional venueId to Scope object. |
| `addUser(user)` | N/A (auth + business_members) | Replace with signUp + business_members insert |
| `updateUser(user)` | N/A (business_members) | Update role in business_members |
| `removeUser(userId)` | N/A (business_members) | Remove from business_members |
| `addVenue(venue)` | `createVenue(businessId, venue)` | Direct mapping |
| `updateVenue(venue)` | `updateVenue(venueId, patch)` | Extract id, pass rest as patch |
| `addArea(area)` | `createArea(venueId, area)` | Direct mapping |
| `updateArea(area)` | `updateArea(areaId, patch)` | Extract id, pass rest as patch |
| `addClicr(clicr)` | `createDevice(areaId, device)` | Map Clicr fields to Device fields |
| `updateClicr(clicr)` | `updateDevice(deviceId, patch)` | Map Clicr → Device |
| `deleteClicr(clicrId)` | `deleteDevice(deviceId)` | Uses soft delete |
| `addDevice(device)` | `createDevice(areaId, device)` | Direct mapping |
| `updateDevice(device)` | `updateDevice(deviceId, patch)` | Direct mapping |
| `addBan(ban)` | `createBan(banPayload)` | Map BanRecord → BanPayload |
| `revokeBan(banId, ...)` | `updateBan(banId, { status: 'REMOVED' })` | Simplified |
| `createPatronBan(person, ban, log)` | `createBan(banPayload)` | Combines person + ban into single call |
| `updatePatronBan(ban, log)` | `updateBan(banId, patch)` | Audit log auto-generated |
| `recordBanEnforcement(event)` | N/A (internal to SupabaseAdapter) | Handled inside logScan when ban detected |
| `updateBusiness(updates)` | `updateBusiness(businessId, patch)` | Direct mapping |
| `addCapacityOverride(override)` | N/A (future) | Not in v4 DataClient scope |
| `addVenueAuditLog(log)` | N/A (auto-generated) | Audit logs created by RPCs |

---

## 2. Server API Route → DataClient Methods

The `/api/sync` route currently handles both reads and writes. Here's how each action maps:

### GET /api/sync (State Hydration)

**Current**: Reads `data/db.json` + hydrates with Supabase data.

**Target**: Replace with direct DataClient calls in components:

```typescript
// Before (in store.tsx):
const res = await fetch('/api/sync');
const data = await res.json();
setState(data);

// After (in refactored AppProvider):
const client = getDataClient();
const venues = await client.listVenues(businessId);
const areas = await Promise.all(venues.map(v => client.listAreas(v.id)));
const snapshots = await client.getSnapshots({ businessId });
// ... build state from individual calls
```

### POST /api/sync Actions

| POST Action | DataClient Method |
|---|---|
| `RECORD_EVENT` | `applyOccupancyDelta()` |
| `RECORD_SCAN` | `logScan()` |
| `RESET_COUNTS` | `resetCounts()` |
| `ADD_VENUE` | `createVenue()` |
| `UPDATE_VENUE` | `updateVenue()` |
| `ADD_AREA` | `createArea()` |
| `UPDATE_AREA` | `updateArea()` |
| `ADD_CLICR` | `createDevice()` |
| `UPDATE_CLICR` | `updateDevice()` |
| `DELETE_CLICR` | `deleteDevice()` |
| `ADD_USER` | signUp + createBusinessMember |
| `UPDATE_USER` | updateBusinessMember |
| `REMOVE_USER` | removeBusinessMember |
| `ADD_BAN` | `createBan()` |
| `REVOKE_BAN` | `updateBan()` |
| `ADD_DEVICE` | `createDevice()` |
| `UPDATE_DEVICE` | `updateDevice()` |
| `UPDATE_BUSINESS` | `updateBusiness()` |

---

## 3. Core Library Files → DataClient

### `lib/core/mutations.ts`

| MUTATIONS Method | DataClient Method |
|---|---|
| `MUTATIONS.applyDelta(ctx, delta, source, deviceId)` | `client.applyOccupancyDelta(payload)` |
| `MUTATIONS.resetCounts(ctx, scope, targetId, reason)` | `client.resetCounts(scope)` |
| `MUTATIONS.deleteDevice(ctx, deviceId)` | `client.deleteDevice(deviceId)` |
| `MUTATIONS.recordScan(ctx, scanData, autoAdd)` | `client.logScan(businessId, scanPayload)` |

### `lib/core/metrics.ts`

| METRICS Method | DataClient Method |
|---|---|
| `METRICS.getTotals(businessId, scope, window)` | `client.getTrafficTotals(scope, window)` |
| `METRICS.getCurrentOccupancy(businessId, areaId)` | `client.getSnapshots(scope)` |
| `METRICS.getAreaSummaries(venueId)` | `client.listAreas(venueId)` + `client.getSnapshots()` |
| `METRICS.getVenueSummaries(businessId)` | `client.listVenues(businessId)` + `client.getSnapshots()` |
| `METRICS.getDailyTrafficSummary(...)` | `client.getHourlyTraffic(scope, window)` |
| `METRICS.checkBanStatus(...)` | `client.checkBanStatus(businessId, personId, venueId)` |

### Sync API (Supabase-only)

The sync route (`/api/sync`) reads and writes exclusively from Supabase. `lib/db.ts` and `data/db.json` have been removed.

---

## 4. Component-Level Integration Points

### Dashboard (`app/(authenticated)/dashboard/page.tsx`)
```typescript
// Replace:
const { venues, areas, events } = useApp();

// With:
const client = getDataClient();
const venues = await client.listVenues(businessId);
const snapshots = await client.getSnapshots({ businessId });
const totals = await client.getTrafficTotals({ businessId }, todayWindow);
```

### Counter/Clicr (`app/(authenticated)/clicr/[id]/page.tsx`)
```typescript
// Replace:
recordEvent({ clicr_id, area_id, venue_id, delta, flow_type, event_type });

// With:
const result = await client.applyOccupancyDelta({
    businessId, venueId, areaId, deviceId: clicrId,
    delta: +1, source: 'manual'
});
setOccupancy(result.newOccupancy); // ← USE THE RETURNED VALUE
```

### Reports (`app/(authenticated)/reports/[venueId]/page.tsx`)
```typescript
// Replace:
const events = useApp().events.filter(...);
// Manual client-side aggregation

// With:
const summary = await client.getReportSummary(scope, window);
const hourly = await client.getHourlyTraffic(scope, window);
const demo = await client.getDemographics(scope, window);
const log = await client.getEventLog(scope, window);
```

### Scanner (`app/(authenticated)/scanner/page.tsx`)
```typescript
// Replace:
recordScan(scanData);

// With:
const banCheck = await client.checkBanStatus(businessId, personId, venueId);
if (banCheck.isBanned) { /* show BLOCKED UI */ }
const scan = await client.logScan(businessId, { ...scanData, autoAddOccupancy: true });
```

---

## 5. Clicr → Device Field Mapping

The prototype uses `Clicr` type; production uses `Device`. Here's the mapping:

| Clicr Field | Device Field | Notes |
|---|---|---|
| `id` | `id` | Same |
| `area_id` | `area_id` | Same |
| `name` | `name` | Same |
| `flow_mode` | `direction_mode` | `'BIDIRECTIONAL' → 'bidirectional'`, etc. |
| `current_count` | N/A | Derived from `occupancy_snapshots` |
| `active` | `active` (from `deleted_at IS NULL`) | Soft delete |
| `button_config` | `button_config` | Same JSONB structure |
| `command` | `serial_number` | Hardware mapping |

---

## 6. Migration Checklist for Developer

```
□ 1. Set up Supabase project (supabase init, supabase start)
□ 2. Run migrations in order: 001_schema.sql → … → 013_identity_hash.sql (13 files total)
□ 3. Enable Realtime on: occupancy_snapshots, occupancy_events, id_scans
□ 4. Copy .env.example → .env.local, fill in Supabase credentials
□ 5. Implement SupabaseAdapter.ts (all methods)
□ 6. Swap NEXT_PUBLIC_APP_MODE=production
□ 7. Test: create business → create venue → create area → tap counter → check dashboard
□ 8. Test: reset counts → verify totals restart from 0
□ 9. Test: scan ID → verify demographics appear in reports
□ 10. Test: create ban → scan banned person → verify BLOCKED
□ 11. Run full QA_CHECKLIST.md
□ 12. Deploy to Vercel with production env vars
```
