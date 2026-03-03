# CLICR V4 — Product Specification

## Overview

CLICR is a B2B SaaS platform for real-time occupancy tracking, ID scanning, patron banning, and venue analytics. It enables nightlife, hospitality, and event businesses to monitor traffic across multiple venues and areas from a unified dashboard.

---

## 1. User Roles (RBAC)

| Role | Permissions |
|------|------------|
| **OWNER** | Full access. Can delete venues, remove team members, manage billing, reset data. One per business. |
| **ADMIN** | Create/edit venues, areas, devices. Manage team invites. Cannot delete business or transfer ownership. |
| **MANAGER** | Operate counters, manage bans, run scans. Can reset counts for assigned areas. |
| **STAFF (Door Staff)** | Tap counters and scan IDs only. Cannot view analytics or manage bans. |
| **ANALYST** | Read-only access to reports and dashboards. Cannot operate counters or manage bans. |

---

## 2. Core Flows

### 2.1 Onboarding
1. User signs up → email verified
2. Create Business (name, timezone)
3. Create first Venue (name, city, capacity)
4. Create first Area within venue
5. Assign first Device (Clicr) to area
6. Tutorial/coachmarks complete → dashboard active

### 2.2 Counting
- **Tap**: Door staff taps +1 (IN) or -1 (OUT) on their device screen
- **Board View**: Multi-button grid for rapid counting (3+ in / 3- out)
- Each tap calls `applyOccupancyDelta()` → atomic RPC
- **Optimistic update**: UI increments immediately, server confirms
- **If server fails**: optimistic state rolls back on next sync

### 2.3 ID Scanning
- Staff scans ID (barcode/camera or Bluetooth scanner in V4.0)
- System parses: name, DOB, age, sex, zip, issuing state
- Checks ban registry → if banned, blocks entry
- If accepted: logs scan, optionally auto-increments occupancy
- All scan data stored as immutable `id_scans` records

### 2.4 Banning
- Managers create bans: select person (from scan history or manual entry)
- Ban types: TEMPORARY (with end date) or PERMANENT
- Reason categories: Violence, Harassment, Theft, Fake ID, Drugs, Policy Violation, Other
- Bans can apply to: all locations or specific venues
- On next scan of banned person → BLOCKED result + enforcement event logged
- Audit trail: every ban create/update/remove generates an audit log entry

### 2.5 Reporting & Analytics
- **Report Summary**: Total In/Out, Net Entries, Turnarounds, Manual vs Scan entries
- **Hourly Traffic**: Bar chart of entries/exits per hour
- **Demographics**: Age band × sex breakdown from accepted scans
- **Event Log**: Unified timeline of taps, scans, resets, bans
- **Export**: PDF and Excel (XLSX) download

### 2.6 Reset
- "Reset All Counts" sets occupancy to 0 for all areas in scope
- Sets `last_reset_at` timestamp on venue/area
- All reporting SINCE RESET uses `last_reset_at` as the effective start time
- Reset events are logged in audit_logs
- **Critical**: Reset does NOT delete events — totals are computed from events since `last_reset_at`

### 2.7 Board View (Multi-Clicker)
- Grid layout for fast counting: 3+ buttons (tap 1/2/3 at a time IN) and 3- buttons (OUT)
- Each button press fires `applyOccupancyDelta()` with the appropriate delta
- Gender tracking (optional): label_a / label_b buttons (e.g., "MALE" / "FEMALE")
- Dual-view: side-by-side panels for two devices simultaneously

---

## 3. Key Definitions

### Occupancy
The **current number of people inside** an area. Source of truth is `occupancy_snapshots.current_occupancy`, maintained atomically by `apply_occupancy_delta()`. Cannot go below 0.

### Total In / Total Out
The **gross cumulative count** of all IN and OUT events since the last reset. Computed by summing `occupancy_events` where `created_at >= last_reset_at`.

- `Total In = SUM(ABS(delta)) WHERE flow_type = 'IN'`
- `Total Out = SUM(ABS(delta)) WHERE flow_type = 'OUT'`

### Since Reset Window
All reports default to the time window starting at the most recent `last_reset_at` for the given scope. This means:
- A venue reset at 8 PM → totals show only events from 8 PM onward
- If no reset has occurred → window starts at business creation time

### Turnarounds
Guests who left and re-entered. Tracked in the `turnarounds` table. Used to compute:
- `Net Entries (Adjusted) = Total In (Gross) - Turnarounds`

### Board View
A keyboard-like UI for rapid-fire counting. Displays:
- 3 IN buttons: +1, +2, +3
- 3 OUT buttons: -1, -2, -3
- Optional gender split (Male/Female buttons)
- Real-time occupancy display in center

---

## 4. Expected Behavior by Screen

### Dashboard (`/dashboard`)
- Shows all venues with current occupancy, capacity %, and status
- KPI cards: Total occupancy across business, Total In Today, Total Out Today
- Clicking a venue navigates to venue detail

### Venues (`/venues`, `/venues/[id]`)
- List all venues with live stats
- Venue detail: areas list with individual occupancy, capacity bars
- Add/edit venue: name, address, timezone, capacity, enforcement mode

### Areas (`/areas/[id]`)
- Shows area occupancy, in/out today, assigned devices
- Inline edit area name and capacity
- Add/remove Clicrs (devices)

### Clicr / Device (`/clicr/[id]`)
- Full-screen counter interface
- Board View: multi-button grid
- Single/Dual panel layout
- Gender tracking toggle
- Real-time occupancy display

### Scanner (`/scanner`)
- Camera or manual entry for ID scanning
- Shows scan result (ACCEPTED/DENIED)
- Ban check alert if person is banned
- Guest demographics visible after scan

### Banning (`/banning`)
- Ban list (active, expired, removed)
- Create ban form with person details and reason
- Edit/revoke bans with audit trail
- Ban enforcement history

### Reports (`/reports`, `/reports/[venueId]`)
- Summary cards (Total In/Out, Net, Turnarounds, Scans)
- Hourly traffic chart
- Demographics breakdown chart
- Full event log table
- Export to PDF/XLSX

### Settings (`/settings`)
- Business profile (name, timezone)
- Team management (invite, roles, remove)
- Reset all counts
- Capacity thresholds configuration

---

## 5. Data Integrity Rules

1. **Occupancy ≥ 0**: The `apply_occupancy_delta()` RPC floors at 0
2. **Events are immutable**: No UPDATE or DELETE on `occupancy_events` or `id_scans`
3. **Resets don't delete**: Reset sets snapshot to 0 and records `last_reset_at`; events persist
4. **Tenant isolation**: Every query is scoped to `business_id` via RLS
5. **Optimistic + confirmation**: UI updates optimistically but uses server-returned values
6. **No mock data in production**: Demo/mock fixtures only render in demo mode
