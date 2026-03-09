# Areas Page: VENUE_DOOR Enforcement & Type Grouping Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent users from creating a second VENUE_DOOR area per venue, and reorganize the area list so areas are grouped by type (alphabetical), with VENUE_DOOR always pinned first.

**Architecture:** Both changes are purely UI/client-side in `app/(authenticated)/areas/page.tsx`. No backend or type changes needed. The VENUE_DOOR enforcement removes the option from the type selector when one already exists for the selected venue. The grouping replaces the flat area list with type-bucketed sub-sections per venue.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4

---

## Task 1: Enforce one VENUE_DOOR per venue in the create form

**Files:**
- Modify: `app/(authenticated)/areas/page.tsx`

### Step 1: Remove VENUE_DOOR from the type select when one already exists

The create form has a `<select>` for `area_type` starting at line ~450. Currently it always shows the `VENUE_DOOR` option and shows a warning below if a duplicate would be created.

Replace the duplicate-warning approach with a harder enforcement: filter VENUE_DOOR out of the options entirely when the selected venue already has one.

Find this block:

```tsx
<select
    value={newArea.area_type}
    onChange={e => setNewArea(prev => ({ ...prev, area_type: e.target.value as AreaType }))}
    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
>
    <option value="VENUE_DOOR">🚪 Venue Door</option>
    <option value="MAIN">Main</option>
    <option value="ENTRY">Entry</option>
    <option value="VIP">VIP</option>
    <option value="PATIO">Patio</option>
    <option value="BAR">Bar</option>
    <option value="EVENT_SPACE">Event Space</option>
    <option value="OTHER">Other</option>
</select>
{newArea.area_type === 'VENUE_DOOR' && newArea.venue_id && getVenueDoorArea(newArea.venue_id) && (
    <p className="text-xs text-amber-400 mt-1">
        ⚠️ This venue already has a Venue Door area. Creating another will cause duplicate venue occupancy tracking.
    </p>
)}
```

Replace with:

```tsx
{(() => {
    const venueDoorExists = !!(newArea.venue_id && getVenueDoorArea(newArea.venue_id));
    return (
        <>
            <select
                value={newArea.area_type}
                onChange={e => setNewArea(prev => ({ ...prev, area_type: e.target.value as AreaType }))}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
                {!venueDoorExists && (
                    <option value="VENUE_DOOR">🚪 Venue Door</option>
                )}
                <option value="MAIN">Main</option>
                <option value="ENTRY">Entry</option>
                <option value="VIP">VIP</option>
                <option value="PATIO">Patio</option>
                <option value="BAR">Bar</option>
                <option value="EVENT_SPACE">Event Space</option>
                <option value="OTHER">Other</option>
            </select>
            {venueDoorExists && newArea.area_type === 'VENUE_DOOR' && (
                <p className="text-xs text-amber-400 mt-1">
                    This venue already has a Venue Door area.
                </p>
            )}
        </>
    );
})()}
```

### Step 2: Reset area_type when venue changes to avoid stale VENUE_DOOR selection

Find the venue `<select>` onChange handler:

```tsx
onChange={e => setNewArea(prev => ({ ...prev, venue_id: e.target.value }))}
```

Replace with:

```tsx
onChange={e => {
    const venueId = e.target.value;
    const hasDoor = !!(venueId && getVenueDoorArea(venueId));
    setNewArea(prev => ({
        ...prev,
        venue_id: venueId,
        // If VENUE_DOOR was selected but new venue already has one, reset to MAIN
        area_type: prev.area_type === 'VENUE_DOOR' && hasDoor ? 'MAIN' : prev.area_type,
    }));
}}
```

### Step 3: Verify TypeScript

```bash
cd /home/king/clicr-v4/.claude/worktrees/venue-door-counter && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

### Step 4: Manual verification

- Open `/areas`, click Add Area
- Select a venue that already has a Venue Door area → confirm VENUE_DOOR option is absent from the type select
- Select a venue with no Venue Door → confirm VENUE_DOOR option appears
- Switch from a no-door venue (with VENUE_DOOR selected) to a has-door venue → confirm type resets to MAIN

### Step 5: Commit

```bash
git add "app/(authenticated)/areas/page.tsx"
git commit -m "feat(areas): enforce one VENUE_DOOR per venue in create form"
```

---

## Task 2: Group areas by type within each venue section

**Files:**
- Modify: `app/(authenticated)/areas/page.tsx`

### Step 1: Define type sort order

After the `getVenueDoorArea` helper (around line 60), add:

```ts
const AREA_TYPE_ORDER: Record<string, number> = {
    VENUE_DOOR: 0, // always first
    BAR: 1,
    ENTRY: 2,
    EVENT_SPACE: 3,
    MAIN: 4,
    OTHER: 5,
    PATIO: 6,
    VIP: 7,
};

const AREA_TYPE_LABELS: Record<string, string> = {
    VENUE_DOOR: 'Venue Door',
    BAR: 'Bar',
    ENTRY: 'Entry',
    EVENT_SPACE: 'Event Space',
    MAIN: 'Main Floor',
    OTHER: 'Other',
    PATIO: 'Patio',
    VIP: 'VIP',
};
```

### Step 2: Replace the flat area list with type-grouped sections

Find the area grid render inside `venueGroups.map(...)`:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {venueAreas.map(area => {
        ...card JSX...
    })}
</div>
```

Replace with a grouped render. First, group and sort `venueAreas` by type:

```tsx
{(() => {
    // Group by area_type, sorted by AREA_TYPE_ORDER
    const typeGroups = Object.entries(
        venueAreas.reduce<Record<string, typeof venueAreas>>((acc, area) => {
            const key = area.area_type;
            if (!acc[key]) acc[key] = [];
            acc[key].push(area);
            return acc;
        }, {})
    ).sort(([a], [b]) => (AREA_TYPE_ORDER[a] ?? 99) - (AREA_TYPE_ORDER[b] ?? 99));

    return (
        <div className="space-y-6">
            {typeGroups.map(([type, typeAreas]) => (
                <div key={type}>
                    <h3 className={cn(
                        "text-xs font-bold uppercase tracking-widest mb-3",
                        type === 'VENUE_DOOR' ? "text-amber-500" : "text-gray-500"
                    )}>
                        {AREA_TYPE_LABELS[type] ?? type}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {typeAreas.map(area => {
                            const scopeKey = `area:${activeBusiness.id}:${area.venue_id}:${area.id}`;
                            const traffic = areaTraffic[scopeKey] ?? { total_in: 0, total_out: 0 };
                            const areaClicrs = clicrs.filter(c => c.area_id === area.id);
                            const deviceCount = areaClicrs.length;
                            const liveOcc = area.current_occupancy ?? 0;
                            const capacity = area.default_capacity ?? area.capacity_limit ?? 0;
                            const pct = capacity > 0 ? Math.round((liveOcc / capacity) * 100) : 0;

                            return (
                                <div
                                    key={area.id}
                                    className={cn(
                                        "border rounded-xl p-6 hover:border-gray-700 transition-colors",
                                        area.area_type === 'VENUE_DOOR'
                                            ? "bg-amber-950/10 border-amber-500/20"
                                            : "bg-gray-900/50 border-gray-800"
                                    )}
                                >
                                    {/* existing card inner content — keep identical, just update outer div className above */}
                                    ...
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
})()}
```

**Important:** Keep all the existing card inner content exactly as-is (the occupancy display, traffic stats, shift buttons, add clicr button, etc). Only the outer wrapper div className and the grouping structure change.

### Step 3: Remove the VENUE_DOOR badge from the card name row

Since areas are now grouped under a labeled section header, the inline "Venue Door" badge is redundant. Find and remove:

```tsx
{area.area_type === 'VENUE_DOOR' && (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
        Venue Door
    </span>
)}
```

Replace the name display with just:

```tsx
<span className="text-lg">{area.name}</span>
```

### Step 4: Verify TypeScript

```bash
cd /home/king/clicr-v4/.claude/worktrees/venue-door-counter && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

### Step 5: Manual verification

- Navigate to `/areas`
- Confirm areas are grouped under type headers per venue (e.g. "Venue Door", "Main Floor", "VIP")
- Confirm VENUE_DOOR group always appears first with amber label
- Confirm other types appear in alphabetical order
- Confirm VENUE_DOOR area card has a subtle amber border tint
- Confirm the old inline "Venue Door" badge is gone

### Step 6: Commit

```bash
git add "app/(authenticated)/areas/page.tsx"
git commit -m "feat(areas): group areas by type, VENUE_DOOR pinned first"
```
