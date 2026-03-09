# Dashboard Redesign — Design Doc

**Date:** 2026-03-06
**Status:** Approved

## Goal

Expand the Live Insights dashboard to match the 4 reference screenshots. Add 6 new data sections below the existing KPI cards and event log, backed by a new historical heatmap API endpoint and a DB index migration.

## Layout

```
Row 1  [Live Occupancy] [Total Entries] [Scans Processed] [Banned Hits]   ← existing
Row 2  [Age Distribution (2/3)]         [Live Event Log (1/3)]            ← existing
Row 3  [Gender Breakdown — full width]                                     ← NEW
Row 4  [Hourly Traffic (1/2)]           [Occupancy Over Time (1/2)]       ← NEW
Row 5  [Peak Times Heatmap — full width]                                   ← NEW
Row 6  [Location Distribution (1/2)]    [Venue Contribution (1/2)]        ← NEW
Row 7  [Traffic Flow (1/2)]             [Operational Workflow (1/2)]      ← NEW
Row 8  [Live Venues — card grid]                                           ← NEW
```

## New Sections — Data Sources

### Row 3: Gender Breakdown
- Source: `IDScanEvent.sex` from accepted scans tonight
- UI: Full-width horizontal split bar (blue = Male, pink = Female, gray = Unknown)
- Shows: Male %, Female %, Unknown % as legend below bar

### Row 4: Hourly Traffic
- Source: `CountEvent` today, grouped by hour (6 PM → close)
- UI: Grouped bar chart (Recharts `BarChart`) — green bars = entries (delta > 0), red = exits (delta < 0)
- X-axis: hours, Y-axis: count

### Row 4: Occupancy Over Time
- Source: `CountEvent` today, running cumulative sum of `delta` by hour
- UI: Area chart (Recharts `AreaChart`) — purple fill, peak marker annotation
- X-axis: hours, Y-axis: net occupancy

### Row 5: Peak Times Heatmap
- Source: `/api/reports/heatmap` — historical `count_events` aggregated by `(day_of_week, hour)`
- UI: CSS grid, day rows (Mon–Sun) × hour columns (6a–2a), cell color intensity = entry density (purple scale, 5 levels)
- Legend: Less → More

### Row 6: Location Distribution
- Source: `IDScanEvent.state` from accepted scans tonight
- UI: Horizontal bar chart (Recharts), top 8 states sorted by count

### Row 6: Venue Contribution
- Source: `CountEvent.venue_id` grouped, entries (delta > 0) only, tonight
- UI: Horizontal bar chart (Recharts), sorted by entry count

### Row 7: Traffic Flow
- Two sub-sections:
  1. **Processing Funnel**: stacked metric rows — Total Entries, IDs Scanned, Accepted (green), Denied (orange), Banned (red), Net Occupancy (cyan). Horizontal bars proportional to total entries.
  2. **Area Distribution**: % of tonight's entries per area — horizontal bars with % label
- No external library needed (plain divs + Tailwind)

### Row 7: Operational Workflow
- Static styled diagram showing the scan flow:
  `ID Scan → Verify → Ban Check → Accept / Deny → Add to Count / Event Log / Reports`
- Pure HTML/CSS — no chart library

### Row 8: Live Venues
- Source: `venues` + `areas` grouped by `venue_id`; occupancy from VENUE_DOOR area
- UI: 2-column card grid per venue — name, occupancy / capacity, % full, +entries / -exits tonight

## Backend Changes

### Migration: `migrations/015_heatmap_index.sql`
```sql
CREATE INDEX IF NOT EXISTS idx_count_events_biz_ts_delta
  ON count_events(business_id, timestamp)
  WHERE delta > 0;
```

### New API Route: `app/api/reports/heatmap/route.ts`
- **Auth**: reads user session via `createClient()`, resolves `business_id` from `business_members`
- **Query**:
  ```sql
  SELECT
    EXTRACT(dow FROM to_timestamp(timestamp / 1000)) AS day,
    EXTRACT(hour FROM to_timestamp(timestamp / 1000)) AS hour,
    SUM(delta) AS entries
  FROM count_events
  WHERE business_id = $1 AND delta > 0
  GROUP BY day, hour
  ```
- **Response**: `{ heatmap: Record<number, Record<number, number>> }` (day 0=Sun…6=Sat, hour 0–23)
- **Caching**: `Cache-Control: s-maxage=300` (5 min)

## Frontend Changes

### `app/(authenticated)/dashboard/page.tsx`
- Add `useEffect` on mount to `fetch('/api/reports/heatmap')` → `useState<HeatmapData>`
- All new sections implemented as inline sub-components in the same file (consistent with existing pattern)
- Charts: Recharts `BarChart`, `AreaChart` — already in stack
- Heatmap: custom CSS grid component
- No new dependencies

## Files Touched

| File | Change |
|------|--------|
| `migrations/015_heatmap_index.sql` | New — DB index |
| `app/api/reports/heatmap/route.ts` | New — historical aggregation endpoint |
| `app/(authenticated)/dashboard/page.tsx` | Modified — add all new sections |
