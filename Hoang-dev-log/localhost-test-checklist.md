# Localhost Test Checklist
**Date:** 2026-02-24
**Branch:** migration-supabase
**App URL:** http://localhost:3000

Use this checklist top-to-bottom. Each section depends on the one above passing.
Mark each item: ✅ Pass | ❌ Fail | ⏭ Skip

---

## 0. Pre-Flight (do this before opening the browser)

| # | Check | Expected | Notes |
|---|---|---|---|
| 0.1 | `.env.local` exists at project root | File present | `cp .env .env.local` |
| 0.2 | `npm run dev` starts without error | Terminal shows `Ready on http://localhost:3000` | Any red error here = stop |
| 0.3 | No TypeScript build errors in terminal | No `Type error:` lines | Warnings are OK |
| 0.4 | Supabase migrations 001–004 ran successfully | All 4 SQL files ran without error in dashboard | Do this before any other test |

---

## 1. Authentication

| # | Check | Steps | Expected |
|---|---|---|---|
| 1.1 | Home page shows landing page | Go to `http://localhost:3000` | Product landing page renders (does NOT redirect — this is correct) |
| 1.2 | Login page renders | Navigate to `/login` | Form visible, no blank page, no console errors |
| 1.3 | Invalid login shows error | Enter wrong email/password → Submit | Error message shown, not a crash |
| 1.4 | Sign up works | Navigate to `/signup`, create a new account | Redirected to onboarding or dashboard |
| 1.5 | Login works | Log in with the new account | Redirected to `/dashboard` |
| 1.6 | Logged-in state persists | Refresh the page | Still logged in, not kicked to login |
| 1.7 | Logout works | Find logout button in settings/nav → click | Redirected to `/login`, session cleared |

---

## 2. Onboarding

| # | Check | Steps | Expected |
|---|---|---|---|
| 2.1 | Onboarding flow starts for new user | Log in as a brand new user | Onboarding wizard appears |
| 2.2 | Business name step | Enter business name, set venue count → Continue | Saved, proceeds to venue step. **Fixed:** removed non-existent `created_by_user_id` column, fixed `role: 'OWNER'` casing, uncommented venue pre-seeding |
| 2.3 | Venue creation step | Enter venue name → Next | Venue created in DB |
| 2.4 | Area creation step | Enter area name → Next | Area created in DB |
| 2.5 | Device creation step | Enter device name → Finish | Device created in DB |
| 2.6 | Completion redirects to dashboard | Complete all steps | Lands on `/dashboard` with venue cards visible |
| 2.7 | Skipping onboarding (if possible) | Try navigating directly to `/dashboard` | Either redirects back to onboarding or shows empty-state dashboard |

---

## 3. Dashboard

| # | Check | Steps | Expected | Fixes tested |
|---|---|---|---|---|
| 3.1 | Dashboard loads | Navigate to `/dashboard` | No blank screen, no infinite spinner | C1 (occEvents TDZ) |
| 3.2 | Business name shows | Look at page header | Your business name appears | — |
| 3.3 | Venue cards render | Dashboard loads | One card per venue | — |
| 3.4 | Live occupancy shows a number | Look at each venue card | Shows `0` or a real count, not `NaN` or blank | C1 |
| 3.5 | "In" and "Out" totals show | Look at venue card KPIs | Numbers appear (0 is fine) — not errors | `get_report_summary` RPC |
| 3.6 | Area capacity bars render | Each venue card | Area rows visible with progress bars | D4 (capacity null guard) |
| 3.7 | No console errors on load | Open DevTools → Console | No red errors | — |
| 3.8 | "System Operational" badge shows | Look at top right of dashboard | Green pulsing dot visible | — |

---

## 4. Core Counting — Clicr Panel ⭐ Most Critical

| # | Check | Steps | Expected | Fixes tested |
|---|---|---|---|---|
| 4.1 | Navigate to a Clicr | Click a device from `/clicr` or dashboard | Panel loads, buttons visible | — |
| 4.2 | IN button increments | Tap the IN button once | Count increases by 1 | `apply_occupancy_delta` RPC |
| 4.3 | OUT button decrements | Tap the OUT button once | Count decreases by 1 | `apply_occupancy_delta` RPC |
| 4.4 | Count updates in real-time | Open two browser tabs on same Clicr, tap IN in one | Other tab updates without refresh | Realtime subscription |
| 4.5 | Count persists after refresh | Tap IN 3 times → refresh the page | Count still shows 3, not 0 | `occupancy_snapshots` table |
| 4.6 | Dashboard reflects Clicr taps | Tap IN 5 times → go to dashboard | Dashboard occupancy number matches | — |
| 4.7 | Count doesn't go below 0 | Tap OUT when count is already 0 | Count stays at 0 or shows warning | Business logic |
| 4.8 | Reset counts works | On dashboard, click "Reset All Counts" → confirm | All area counts go to 0 | D2 (`reset_counts` RPC) |
| 4.9 | After reset, count is 0 on Clicr panel | Complete 4.8 → navigate back to Clicr | Count shows 0 | D2 |
| 4.10 | Tapping after reset increments from 0 | After reset, tap IN once | Count goes to 1 not a negative/wrong number | D2 |

**If 4.2 or 4.3 fails:** Open terminal running `npm run dev` and look for `Supabase Atomic Update Failed` — this means `apply_occupancy_delta` RPC is missing → re-run `migrations/003_rpcs.sql`.

---

## 5. Device (Clicr) Management

| # | Check | Steps | Expected | Fixes tested |
|---|---|---|---|---|
| 5.1 | Devices list loads | Navigate to `/clicr` | List of devices shows, no crash | C4 (device hydration) |
| 5.2 | Device button labels show | Look at each device card | "GUEST IN" / "GUEST OUT" or custom labels — not blank | C5 (`button_config`) |
| 5.3 | Add a new device | Find "Add Device" button → fill form → save | New device appears in list | ADD_CLICR fix |
| 5.4 | New device has correct type | Check DB or debug page | `device_type = 'COUNTER'` (not `COUNTER_ONLY`) | Fix #11 |
| 5.5 | New device status is ACTIVE | Check DB or debug page | `status = 'ACTIVE'` (not `is_active = true`) | Fix #10 |
| 5.6 | Rename a device | Click device → rename → save | New name persists after refresh | — |
| 5.7 | Delete a device | Click device → delete | Device removed from list; NOT in DB with `deleted_at` set | Soft delete |
| 5.8 | Deleted device does not reappear | Refresh after deleting | Device stays gone | — |

---

## 6. Venue Management

| # | Check | Steps | Expected | Fixes tested |
|---|---|---|---|---|
| 6.1 | Venues list loads | Navigate to `/venues` | List renders | — |
| 6.2 | Venue detail page loads | Click a venue → view detail | All tabs load (Overview, Areas, Devices, Team, Logs) | — |
| 6.3 | Create a new venue | `/venues/new` → fill form → save | New venue appears in list and dashboard | — |
| 6.4 | Edit venue capacity | Venue settings → change capacity → save | `capacity_max` updates in DB (not `total_capacity`) | Fix #7 |
| 6.5 | Capacity shows on dashboard | After 6.4, go to dashboard | Capacity bar reflects new value | D4 |
| 6.6 | Edit venue name | Change name → save | New name shows everywhere (dashboard, nav) | — |

---

## 7. Area Management

| # | Check | Steps | Expected | Fixes tested |
|---|---|---|---|---|
| 7.1 | Areas list loads | Navigate to `/areas` | Areas render with occupancy counts | — |
| 7.2 | Area detail page loads | Click an area | Detail page opens | — |
| 7.3 | Edit area capacity | Change capacity → save | `capacity_max` updates in DB (not `capacity`) | Fix #8 |
| 7.4 | Occupancy bar reflects capacity | After 7.3, return to dashboard | Bar uses new capacity for percentage | — |

---

## 8. ID Scanner ⭐ Critical

| # | Check | Steps | Expected | Fixes tested |
|---|---|---|---|---|
| 8.1 | Scanner page loads | Navigate to `/scanner` or open via Clicr panel | Camera permission prompt or scan UI visible | — |
| 8.2 | Simulate a scan (mock ID) | Use the "Simulate Scan" / mock button in the Clicr panel | Scan result popup shows ACCEPTED or DENIED | — |
| 8.3 | Accepted scan is recorded | After 8.2 with ACCEPTED result | Row appears in `id_scans` table in Supabase dashboard | Fix #3 (id_scans table) |
| 8.4 | Scan record has business_id | Check the new row in `id_scans` | `business_id` column is not null | C3 |
| 8.5 | Scan record has correct result | Check `scan_result` column | Value is `'ACCEPTED'` or `'DENIED'` (not `'BANNED'`) | C2 |
| 8.6 | Accepted scan increments occupancy | Scan an ID → result is ACCEPTED | Area occupancy count goes up by 1 | `apply_occupancy_delta` in scan.ts |
| 8.7 | Denied scan does NOT increment occupancy | Scan an underage ID | Count stays the same | — |
| 8.8 | Recent scans list updates | After scanning | New scan appears in the scan history feed | Fix #3 (id_scans query) |
| 8.9 | Scan timestamp is valid | Check the scan result timestamp | Shows a real date/time, not `NaN` or `Invalid Date` | Fix #13 (`created_at`) |

---

## 9. Ban Management

| # | Check | Steps | Expected | Fixes tested |
|---|---|---|---|---|
| 9.1 | Banning page loads | Navigate to `/banning` | List renders (empty is fine) | Fix #5 (`banned_persons`) |
| 9.2 | Create a new ban | `/banning/new` → fill name, DOB, reason → save | Ban record appears in list | `banned_persons` + `patron_bans` |
| 9.3 | Banned person scan shows DENIED | Scan an ID matching the banned person's last4 + state | Result shows DENIED or BANNED | D1 (`check_ban_status`) |
| 9.4 | DENIED scan is written as `'DENIED'` in DB | Check `id_scans.scan_result` after 9.3 | Value is `'DENIED'` not `'BANNED'` | C2 |
| 9.5 | Banned scan does NOT increment occupancy | After 9.3 | Area count stays the same | `finalStatus` logic |
| 9.6 | View ban details | Click a ban in the list | Detail page shows ban info | — |
| 9.7 | Revoke a ban | Find revoke/remove option → confirm | Ban status changes to REMOVED/INACTIVE | — |
| 9.8 | Revoked person is no longer blocked | After 9.7, scan again | Result is ACCEPTED (if otherwise valid) | — |

---

## 10. Reports & Analytics

| # | Check | Steps | Expected | Fixes tested |
|---|---|---|---|---|
| 10.1 | Reports page loads | Navigate to `/reports` | Page renders without error | Fix #2 (metrics.ts) |
| 10.2 | Traffic totals show numbers | Look at In/Out/Net counters | Actual numbers (0 is OK) — not `undefined` or error | `get_report_summary` RPC |
| 10.3 | Hourly traffic chart renders | Scroll to chart section | Chart appears with bars or empty state — not a blank div | `get_hourly_traffic` RPC (V4) |
| 10.4 | Venue report page loads | Navigate to `/reports/[venueId]` | Venue-specific data loads | — |
| 10.5 | Date range change works | If date picker is available, change dates | Data refreshes | — |
| 10.6 | Demographics data shows | If demographics section exists | Age/gender breakdown appears | `get_demographics` RPC |

---

## 11. Settings

| # | Check | Steps | Expected |
|---|---|---|---|
| 11.1 | Settings page loads | Navigate to `/settings` | Page renders |
| 11.2 | Team settings load | Navigate to `/settings/team` | Team member list renders |
| 11.3 | Invite a team member | Enter an email → send invite | Invite recorded; email sent (or logged in dev) |
| 11.4 | Ban settings load | Navigate to `/settings/bans` | Ban list renders |
| 11.5 | Business settings editable | Change timezone or refresh interval → save | Settings persist after refresh |

---

## 12. Guests Page

| # | Check | Steps | Expected |
|---|---|---|---|
| 12.1 | Guests page loads | Navigate to `/guests` | Page renders (may be empty) |
| 12.2 | Recent scans appear | After doing scans in section 8 | Scan history list populated |
| 12.3 | Filter by venue works | If filter control exists | List narrows correctly |

---

## 13. Real-Time Sync

| # | Check | Steps | Expected |
|---|---|---|---|
| 13.1 | Polling runs every ~2 seconds | Open DevTools → Network tab → filter `sync` | POST requests appear every ~2s |
| 13.2 | Realtime fires after a tap | Open two tabs → tap IN in Tab 1 | Tab 2 updates without a manual refresh |
| 13.3 | Realtime reconnects after sleep | Close laptop lid → reopen → tap IN | Count still updates (reconnection works) |
| 13.4 | No duplicate events | Tap IN once | Count goes up by exactly 1 (not 2) | `idempotency_key` logic |

---

## 14. Debug & QA Pages (developer only)

| # | URL | What to check |
|---|---|---|
| 14.1 | `/debug` | Runtime inspector loads; shows current app state |
| 14.2 | `/debug/auth` | Shows current user ID, email, role |
| 14.3 | `/debug/context` | Shows full state tree (business, venues, areas, clicrs) |
| 14.4 | `/debug/devices` | Lists devices with their DB values |
| 14.5 | `/debug/create-clicr-truth` | Can create a test device — verify `device_type = 'COUNTER'` in result |
| 14.6 | `/debug/areas-truth` | Shows areas with `capacity_max` column |
| 14.7 | `/qa` | QA test page — run any automated checks available |

---

## 15. Error Handling

| # | Check | Steps | Expected |
|---|---|---|---|
| 15.1 | Missing migration → clear error | If a table is missing, check server terminal | Error message names the missing table/RPC (not a generic crash) |
| 15.2 | Network offline graceful | Disable network in DevTools → try tapping IN | App shows an error message, does not crash or show blank screen |
| 15.3 | Errors logged to `app_errors` | After triggering any server error | Check `app_errors` table in Supabase dashboard — row should appear |

---

## Quick Fail Reference

If something is broken, match the symptom to the cause:

| Symptom | Likely Cause | Fix |
|---|---|---|
| Dashboard infinite spinner | `business_id` not resolving from profile | Check `business_members` table has a row for your user |
| Tap IN does nothing / "Count Failed" | `apply_occupancy_delta` RPC missing | Re-run `migrations/003_rpcs.sql` |
| Count shows `NaN` | `occupancy_snapshots` table missing | Re-run `migrations/001_schema.sql` |
| Scan page crashes | `id_scans` table missing | Re-run `migrations/001_schema.sql` |
| Ban check always passes | `check_ban_status` RPC missing | Re-run `migrations/003_rpcs.sql` |
| Reset count does nothing to Supabase | User has no `business_id` in profile | Check `business_members` row exists |
| "BANNED not valid scan_result" DB error | `scan_result` constraint violation | Already fixed in code — if you see this, check you are on `migration-supabase` branch |
| RLS error `new row violates row-level security` | `004_rls.sql` not run yet | Run `migrations/004_rls.sql` |
| All data visible to everyone | `004_rls.sql` not run yet | **Priority — run immediately** |
