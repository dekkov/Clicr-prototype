# Onboarding Clicr Step Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three issues in the onboarding wizard: step 3 → 4 loading flash, immediate DB writes on step 4, and missing delete/rename on clicr rows.

**Architecture:** All changes are isolated to `app/onboarding/setup/page.tsx`. No new files, no server actions, no DB schema changes. State management stays in the same component.

**Tech Stack:** React 19, Next.js 16, TypeScript strict, Lucide React icons, Tailwind CSS 4.

---

### Task 1: Fix Step 3 → 4 Loading Flash

**Files:**
- Modify: `app/onboarding/setup/page.tsx` (function `handleCompleteStep3`, ~lines 111-143)

**Context:**

`handleCompleteStep3` currently calls `setIsLoading(false)` right after the API call returns, before `refreshState()` and `setStep('CLICRS')`. This drops the overlay, leaving step 3 briefly visible before step 4 renders.

**Step 1: Locate `handleCompleteStep3`**

Open `app/onboarding/setup/page.tsx`. Find the function starting around line 111:

```ts
const handleCompleteStep3 = async () => {
    if (createdAreas.length === 0) return;
    setIsLoading(true);
    setError(null);
    const result = await createBusinessVenueAndAreas({ ... });
    setIsLoading(false);          // ← THIS IS THE PROBLEM
    if (!result.success) {
        setError(result.error);
        return;
    }
    ...
    await refreshState();
    setStep('CLICRS');
};
```

**Step 2: Apply the fix**

Move `setIsLoading(false)` to two places:
1. Inside the `if (!result.success)` block (before `return`)
2. After `setStep('CLICRS')` at the end

Replace the function with:

```ts
const handleCompleteStep3 = async () => {
    if (createdAreas.length === 0) return;
    setIsLoading(true);
    setError(null);
    const result = await createBusinessVenueAndAreas({
        businessName,
        timezone,
        logoUrl: logoUrl || undefined,
        venue: {
            name: venueData.name,
            city: venueData.city || undefined,
            state: venueData.state || undefined,
            capacity: !isNaN(parseInt(venueData.capacity, 10)) && parseInt(venueData.capacity, 10) > 0
                ? parseInt(venueData.capacity, 10)
                : undefined,
        },
        areas: createdAreas.map(a => ({
            name: a.name,
            capacity: a.default_capacity ?? undefined,
        })),
    });
    if (!result.success) {
        setIsLoading(false);
        setError(result.error);
        return;
    }
    setNewBusinessId(result.businessId);
    setVenueId(result.venueId);
    setCreatedAreas(prev =>
        prev.map((a, i) => ({ ...a, id: result.areaIds[i], venue_id: result.venueId } as Area))
    );
    await refreshState();
    setStep('CLICRS');
    setIsLoading(false);
};
```

**Step 3: Verify**

Run `npm run build` — no TypeScript errors expected.

Manual test: Go through onboarding to step 3, add an area, click "Next: Clicrs". The spinner should stay visible until step 4 is fully rendered. The old step 3 content must NOT flash before step 4 appears.

---

### Task 2: Defer Clicr DB Writes to "Next" Click

**Files:**
- Modify: `app/onboarding/setup/page.tsx` (functions `handleAddClicr`, `handleApplyTemplate`, and the "Next: Invite Team" button ~line 469)

**Context:**

`handleAddClicr` calls `await addClicr(clicr)` immediately on every "Add" click. `handleApplyTemplate` calls `await addClicr(c)` for each template clicr. These should only write to the DB when the user clicks "Next: Invite Team".

**Step 1: Rewrite `handleAddClicr` to be synchronous (no DB call)**

Find and replace `handleAddClicr`:

```ts
const handleAddClicr = (areaId: string) => {
    const name = clicrInputs[areaId];
    if (!name) return;
    const clicr: Clicr = {
        id: crypto.randomUUID(),
        area_id: areaId,
        name,
        flow_mode: 'BIDIRECTIONAL',
        active: true,
        current_count: 0,
    };
    setCreatedClicrs(prev => [...prev, clicr]);
    setClicrInputs(prev => ({ ...prev, [areaId]: '' }));
};
```

Note: removed `async`, removed `setIsLoading`, removed `await addClicr(clicr)`.

**Step 2: Rewrite `handleApplyTemplate` to be synchronous (no DB calls)**

Find and replace `handleApplyTemplate`:

```ts
const handleApplyTemplate = (template: typeof CLICR_TEMPLATES[0], areaId: string) => {
    const newClicrs: Clicr[] = template.names.map(name => ({
        id: crypto.randomUUID(),
        area_id: areaId,
        name,
        flow_mode: 'BIDIRECTIONAL' as const,
        active: true,
        current_count: 0,
    }));
    setCreatedClicrs(prev => [...prev, ...newClicrs]);
};
```

Note: removed `async`, removed `setIsLoading`, removed the `for` loop with `await addClicr`.

**Step 3: Add `handleCompleteStep4` that flushes all clicrs to DB**

Add this new function after `handleApplyTemplate`:

```ts
const handleCompleteStep4 = async () => {
    setIsLoading(true);
    for (const clicr of createdClicrs) {
        await addClicr(clicr);
    }
    setIsLoading(false);
    setStep('INVITE');
};
```

**Step 4: Wire "Next: Invite Team" button to `handleCompleteStep4`**

Find the button in the CLICRS step JSX (around line 469):

```tsx
<button type="button" onClick={() => setStep('INVITE')} className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all">
    Next: Invite Team
</button>
```

Replace with:

```tsx
<button type="button" onClick={handleCompleteStep4} disabled={isLoading} className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
    {isLoading ? 'Saving...' : 'Next: Invite Team'}
</button>
```

**Step 5: Verify**

Run `npm run build` — no TypeScript errors expected.

Manual test: On step 4, add several clicrs via the input and templates. None should be saved to DB yet (check Supabase dashboard or network tab — no POST requests should fire). Click "Next: Invite Team" — the spinner shows briefly, then step 5 appears. Verify all clicrs exist in DB after.

Also verify: if clicrs list is empty, clicking "Next: Invite Team" still advances (no DB writes needed, `for` loop is a no-op).

---

### Task 3: Add Delete + Inline Rename to Step 4 Clicr Rows

**Files:**
- Modify: `app/onboarding/setup/page.tsx` (imports, state declarations, and CLICRS step JSX)

**Context:**

Currently each clicr row renders as `● Name` with no controls. Need to add:
- **Delete**: trash icon, removes from `createdClicrs` state
- **Rename**: pencil icon → swaps name text for an input; Enter or ✓ button saves; Escape or ✗ cancels

**Step 1: Update imports**

Find the lucide-react import line:

```ts
import { Building2, MapPin, Users, Check, Plus, ArrowRight, ArrowLeft, Mail, Shield, Scan, Ban, LayoutGrid, Trash2 } from 'lucide-react';
```

Add `Pencil` and `X` to the import:

```ts
import { Building2, MapPin, Users, Check, Plus, ArrowRight, ArrowLeft, Mail, Shield, Scan, Ban, LayoutGrid, Trash2, Pencil, X } from 'lucide-react';
```

**Step 2: Add editing state**

After the existing `// Clicrs step state` block (around line 58-60), add two new state variables:

```ts
const [editingClicrId, setEditingClicrId] = useState<string | null>(null);
const [editingClicrName, setEditingClicrName] = useState('');
```

**Step 3: Add delete + rename helper functions**

Add three helper functions after `handleApplyTemplate` and before `handleCompleteStep4`:

```ts
const startEditClicr = (clicr: Clicr) => {
    setEditingClicrId(clicr.id);
    setEditingClicrName(clicr.name);
};

const saveEditClicr = () => {
    if (!editingClicrId || !editingClicrName.trim()) return;
    setCreatedClicrs(prev =>
        prev.map(c => c.id === editingClicrId ? { ...c, name: editingClicrName.trim() } : c)
    );
    setEditingClicrId(null);
    setEditingClicrName('');
};

const deleteClicr = (clicrId: string) => {
    setCreatedClicrs(prev => prev.filter(c => c.id !== clicrId));
};
```

**Step 4: Replace clicr row JSX**

Find the existing clicr row in the CLICRS step JSX (around line 446-450):

```tsx
{areaClicrs.map(c => (
    <div key={c.id} className="flex items-center gap-2 mb-2 text-sm text-slate-300">
        <div className="w-2 h-2 rounded-full bg-emerald-500" /> {c.name}
    </div>
))}
```

Replace with:

```tsx
{areaClicrs.map(c => (
    <div key={c.id} className="flex items-center gap-2 mb-2 text-sm">
        {editingClicrId === c.id ? (
            <>
                <input
                    autoFocus
                    value={editingClicrName}
                    onChange={e => setEditingClicrName(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') saveEditClicr();
                        if (e.key === 'Escape') setEditingClicrId(null);
                    }}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                />
                <button
                    type="button"
                    onClick={saveEditClicr}
                    disabled={!editingClicrName.trim()}
                    className="p-1 rounded text-emerald-400 hover:text-emerald-300 disabled:opacity-40"
                    title="Save"
                >
                    <Check className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    onClick={() => setEditingClicrId(null)}
                    className="p-1 rounded text-slate-400 hover:text-slate-300"
                    title="Cancel"
                >
                    <X className="w-4 h-4" />
                </button>
            </>
        ) : (
            <>
                <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="flex-1 text-slate-300">{c.name}</span>
                <button
                    type="button"
                    onClick={() => startEditClicr(c)}
                    className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
                    title="Rename"
                >
                    <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => deleteClicr(c.id)}
                    className="p-1 rounded text-slate-500 hover:text-red-400 transition-colors"
                    title="Delete"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </>
        )}
    </div>
))}
```

**Step 5: Verify**

Run `npm run build` — no TypeScript errors expected.

Manual test:
- Add a clicr → row shows name with pencil + trash icons
- Click pencil → name becomes editable input, autofocused
- Type new name, press Enter → name updates, input disappears
- Click pencil again → edit mode; press Escape → reverts to display mode
- Click pencil → type new name, click ✓ → saves
- Click trash → row disappears from list
- Apply a template → multiple rows appear, each with pencil + trash
- Delete all rows → Next button still works (no clicrs to save, advances fine)
