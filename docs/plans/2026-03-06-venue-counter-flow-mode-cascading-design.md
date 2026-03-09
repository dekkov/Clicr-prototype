# Design: Venue Counter Clicr, Flow Mode, Cascading Forms & 403 Fix

Date: 2026-03-06

## Problem

1. Venue occupancy is tracked via a hidden VENUE_DOOR area — should be tracked directly on the venue via a dedicated "venue counter" clicr
2. Clicr templates (1/2/3 counters) are outdated — users need flow_mode selection (bidirectional, in-only, out-only) instead
3. 403 error on tap endpoint — RLS blocks service_role inserts in the apply_occupancy_delta RPC
4. /venues/new creates entities per step instead of batching on finish
5. No way to add clicrs from /clicr page (only from /areas)
6. Adding an area doesn't offer to add clicrs inline

## Section 1: Dedicated Venue Counter Clicr (Direct Venue Connection)

### Schema (migration 016)

- `venues`: add `current_occupancy INTEGER NOT NULL DEFAULT 0`
- `devices`: add `is_venue_counter BOOLEAN NOT NULL DEFAULT false`
- `occupancy_events.area_id`: change from `NOT NULL` to nullable
- Remove `VENUE_DOOR` from area_type CHECK constraints (undo migration 014)
- Delete existing VENUE_DOOR areas

### RPC changes

Modify `apply_occupancy_delta` to accept optional `p_venue_id`. When `p_area_id` is NULL and `p_venue_id` is provided, update `venues.current_occupancy` instead of `areas.current_occupancy`. Insert event with `area_id = NULL`.

### TypeScript types

- `Clicr.area_id` becomes `string | null` (null for venue counters)
- Add `Clicr.venue_id?: string` and `Clicr.is_venue_counter?: boolean`
- Remove `VENUE_DOOR` from `AreaType` union

### Store

- `addVenue()`: stop creating VENUE_DOOR area, instead auto-create a venue counter clicr (`is_venue_counter: true`, `area_id: null`, `venue_id: venue.id`)

### Wizard step 4 (CLICRS)

Before user areas, show a special amber section with the venue name as header (text only, no data binding). The auto-created venue counter clicr appears here. Edit (name + flow_mode) allowed, delete disabled.

### /clicr/ page

Venue counter clicrs: amber card styling, pinned first in venue group, no delete action.

### ClicrPanel

Check `is_venue_counter` flag. Read venue occupancy from `venues.current_occupancy`.

### Dashboard

Read venue occupancy from `venues.current_occupancy` instead of VENUE_DOOR area.

## Section 2: Replace Clicr Templates with Flow Mode

- Remove `CLICR_TEMPLATES` and `handleApplyTemplate` from BusinessSetupWizard
- Add flow_mode select to clicr add form (Both / In only / Out only)
- Per-area flow mode state: `clicrFlowModes: Record<string, FlowMode>`
- Edit mode (pencil): stacked inline — name + flow_mode + Save/Cancel
- `handleSaveClicrName` -> `handleSaveClicr` (saves name + flow_mode)
- Display: flow_mode badge next to name

## Section 3: 403 Error Fix

Root cause: `apply_occupancy_delta` RPC is SECURITY DEFINER but the INSERT into `occupancy_events` hits RLS. Fix in migration 016 by ensuring proper RLS bypass inside the function.

## Section 4: Cascading Add Forms (Batch on Finish)

### /venues/new

Refactor to collect all data in local state across all 3 steps. Only call `addVenue`, `addArea`, `addClicr` on "Finish Setup". Add flow_mode to clicr form.

### /areas page

After adding an area, show inline "Add Clicrs?" prompt with name + flow_mode form.

### /clicr page

Replace link-to-areas button with a modal: area selector (grouped by venue) + name + flow_mode.

## Scope

| File | Changes |
|------|---------|
| migrations/016_venue_counter_clicr.sql | Schema + RPC changes |
| lib/types.ts | Clicr type, remove VENUE_DOOR |
| lib/store.tsx | addVenue auto-create venue counter clicr |
| components/wizards/BusinessSetupWizard.tsx | Venue counter in step 4, flow_mode, remove templates |
| app/(authenticated)/clicr/page.tsx | Amber + pin venue counter, add clicr modal |
| app/(authenticated)/clicr/[id]/ClicrPanel.tsx | venue counter flag + venues.current_occupancy |
| app/(authenticated)/areas/page.tsx | Remove VENUE_DOOR, cascading clicr add |
| app/(authenticated)/venues/new/page.tsx | Batch on finish, flow_mode |
| app/(authenticated)/dashboard/page.tsx | Venue occupancy from venues table |
| core/adapters/LocalAdapter.ts | Handle venue counter clicrs |
| core/adapters/SupabaseAdapter.ts | Handle venue counter clicrs |
| app/api/tap/[token]/route.ts | Support venue counter taps |
| app/onboarding/setup-actions.ts | Remove VENUE_DOOR, create venue counter clicr |
