# Design: Edit Capacity + Type for Areas During Onboarding / New Business

Date: 2026-03-06

## Problem

When adding areas during the onboarding wizard (`/onboarding/setup`) or the new-business wizard (`/businesses/new`), the add-area form exposes name, type, and capacity. However, the inline edit (pencil icon) on already-added areas only allows changing the name. The venue counter in the onboarding wizard has no capacity field at all.

## Scope

- `app/onboarding/setup/page.tsx`
- `app/(authenticated)/businesses/new/page.tsx`
- `app/onboarding/setup-actions.ts`

## Design

### Normal Area Edit Mode (Stacked Inline)

Clicking the pencil replaces the area row with a stacked form:

```
[ Name input (full width)          ]
[ Type select   ] [ Capacity input ]
[ Save (check)  ] [ Cancel (x)     ]
```

State additions (both pages):
- `editingAreaCapacity: string` — initialised from the area's `default_capacity` on edit entry
- `editingAreaType: AreaType` — initialised from the area's `area_type` on edit entry

`handleSaveAreaName` is replaced by `handleSaveArea`, which updates the matching entry in `createdAreas` with the new name, capacity, and type.

For VENUE_DOOR-typed areas (only appears in `businesses/new` where the user can add a VENUE_DOOR via the dropdown), the type select is omitted — capacity and name only.

### Venue Counter Edit Mode (Onboarding `setup/page.tsx` only)

The amber venue counter row in edit mode becomes:

```
[ Name input (full width)          ]
[ Capacity input (full width)      ]
[ Save (check)  ] [ Cancel (x)     ]
```

State additions:
- `venueDoorCapacity: string` — default `''` (unset; server falls back to venue capacity)
- `editingVenueDoorCapacity: string`

### Display (non-edit mode)

Area rows show sub-text for type and capacity when set:

- Normal area: `Main Floor  ·  main  ·  150 cap`
- No capacity set: `Main Floor  ·  main`

### Server Action (`setup-actions.ts`)

Add `venueDoorCapacity?: number` to `OnboardingBatchInput`. When present and valid, use it as the venue door's `capacity_max` instead of inheriting the venue's capacity.

## Trade-offs Considered

- **Modal** — more space, but adds a new component and feels heavy for a wizard.
- **Horizontal bar** — compact, but three fields become very cramped on narrow screens.
- **Stacked inline (chosen)** — matches existing edit pattern, no new components, readable labels.
