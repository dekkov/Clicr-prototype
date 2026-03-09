# Areas UX Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix area_type grouping bug, add a configure/delete modal for areas, and improve the onboarding areas step with a Venue Counter preview and type selector.

**Architecture:** Four tasks, all in existing files. The grouping bug is a one-line fix in the sync API. Configure/delete replaces the clock icon with a gear opening a unified modal. Onboarding gets a locked Venue Counter row + per-area type selector. No new routes or components.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, Supabase

---

## Task 1: Fix area_type hardcoded in sync route

**Files:**
- Modify: `app/api/sync/route.ts`

### Step 1: Fix the area mapping in the GET handler

Find this block (around line 41–56):

```ts
if (sbAreas) {
    data.areas = sbAreas.map((a: any) => ({
        id: a.id,
        venue_id: a.venue_id,
        business_id: a.business_id,
        name: a.name,
        default_capacity: a.capacity_max,
        parent_area_id: a.parent_area_id,
        current_occupancy: a.current_occupancy ?? 0,
        last_reset_at: a.last_reset_at || undefined,
        area_type: 'MAIN',
        counting_mode: 'MANUAL',
        is_active: true,
        created_at: a.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
    }));
}
```

Replace with:

```ts
if (sbAreas) {
    data.areas = sbAreas.map((a: any) => ({
        id: a.id,
        venue_id: a.venue_id,
        business_id: a.business_id,
        name: a.name,
        default_capacity: a.capacity_max,
        parent_area_id: a.parent_area_id,
        current_occupancy: a.current_occupancy ?? 0,
        last_reset_at: a.last_reset_at || undefined,
        area_type: a.area_type || 'MAIN',
        counting_mode: a.counting_mode || 'MANUAL',
        is_active: a.is_active ?? true,
        shift_mode: a.shift_mode || 'MANUAL',
        auto_reset_time: a.auto_reset_time || undefined,
        auto_reset_timezone: a.auto_reset_timezone || undefined,
        created_at: a.created_at || new Date().toISOString(),
        updated_at: a.updated_at || new Date().toISOString()
    }));
}
```

### Step 2: Fix the UPDATE_AREA handler to persist area_type, counting_mode, and shift fields

Find around line 555–561:

```ts
case 'UPDATE_AREA': {
    const areaPayload = payload as Area;
    await supabaseAdmin.from('areas').update({
        name: areaPayload.name,
        capacity_max: areaPayload.default_capacity ?? areaPayload.capacity_max,
    }).eq('id', areaPayload.id);
    break;
}
```

Replace with:

```ts
case 'UPDATE_AREA': {
    const areaPayload = payload as Area;
    await supabaseAdmin.from('areas').update({
        name: areaPayload.name,
        capacity_max: areaPayload.default_capacity ?? areaPayload.capacity_max,
        area_type: areaPayload.area_type,
        counting_mode: areaPayload.counting_mode,
        shift_mode: areaPayload.shift_mode ?? 'MANUAL',
        auto_reset_time: areaPayload.auto_reset_time ?? null,
        auto_reset_timezone: areaPayload.auto_reset_timezone ?? null,
    }).eq('id', areaPayload.id);
    break;
}
```

### Step 3: Add DELETE_AREA handler

After the ADD_AREA case (around line 580), add:

```ts
case 'DELETE_AREA': {
    const { id } = payload as { id: string };
    await supabaseAdmin.from('areas').delete().eq('id', id);
    break;
}
```

### Step 4: Verify TypeScript

```bash
cd /home/king/clicr-v4/.claude/worktrees/venue-door-counter && npx tsc --noEmit 2>&1 | grep "sync/route"
```

Expected: no new errors.

### Step 5: Commit

```bash
git add app/api/sync/route.ts
git commit -m "fix(sync): read area_type/counting_mode from DB, fix UPDATE_AREA, add DELETE_AREA"
```

---

## Task 2: Add deleteArea to store

**Files:**
- Modify: `lib/store.tsx`

### Step 1: Add deleteArea to the AppContextType interface

Find (around line 65):
```ts
updateArea: (area: Area) => Promise<boolean>;
```

Add below it:
```ts
deleteArea: (areaId: string) => Promise<void>;
```

### Step 2: Add deleteArea implementation in the provider

Find the `updateArea` function in the provider body. After its closing `};`, add:

```ts
const deleteArea = async (areaId: string) => {
    setState(prev => ({ ...prev, areas: prev.areas.filter(a => a.id !== areaId) }));
    try {
        await authFetch({ action: 'DELETE_AREA', payload: { id: areaId } });
    } catch (error) { console.error("Failed to delete area", error); }
};
```

### Step 3: Expose deleteArea in the context value

Find the `<AppContext.Provider value={{...}}>` return and add `deleteArea` to the value object alongside `addArea` and `updateArea`.

### Step 4: Verify TypeScript

```bash
cd /home/king/clicr-v4/.claude/worktrees/venue-door-counter && npx tsc --noEmit 2>&1 | grep "store.tsx"
```

Expected: no errors.

### Step 5: Commit

```bash
git add lib/store.tsx
git commit -m "feat(store): add deleteArea action"
```

---

## Task 3: Replace clock icon with unified Configure modal on area cards

**Files:**
- Modify: `app/(authenticated)/areas/page.tsx`

### Step 1: Update imports

Ensure `Settings2` is imported from lucide-react (it may already be there from ClicrPanel). Add it if not present. Remove `Clock` from the import only if it's no longer used elsewhere in the file (search the file for other Clock usages first).

Add `hasMinRole` to the permissions import:
```ts
import { canEditVenuesAndAreas, canStartShift, canAddClicr, hasMinRole } from '@/lib/permissions';
```

### Step 2: Update store destructure — add deleteArea

```ts
const { areas, clicrs, venues, areaTraffic, activeBusiness, addArea, addClicr, resetCounts, startShift, endShift, updateArea, deleteArea, isLoading, currentUser, activeShiftId, activeShiftAreaId } = useApp();
```

Add the delete permission:
```ts
const canDelete = hasMinRole(userRole, 'ADMIN');
```

### Step 3: Replace old shift modal state with configure modal state

Remove these state declarations:
```ts
const [editShiftAreaId, setEditShiftAreaId] = useState<string | null>(null);
const [editShiftMode, setEditShiftMode] = useState<ShiftMode>('MANUAL');
const [editAutoTime, setEditAutoTime] = useState('09:00');
const [editAutoTz, setEditAutoTz] = useState(...);
```

Add in their place:
```ts
const [configAreaId, setConfigAreaId] = useState<string | null>(null);
const [configName, setConfigName] = useState('');
const [configCapacity, setConfigCapacity] = useState(0);
const [configAreaType, setConfigAreaType] = useState<AreaType>('MAIN');
const [configCountingMode, setConfigCountingMode] = useState<CountingMode>('BOTH');
const [configShiftMode, setConfigShiftMode] = useState<ShiftMode>('MANUAL');
const [configAutoTime, setConfigAutoTime] = useState('09:00');
const [configAutoTz, setConfigAutoTz] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
});
const [isSavingConfig, setIsSavingConfig] = useState(false);
const [isDeletingArea, setIsDeletingArea] = useState(false);
```

### Step 4: Replace openShiftConfig and handleSaveShiftConfig with new handlers

Remove `openShiftConfig` and `handleSaveShiftConfig`. Add:

```ts
const openConfigModal = (area: Area) => {
    setConfigAreaId(area.id);
    setConfigName(area.name);
    setConfigCapacity(area.default_capacity ?? (area as any).capacity_limit ?? 0);
    setConfigAreaType(area.area_type);
    setConfigCountingMode(area.counting_mode);
    setConfigShiftMode(area.shift_mode ?? 'MANUAL');
    setConfigAutoTime(area.auto_reset_time ?? '09:00');
    setConfigAutoTz(area.auto_reset_timezone ?? ((() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } })()));
};

const handleSaveConfig = async () => {
    if (!configAreaId) return;
    const area = areas.find(a => a.id === configAreaId);
    if (!area) return;
    setIsSavingConfig(true);
    await updateArea({
        ...area,
        name: configName.trim() || area.name,
        default_capacity: configCapacity,
        capacity_max: configCapacity,
        area_type: configAreaType,
        counting_mode: configCountingMode,
        shift_mode: configShiftMode,
        auto_reset_time: configShiftMode === 'AUTO' ? configAutoTime : undefined,
        auto_reset_timezone: configShiftMode === 'AUTO' ? configAutoTz : undefined,
    });
    setIsSavingConfig(false);
    setConfigAreaId(null);
};

const handleDeleteArea = async () => {
    if (!configAreaId) return;
    setIsDeletingArea(true);
    await deleteArea(configAreaId);
    setIsDeletingArea(false);
    setConfigAreaId(null);
};
```

### Step 5: Replace clock button in the area card

Find:
```tsx
{canEdit && (
    <button
        onClick={() => openShiftConfig(area)}
        className="text-gray-500 hover:text-gray-300 transition-colors p-1"
        title="Configure shift mode"
    >
        <Clock className="w-3.5 h-3.5" />
    </button>
)}
```

Replace with (use Settings2 icon):
```tsx
{canEdit && (
    <button
        onClick={() => openConfigModal(area)}
        className="text-gray-500 hover:text-gray-300 transition-colors p-1"
        title="Configure area"
    >
        <Settings2 className="w-3.5 h-3.5" />
    </button>
)}
```

### Step 6: Replace the old Edit Shift Config Modal with the unified Configure Modal

Find the entire `{/* Edit Shift Config Modal */}` AnimatePresence block and replace it with:

```tsx
{/* Configure Area Modal */}
<AnimatePresence>
    {configAreaId && (() => {
        const configArea = areas.find(a => a.id === configAreaId);
        const isVenueDoor = configArea?.area_type === 'VENUE_DOOR';
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                onClick={() => setConfigAreaId(null)}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-xl"
                    onClick={e => e.stopPropagation()}
                >
                    <h2 className="text-xl font-bold mb-1">Configure Area</h2>
                    <p className="text-sm text-gray-400 mb-4">{configArea?.name}</p>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-400">Name</label>
                            <input
                                type="text"
                                value={configName}
                                onChange={e => setConfigName(e.target.value)}
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-400">Capacity</label>
                            <input
                                type="number"
                                value={configCapacity || ''}
                                onChange={e => setConfigCapacity(parseInt(e.target.value) || 0)}
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                placeholder="0 for unlimited"
                            />
                        </div>
                        {!isVenueDoor && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-400">Type</label>
                                <select
                                    value={configAreaType}
                                    onChange={e => setConfigAreaType(e.target.value as AreaType)}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                >
                                    <option value="MAIN">Main Floor</option>
                                    <option value="ENTRY">Entry</option>
                                    <option value="VIP">VIP</option>
                                    <option value="PATIO">Patio</option>
                                    <option value="BAR">Bar</option>
                                    <option value="EVENT_SPACE">Event Space</option>
                                    <option value="OTHER">Other</option>
                                </select>
                            </div>
                        )}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-400">Counting Mode</label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['MANUAL', 'AUTO_FROM_SCANS', 'BOTH'] as CountingMode[]).map(mode => (
                                    <button key={mode} type="button"
                                        onClick={() => setConfigCountingMode(mode)}
                                        className={cn(
                                            "px-2 py-2 rounded-lg text-xs font-medium border transition-colors",
                                            configCountingMode === mode
                                                ? "bg-purple-900/30 text-purple-400 border-purple-500/50"
                                                : "bg-gray-950 border-gray-800 text-gray-400 hover:bg-gray-900"
                                        )}
                                    >{mode.replace(/_/g, ' ')}</button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-400">Shift Mode</label>
                            <div className="grid grid-cols-2 gap-2">
                                {(['MANUAL', 'AUTO'] as ShiftMode[]).map(mode => (
                                    <button key={mode} type="button"
                                        onClick={() => setConfigShiftMode(mode)}
                                        className={cn(
                                            "px-3 py-2 rounded-lg text-xs font-medium border transition-colors",
                                            configShiftMode === mode
                                                ? "bg-purple-900/30 text-purple-400 border-purple-500/50"
                                                : "bg-gray-950 border-gray-800 text-gray-400 hover:bg-gray-900"
                                        )}
                                    >{mode === 'MANUAL' ? 'Manual Start' : 'Auto (Scheduled)'}</button>
                                ))}
                            </div>
                            {configShiftMode === 'AUTO' && (
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Time</label>
                                        <input type="time" value={configAutoTime}
                                            onChange={e => setConfigAutoTime(e.target.value)}
                                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Timezone</label>
                                        <select value={configAutoTz}
                                            onChange={e => setConfigAutoTz(e.target.value)}
                                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none">
                                            {TIMEZONES.map(tz => (
                                                <option key={tz.value} value={tz.value}>{tz.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-800">
                            {canDelete && !isVenueDoor ? (
                                <button type="button" onClick={handleDeleteArea} disabled={isDeletingArea}
                                    className="px-4 py-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 text-sm font-medium transition-colors disabled:opacity-50">
                                    {isDeletingArea ? 'Deleting...' : 'Delete Area'}
                                </button>
                            ) : <span />}
                            <div className="flex gap-3">
                                <button type="button" onClick={() => setConfigAreaId(null)}
                                    className="px-4 py-2 text-gray-400 hover:text-white transition-colors">
                                    Cancel
                                </button>
                                <button type="button" onClick={handleSaveConfig} disabled={isSavingConfig}
                                    className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-bold shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center gap-2">
                                    {isSavingConfig && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                    {isSavingConfig ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        );
    })()}
</AnimatePresence>
```

### Step 7: Verify TypeScript

```bash
cd /home/king/clicr-v4/.claude/worktrees/venue-door-counter && npx tsc --noEmit 2>&1 | grep "areas/page"
```

Expected: only the pre-existing activeBusiness null error.

### Step 8: Commit

```bash
git add "app/(authenticated)/areas/page.tsx"
git commit -m "feat(areas): unified configure modal with name/capacity/type/shift/delete"
```

---

## Task 4: Onboarding — Venue Counter row + area type selector

**Files:**
- Modify: `app/onboarding/setup/page.tsx`
- Modify: `app/onboarding/setup-actions.ts`

### Step 1: Update OnboardingBatchInput in setup-actions.ts

Find:
```ts
areas: { name: string; capacity?: number }[];
```

Replace with:
```ts
areas: { name: string; capacity?: number; area_type?: string }[];
venueDoorName?: string;
```

### Step 2: Use venueDoorName and area_type in createBusinessVenueAndAreas

Find the VENUE_DOOR auto-insert:
```ts
name: 'Venue Counter',
```
Replace with:
```ts
name: input.venueDoorName?.trim() || 'Venue Counter',
```

Find the user areas loop insert:
```ts
area_type: 'MAIN',
```
Replace with:
```ts
area_type: a.area_type || 'MAIN',
```

### Step 3: Update areaInput state in setup/page.tsx

Find:
```ts
const [areaInput, setAreaInput] = useState({ name: '', capacity: '100' });
```

Replace with:
```ts
const [areaInput, setAreaInput] = useState({ name: '', capacity: '100', area_type: 'MAIN' });
const [venueDoorName, setVenueDoorName] = useState('Venue Counter');
const [isEditingVenueDoor, setIsEditingVenueDoor] = useState(false);
const [editingVenueDoorName, setEditingVenueDoorName] = useState('');
```

Also add `AreaType` to the import:
```ts
import { Area, AreaType, Clicr, Venue } from '@/lib/types';
```

### Step 4: Use area_type in handleAddArea and reset

In `handleAddArea`, find:
```ts
area_type: 'MAIN',
```
Replace with:
```ts
area_type: areaInput.area_type as AreaType,
```

Find the reset after adding:
```ts
setAreaInput({ name: '', capacity: '100' });
```
Replace with:
```ts
setAreaInput({ name: '', capacity: '100', area_type: 'MAIN' });
```

### Step 5: Pass venueDoorName and area_type when calling createBusinessVenueAndAreas

Find where the function is called and update the `areas` mapping and add `venueDoorName`:

```ts
await createBusinessVenueAndAreas({
    // ... all existing fields ...
    venueDoorName,
    areas: createdAreas.map(a => ({
        name: a.name,
        capacity: a.default_capacity ?? undefined,
        area_type: a.area_type,
    })),
});
```

### Step 6: Add the locked Venue Counter row to the AREAS step UI

In the AREAS step, immediately after the `{error && ...}` line and BEFORE the `{createdAreas.length > 0 && ...}` block, add:

```tsx
{/* Venue Counter — auto-created, name-only editable */}
<div className="flex items-center justify-between bg-amber-500/5 border border-amber-500/20 px-4 py-3 rounded-lg">
    {!isEditingVenueDoor ? (
        <>
            <div className="flex items-center gap-2">
                <span className="text-amber-300 font-medium">{venueDoorName}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                    Venue Counter
                </span>
            </div>
            <button
                type="button"
                onClick={() => { setIsEditingVenueDoor(true); setEditingVenueDoorName(venueDoorName); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                title="Rename"
            >
                <Pencil className="w-3.5 h-3.5" />
            </button>
        </>
    ) : (
        <div className="flex items-center gap-2 w-full">
            <input
                autoFocus
                type="text"
                value={editingVenueDoorName}
                onChange={e => setEditingVenueDoorName(e.target.value)}
                onBlur={() => { if (editingVenueDoorName.trim()) setVenueDoorName(editingVenueDoorName.trim()); setIsEditingVenueDoor(false); }}
                onKeyDown={e => {
                    if (e.key === 'Enter') { if (editingVenueDoorName.trim()) setVenueDoorName(editingVenueDoorName.trim()); setIsEditingVenueDoor(false); }
                    if (e.key === 'Escape') setIsEditingVenueDoor(false);
                }}
                className="flex-1 bg-slate-900 border border-primary/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button type="button"
                onClick={() => { if (editingVenueDoorName.trim()) setVenueDoorName(editingVenueDoorName.trim()); setIsEditingVenueDoor(false); }}
                className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                <Check className="w-4 h-4" />
            </button>
        </div>
    )}
</div>
```

### Step 7: Add type selector to the area add row

Find the area add row and add a `<select>` between the name input and the capacity input:

```tsx
<div className="flex gap-2">
    <input type="text" placeholder="Area name (e.g. Main Floor)" value={areaInput.name}
        onChange={e => setAreaInput(p => ({ ...p, name: e.target.value }))}
        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none text-sm" />
    <select
        value={areaInput.area_type}
        onChange={e => setAreaInput(p => ({ ...p, area_type: e.target.value }))}
        className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none text-sm"
    >
        <option value="MAIN">Main Floor</option>
        <option value="ENTRY">Entry</option>
        <option value="VIP">VIP</option>
        <option value="PATIO">Patio</option>
        <option value="BAR">Bar</option>
        <option value="EVENT_SPACE">Event Space</option>
        <option value="OTHER">Other</option>
    </select>
    <input type="number" value={areaInput.capacity} onChange={e => setAreaInput(p => ({ ...p, capacity: e.target.value }))}
        className="w-24 bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none text-sm" />
    <button onClick={handleAddArea} disabled={!areaInput.name}
        className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-1">
        <Plus className="w-4 h-4" />
    </button>
</div>
```

### Step 8: Show area type in the created areas list

In the existing area list rows (`createdAreas.map(a => ...)`), add the type as a small label next to the name in the non-edit state:

```tsx
<span className="text-white font-medium">{a.name}</span>
<span className="text-xs text-slate-500 ml-1.5">{AREA_TYPE_LABELS[a.area_type] ?? a.area_type}</span>
```

`AREA_TYPE_LABELS` is defined at module scope in `areas/page.tsx` — import it here or duplicate the minimal subset needed. Since these are separate files, define a small inline lookup or just use the raw value: `a.area_type.replace(/_/g, ' ').toLowerCase()`.

Use:
```tsx
<span className="text-xs text-slate-500 ml-1.5">{a.area_type.replace(/_/g, ' ').toLowerCase()}</span>
```

### Step 9: Allow Next step even with 0 manually added areas

Change the Next button from `disabled={createdAreas.length === 0}` to always enabled (Venue Counter is auto-created server-side):

```tsx
<button type="button" onClick={handleCompleteStep3}
    className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all">
    Next: Clicrs
</button>
```

### Step 10: Verify TypeScript

```bash
cd /home/king/clicr-v4/.claude/worktrees/venue-door-counter && npx tsc --noEmit 2>&1 | grep -E "onboarding|setup-actions"
```

Expected: no new errors.

### Step 11: Commit

```bash
git add app/onboarding/setup/page.tsx app/onboarding/setup-actions.ts
git commit -m "feat(onboarding): Venue Counter protected row, area type selector, pass to DB"
```

---

## Final Verification

1. Add area with type "VIP" → shows under "VIP" group not "Main Floor"
2. Reload → still in "VIP" group (DB value is read correctly)
3. Gear icon on area card opens configure modal with all fields pre-filled
4. Save after editing name/capacity/type → card updates
5. Owner/admin: Delete button visible for non-VENUE_DOOR areas; hard delete removes it
6. Venue Counter: configure modal has no Type selector, no Delete button
7. Onboarding areas step: amber "Venue Counter" row shown at top, pencil to rename, no trash
8. Onboarding: add area "Bar Area" with type "Bar" → row shows "bar" label
9. Onboarding: Next button enabled even with 0 manually added areas
10. `npx tsc --noEmit` shows no new errors
