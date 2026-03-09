# Board View (Multi-Clicr View) Design

## Summary

Board View displays up to 5 counters on one screen, each tracking independently with full M/F tap buttons. Two types exist: auto area boards (derived from an area's clicrs, always in sync) and custom boards (user-created, editable, with custom labels). Events attribute to the underlying clicr/area for reporting.

## Entry Points

### 1. Area card icon (Areas page)
- Replace current resize icon with board/grid icon (LayoutGrid)
- Tapping navigates directly to `/clicr/board/area-[areaId]`
- No intermediate step — immediate board view for that area's clicrs

### 2. "Board View" button (Clicrs page, top right)
- Opens a slide-over panel from the right (not a page navigation)
- Two sections:
  - **MY BOARDS** — user-created custom boards (hidden if none exist)
  - **BROWSE AREAS & CREATE** — all areas grouped by venue, hover reveals "Create View +", clicking area name opens auto board

### 3. Direct URL
- `/clicr/board/[id]` for custom boards
- `/clicr/board/area-[areaId]` for auto area boards
- Bookmarkable

## Board Types

### Auto area boards
- Derived from area's clicrs at render time — not stored
- Always in sync: add/remove a clicr from the area, board reflects it
- Read-only: name and labels come from area/clicr names, no customization
- Cannot be edited or deleted

### Custom boards
- Stored in `board_views` table (already exists)
- User picks clicrs from any area (max 5), assigns custom labels
- Editable after creation (rename, add/remove clicrs, update labels)
- Can be deleted

## Board View Page

**Route:** `/clicr/board/[id]` or `/clicr/board/area-[areaId]`

### Header
- Back arrow to `/clicr`
- Board name (area name for auto, custom name for user boards)
- Venue/area breadcrumb subtitle
- Right: edit icon (custom boards only) + fullscreen/kiosk button

### Counter Tile Grid
- 1 clicr: single centered tile
- 2 clicrs: 2 columns
- 3 clicrs: 3 columns (or 2+1)
- 4-5 clicrs: 2x2 or 2x3 grid

### Each Tile (top to bottom)
- **Label** — custom label or clicr name (small text)
- **Count** — large number, area-level occupancy for that clicr's area
- **Capacity bar** — thin progress bar + "of X / Y% full", color shifts at thresholds (green/amber/red)
- **4 tap buttons** — 2x2 grid:
  - +M (green) | +F (green)
  - -M (red)  | -F (red)

### Occupancy Rules
- Each tile displays **area-level** occupancy (not venue-level)
- Capacity from `area.capacity_max`
- On a custom board mixing areas: tiles from the same area share occupancy, tiles from different areas show independently
- On auto area boards: all tiles share same area occupancy

## Data Flow

- Tap buttons call `recordEvent()` from `useApp()` — same as ClicrPanel
- Event payload: `{ venue_id, area_id, clicr_id, delta: +/-1, flow_type: IN/OUT, gender: M/F, event_type: TAP }`
- Attribution always to the underlying clicr — board view is purely display
- Realtime updates via existing store polling/subscription — no separate polling
- No new API or adapter work needed

## Slide-over Selection Panel

- Triggered by "Board View" button on `/clicr`
- Slides in from right with dark overlay
- Header: "Board View" + close X

### MY BOARDS section
- List of custom boards: name, venue/area context, clicr count
- Click row to navigate to `/clicr/board/[id]`
- Hidden if no custom boards exist

### BROWSE AREAS & CREATE section
- Areas grouped by venue (venue name as subheader)
- Click area name to open auto board (`/clicr/board/area-[areaId]`)
- Hover reveals "Create View +" on the right
- "Create View +" opens create modal

### Create Modal
- Pre-populated with that area's clicrs
- Fields: board name, optional custom label per clicr
- Can remove clicrs or add from other areas
- Max 5 clicrs enforced
- Save creates board and navigates to it

## Edit & Delete (Custom Boards Only)

### Edit
- Gear icon in board view header (custom boards only, not shown on auto boards)
- Modal: edit name, edit labels, remove/add clicrs (max 5)
- Save updates `board_views` record

### Delete
- Available in edit modal (danger zone) or via context on "My Boards" list
- Confirm dialog, then navigates to `/clicr`

## Changes to Existing Pages

### Clicrs page (`/clicr`)
- "Board View" button opens slide-over instead of navigating to settings
- Clicrs on a custom board show "On Board" badge

### Areas page
- Replace resize icon with LayoutGrid icon per area card
- Click navigates to `/clicr/board/area-[areaId]`

### Settings page
- Remove "Board Views" card — feature lives in clicr flow now

### Existing `/board/[id]` page
- Kept as kiosk/fullscreen mode
- Updated to use same tile layout as new board view
- Accessible via fullscreen button on board view page

### File moves
- `settings/board-actions.ts` server actions move to `app/actions/board.ts`
- `settings/board-views/` page removed
