# Venue Counter Clicr, Flow Mode, Cascading Forms & 403 Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the VENUE_DOOR area system with a direct venue counter clicr, add flow_mode selection to clicr creation, fix the 403 tap error, batch-create in /venues/new, and add clicr creation from the /clicr page.

**Architecture:** Each venue gets a dedicated `is_venue_counter` clicr that updates `venues.current_occupancy` directly (no hidden area). All VENUE_DOOR area logic is removed. Clicr creation gains a flow_mode selector. The /venues/new page is refactored to batch-create on finish. The /clicr page gets an "Add Clicr" modal.

**Tech Stack:** Next.js App Router, React 19, TypeScript 5, Supabase (PostgreSQL + RLS), Tailwind CSS 4

---

### Task 1: Migration — Schema Changes + RPC Fix

**Files:**
- Create: `migrations/016_venue_counter_clicr.sql`

**Step 1: Create the migration file**

```sql
-- ============================================================================
-- Migration: 016_venue_counter_clicr.sql
-- Description: Add venue counter clicr support, remove VENUE_DOOR area type,
--              fix 403 RPC error.
-- ============================================================================

-- 1. Add current_occupancy to venues
ALTER TABLE venues
    ADD COLUMN IF NOT EXISTS current_occupancy INTEGER NOT NULL DEFAULT 0;

-- 2. Add is_venue_counter flag to devices
ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS is_venue_counter BOOLEAN NOT NULL DEFAULT false;

-- 3. Make occupancy_events.area_id nullable (venue counter events have no area)
ALTER TABLE occupancy_events
    ALTER COLUMN area_id DROP NOT NULL;

-- 4. Remove VENUE_DOOR from area_type CHECK constraint
ALTER TABLE areas
    DROP CONSTRAINT IF EXISTS areas_area_type_check;
ALTER TABLE areas
    ADD CONSTRAINT areas_area_type_check
    CHECK (area_type IN ('ENTRY', 'MAIN', 'PATIO', 'VIP', 'BAR', 'EVENT_SPACE', 'OTHER'));

-- 5. Clean up existing VENUE_DOOR areas (and their events)
DELETE FROM occupancy_events WHERE area_id IN (
    SELECT id FROM areas WHERE area_type = 'VENUE_DOOR'
);
DELETE FROM areas WHERE area_type = 'VENUE_DOOR';

-- 6. Recreate apply_occupancy_delta to support venue-level taps and fix RLS bypass
CREATE OR REPLACE FUNCTION apply_occupancy_delta(
    p_area_id         UUID DEFAULT NULL,
    p_venue_id        UUID DEFAULT NULL,
    p_delta           INTEGER DEFAULT 1,
    p_source          TEXT DEFAULT 'manual',
    p_device_id       UUID DEFAULT NULL,
    p_gender          TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE(new_occupancy INTEGER, event_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_occ      INTEGER;
    v_event_id     UUID;
    v_flow_type    TEXT;
    v_business_id  UUID;
    v_venue_id     UUID;
BEGIN
    v_flow_type := CASE WHEN p_delta > 0 THEN 'IN' ELSE 'OUT' END;

    -- Idempotency check
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM occupancy_events
            WHERE idempotency_key = p_idempotency_key
        ) THEN
            IF p_area_id IS NOT NULL THEN
                SELECT a.current_occupancy, oe.id
                INTO v_new_occ, v_event_id
                FROM areas a
                JOIN occupancy_events oe ON oe.idempotency_key = p_idempotency_key
                WHERE a.id = p_area_id;
            ELSE
                SELECT v.current_occupancy, oe.id
                INTO v_new_occ, v_event_id
                FROM venues v
                JOIN occupancy_events oe ON oe.idempotency_key = p_idempotency_key
                WHERE v.id = p_venue_id;
            END IF;
            RETURN QUERY SELECT v_new_occ, v_event_id;
            RETURN;
        END IF;
    END IF;

    IF p_area_id IS NOT NULL THEN
        -- AREA-LEVEL tap (existing behavior)
        SELECT current_occupancy + p_delta, business_id, venue_id
        INTO v_new_occ, v_business_id, v_venue_id
        FROM areas
        WHERE id = p_area_id
        FOR UPDATE;

        v_new_occ := GREATEST(v_new_occ, 0);

        UPDATE areas
        SET current_occupancy = v_new_occ, updated_at = now()
        WHERE id = p_area_id;
    ELSIF p_venue_id IS NOT NULL THEN
        -- VENUE-LEVEL tap (new: venue counter clicr)
        SELECT current_occupancy + p_delta, business_id
        INTO v_new_occ, v_business_id
        FROM venues
        WHERE id = p_venue_id
        FOR UPDATE;

        v_venue_id := p_venue_id;
        v_new_occ := GREATEST(v_new_occ, 0);

        UPDATE venues
        SET current_occupancy = v_new_occ, updated_at = now()
        WHERE id = p_venue_id;
    ELSE
        RAISE EXCEPTION 'Either p_area_id or p_venue_id must be provided';
    END IF;

    -- Insert the immutable event log entry (area_id nullable for venue taps)
    INSERT INTO occupancy_events (
        business_id, venue_id, area_id, device_id,
        user_id, delta, flow_type, event_type, source,
        gender, idempotency_key
    )
    VALUES (
        v_business_id, v_venue_id, p_area_id, p_device_id,
        auth.uid(), p_delta, v_flow_type,
        CASE WHEN p_source = 'auto_scan' THEN 'AUTO_SCAN' ELSE 'TAP' END,
        p_source, p_gender, p_idempotency_key
    )
    RETURNING id INTO v_event_id;

    RETURN QUERY SELECT v_new_occ, v_event_id;
END;
$$;

-- 7. Update reset_counts to also reset venue occupancy
CREATE OR REPLACE FUNCTION reset_counts(
    p_scope       TEXT,
    p_business_id UUID,
    p_venue_id    UUID DEFAULT NULL,
    p_area_id     UUID DEFAULT NULL,
    p_reason      TEXT DEFAULT NULL
)
RETURNS TABLE(areas_reset INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reset_ts   TIMESTAMPTZ := now();
    v_count      INTEGER := 0;
BEGIN
    IF p_scope = 'AREA' AND p_area_id IS NOT NULL THEN
        UPDATE areas
        SET current_occupancy = 0, last_reset_at = v_reset_ts, updated_at = v_reset_ts
        WHERE business_id = p_business_id AND id = p_area_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    ELSIF p_scope = 'VENUE' AND p_venue_id IS NOT NULL THEN
        UPDATE areas
        SET current_occupancy = 0, last_reset_at = v_reset_ts, updated_at = v_reset_ts
        WHERE business_id = p_business_id AND venue_id = p_venue_id;

        UPDATE venues
        SET current_occupancy = 0, last_reset_at = v_reset_ts
        WHERE id = p_venue_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    ELSE
        UPDATE areas
        SET current_occupancy = 0, last_reset_at = v_reset_ts, updated_at = v_reset_ts
        WHERE business_id = p_business_id;

        UPDATE venues
        SET current_occupancy = 0, last_reset_at = v_reset_ts
        WHERE business_id = p_business_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
    END IF;

    INSERT INTO audit_logs (business_id, action, performed_by_user_id, target_type, target_id, details_json)
    VALUES (
        p_business_id,
        'RESET_COUNTS',
        auth.uid(),
        p_scope,
        COALESCE(p_area_id, p_venue_id, p_business_id),
        jsonb_build_object('scope', p_scope, 'reason', p_reason, 'areas_reset', v_count)
    );

    RETURN QUERY SELECT v_count, v_reset_ts;
END;
$$;
```

**Step 2: Commit**

```bash
git add migrations/016_venue_counter_clicr.sql
git commit -m "feat: migration 016 — venue counter clicr schema + RPC fix"
```

---

### Task 2: Update TypeScript Types

**Files:**
- Modify: `lib/types.ts:92` (AreaType)
- Modify: `lib/types.ts:131-149` (Clicr type)

**Step 1: Remove VENUE_DOOR from AreaType**

Find line 92:
```typescript
export type AreaType = 'ENTRY' | 'MAIN' | 'PATIO' | 'VIP' | 'BAR' | 'EVENT_SPACE' | 'OTHER' | 'VENUE_DOOR';
```
Replace with:
```typescript
export type AreaType = 'ENTRY' | 'MAIN' | 'PATIO' | 'VIP' | 'BAR' | 'EVENT_SPACE' | 'OTHER';
```

**Step 2: Update Clicr type**

Find lines 131-149:
```typescript
export type Clicr = {
    id: string;
    area_id: string;
    name: string;
    flow_mode: FlowMode;
    current_count: number;
    active: boolean;
    button_config?: { ... };
    command?: string;
    direction_mode?: 'in_only' | 'out_only' | 'bidirectional';
    scan_enabled?: boolean;
};
```

Replace with:
```typescript
export type Clicr = {
    id: string;
    area_id: string | null;
    venue_id?: string;
    is_venue_counter?: boolean;
    name: string;
    flow_mode: FlowMode;
    current_count: number;
    active: boolean;
    button_config?: {
        auto_reset?: {
            enabled: boolean;
            time: string;
            timezone: string;
        };
        tap_token?: string;
    };
    command?: string;
    direction_mode?: 'in_only' | 'out_only' | 'bidirectional';
    scan_enabled?: boolean;
};
```

**Step 3: Fix all TypeScript errors from nullable area_id**

Search the codebase for `c.area_id` and `clicr.area_id` usages. Any grouping/filtering logic like `clicrs.filter(c => c.area_id === area.id)` will still work — null area_id clicrs simply won't match any area. Venue counter clicrs need separate handling (see Tasks 5, 9).

**Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat: update types — remove VENUE_DOOR, add venue counter fields to Clicr"
```

---

### Task 3: Update Store — addVenue Auto-Creates Venue Counter Clicr

**Files:**
- Modify: `lib/store.tsx:661-680` (addVenue)

**Step 1: Replace VENUE_DOOR area creation with venue counter clicr creation**

Find the `addVenue` function (around line 661). Replace it:

```typescript
    const addVenue = async (venue: Venue) => {
        setState(prev => ({ ...prev, venues: [...prev.venues, venue] }));
        try {
            await authFetch({ action: 'ADD_VENUE', payload: venue });
            // Auto-create the venue's dedicated counter clicr
            const venueCounterClicr: Clicr = {
                id: crypto.randomUUID(),
                area_id: null,
                venue_id: venue.id,
                is_venue_counter: true,
                name: 'Venue Counter',
                flow_mode: 'BIDIRECTIONAL',
                active: true,
                current_count: 0,
            };
            setState(prev => ({ ...prev, clicrs: [...prev.clicrs, venueCounterClicr] }));
            await authFetch({ action: 'ADD_CLICR', payload: venueCounterClicr });
        } catch (error) { console.error("Failed to add venue", error); }
    };
```

**Step 2: Commit**

```bash
git add lib/store.tsx
git commit -m "feat: addVenue auto-creates venue counter clicr instead of VENUE_DOOR area"
```

---

### Task 4: Update Setup Actions — Remove VENUE_DOOR from Onboarding Batch

**Files:**
- Modify: `app/onboarding/setup-actions.ts:87-93` (input type)
- Modify: `app/onboarding/setup-actions.ts:150-168` (batch creation)

**Step 1: Add venueCounterName to input type**

Find the `OnboardingBatchInput` type (line 87):
```typescript
export type OnboardingBatchInput = {
    businessName: string;
    timezone: string;
    logoUrl?: string;
    venue: { name: string; city?: string; state?: string; capacity?: number };
    areas: { name: string; capacity?: number; area_type?: string }[];
};
```
Replace with:
```typescript
export type OnboardingBatchInput = {
    businessName: string;
    timezone: string;
    logoUrl?: string;
    venue: { name: string; city?: string; state?: string; capacity?: number };
    areas: { name: string; capacity?: number; area_type?: string }[];
    venueCounterName?: string;
};
```

**Step 2: Replace VENUE_DOOR area creation with venue counter device**

Find the venue door creation block (look for `'VENUE_DOOR'` or `venueDoorId`). It creates a VENUE_DOOR area. Replace that block with inserting a device row instead:

```typescript
        // Auto-create the venue's dedicated counter clicr (device)
        const venueCounterId = crypto.randomUUID();
        const { error: vcError } = await supabaseAdmin
            .from('devices')
            .insert({
                id: venueCounterId,
                business_id: business.id,
                venue_id: venueId,
                area_id: null,
                name: input.venueCounterName?.trim() || 'Venue Counter',
                device_type: 'COUNTER',
                direction_mode: 'bidirectional',
                is_venue_counter: true,
                status: 'ACTIVE',
            });
        if (vcError) throw vcError;
```

Update the returned `areaIds` — it previously started with `[venueDoorId]`. Remove that since there's no VENUE_DOOR area. The array should only contain user-defined area IDs. Also return the `venueCounterId`:

Update the return type to include `venueCounterId`:
```typescript
export type OnboardingBatchResult =
    | { success: true; businessId: string; venueId: string; areaIds: string[]; venueCounterId: string }
    | { success: false; error: string };
```

And the final return:
```typescript
        return { success: true, businessId: business.id, venueId: venueId, areaIds, venueCounterId };
```

**Step 3: Commit**

```bash
git add app/onboarding/setup-actions.ts
git commit -m "feat: setup-actions creates venue counter device instead of VENUE_DOOR area"
```

---

### Task 5: Update BusinessSetupWizard — Venue Counter in Step 4 + Flow Mode

**Files:**
- Modify: `components/wizards/BusinessSetupWizard.tsx`

This is the largest change. Multiple sub-steps.

**Step 1: Add new state variables and import FlowMode**

At the imports (line 6), add `FlowMode` to the import from `@/lib/types`:
```typescript
import { Area, AreaType, Clicr, FlowMode } from '@/lib/types';
```

Delete lines 21-25 (`CLICR_TEMPLATES` constant).

After `editingClicrName` state (around line 81), add:
```typescript
    const [editingClicrFlowMode, setEditingClicrFlowMode] = useState<FlowMode>('BIDIRECTIONAL');
    const [clicrFlowModes, setClicrFlowModes] = useState<Record<string, FlowMode>>({});
```

Add venue counter state:
```typescript
    const [venueCounterName, setVenueCounterName] = useState('Venue Counter');
    const [venueCounterFlowMode, setVenueCounterFlowMode] = useState<FlowMode>('BIDIRECTIONAL');
    const [editingVenueCounter, setEditingVenueCounter] = useState(false);
    const [editingVCName, setEditingVCName] = useState('');
    const [editingVCFlowMode, setEditingVCFlowMode] = useState<FlowMode>('BIDIRECTIONAL');
```

**Step 2: Delete handleApplyTemplate**

Remove the `handleApplyTemplate` function (around lines 154-164).

**Step 3: Update handleAddClicr to use flow_mode**

Replace the `handleAddClicr` function:
```typescript
    const handleAddClicr = (areaId: string) => {
        const name = clicrInputs[areaId];
        if (!name) return;
        const clicr: Clicr = {
            id: crypto.randomUUID(),
            area_id: areaId,
            name,
            flow_mode: clicrFlowModes[areaId] || 'BIDIRECTIONAL',
            active: true,
            current_count: 0,
        };
        setCreatedClicrs(prev => [...prev, clicr]);
        setClicrInputs(prev => ({ ...prev, [areaId]: '' }));
    };
```

**Step 4: Replace handleSaveClicrName with handleSaveClicr**

Replace:
```typescript
    const handleSaveClicr = (id: string) => {
        const trimmed = editingClicrName.trim();
        if (trimmed) setCreatedClicrs(prev => prev.map(c => c.id === id ? {
            ...c,
            name: trimmed,
            flow_mode: editingClicrFlowMode,
        } : c));
        setEditingClicrId(null);
    };
```

**Step 5: Update the finish function**

In the `finish()` function, find the `createBusinessVenueAndAreas` call. Add `venueCounterName`:
```typescript
                const result = await createBusinessVenueAndAreas({
                    businessName,
                    timezone,
                    logoUrl: logoUrl || undefined,
                    venue: { ... },
                    areas: createdAreas.map(a => ({ ... })),
                    venueCounterName,
                });
```

The areaIds mapping — previously `result.areaIds` started with the venueDoorId at index 0, and user areas started at index 1. Now there's no venue door, so the mapping is direct (index 0 = first user area). Check the existing mapping logic and simplify:

```typescript
                currentAreas = createdAreas.map((a, i) => ({
                    ...a,
                    id: result.areaIds[i],
                    venue_id: result.venueId,
                } as Area));
```

**Step 6: Rewrite the CLICRS step JSX**

Replace the entire `{step === 'CLICRS' && (...)}` block (lines 509-590) with:

```tsx
            {step === 'CLICRS' && (
                <div className="space-y-6 bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl">
                    <div className="flex items-center gap-3">
                        <Users className="text-primary w-6 h-6" />
                        <h2 className="text-2xl font-bold text-white">Add Clicrs</h2>
                    </div>
                    <p className="text-slate-400 text-sm">Name your counters. The venue counter tracks overall venue occupancy.</p>

                    {/* VENUE COUNTER — dedicated, non-deletable */}
                    <div className="bg-amber-950/10 p-4 rounded-xl border border-amber-500/20">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-3">{venueData.name || 'Venue'}</h3>
                        {!editingVenueCounter ? (
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2 text-amber-300">
                                    <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                    {venueCounterName}
                                    <span className="text-xs text-amber-600">{venueCounterFlowMode === 'BIDIRECTIONAL' ? 'both' : venueCounterFlowMode === 'IN_ONLY' ? 'in only' : 'out only'}</span>
                                </div>
                                <button type="button"
                                    onClick={() => { setEditingVenueCounter(true); setEditingVCName(venueCounterName); setEditingVCFlowMode(venueCounterFlowMode); }}
                                    className="p-1.5 rounded-lg text-amber-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors" title="Edit">
                                    <Pencil className="w-3 h-3" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2 w-full">
                                <input autoFocus type="text" value={editingVCName}
                                    onChange={e => setEditingVCName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Escape') setEditingVenueCounter(false); }}
                                    className="flex-1 bg-slate-900 border border-amber-500/30 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
                                <select value={editingVCFlowMode} onChange={e => setEditingVCFlowMode(e.target.value as FlowMode)}
                                    className="flex-1 bg-slate-900 border border-amber-500/30 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500">
                                    <option value="BIDIRECTIONAL">Both (in + out)</option>
                                    <option value="IN_ONLY">In only</option>
                                    <option value="OUT_ONLY">Out only</option>
                                </select>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => {
                                        if (editingVCName.trim()) { setVenueCounterName(editingVCName.trim()); setVenueCounterFlowMode(editingVCFlowMode); }
                                        setEditingVenueCounter(false);
                                    }} className="flex-1 py-1 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-sm font-medium transition-colors flex items-center justify-center gap-1">
                                        <Check className="w-3.5 h-3.5" /> Save
                                    </button>
                                    <button type="button" onClick={() => setEditingVenueCounter(false)}
                                        className="flex-1 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-sm font-medium transition-colors flex items-center justify-center gap-1">
                                        <X className="w-3.5 h-3.5" /> Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* AREA CLICRS */}
                    <div className="space-y-4">
                        {createdAreas.map(area => {
                            const areaClicrs = createdClicrs.filter(c => c.area_id === area.id);
                            return (
                                <div key={area.id} className="bg-slate-950/30 p-4 rounded-xl border border-slate-800">
                                    <h3 className="font-bold text-white mb-3">{area.name}</h3>
                                    {areaClicrs.map(c => (
                                        <div key={c.id} className="flex items-center justify-between mb-2 text-sm">
                                            {editingClicrId !== c.id ? (
                                                <>
                                                    <div className="flex items-center gap-2 text-slate-300">
                                                        <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                                        {c.name}
                                                        <span className="text-xs text-slate-500">{c.flow_mode === 'BIDIRECTIONAL' ? 'both' : c.flow_mode === 'IN_ONLY' ? 'in only' : 'out only'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button type="button"
                                                            onClick={() => { setEditingClicrId(c.id); setEditingClicrName(c.name); setEditingClicrFlowMode(c.flow_mode); }}
                                                            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors" title="Edit">
                                                            <Pencil className="w-3 h-3" />
                                                        </button>
                                                        <button type="button"
                                                            onClick={() => setCreatedClicrs(prev => prev.filter(x => x.id !== c.id))}
                                                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Remove">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex flex-col gap-2 w-full">
                                                    <input autoFocus type="text" value={editingClicrName}
                                                        onChange={e => setEditingClicrName(e.target.value)}
                                                        onKeyDown={e => { if (e.key === 'Escape') setEditingClicrId(null); }}
                                                        className="flex-1 bg-slate-900 border border-primary/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                                                    <select value={editingClicrFlowMode} onChange={e => setEditingClicrFlowMode(e.target.value as FlowMode)}
                                                        className="flex-1 bg-slate-900 border border-primary/50 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                                                        <option value="BIDIRECTIONAL">Both (in + out)</option>
                                                        <option value="IN_ONLY">In only</option>
                                                        <option value="OUT_ONLY">Out only</option>
                                                    </select>
                                                    <div className="flex gap-2">
                                                        <button type="button" onClick={() => handleSaveClicr(c.id)}
                                                            className="flex-1 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-sm font-medium transition-colors flex items-center justify-center gap-1">
                                                            <Check className="w-3.5 h-3.5" /> Save
                                                        </button>
                                                        <button type="button" onClick={() => setEditingClicrId(null)}
                                                            className="flex-1 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-sm font-medium transition-colors flex items-center justify-center gap-1">
                                                            <X className="w-3.5 h-3.5" /> Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    <div className="flex gap-2">
                                        <input type="text" placeholder="Clicr name (e.g. Door 1)"
                                            value={clicrInputs[area.id] || ''}
                                            onChange={e => setClicrInputs(p => ({ ...p, [area.id]: e.target.value }))}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddClicr(area.id); } }}
                                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-primary focus:outline-none" />
                                        <select value={clicrFlowModes[area.id] || 'BIDIRECTIONAL'}
                                            onChange={e => setClicrFlowModes(p => ({ ...p, [area.id]: e.target.value as FlowMode }))}
                                            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm focus:ring-1 focus:ring-primary focus:outline-none">
                                            <option value="BIDIRECTIONAL">Both</option>
                                            <option value="IN_ONLY">In only</option>
                                            <option value="OUT_ONLY">Out only</option>
                                        </select>
                                        <button onClick={() => handleAddClicr(area.id)} disabled={!clicrInputs[area.id]}
                                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                                            Add
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex gap-3 pt-2 border-t border-slate-800">
                        <button type="button" onClick={goToPrevStep} className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2">
                            <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <button type="button" onClick={() => setStep('INVITE')} className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all">
                            Next: Invite Team
                        </button>
                    </div>
                </div>
            )}
```

**Step 7: Commit**

```bash
git add components/wizards/BusinessSetupWizard.tsx
git commit -m "feat: wizard step 4 — venue counter section, flow_mode selector, remove templates"
```

---

### Task 6: Fix Tap Endpoint — Support Venue Counter Clicrs

**Files:**
- Modify: `app/api/tap/[token]/route.ts:69-80`

**Step 1: Update the RPC call to handle venue counters**

Find the RPC call block (line 69-80). Replace with:

```typescript
    const delta = (direction as 'IN' | 'OUT') === 'IN' ? 1 : -1;

    // Venue counter clicrs have area_id = null, use venue_id instead
    const rpcParams: Record<string, unknown> = {
        p_delta: delta,
        p_source: 'manual',
        p_device_id: device.id,
        p_gender: null,
        p_idempotency_key: null,
    };

    if (device.area_id) {
        rpcParams.p_area_id = device.area_id;
    } else if (device.venue_id) {
        rpcParams.p_venue_id = device.venue_id;
    } else {
        return NextResponse.json({ error: 'Device has no area or venue assigned' }, { status: 422 });
    }

    const { error: rpcError } = await supabaseAdmin.rpc('apply_occupancy_delta', rpcParams);
```

Note: also pass `device.id` as `p_device_id` — currently it passes `null` which loses the device reference.

**Step 2: Commit**

```bash
git add app/api/tap/[token]/route.ts
git commit -m "fix: tap endpoint supports venue counter clicrs + passes device_id"
```

---

### Task 7: Update Dashboard — Read Venue Occupancy from venues Table

**Files:**
- Modify: `app/(authenticated)/dashboard/page.tsx`

**Step 1: Update liveOccupancy calculation**

Find (around line 557):
```typescript
    const liveOccupancy = useMemo(
        () => areas
            .filter(a => a.area_type === 'VENUE_DOOR')
            .reduce((sum, a) => sum + (a.current_occupancy ?? 0), 0),
        [areas]
    );
```
Replace with:
```typescript
    const liveOccupancy = useMemo(
        () => venues.reduce((sum, v) => sum + ((v as any).current_occupancy ?? 0), 0),
        [venues]
    );
```

**Step 2: Update liveVenuesData**

Find (around line 703):
```typescript
            const doorArea = venueAreas.find(a => a.area_type === 'VENUE_DOOR');
            const occupancy = doorArea?.current_occupancy ?? 0;
```
Replace with:
```typescript
            const occupancy = (venue as any).current_occupancy ?? 0;
```

Also remove the VENUE_DOOR filter from area count:
```typescript
            const areaCount = venueAreas.filter(a => a.area_type !== 'VENUE_DOOR' && a.is_active).length;
```
Replace with:
```typescript
            const areaCount = venueAreas.filter(a => a.is_active).length;
```

**Step 3: Update Venue type to include current_occupancy**

In `lib/types.ts`, find the Venue type. Add `current_occupancy?: number;` field. Then remove the `as any` casts added above.

**Step 4: Commit**

```bash
git add app/(authenticated)/dashboard/page.tsx lib/types.ts
git commit -m "feat: dashboard reads venue occupancy from venues.current_occupancy"
```

---

### Task 8: Update ClicrPanel — Venue Counter Support

**Files:**
- Modify: `app/(authenticated)/clicr/[id]/ClicrPanel.tsx`

**Step 1: Update venue occupancy detection**

Find the `isVenueDoor` logic (around line 179):
```typescript
const venueDoorArea = venueAreas.find(a => a.area_type === 'VENUE_DOOR');
const currentVenueOccupancy = venueDoorArea?.current_occupancy ?? 0;
const isVenueDoor = currentArea?.area_type === 'VENUE_DOOR';
```
Replace with:
```typescript
const currentVenueOccupancy = currentVenue?.current_occupancy ?? 0;
const isVenueCounter = currentClicr?.is_venue_counter === true;
```

Update all references from `isVenueDoor` to `isVenueCounter` throughout the file (amber styling at lines 690-727).

For venue counter clicrs, the occupancy displayed should be `currentVenueOccupancy` (from the venue), and the capacity should be `currentVenue?.capacity_max`.

**Step 2: Commit**

```bash
git add app/(authenticated)/clicr/[id]/ClicrPanel.tsx
git commit -m "feat: ClicrPanel uses is_venue_counter flag and venue occupancy"
```

---

### Task 9: Update /clicr Page — Amber Pin + Add Clicr Modal

**Files:**
- Modify: `app/(authenticated)/clicr/page.tsx`

**Step 1: Add venue counter clicrs to grouping**

Find the grouping logic (around line 68). Venue counter clicrs have `area_id = null` so they won't appear in `areasWithClicrs`. Add them separately:

```typescript
    const venuesWithContent = (venues || []).map(venue => {
        const venueAreas = (areas || []).filter(a => a.venue_id === venue.id);
        const venueCounterClicrs = (clicrs || []).filter(c => c.is_venue_counter && c.venue_id === venue.id);

        const areasWithClicrs = venueAreas.map(area => {
            const areaClicrs = (clicrs || []).filter(c => c.area_id === area.id);
            return { ...area, clicrs: areaClicrs };
        });

        return { ...venue, areas: areasWithClicrs, venueCounterClicrs };
    });
```

**Step 2: Render venue counter clicrs first with amber styling**

In the rendering, before the area clicrs grid, add:

```tsx
{venue.venueCounterClicrs.map(clicr => (
    <ClicrCard key={clicr.id} clicr={clicr} area={null} isVenueCounter />
))}
```

Update `ClicrCard` to accept `isVenueCounter` prop and apply amber border/bg when true. Also hide the delete action for venue counter clicrs.

**Step 3: Replace the "Add Clicr" link with a modal**

Remove the `<Link href="/areas">Add Clicr</Link>` button (lines 116-124).

Add state for the modal:
```typescript
const [showAddClicr, setShowAddClicr] = useState(false);
const [newClicrAreaId, setNewClicrAreaId] = useState('');
const [newClicrName, setNewClicrName] = useState('');
const [newClicrFlow, setNewClicrFlow] = useState<FlowMode>('BIDIRECTIONAL');
```

Add a button that opens the modal:
```tsx
<button onClick={() => setShowAddClicr(true)}
    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors text-sm">
    <Plus className="w-4 h-4" /> Add Clicr
</button>
```

Add the modal at the end of the component (before closing `</div>`):
```tsx
{showAddClicr && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold text-white">Add Clicr</h3>
            <div className="space-y-3">
                <div>
                    <label className="text-xs font-medium text-slate-400 mb-1 block">Area</label>
                    <select value={newClicrAreaId} onChange={e => setNewClicrAreaId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm">
                        <option value="">Select area...</option>
                        {venues.map(v => (
                            <optgroup key={v.id} label={v.name}>
                                {areas.filter(a => a.venue_id === v.id && a.is_active).map(a => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-400 mb-1 block">Name</label>
                    <input type="text" value={newClicrName} onChange={e => setNewClicrName(e.target.value)}
                        placeholder="e.g. Front Door"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
                </div>
                <div>
                    <label className="text-xs font-medium text-slate-400 mb-1 block">Flow Mode</label>
                    <select value={newClicrFlow} onChange={e => setNewClicrFlow(e.target.value as FlowMode)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm">
                        <option value="BIDIRECTIONAL">Both (in + out)</option>
                        <option value="IN_ONLY">In only</option>
                        <option value="OUT_ONLY">Out only</option>
                    </select>
                </div>
            </div>
            <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowAddClicr(false); setNewClicrName(''); setNewClicrAreaId(''); }}
                    className="flex-1 py-2 border border-slate-700 text-slate-400 hover:text-white rounded-xl text-sm font-medium transition-colors">
                    Cancel
                </button>
                <button onClick={async () => {
                    if (!newClicrAreaId || !newClicrName.trim()) return;
                    await addClicr({
                        id: crypto.randomUUID(),
                        area_id: newClicrAreaId,
                        name: newClicrName.trim(),
                        flow_mode: newClicrFlow,
                        active: true,
                        current_count: 0,
                    });
                    setShowAddClicr(false);
                    setNewClicrName('');
                    setNewClicrAreaId('');
                    setNewClicrFlow('BIDIRECTIONAL');
                }} disabled={!newClicrAreaId || !newClicrName.trim()}
                    className="flex-1 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
                    Add
                </button>
            </div>
        </div>
    </div>
)}
```

**Step 4: Commit**

```bash
git add app/(authenticated)/clicr/page.tsx
git commit -m "feat: /clicr page — amber venue counter, add clicr modal"
```

---

### Task 10: Update /areas Page — Remove VENUE_DOOR References

**Files:**
- Modify: `app/(authenticated)/areas/page.tsx`

**Step 1: Remove VENUE_DOOR from constants and logic**

Find `AREA_TYPE_ORDER` (line 26) — remove the `VENUE_DOOR: 0` entry.
Find `AREA_TYPE_LABELS` (line 36) — remove the `VENUE_DOOR: 'venue door'` entry.
Find `getVenueDoorArea` and `venueDoorExists` (lines 92-94) — delete both.
Remove any VENUE_DOOR option from area type dropdowns if present.

**Step 2: Add cascading clicr creation after adding an area**

After the area creation modal closes successfully (inside `handleCreateArea` success path), show an inline prompt. Add state:

```typescript
const [justCreatedAreaId, setJustCreatedAreaId] = useState<string | null>(null);
const [cascadeClicrName, setCascadeClicrName] = useState('');
const [cascadeClicrFlow, setCascadeClicrFlow] = useState<FlowMode>('BIDIRECTIONAL');
```

In the area creation success handler, set `setJustCreatedAreaId(newAreaId)` and close the area modal.

In the JSX, after the area cards, if `justCreatedAreaId` is set, render a small inline card:
```tsx
{justCreatedAreaId && (
    <div className="bg-slate-900/50 border border-primary/20 rounded-xl p-4 space-y-3">
        <p className="text-sm text-slate-300">Add Clicrs to <span className="font-bold text-white">{areas.find(a => a.id === justCreatedAreaId)?.name}</span>?</p>
        <div className="flex gap-2">
            <input type="text" placeholder="Clicr name" value={cascadeClicrName}
                onChange={e => setCascadeClicrName(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
            <select value={cascadeClicrFlow} onChange={e => setCascadeClicrFlow(e.target.value as FlowMode)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm">
                <option value="BIDIRECTIONAL">Both</option>
                <option value="IN_ONLY">In only</option>
                <option value="OUT_ONLY">Out only</option>
            </select>
            <button onClick={async () => {
                if (!cascadeClicrName.trim()) return;
                await addClicr({ id: crypto.randomUUID(), area_id: justCreatedAreaId, name: cascadeClicrName.trim(), flow_mode: cascadeClicrFlow, active: true, current_count: 0 });
                setCascadeClicrName('');
            }} disabled={!cascadeClicrName.trim()}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50">
                Add
            </button>
        </div>
        <button onClick={() => setJustCreatedAreaId(null)} className="text-xs text-slate-500 hover:text-slate-300">Done adding clicrs</button>
    </div>
)}
```

**Step 3: Commit**

```bash
git add app/(authenticated)/areas/page.tsx
git commit -m "feat: remove VENUE_DOOR from areas page, add cascading clicr creation"
```

---

### Task 11: Refactor /venues/new — Batch Create on Finish

**Files:**
- Modify: `app/(authenticated)/venues/new/page.tsx`

**Step 1: Refactor to collect-then-commit pattern**

Currently:
- Step 1 (line 59): `await addVenue(venue)` immediately
- Step 2 (line 82): `await addArea(area)` immediately
- Step 3 (line 105): `await addClicr(clicr)` immediately
- Finish (line 111): just navigates

Replace with local-state-only collection in steps 1-3, then batch-commit in `handleFinish`:

```typescript
    // Replace handleCreateVenue — just collect data, don't call addVenue
    const handleCreateVenue = (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeBusiness?.id) {
            alert('Please select a business from the sidebar first.');
            return;
        }
        const newId = crypto.randomUUID();
        setVenueId(newId);
        setStep('AREAS');
    };

    // Replace handleAddArea — just collect locally
    const handleAddArea = () => {
        if (!areaInput.name) return;
        const newAreaId = crypto.randomUUID();
        const area: Area = {
            id: newAreaId,
            venue_id: venueId,
            name: areaInput.name,
            default_capacity: areaInput.capacity,
            area_type: 'MAIN',
            counting_mode: 'BOTH',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            current_count: 0,
        } as Area;
        setCreatedAreas(prev => [...prev, area]);
        setAreaInput({ name: '', capacity: 100 });
    };

    // Replace handleAddClicr — just collect locally
    const handleAddClicrLocal = (areaId: string) => {
        const name = clicrInputs[areaId];
        if (!name) return;
        const clicr: Clicr = {
            id: crypto.randomUUID(),
            area_id: areaId,
            name,
            flow_mode: clicrFlowModes[areaId] || 'BIDIRECTIONAL',
            active: true,
            current_count: 0,
        };
        setCreatedClicrs(prev => [...prev, clicr]);
        setClicrInputs(prev => ({ ...prev, [areaId]: '' }));
    };

    // New handleFinish — batch commit everything
    const handleFinish = async () => {
        if (!activeBusiness?.id) return;
        setIsLoading(true);

        try {
            // 1. Create venue
            const venue: Venue = {
                id: venueId,
                business_id: activeBusiness.id,
                name: venueData.name,
                city: venueData.city,
                state: venueData.state,
                default_capacity_total: venueData.capacity,
                capacity_enforcement_mode: 'WARN_ONLY',
                status: 'ACTIVE',
                timezone: 'America/New_York',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                active: true,
            };
            await addVenue(venue);
            // addVenue auto-creates venue counter clicr

            // 2. Create areas
            for (const area of createdAreas) {
                await addArea(area);
            }

            // 3. Create clicrs
            for (const clicr of createdClicrs) {
                await addClicr(clicr);
            }

            router.push('/venues');
        } catch (e: any) {
            console.error('Failed to create venue setup:', e);
            setIsLoading(false);
        }
    };
```

Add state for flow mode per area and clicr flow modes:
```typescript
    const [clicrFlowModes, setClicrFlowModes] = useState<Record<string, FlowMode>>({});
```

**Step 2: Add flow_mode select to step 3 clicr form**

In the `renderClicrsStep` function, next to the clicr name input, add:
```tsx
<select value={clicrFlowModes[area.id] || 'BIDIRECTIONAL'}
    onChange={e => setClicrFlowModes(p => ({ ...p, [area.id]: e.target.value as FlowMode }))}
    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm">
    <option value="BIDIRECTIONAL">Both</option>
    <option value="IN_ONLY">In only</option>
    <option value="OUT_ONLY">Out only</option>
</select>
```

**Step 3: Update imports**

Add `FlowMode` to imports from `@/lib/types`. Add `addArea` to the `useApp()` destructure if not already present.

**Step 4: Commit**

```bash
git add app/(authenticated)/venues/new/page.tsx
git commit -m "refactor: /venues/new batches all creation on finish + flow_mode"
```

---

### Task 12: Update Adapters — Handle Venue Counter Clicrs

**Files:**
- Modify: `core/adapters/LocalAdapter.ts`
- Modify: `core/adapters/SupabaseAdapter.ts` (if it has relevant handlers)

**Step 1: Update LocalAdapter**

The LocalAdapter stores clicrs in localStorage. A venue counter clicr has `area_id: null` and `venue_id` set. The LocalAdapter's `applyOccupancyDelta` method (around line 280) currently only handles area-level occupancy. Add venue-level support:

Find the method and add a branch for venue counters:
```typescript
// If area_id is null but venue_id is provided, update venue occupancy
if (!areaId && venueId) {
    const venues = this.getVenues();
    const venue = venues.find(v => v.id === venueId);
    if (venue) {
        (venue as any).current_occupancy = Math.max(0, ((venue as any).current_occupancy ?? 0) + delta);
        this.saveVenues(venues);
    }
    return;
}
```

**Step 2: Commit**

```bash
git add core/adapters/LocalAdapter.ts core/adapters/SupabaseAdapter.ts
git commit -m "feat: adapters handle venue counter clicrs"
```

---

## Manual Verification Checklist

After all tasks:

1. `npm run dev` — confirm no build errors
2. **Onboarding wizard**: Create business → step 4 shows amber venue counter section + flow mode selectors. Complete wizard, verify venue counter clicr is created in store.
3. **`/clicr` page**: Venue counter clicr appears first with amber styling. "Add Clicr" button opens modal with area selector.
4. **`/areas` page**: No VENUE_DOOR sections. After adding area, cascading clicr prompt appears.
5. **`/venues/new`**: All three steps collect data locally. Only "Finish Setup" commits to store. Flow mode selector on clicr step.
6. **Tap endpoint**: Test with `curl -X POST /api/tap/[token] -d '{"direction":"IN"}'` — should return `{ success: true }` (no 403).
7. **Dashboard**: Venue occupancy reads from venue, not from VENUE_DOOR area.
8. **ClicrPanel**: Venue counter clicr shows amber theme, reads venue occupancy.
