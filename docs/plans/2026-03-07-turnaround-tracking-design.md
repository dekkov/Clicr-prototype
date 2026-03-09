# Turnaround Tracking & Display — Design

## Problem

Turnarounds are recorded to the database via the ClicrPanel button, but:
1. They are never fetched back during `/api/sync` GET — lost on page refresh
2. They are not displayed anywhere in the UI
3. The `net_entries_adjusted` metric (computed by the existing RPC) is never surfaced

## Scope

Turnarounds are **venue-counter only** (no area-level turnarounds).

## Changes

### 1. Data Pipeline Fix — Sync turnarounds from server

- Add turnarounds query to `buildSyncResponse()` in `app/api/sync/route.ts`
- Fetch from `turnarounds` table filtered by `business_id`, today's events only
- Map DB rows to `TurnaroundEvent` type in the sync response
- AppState already has `turnarounds: TurnaroundEvent[]` — just needs to be populated from sync

### 2. Dashboard — Traffic Flow funnel additions

Current funnel: Total Entries > IDs Scanned > Accepted > Denied > Banned > Net Occupancy

New rows inserted before Net Occupancy:
- **Turnarounds** — count of turnaround events today (venue-counter only), amber/orange color
- **Net Entries (Adjusted)** — `Total Entries - Turnarounds`, cyan/teal color

Data source: sum `turnarounds` array from AppState, filtered to today's timestamp.

`TrafficFlow` component receives two new props: `turnarounds: number` and `netAdjusted: number`, computed via `useMemo` in the dashboard page.

### 3. Venue Page — KPI card + Log entry

**Overview tab — new KPI card:**
- 5th KPI card: "Turnarounds" showing count for that venue today
- Subtitle: "Net Entries: X" (gross entries minus turnarounds)
- Icon: `RotateCcw`
- Data source: filter `turnarounds` array from AppState by `venue_id`

**Logs tab — turnaround entries:**
- Turnaround events appear in VenueLogs alongside existing audit logs
- Each entry: action badge "TURNAROUND", timestamp, created_by user, count
- No new tab — reuse existing Logs infrastructure

## Files Involved

- `app/api/sync/route.ts` — add turnarounds to sync response
- `app/(authenticated)/dashboard/page.tsx` — add turnaround metrics + pass to TrafficFlow
- `app/(authenticated)/venues/[venueId]/_components/VenueOverview.tsx` — add KPI card
- `app/(authenticated)/venues/[venueId]/_components/VenueLogs.tsx` — show turnaround entries

## Not Changed

- ClicrPanel turnaround button (already works)
- Database schema (already complete)
- RPC functions (already compute turnarounds_count and net_entries_adjusted)
- TurnaroundEvent type (already defined)
