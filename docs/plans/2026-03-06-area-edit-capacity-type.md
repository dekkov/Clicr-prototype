# Area Edit: Capacity + Type During Onboarding / New Business

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users edit capacity and type on already-added areas in the onboarding and new-business wizards; also let them set a capacity on the default venue counter in the onboarding wizard.

**Architecture:** Three files changed. `setup-actions.ts` gains a `venueDoorCapacity` field. Both wizard pages replace the name-only inline edit with a stacked form (name, then type+capacity row, then save/cancel). The venue counter row in the onboarding wizard gains a capacity input in edit mode.

**Tech Stack:** Next.js 14 App Router, React 19, TypeScript, Tailwind CSS

---

### Task 1: Extend `OnboardingBatchInput` and use `venueDoorCapacity`

**Files:**
- Modify: `app/onboarding/setup-actions.ts:87-94` (input type)
- Modify: `app/onboarding/setup-actions.ts:152-165` (venue door insert)

No automated tests for server actions in this codebase — skip test steps, verify manually after Task 3.

**Step 1: Add `venueDoorCapacity` to the input type**

In `app/onboarding/setup-actions.ts`, find the `OnboardingBatchInput` type (around line 87) and add the new optional field:

```ts
export type OnboardingBatchInput = {
    businessName: string;
    timezone: string;
    logoUrl?: string;
    venue: { name: string; city?: string; state?: string; capacity?: number };
    areas: { name: string; capacity?: number; area_type?: string }[];
    venueDoorName?: string;
    venueDoorCapacity?: number;   // ← add this line
};
```

**Step 2: Use it when inserting the venue door**

Find the venue door insert block (around line 152). Change `capacity_max: capacity` to prefer the explicit value:

```ts
        const venueDoorId = crypto.randomUUID();
        const { error: venueDoorError } = await supabaseAdmin
            .from('areas')
            .insert({
                id: venueDoorId,
                venue_id: venueId,
                business_id: business.id,
                name: input.venueDoorName?.trim() || 'Venue Counter',
                capacity_max: input.venueDoorCapacity ?? capacity,   // ← was: capacity
                area_type: 'VENUE_DOOR',
                counting_mode: 'BOTH',
                is_active: true,
            });
```

**Step 3: Commit**

```bash
git add app/onboarding/setup-actions.ts
git commit -m "feat: accept venueDoorCapacity in onboarding batch action"
```

---

### Task 2: Update `app/onboarding/setup/page.tsx`

**Files:**
- Modify: `app/onboarding/setup/page.tsx`

**Step 1: Add new state variables**

After line 65 (`const [editingAreaName, setEditingAreaName] = useState('');`), add:

```ts
    const [editingAreaCapacity, setEditingAreaCapacity] = useState('');
    const [editingAreaType, setEditingAreaType] = useState<AreaType>('MAIN');
```

After line 55 (`const [venueDoorName, setVenueDoorName] = useState('Venue Counter');`), add:

```ts
    const [venueDoorCapacity, setVenueDoorCapacity] = useState('');
    const [editingVenueDoorCapacity, setEditingVenueDoorCapacity] = useState('');
```

**Step 2: Replace `handleSaveAreaName` with `handleSaveArea`**

Find lines 112-116:
```ts
    const handleSaveAreaName = (id: string) => {
        const trimmed = editingAreaName.trim();
        if (trimmed) setCreatedAreas(prev => prev.map(a => a.id === id ? { ...a, name: trimmed } : a));
        setEditingAreaId(null);
    };
```

Replace with:
```ts
    const handleSaveArea = (id: string) => {
        const trimmed = editingAreaName.trim();
        const parsedCap = parseInt(editingAreaCapacity, 10);
        if (trimmed) setCreatedAreas(prev => prev.map(a => a.id === id ? {
            ...a,
            name: trimmed,
            default_capacity: !isNaN(parsedCap) && parsedCap > 0 ? parsedCap : null,
            area_type: editingAreaType,
        } : a));
        setEditingAreaId(null);
    };
```

**Step 3: Update pencil button `onClick` to initialise all three edit fields**

Find (around line 458):
```ts
onClick={() => { setEditingAreaId(a.id); setEditingAreaName(a.name); }}
```

Replace with:
```ts
onClick={() => {
    setEditingAreaId(a.id);
    setEditingAreaName(a.name);
    setEditingAreaCapacity(String(a.default_capacity ?? ''));
    setEditingAreaType((a.area_type as AreaType) || 'MAIN');
}}
```

**Step 4: Replace the area edit-mode JSX (name input only) with stacked form**

Find the edit-mode branch inside the `createdAreas.map` (around lines 479-496). Currently:
```tsx
) : (
    <div className="flex items-center gap-2 w-full">
        <input autoFocus type="text" value={editingAreaName}
            onChange={e => setEditingAreaName(e.target.value)}
            onBlur={() => handleSaveAreaName(a.id)}
            onKeyDown={e => {
                if (e.key === 'Enter') handleSaveAreaName(a.id);
                if (e.key === 'Escape') setEditingAreaId(null);
            }}
            className="flex-1 bg-slate-900 border border-primary/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button type="button" onClick={() => handleSaveAreaName(a.id)}
            className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors">
            <Check className="w-4 h-4" />
        </button>
    </div>
)}
```

Replace with:
```tsx
) : (
    <div className="flex flex-col gap-2 w-full">
        <input
            autoFocus
            type="text"
            value={editingAreaName}
            onChange={e => setEditingAreaName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setEditingAreaId(null); }}
            className="flex-1 bg-slate-900 border border-primary/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex gap-2">
            <select
                value={editingAreaType}
                onChange={e => setEditingAreaType(e.target.value as AreaType)}
                className="flex-1 bg-slate-900 border border-primary/50 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
                <option value="MAIN">Main</option>
                <option value="ENTRY">Entry</option>
                <option value="VIP">VIP</option>
                <option value="PATIO">Patio</option>
                <option value="BAR">Bar</option>
                <option value="EVENT_SPACE">Event Space</option>
                <option value="OTHER">Other</option>
            </select>
            <input
                type="number"
                placeholder="Cap"
                value={editingAreaCapacity}
                onChange={e => setEditingAreaCapacity(e.target.value)}
                className="w-20 bg-slate-900 border border-primary/50 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
        </div>
        <div className="flex gap-2">
            <button type="button" onClick={() => handleSaveArea(a.id)}
                className="flex-1 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-sm font-medium transition-colors flex items-center justify-center gap-1">
                <Check className="w-3.5 h-3.5" /> Save
            </button>
            <button type="button" onClick={() => setEditingAreaId(null)}
                className="flex-1 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-sm font-medium transition-colors flex items-center justify-center gap-1">
                <X className="w-3.5 h-3.5" /> Cancel
            </button>
        </div>
    </div>
)}
```

Note: `X` must be added to the lucide-react import at line 7.

**Step 5: Update non-edit display to show type and capacity**

Find the non-edit branch for normal areas (around line 453):
```tsx
<span className="text-white font-medium">{a.name}</span>
<span className="text-xs text-slate-500 ml-1.5">{(a.area_type || 'main').replace(/_/g, ' ').toLowerCase()}</span>
```

Replace with:
```tsx
<div className="flex items-center gap-2 min-w-0">
    <span className="text-white font-medium">{a.name}</span>
    <span className="text-xs text-slate-500">{(a.area_type || 'main').replace(/_/g, ' ').toLowerCase()}</span>
    {a.default_capacity ? <span className="text-xs text-slate-600">{a.default_capacity} cap</span> : null}
</div>
```

**Step 6: Update venue counter edit UI to include capacity**

Find the venue door edit-mode block (around lines 426-444):
```tsx
) : (
    <div className="flex items-center gap-2 w-full">
        <input
            autoFocus
            type="text"
            value={editingVenueDoorName}
            ...
        />
        <button type="button"
            onClick={() => { if (editingVenueDoorName.trim()) setVenueDoorName(editingVenueDoorName.trim()); setIsEditingVenueDoor(false); }}
            className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors">
            <Check className="w-4 h-4" />
        </button>
    </div>
)}
```

Replace with:
```tsx
) : (
    <div className="flex flex-col gap-2 w-full">
        <input
            autoFocus
            type="text"
            value={editingVenueDoorName}
            onChange={e => setEditingVenueDoorName(e.target.value)}
            onBlur={() => {
                if (editingVenueDoorName.trim()) setVenueDoorName(editingVenueDoorName.trim());
                setIsEditingVenueDoor(false);
            }}
            onKeyDown={e => {
                if (e.key === 'Enter') { if (editingVenueDoorName.trim()) setVenueDoorName(editingVenueDoorName.trim()); setIsEditingVenueDoor(false); }
                if (e.key === 'Escape') setIsEditingVenueDoor(false);
            }}
            className="flex-1 bg-slate-900 border border-primary/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <input
            type="number"
            placeholder="Capacity (optional)"
            value={editingVenueDoorCapacity}
            onChange={e => setEditingVenueDoorCapacity(e.target.value)}
            className="flex-1 bg-slate-900 border border-primary/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex gap-2">
            <button type="button"
                onClick={() => {
                    if (editingVenueDoorName.trim()) setVenueDoorName(editingVenueDoorName.trim());
                    setVenueDoorCapacity(editingVenueDoorCapacity);
                    setIsEditingVenueDoor(false);
                }}
                className="flex-1 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-sm font-medium transition-colors flex items-center justify-center gap-1">
                <Check className="w-3.5 h-3.5" /> Save
            </button>
            <button type="button" onClick={() => setIsEditingVenueDoor(false)}
                className="flex-1 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-sm font-medium transition-colors flex items-center justify-center gap-1">
                <X className="w-3.5 h-3.5" /> Cancel
            </button>
        </div>
    </div>
)}
```

Also update the pencil button onClick to initialise `editingVenueDoorCapacity`:
```tsx
onClick={() => { setIsEditingVenueDoor(true); setEditingVenueDoorName(venueDoorName); setEditingVenueDoorCapacity(venueDoorCapacity); }}
```

And update the non-edit venue door display to show capacity when set:
```tsx
<div className="flex items-center gap-2">
    <span className="text-amber-300 font-medium">{venueDoorName}</span>
    {venueDoorCapacity && <span className="text-xs text-amber-600">{venueDoorCapacity} cap</span>}
    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
        Venue Counter
    </span>
</div>
```

**Step 7: Pass `venueDoorCapacity` to the batch action**

Find the `createBusinessVenueAndAreas` call (around line 184). Add the new field:
```ts
const result = await createBusinessVenueAndAreas({
    businessName,
    timezone,
    logoUrl: logoUrl || undefined,
    venue: { ... },
    venueDoorName,
    venueDoorCapacity: (() => {
        const p = parseInt(venueDoorCapacity, 10);
        return !isNaN(p) && p > 0 ? p : undefined;
    })(),
    areas: createdAreas.map(a => ({ ... })),
});
```

**Step 8: Add `X` to lucide-react import**

Find line 7:
```ts
import { Building2, MapPin, Users, Check, Plus, ArrowRight, ArrowLeft, Mail, Shield, Scan, Ban, Trash2, Pencil } from 'lucide-react';
```

Add `X`:
```ts
import { Building2, MapPin, Users, Check, Plus, ArrowRight, ArrowLeft, Mail, Shield, Scan, Ban, Trash2, Pencil, X } from 'lucide-react';
```

**Step 9: Commit**

```bash
git add app/onboarding/setup/page.tsx
git commit -m "feat: edit capacity + type for areas and capacity for venue counter in onboarding wizard"
```

---

### Task 3: Update `app/(authenticated)/businesses/new/page.tsx`

**Files:**
- Modify: `app/(authenticated)/businesses/new/page.tsx`

**Step 1: Add new edit state variables**

After line 72 (`const [editingAreaName, setEditingAreaName] = useState('');`), add:

```ts
    const [editingAreaCapacity, setEditingAreaCapacity] = useState('');
    const [editingAreaType, setEditingAreaType] = useState<AreaType>('MAIN');
```

**Step 2: Replace `handleSaveAreaName` with `handleSaveArea`**

Find lines 125-129:
```ts
    const handleSaveAreaName = (id: string) => {
        const trimmed = editingAreaName.trim();
        if (trimmed) setCreatedAreas(prev => prev.map(a => a.id === id ? { ...a, name: trimmed } : a));
        setEditingAreaId(null);
    };
```

Replace with:
```ts
    const handleSaveArea = (id: string) => {
        const trimmed = editingAreaName.trim();
        const parsedCap = parseInt(editingAreaCapacity, 10);
        if (trimmed) setCreatedAreas(prev => prev.map(a => a.id === id ? {
            ...a,
            name: trimmed,
            default_capacity: !isNaN(parsedCap) && parsedCap > 0 ? parsedCap : null,
            // keep area_type locked for VENUE_DOOR, otherwise use editingAreaType
            area_type: a.area_type === 'VENUE_DOOR' ? 'VENUE_DOOR' : editingAreaType,
        } : a));
        setEditingAreaId(null);
    };
```

**Step 3: Update pencil button `onClick`**

Find line 418:
```ts
onClick={() => { setEditingAreaId(a.id); setEditingAreaName(a.name); }}
```

Replace with:
```ts
onClick={() => {
    setEditingAreaId(a.id);
    setEditingAreaName(a.name);
    setEditingAreaCapacity(String(a.default_capacity ?? ''));
    setEditingAreaType((a.area_type as AreaType) || 'MAIN');
}}
```

**Step 4: Replace area edit-mode JSX**

Find the edit-mode branch (lines 434-444). Replace with the same stacked form as Task 2 Step 4, but conditionally hide the type select for VENUE_DOOR:

```tsx
) : (
    <div className="flex flex-col gap-2 w-full">
        <input
            autoFocus
            type="text"
            value={editingAreaName}
            onChange={e => setEditingAreaName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setEditingAreaId(null); }}
            className="flex-1 bg-slate-900 border border-primary/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex gap-2">
            {a.area_type !== 'VENUE_DOOR' && (
                <select
                    value={editingAreaType}
                    onChange={e => setEditingAreaType(e.target.value as AreaType)}
                    className="flex-1 bg-slate-900 border border-primary/50 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                    <option value="MAIN">Main</option>
                    <option value="ENTRY">Entry</option>
                    <option value="VIP">VIP</option>
                    <option value="PATIO">Patio</option>
                    <option value="BAR">Bar</option>
                    <option value="EVENT_SPACE">Event Space</option>
                    <option value="OTHER">Other</option>
                </select>
            )}
            <input
                type="number"
                placeholder="Cap"
                value={editingAreaCapacity}
                onChange={e => setEditingAreaCapacity(e.target.value)}
                className="w-20 bg-slate-900 border border-primary/50 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
        </div>
        <div className="flex gap-2">
            <button type="button" onClick={() => handleSaveArea(a.id)}
                className="flex-1 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-sm font-medium transition-colors flex items-center justify-center gap-1">
                <Check className="w-3.5 h-3.5" /> Save
            </button>
            <button type="button" onClick={() => setEditingAreaId(null)}
                className="flex-1 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-sm font-medium transition-colors flex items-center justify-center gap-1">
                <X className="w-3.5 h-3.5" /> Cancel
            </button>
        </div>
    </div>
)}
```

**Step 5: Update non-edit display to show type and capacity**

Find line 415:
```tsx
<span className="text-white font-medium">{a.name}</span>
```

Replace that single span (and surrounding display) with:
```tsx
<div className="flex items-center gap-2 min-w-0">
    <span className="text-white font-medium">{a.name}</span>
    <span className="text-xs text-slate-500">{(a.area_type || 'main').replace(/_/g, ' ').toLowerCase()}</span>
    {a.default_capacity ? <span className="text-xs text-slate-600">{a.default_capacity} cap</span> : null}
</div>
```

**Step 6: Add `X` to lucide-react import**

Find line 7:
```ts
import { Building2, MapPin, Users, Check, Plus, ArrowRight, ArrowLeft, Mail, Shield, Scan, Ban, Trash2, Pencil, X } from 'lucide-react';
```

**Step 7: Commit**

```bash
git add app/(authenticated)/businesses/new/page.tsx
git commit -m "feat: edit capacity + type for areas in new-business wizard"
```

---

## Manual Verification

After all three tasks:

1. Run the dev server: `npm run dev`
2. Navigate to `/businesses/new` → go through to AREAS step → add an area → click pencil → confirm stacked form with name, type, capacity → save → confirm display shows type and capacity.
3. Navigate to `/onboarding/setup` → reach AREAS step → click pencil on the amber venue counter → confirm name + capacity fields → save → confirm capacity shown in display. Click pencil on a normal area → confirm name + type + capacity → save.
4. Complete the full onboarding flow and confirm the venue door and areas are created with the correct `capacity_max` in Supabase (or local adapter state in demo mode).
