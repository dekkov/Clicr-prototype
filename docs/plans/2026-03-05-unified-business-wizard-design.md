# Unified Business Setup Wizard — Design

**Date:** 2026-03-05
**Status:** Approved

---

## Goal

Unify `/onboarding/setup` and `/businesses/new` into a single shared wizard component. Add VENUE_DOOR area and clicr restrictions throughout the wizard.

---

## Architecture

### Shared component: `components/wizards/BusinessSetupWizard.tsx`

- Contains all state, step logic, and step JSX
- Steps: BUSINESS → VENUE → AREAS → CLICRS → INVITE → SCAN_CONFIG → BAN_CONFIG
- No cancel button, no page title — purely the wizard
- Accepts `onComplete?: () => void` callback (defaults to `router.push('/dashboard')`)

### `/onboarding/setup/page.tsx` (thin wrapper)

- Standalone fullscreen layout (no AppLayout, no sidebar)
- Renders `<BusinessSetupWizard />`

### `/businesses/new/page.tsx` (thin wrapper)

- AppLayout (sidebar visible)
- Page header: "Add New Business" title + Cancel button (`router.back()`)
- Renders `<BusinessSetupWizard />`

---

## Area Step Behavior

### Venue Door — auto-created

When the user advances from the Venue step to the Areas step, a VENUE_DOOR area named "Venue Door" is automatically inserted at the top of `createdAreas`. Simultaneously, an "Entry Door" clicr is auto-inserted into `createdClicrs` for that area.

### Venue Door area in the list

- Name: **editable** (inline edit)
- Capacity: **editable**
- Type: not shown/editable — it is implicitly VENUE_DOOR
- Delete button: **hidden**

### Regular area input

Type dropdown contains: Main, Entry, VIP, Patio, Bar, Event Space, Other — **no Venue Door option**.

Regular areas are fully editable and deletable.

---

## Clicrs Step Behavior

### Venue Door area clicrs

- "Entry Door" clicr is pre-populated (auto-created alongside the area)
- **First clicr (auto-created):**
  - Name: editable
  - Flow mode: editable
  - Delete: **hidden**
- **Additional clicrs on Venue Door area:** fully editable + deletable

### All other areas

No restrictions — clicrs are fully editable and deletable as before.

---

## Data Flow

1. User completes Venue step → `handleCreateVenue` fires → VENUE_DOOR area + Entry Door clicr inserted into local state
2. User completes Areas/Clicrs steps → `finish()` calls `createBusinessVenueAndAreas` with `area_type` per area
3. Server action saves `area_type` (already updated to accept it)
4. `finish()` then calls `addClicr` for each clicr in `createdClicrs` (including the locked Entry Door)

---

## Server Action Changes

`setup-actions.ts` — `OnboardingBatchInput.areas` already accepts `area_type?: string` (done). The insert uses `a.area_type || 'MAIN'`.

---

## Key Invariants

- Only one VENUE_DOOR area per wizard session
- The first clicr of a VENUE_DOOR area is identified by position (index 0 among clicrs for that area) — no special flag needed
- Deleting the VENUE_DOOR area is not possible in the wizard UI (but remains possible in `/areas` page for existing areas)
