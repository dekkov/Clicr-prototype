# Venue Door Counter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Introduce a `VENUE_DOOR` area type that acts as the venue's dedicated occupancy counter — area clicrs track their own occupancy independently and no longer roll up to venue totals.

**Architecture:** `VENUE_DOOR` is a first-class `AreaType` value. One such area can exist per venue. Venue occupancy = the VENUE_DOOR area's `current_occupancy` (not a sum of all areas). All other areas remain unchanged. A DB migration adds the new enum value. ClicrPanel detects the VENUE_DOOR type and renders a visually distinct UI. Dashboard and capacity enforcement both source venue occupancy from VENUE_DOOR only.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, Supabase PostgreSQL

---

## Task 1: DB Migration — Add VENUE_DOOR to area_type constraint

**Files:**
- Create: `migrations/014_venue_door_area_type.sql`

### Step 1: Write the migration

```sql
-- migrations/014_venue_door_area_type.sql
-- Add VENUE_DOOR to the area_type CHECK constraint

ALTER TABLE areas
  DROP CONSTRAINT IF EXISTS areas_area_type_check;

ALTER TABLE areas
  ADD CONSTRAINT areas_area_type_check
  CHECK (area_type IN (
    'ENTRY', 'MAIN', 'PATIO', 'VIP', 'BAR', 'EVENT_SPACE', 'OTHER', 'VENUE_DOOR'
  ));
```

### Step 2: Run migration in Supabase SQL editor (production) or note for local dev

For demo/local mode this migration is not required (LocalAdapter doesn't enforce DB constraints). For production, run in Supabase dashboard SQL editor.

### Step 3: Commit

```bash
git add migrations/014_venue_door_area_type.sql
git commit -m "feat(db): add VENUE_DOOR to area_type constraint"
```

---

## Task 2: TypeScript — Add VENUE_DOOR to AreaType

**Files:**
- Modify: `lib/types.ts`

### Step 1: Update the AreaType union

Find this line:
```ts
export type AreaType = 'ENTRY' | 'MAIN' | 'PATIO' | 'VIP' | 'BAR' | 'EVENT_SPACE' | 'OTHER';
```

Replace with:
```ts
export type AreaType = 'ENTRY' | 'MAIN' | 'PATIO' | 'VIP' | 'BAR' | 'EVENT_SPACE' | 'OTHER' | 'VENUE_DOOR';
```

### Step 2: Verify no TypeScript errors

```bash
cd /home/king/clicr-v4 && npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors (existing errors unrelated to this change are fine).

### Step 3: Commit

```bash
git add lib/types.ts
git commit -m "feat(types): add VENUE_DOOR to AreaType"
```

---

## Task 3: Areas Page — Add VENUE_DOOR to creation form

**Files:**
- Modify: `app/(authenticated)/areas/page.tsx`

### Step 1: Add a helper to find existing VENUE_DOOR area per venue

After the state declarations near the top of `AreasPage`, add:
```ts
// Find existing VENUE_DOOR area for a given venue (only one allowed per venue)
const getVenueDoorArea = (venueId: string) =>
    areas.find(a => a.venue_id === venueId && a.area_type === 'VENUE_DOOR' && !a.deleted_at);
```

### Step 2: Add VENUE_DOOR to the area_type select in the create area form

Find the area_type `<select>` (or the field where `area_type` is chosen) inside the create area form. Add VENUE_DOOR as the first option with a label and a warning if one already exists for the selected venue:

```tsx
{/* Area Type */}
<div className="space-y-2">
    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Area Type</label>
    <select
        value={newArea.area_type}
        onChange={(e) => setNewArea(prev => ({ ...prev, area_type: e.target.value as AreaType }))}
        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white transition-colors"
    >
        <option value="VENUE_DOOR">🚪 Venue Door (main entrance counter)</option>
        <option value="ENTRY">Entry</option>
        <option value="MAIN">Main Floor</option>
        <option value="PATIO">Patio</option>
        <option value="VIP">VIP</option>
        <option value="BAR">Bar</option>
        <option value="EVENT_SPACE">Event Space</option>
        <option value="OTHER">Other</option>
    </select>
    {newArea.area_type === 'VENUE_DOOR' && newArea.venue_id && getVenueDoorArea(newArea.venue_id) && (
        <p className="text-xs text-amber-400">
            ⚠️ This venue already has a Venue Door area. Creating another will cause duplicate venue occupancy tracking.
        </p>
    )}
</div>
```

### Step 3: Visually distinguish VENUE_DOOR areas in the area list

In the area list render, find where each area card/row is rendered. Add a visual badge for VENUE_DOOR areas. Locate where area name/type is displayed and add:

```tsx
{area.area_type === 'VENUE_DOOR' && (
    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
        Venue Door
    </span>
)}
```

### Step 4: Verify TypeScript

```bash
cd /home/king/clicr-v4 && npx tsc --noEmit 2>&1 | head -30
```

### Step 5: Manual verification

- Navigate to `/areas`
- Open the create area form
- Confirm "Venue Door" appears as the first option in the type selector
- Confirm the warning appears if you select VENUE_DOOR and a door area already exists for the chosen venue

### Step 6: Commit

```bash
git add "app/(authenticated)/areas/page.tsx"
git commit -m "feat(areas): add VENUE_DOOR type to create form with duplicate warning"
```

---

## Task 4: ClicrPanel — Fix venue occupancy calculation

**Files:**
- Modify: `app/(authenticated)/clicr/[id]/ClicrPanel.tsx`

### Step 1: Replace the venue occupancy calculation

Find this block (~lines 161–163):
```ts
// Venue Occupancy = Sum of all areas in venue (Realtime)
const venueAreas = (areas || []).filter(a => a.venue_id === venueId);
const currentVenueOccupancy = venueAreas.reduce((acc, a) => acc + (a.current_occupancy || 0), 0);
```

Replace with:
```ts
// Venue Occupancy = VENUE_DOOR area's count only (dedicated door counter)
const venueAreas = (areas || []).filter(a => a.venue_id === venueId);
const venueDoorArea = venueAreas.find(a => a.area_type === 'VENUE_DOOR');
const currentVenueOccupancy = venueDoorArea?.current_occupancy ?? 0;
```

### Step 2: Verify TypeScript

```bash
cd /home/king/clicr-v4 && npx tsc --noEmit 2>&1 | head -30
```

### Step 3: Commit

```bash
git add "app/(authenticated)/clicr/[id]/ClicrPanel.tsx"
git commit -m "fix(clicr): venue occupancy sourced from VENUE_DOOR area only, not sum of areas"
```

---

## Task 5: ClicrPanel — Visual differentiation for VENUE_DOOR

**Files:**
- Modify: `app/(authenticated)/clicr/[id]/ClicrPanel.tsx`

### Step 1: Derive isVenueDoor flag near other area derivations

After the line `const currentArea = (areas || []).find(a => a.id === clicr?.area_id);`, add:
```ts
const isVenueDoor = currentArea?.area_type === 'VENUE_DOOR';
```

### Step 2: Style the outer container differently

Find:
```tsx
<div className="flex flex-col h-[100vh] bg-black relative overflow-hidden" ...>
```

Replace with:
```tsx
<div className={cn(
    "flex flex-col h-[100vh] relative overflow-hidden",
    isVenueDoor ? "bg-[#0d0a00]" : "bg-black"
)} ...>
```

### Step 3: Style the header differently for VENUE_DOOR

In the header section, find where the venue name and clicr name are rendered (~lines 718–744). Wrap the venue name label with amber styling when isVenueDoor:

```tsx
<h2 className={cn(
    "font-bold text-[10px] uppercase tracking-[0.2em] mb-1",
    isVenueDoor ? "text-amber-500" : "text-slate-500"
)}>
    {venue?.name || 'VENUE'}
</h2>
<div className="flex items-center gap-2">
    <h1 className={cn(
        "font-bold text-2xl tracking-tight",
        isVenueDoor ? "text-amber-300" : "text-white"
    )}>
        {isVenueDoor ? '🚪 ' : ''}{clicr.name}
    </h1>
    {/* settings gear button unchanged */}
</div>
{isVenueDoor && (
    <p className="text-[10px] text-amber-600 uppercase tracking-widest mt-0.5">Venue Occupancy Counter</p>
)}
```

### Step 4: Style the OccupancyDisplay count amber for VENUE_DOOR

The `OccupancyDisplay` component is in `lib/ui/components/ClicrComponents`. Rather than modifying that component, pass a className or prop if available, or wrap with a color override div. Check what props it accepts first.

If `OccupancyDisplay` doesn't accept a color prop, wrap the section:
```tsx
<div className={cn("flex-1 flex flex-col items-center justify-center min-h-0", isVenueDoor && "[&_[data-occupancy-count]]:text-amber-400")}>
    <OccupancyDisplay ... />
</div>
```

Alternatively, add a `data-occupancy-count` attribute to the count element in `OccupancyDisplay` and target it via the wrapper. If that's too complex, simply add a subtitle below OccupancyDisplay for VENUE_DOOR context:

```tsx
{isVenueDoor && (
    <p className="text-xs text-amber-600 uppercase tracking-widest mt-2">Total in building</p>
)}
```

### Step 5: Style the GUEST IN button amber for VENUE_DOOR

Find the `ActionButton` for "GUEST IN" (~line 822). The `ActionButton` component likely accepts a `className`. Add amber override for VENUE_DOOR:

```tsx
<ActionButton
    label="GUEST IN"
    onClick={handleGuestIn}
    className={cn("h-24 md:h-28 text-lg", isVenueDoor && "bg-amber-600 hover:bg-amber-500")}
    icon={...}
/>
```

### Step 6: Verify TypeScript

```bash
cd /home/king/clicr-v4 && npx tsc --noEmit 2>&1 | head -30
```

### Step 7: Manual verification

- Create a VENUE_DOOR area in `/areas`, assign a clicr to it
- Navigate to that clicr's panel at `/clicr/[id]`
- Confirm dark amber/gold background, amber venue name label, "Venue Occupancy Counter" subtitle, 🚪 prefix in name
- Open any non-VENUE_DOOR clicr panel — confirm it still shows normal black/white styling

### Step 8: Commit

```bash
git add "app/(authenticated)/clicr/[id]/ClicrPanel.tsx"
git commit -m "feat(clicr): amber visual theme for VENUE_DOOR counters"
```

---

## Task 6: Dashboard — Fix liveOccupancy to use VENUE_DOOR areas only

**Files:**
- Modify: `app/(authenticated)/dashboard/page.tsx`

### Step 1: Replace the liveOccupancy calculation

Find (~line 127–130):
```ts
const liveOccupancy = useMemo(
    () => areas.reduce((sum, a) => sum + (a.current_occupancy ?? 0), 0),
    [areas]
);
```

Replace with:
```ts
// Venue occupancy = sum of VENUE_DOOR areas only (one per venue)
const liveOccupancy = useMemo(
    () => areas
        .filter(a => a.area_type === 'VENUE_DOOR')
        .reduce((sum, a) => sum + (a.current_occupancy ?? 0), 0),
    [areas]
);
```

### Step 2: Verify TypeScript

```bash
cd /home/king/clicr-v4 && npx tsc --noEmit 2>&1 | head -30
```

### Step 3: Manual verification

- Dashboard "Live Occupancy" KPI card should now reflect only VENUE_DOOR area counts
- Tapping a non-VENUE_DOOR clicr (VIP, bar, etc.) should NOT change the dashboard Live Occupancy number

### Step 4: Commit

```bash
git add "app/(authenticated)/dashboard/page.tsx"
git commit -m "fix(dashboard): live occupancy sourced from VENUE_DOOR areas only"
```

---

## Task 7: Onboarding — Prompt to create VENUE_DOOR area during setup

**Files:**
- Modify: `app/onboarding/setup/page.tsx`

### Step 1: Read the current setup page area creation section

The setup page creates areas inline during onboarding. Find where areas are created and ensure `VENUE_DOOR` is available as a type option. If the setup page has a hardcoded area type of `'MAIN'` or similar for the first area, change the default to `'VENUE_DOOR'` and label it "Main Entrance (Venue Door)":

Find any area creation defaults that look like:
```ts
area_type: 'MAIN'
```
or area type selectors in the onboarding form. Update to offer `VENUE_DOOR` as the recommended first area:

```tsx
<option value="VENUE_DOOR">🚪 Main Entrance — Venue Door (recommended)</option>
```

If the onboarding page auto-creates the first area without user input, set its `area_type` to `'VENUE_DOOR'` by default.

### Step 2: Verify TypeScript

```bash
cd /home/king/clicr-v4 && npx tsc --noEmit 2>&1 | head -30
```

### Step 3: Commit

```bash
git add app/onboarding/setup/page.tsx
git commit -m "feat(onboarding): default first area type to VENUE_DOOR"
```

---

## Final Verification Checklist

Run through this manually after all tasks complete:

1. **Create a venue** → Setup suggests a VENUE_DOOR area as the first area
2. **Create additional areas** (VIP, Bar) → They show normally in the list; VENUE_DOOR area has amber badge
3. **Assign a clicr to VENUE_DOOR area** → Its ClicrPanel shows amber/gold theme with "Venue Occupancy Counter" label
4. **Tap GUEST IN on VENUE_DOOR clicr** → Dashboard "Live Occupancy" increments
5. **Tap GUEST IN on VIP clicr** → VIP area count increments, dashboard "Live Occupancy" does NOT change
6. **Tap GUEST IN on VIP clicr** → VIP's own area occupancy goes up (visible in VIP ClicrPanel)
7. **TypeScript clean**: `npx tsc --noEmit` shows no new errors
