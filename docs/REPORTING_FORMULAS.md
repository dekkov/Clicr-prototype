# CLICR V4 — Reporting Formulas

## Overview

All reporting in CLICR derives from two immutable tables:
- `occupancy_events` — every tap, scan, bulk adjustment, and reset
- `id_scans` — every ID scan attempt (accepted, denied, pending)

Plus one mutable adjustment table:
- `turnarounds` — re-entries tracked separately

The **effective time window** for all "current session" reports is determined by `last_reset_at` on the relevant venue or area. If no explicit window is provided, reports use `last_reset_at` as the start time.

---

## 1. Total In / Total Out

**Source**: `occupancy_events` table

### Formula

```sql
Total In (Gross) = SUM(ABS(delta))
    WHERE flow_type = 'IN'
      AND event_type != 'RESET'
      AND created_at >= effective_start

Total Out (Gross) = SUM(ABS(delta))
    WHERE flow_type = 'OUT'
      AND event_type != 'RESET'
      AND created_at >= effective_start
```

### Notes
- `ABS(delta)` is used because all events store the signed delta (+1 for in, -1 for out), and we want gross counts
- RESET events are excluded from totals (they're system events, not traffic)
- The filter `event_type != 'RESET'` ensures system resets don't inflate traffic numbers

### Required Fields
- `delta` (integer, signed)
- `flow_type` ('IN' | 'OUT')
- `event_type` ('TAP' | 'SCAN' | 'BULK' | 'AUTO_SCAN' — exclude 'RESET')
- `created_at` (timestamp)

---

## 2. Peak Occupancy

**Source**: `occupancy_events` table (computed, not stored)

### Formula

Peak occupancy is computed by replaying events in chronological order:

```
running_occupancy = 0
peak = 0

FOR EACH event IN (occupancy_events ORDER BY created_at ASC
                    WHERE created_at >= effective_start):
    running_occupancy += event.delta
    running_occupancy = MAX(running_occupancy, 0)  // floor at 0
    peak = MAX(peak, running_occupancy)

RETURN peak
```

### SQL Approximation

```sql
-- Using a window function:
SELECT MAX(running_total) AS peak_occupancy
FROM (
    SELECT SUM(delta) OVER (ORDER BY created_at ASC) AS running_total
    FROM occupancy_events
    WHERE business_id = ?
      AND (venue_id = ? OR ? IS NULL)
      AND (area_id = ? OR ? IS NULL)
      AND created_at >= effective_start
      AND event_type != 'RESET'
) sub
WHERE running_total >= 0;
```

### Notes
- This is an approximation because it doesn't account for the floor-at-0 rule during replay
- For exact peak, a PL/pgSQL loop function would be needed
- For dashboard display, the approximation is sufficient

---

## 3. Hourly Breakdown Buckets

**Source**: `occupancy_events` table

### Formula

```sql
SELECT
    date_trunc('hour', created_at) AS hour_bucket,
    SUM(CASE WHEN flow_type = 'IN' THEN ABS(delta) ELSE 0 END) AS entries_in,
    SUM(CASE WHEN flow_type = 'OUT' THEN ABS(delta) ELSE 0 END) AS entries_out,
    SUM(delta) AS net_delta
FROM occupancy_events
WHERE business_id = ?
  AND created_at >= effective_start
  AND (created_at <= effective_end OR effective_end IS NULL)
  AND event_type != 'RESET'
GROUP BY date_trunc('hour', created_at)
ORDER BY hour_bucket ASC;
```

### Chart Mapping

| Field | Chart Element |
|-------|--------------|
| `hour_bucket` | X-axis label (formatted as "9 AM", "10 AM", etc.) |
| `entries_in` | Green bar (positive) |
| `entries_out` | Red bar (negative or separate) |
| `net_delta` | Line overlay showing net trend |

### Notes
- Hours with no events won't appear in results — fill with zeros client-side
- Timezone handling: `date_trunc` uses the database timezone. Pass venue timezone to adjust.
- For multi-day reports, consider `date_trunc('day', ...)` instead.

---

## 4. Demographic Aggregation

**Source**: `id_scans` table

### Formula

```sql
-- Total accepted scans (denominator for percentages)
total_accepted = COUNT(*) WHERE scan_result = 'ACCEPTED'

-- Breakdown by age band and sex
SELECT
    COALESCE(age_band, 'Unknown') AS age_band,
    COALESCE(sex, 'U') AS sex,
    COUNT(*) AS count,
    ROUND((COUNT(*)::NUMERIC / total_accepted) * 100, 1) AS percentage
FROM id_scans
WHERE business_id = ?
  AND scan_result = 'ACCEPTED'  -- Only count people who entered
  AND created_at >= effective_start
GROUP BY age_band, sex
ORDER BY count DESC;
```

### Age Band Computation

Age bands are computed at scan time from DOB:

```
age = floor((scan_date - dob) / 365.25)

Age Band:
  Under 21  → age < 21
  21-25     → 21 <= age <= 25
  26-30     → 26 <= age <= 30
  31-40     → 31 <= age <= 40
  41+       → age >= 41
```

### Required Fields
- `scan_result` ('ACCEPTED' only for demographics)
- `age` (integer)
- `age_band` (pre-computed string)
- `sex` ('M' | 'F' | 'U')
- `zip_code` (for geographic analysis)

### Geographic Breakdown

```sql
SELECT
    COALESCE(zip_code, 'Unknown') AS zip,
    COALESCE(state, 'Unknown') AS state,
    COUNT(*) AS visitor_count
FROM id_scans
WHERE business_id = ? AND scan_result = 'ACCEPTED'
  AND created_at >= effective_start
GROUP BY zip_code, state
ORDER BY visitor_count DESC
LIMIT 20;
```

---

## 5. Turnarounds Adjustment

**Source**: `turnarounds` table + `occupancy_events` table

### Definitions

- **Gross Entries**: Total number of IN events (includes re-entries)
- **Turnarounds**: Count of people who left and came back
- **Net Entries (Adjusted)**: Unique visitors ≈ Gross Entries - Turnarounds

### Formula

```sql
Turnarounds = SUM(count)
    FROM turnarounds
    WHERE business_id = ?
      AND created_at >= effective_start

Net Entries (Adjusted) = Total In (Gross) - Turnarounds
```

### When Turnarounds Are Logged

Turnarounds are created when:
1. Staff manually logs a re-entry via the UI
2. A scan detects a person who was already scanned IN today (auto-detect)

### Notes
- Turnarounds are a **positive number** representing the count of re-entries
- If Turnarounds > Total In, Net Entries is floored at 0
- This metric helps answer "how many unique people visited?" vs "how many entries occurred?"

---

## 6. Report Summary Aggregate

**Source**: RPC `get_report_summary`

The report summary combines all of the above into a single response:

```typescript
type ReportSummary = {
    totalEntriesGross: number;     // SUM(abs(delta)) WHERE flow_type='IN'
    totalExitsGross: number;       // SUM(abs(delta)) WHERE flow_type='OUT'
    turnaroundsCount: number;      // SUM(count) FROM turnarounds
    netEntriesAdjusted: number;    // totalEntriesGross - turnaroundsCount
    entriesManual: number;         // SUM WHERE source='manual' AND flow_type='IN'
    entriesScan: number;           // SUM WHERE source IN ('scan','auto_scan') AND flow_type='IN'
    scansTotal: number;            // COUNT(*) FROM id_scans
    scansAccepted: number;         // COUNT WHERE scan_result='ACCEPTED'
    scansDenied: number;           // COUNT WHERE scan_result='DENIED'
    effectiveStartTs: string;      // The start of the reporting window
};
```

---

## 7. Chart Field Requirements Matrix

| Chart | Required `occupancy_events` Fields | Required `id_scans` Fields | Required `turnarounds` Fields |
|-------|-----------------------------------|---------------------------|-------------------------------|
| **Summary Cards** | delta, flow_type, event_type, source, created_at | scan_result, created_at | count, created_at |
| **Hourly Bar Chart** | delta, flow_type, event_type, created_at | — | — |
| **Demographics Pie** | — | age_band, sex, scan_result, created_at | — |
| **Geographic Map** | — | zip_code, state, scan_result, created_at | — |
| **Event Log** | all fields | all fields | all fields |
| **Peak Occupancy** | delta, created_at, event_type | — | — |
