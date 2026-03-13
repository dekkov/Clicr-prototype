# Post-Scan Label Picker + Dashboard Location Metrics

**Date:** 2026-03-13
**Status:** Approved

## Problem

1. After an ID scan is accepted, the +1 count event auto-records with the first counter label. The user has no opportunity to choose which label to attribute the entry to, reducing the usefulness of label-based metrics.
2. The dashboard has gender and age breakdowns from ID scan data, but no location metrics (state/city) despite that data already being captured on every scan.

## Prerequisite Fix: API Scan Path

`ClicrPanel.tsx` has two scan processing paths in `processScan()`:

- **API path** (lines 383-427): Calls `/api/verify-id`, creates a minimal scan event with `sex: 'U'`, `zip_code: '00000'`, no demographics. Does NOT call `recordScan()`. Does NOT pass `counter_label_id` to `recordEvent()`.
- **Local fallback path** (lines 434-476): Calls `evaluateScan()`, populates all demographic fields (`sex`, `issuing_state`, `city`, etc.), calls `recordScan()`, passes `counter_label_id`.

**Fix required:** The API path must be brought in line with the local path:
1. Populate demographic fields from the parsed AAMVA data (already available as `parsed` parameter) before creating `scanEvent`
2. Call `recordScan()` to persist the scan event
3. Both paths must defer `recordEvent()` for label selection (see below)

This ensures location metrics have complete data regardless of which path executes.

## Solution

### 1. Post-Scan Label Picker

Modify the ScannerResult overlay to include a label picker when the clicr has counter labels configured. Applies to **all scan modes** (Bluetooth, Camera, NFC) since they share the same `processScan()` code path.

#### Flow

1. Scan → parse AAMVA → evaluate → ACCEPTED
2. `recordScan()` fires immediately (scan event persisted) — both API and local paths
3. ScannerResult overlay appears with patron info (name, age, status)
4. **If clicr has active counter labels:**
   - Suppress the 3-second auto-dismiss countdown
   - Display label buttons at the bottom of the overlay
   - User must pick one label
   - On label tap: call `recordEvent(delta: +1, counter_label_id: selectedLabel.id, event_type: 'SCAN')`, then dismiss overlay
5. **If clicr has NO counter labels:**
   - Keep current behavior: auto-record +1 with no label, auto-dismiss after 3s
6. **If `addToCountOnAccept` is OFF:**
   - No label picker shown, no count event recorded. Scan persisted only. Auto-dismiss as normal.

#### ScannerResult Component Changes

New optional props:
- `labels?: CounterLabel[]` — active counter labels from the clicr
- `onLabelSelect?: (labelId: string) => void` — callback when user picks a label

Behavior when `labels` is provided and non-empty:
- Hide the countdown progress bar
- Show a label button grid below the patron info
- Each button shows the label name, styled with the label's color (or rotating palette)
- Tapping a button calls `onLabelSelect(label.id)` — the parent handles recording the event and dismissing the overlay
- If more than 6 labels, wrap in a scrollable container to handle small screens

Behavior when `labels` is absent or empty:
- No change — existing auto-dismiss + countdown behavior

#### ClicrPanel Changes

- **Both scan paths** (API at ~line 410 and local at ~line 456): remove the automatic `recordEvent()` call when active labels exist
- Pass `activeLabels` and a callback to `ScannerResult`
- The callback:
  1. Calls `recordEvent({ delta: 1, flow_type: 'IN', event_type: 'SCAN', venue_id, area_id, clicr_id, counter_label_id: selectedLabelId })`
  2. Clears `lastScan` to dismiss the overlay
- When no labels exist and `addToCountOnAccept` is on, keep the current auto-record behavior

### 2. Dashboard Location Metrics

Two new components on the dashboard page, placed below the Gender Breakdown section in a 2-column grid. Both wrapped in `{isToday && ...}` guard like all other scan-based dashboard sections.

#### StateBreakdown Component

- Source: `todayScanEvents.filter(s => s.scan_result === 'ACCEPTED')`
- Aggregation field: `s.issuing_state || s.state` (ID issuing state preferred, residential state as fallback)
- Display: horizontal stacked bar (same pattern as GenderBreakdown)
  - Top 5 states get distinct colors, remainder grouped as "Other"
  - Each state shows abbreviation + percentage
- Title: "ID State" (reflects issuing jurisdiction)
- Empty state: "No scan data yet."

#### CityBreakdown Component

- Source: same filtered scan events
- Aggregation field: `s.city`
- Display: horizontal bar chart (same pattern as AgeBand)
  - Top 5 cities shown, remainder grouped as "Other"
  - Bar width proportional to count
- Empty state: "No scan data yet."

#### Dashboard Layout

Insert immediately after the `<GenderBreakdown />` usage (~line 1134 of `dashboard/page.tsx`):

```
{isToday && <GenderBreakdown scanEvents={todayScanEvents} />}
{isToday && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <StateBreakdown scanEvents={todayScanEvents} />
    <CityBreakdown scanEvents={todayScanEvents} />
</div>}
{isToday && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <HourlyTraffic ... />
    ...
```

## Files Modified

| File | Change |
|------|--------|
| `lib/ui/components/ScannerResult.tsx` | Add `labels` and `onLabelSelect` props; render label button grid when provided; suppress auto-dismiss when labels present |
| `app/(authenticated)/clicr/[id]/ClicrPanel.tsx` | Fix API path to call `recordScan()` with demographics; defer `recordEvent` in both paths until label is picked; pass active labels + callback to ScannerResult |
| `app/(authenticated)/dashboard/page.tsx` | Add `StateBreakdown` and `CityBreakdown` components; add 2-column grid section below Gender Breakdown wrapped in `isToday` |

## Files Unchanged

- `lib/types.ts` — all needed fields already exist on IDScanEvent and CountEvent
- `lib/store.tsx` — `recordEvent` and `recordScan` already support all required params
- API routes — no backend changes needed
- Database — no schema changes needed

## Data Dependencies

All data fields already exist and are populated:

| Field | Type | Source |
|-------|------|--------|
| `clicr.counter_labels` | `CounterLabel[]` | Configured per-clicr |
| `CountEvent.counter_label_id` | `string \| null` | Set on `recordEvent()` |
| `IDScanEvent.sex` | `string` | Parsed from PDF417 |
| `IDScanEvent.age` / `age_band` | `number` / `string` | Parsed from PDF417 |
| `IDScanEvent.issuing_state` / `state` | `string` | Parsed from PDF417 |
| `IDScanEvent.city` | `string` | Parsed from PDF417 |

## Edge Cases

- **Clicr with no labels:** Falls through to existing auto-record behavior. No label picker shown.
- **Scan DENIED:** No label picker. ScannerResult shows denial as-is.
- **`addToCountOnAccept` is OFF:** No label picker, no count event. Scan recorded only. Auto-dismiss as normal.
- **User takes long to pick label:** No timeout. Overlay stays until label is picked. Occupancy is not incremented until label is selected.
- **Multiple rapid scans:** `lastScan` state prevents processing new scans while overlay is showing (existing guard at lines 865, 873 of ClicrPanel).
- **API scan path:** Fixed to populate demographics from parsed data and call `recordScan()`, ensuring location metrics get complete data.
- **Many labels (6+):** Label grid scrollable to prevent overflow on small screens.
