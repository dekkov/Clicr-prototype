# CLICR V4 — QA Checklist

## Pre-Flight

- [ ] App starts with `npm run dev` without errors
- [ ] App builds with `npm run build` without errors
- [ ] No TypeScript errors in strict mode
- [ ] No console errors on initial load
- [ ] `.env.example` contains all required vars (no secrets)

---

## 1. Onboarding Flow

### Happy Path
- [ ] New user can sign up with email + password
- [ ] Email verification works (or skip in demo mode)
- [ ] Business creation: name + timezone saved correctly
- [ ] First venue creation: name, city, capacity saves
- [ ] First area creation within venue
- [ ] First device (Clicr) created and assigned to area
- [ ] Onboarding completes → redirects to dashboard

### Edge Cases
- [ ] Duplicate email shows error (not crash)
- [ ] Empty business name shows validation error
- [ ] Back button during onboarding doesn't lose progress
- [ ] Refreshing mid-onboarding resumes at correct step

---

## 2. Counting (Core Feature — Most Critical)

### Single Tap
- [ ] Tap +1 → occupancy increases by 1
- [ ] Tap -1 → occupancy decreases by 1
- [ ] Occupancy display updates immediately (optimistic)
- [ ] Server-confirmed value matches optimistic value

### Rapid Tapping (Stress Test)
- [ ] Tap +1 rapidly 20 times → final occupancy = 20
- [ ] No "lost taps" — every click must count
- [ ] UI doesn't freeze or lag during rapid taps
- [ ] No console errors during rapid tapping
- [ ] Server state matches local state after rapid taps settle

### Occupancy Floor
- [ ] When occupancy is 0, tapping -1 keeps it at 0 (not negative)
- [ ] Display never shows negative numbers

### Board View (Multi-Clicker)
- [ ] +1, +2, +3 buttons work correctly
- [ ] -1, -2, -3 buttons work correctly
- [ ] Gender split (Male/Female) buttons work when enabled
- [ ] Dual-panel view shows two devices side by side
- [ ] Single-panel view shows one device full-width

### Cross-View Consistency
- [ ] Tap on `/clicr/[id]` → occupancy updates on `/dashboard`
- [ ] Tap on `/clicr/[id]` → occupancy updates on `/areas/[id]`
- [ ] Tap on `/clicr/[id]` → occupancy updates on `/venues/[id]`
- [ ] Multiple browser tabs show consistent occupancy

---

## 3. ID Scanning

### Scan Flow
- [ ] Camera opens on scanner page (permission prompt works)
- [ ] Scan barcode → person details extracted
- [ ] ACCEPTED scan: person details shown, occupancy optionally increments
- [ ] DENIED scan: denial reason shown clearly
- [ ] Ban check: if person is banned, BLOCKED result appears

### Edge Cases
- [ ] Scan with no DOB → age shows as "Unknown"
- [ ] Scan underage person → DENIED with "UNDERAGE" reason
- [ ] Scan same person twice → no crash, scan logged both times
- [ ] Camera permission denied → graceful error state

---

## 4. Banning

### Create Ban
- [ ] Create TEMPORARY ban with end date → saved correctly
- [ ] Create PERMANENT ban → no end date field required
- [ ] All reason categories selectable
- [ ] Ban appears in ban list immediately
- [ ] "Applies to all locations" toggle works

### Ban Enforcement
- [ ] Scan banned person → BLOCKED result
- [ ] Scan person banned at 1 venue, at unaffected venue → ACCEPTED
- [ ] Expired temporary ban → person not blocked

### Manage Bans
- [ ] Edit ban reason/notes
- [ ] Remove ban → status changes to REMOVED
- [ ] Audit log shows all ban changes

---

## 5. Reporting & Analytics

### Summary Cards
- [ ] Total In matches sum of all IN events since reset
- [ ] Total Out matches sum of all OUT events since reset
- [ ] Net = Total In - Total Out
- [ ] Turnarounds show separately
- [ ] Net Adjusted = Total In - Turnarounds

### Hourly Chart
- [ ] Bars appear for hours with events
- [ ] Green = IN, Red = OUT
- [ ] Hours with no events show as 0 (not missing)
- [ ] Chart updates after new taps

### Demographics
- [ ] Pie/bar chart shows age bands
- [ ] Only ACCEPTED scans counted
- [ ] Percentages sum to ~100%

### Event Log
- [ ] Shows all events in reverse chronological order
- [ ] Each entry shows: time, type (TAP/SCAN/RESET), delta, device
- [ ] Pagination works for large event logs

### Export
- [ ] PDF export downloads successfully
- [ ] Excel (XLSX) export downloads successfully
- [ ] Exported data matches on-screen report

---

## 6. Reset

### Reset All
- [ ] "Reset All Counts" button shows confirmation dialog
- [ ] After reset: all area occupancies = 0
- [ ] After reset: Total In and Total Out = 0 (since new reset)
- [ ] After reset: event log shows RESET entry
- [ ] Events before reset still exist in DB (not deleted)

### Venue-Scoped Reset
- [ ] Resetting Venue A doesn't affect Venue B
- [ ] Only areas within the target venue are reset

### Post-Reset Consistency
- [ ] New taps after reset show correct totals
- [ ] Reports correctly use new reset time as window start
- [ ] Dashboard shows updated values immediately

---

## 7. Venue & Area Management

### CRUD Operations
- [ ] Create venue → appears in list immediately
- [ ] Edit venue name → updates across all views
- [ ] Edit venue capacity → capacity bar reflects change
- [ ] Create area within venue → appears in venue detail
- [ ] Edit area capacity → updates correctly
- [ ] Add device to area → device appears in area detail
- [ ] Remove device from area → device removed, data preserved

### Validation
- [ ] Empty venue name → error
- [ ] Negative capacity → error or ignored
- [ ] Duplicate venue name → allowed (different IDs)

---

## 8. Navigation & Layout

- [ ] Sidebar navigation works on desktop
- [ ] Mobile responsive: menu collapses to hamburger
- [ ] All routes load without 404
- [ ] Back button behavior is intuitive
- [ ] Loading states show spinners/skeletons

---

## 9. Authentication & Authorization

### Auth Flow
- [ ] Login with valid credentials → redirects to dashboard
- [ ] Login with invalid credentials → error message
- [ ] Sign out → redirects to login
- [ ] Protected routes redirect to login if unauthenticated
- [ ] Session persists across page refreshes

### RBAC (when implemented)
- [ ] OWNER can access all settings
- [ ] USER (door staff) can only see counter and scanner
- [ ] Non-members cannot access business data

---

## 10. Error Handling

- [ ] Network failure during tap → error logged, UI doesn't crash
- [ ] API returns 500 → error message shown, not white screen
- [ ] Invalid routes → 404 page shown
- [ ] Supabase offline → graceful degradation (show last known state)

---

## 11. Performance

- [ ] Dashboard loads in < 2 seconds
- [ ] Counter view (clicr page) responds to taps in < 100ms (perceived)
- [ ] No layout shifts after data loads
- [ ] Memory doesn't leak during long sessions (check Chrome DevTools)
- [ ] Polling doesn't accumulate if tab is backgrounded

---

## 12. Demo Mode vs Production Mode

- [ ] `NEXT_PUBLIC_APP_MODE=demo` → uses LocalAdapter, mock data OK
- [ ] `NEXT_PUBLIC_APP_MODE=production` → uses SupabaseAdapter, no mock data
- [ ] Switching modes doesn't break navigation
- [ ] Demo mode doesn't require Supabase credentials

---

## Cross-Browser Testing

- [ ] Chrome (latest)
- [ ] Safari (latest, macOS + iOS)
- [ ] Firefox (latest)
- [ ] Mobile Safari (iPhone, iPad)
- [ ] Mobile Chrome (Android)

---

## Regression Triggers

When any of the following changes are made, re-run the full checklist:

1. `apply_occupancy_delta` RPC modified
2. `reset_counts` RPC modified
3. `lib/store.tsx` (AppProvider) modified
4. `core/adapters/DataClient.ts` interface modified
5. Any RLS policy changed
6. New migration applied
7. Authentication changes
