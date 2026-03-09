# Unified Business Setup Wizard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract the shared 7-step business setup wizard into `components/wizards/BusinessSetupWizard.tsx`, replace both onboarding and new-business pages with thin wrappers.

**Architecture:** Single `BusinessSetupWizard` component holds all state + step JSX. Both pages render it inside their own layout context. The wizard receives an `onComplete` callback for post-finish navigation.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, Lucide React

**Pre-conditions:**
- `setup-actions.ts` already accepts `area_type` per area
- Both wizards have identical area edit (stacked form: name, type select, capacity, Save/Cancel)
- No VENUE_DOOR auto-creation — areas start empty, user adds manually
- Area type labels are lowercase throughout
- Area type options: main, entry, vip, patio, bar, event space, other

---

## Current State: Differences to Reconcile

Both `app/onboarding/setup/page.tsx` (820 lines) and `app/(authenticated)/businesses/new/page.tsx` (768 lines) are ~95% identical. Key differences:

| Aspect | Onboarding | New Business | Wizard should use |
|--------|-----------|--------------|-------------------|
| Outer layout | fullscreen centered `min-h-screen` | inside AppLayout, has header + Cancel | Neither — wrapper provides layout |
| Constants | `STEP_LABELS`, `CLICR_TEMPLATES` inside component | Outside component + `STEP_DISPLAY` const | Outside component (new-business style) |
| `useApp()` | Destructures `businesses`, `isLoading: storeLoading` | Only `addClicr, selectBusiness, refreshState` | Minimal: only what's used |
| `areaInput` type | `area_type: 'MAIN'` (string) | `area_type: 'MAIN' as AreaType` (typed) | Typed (`as AreaType`) |
| `handleAddArea` reset | Resets to `'MAIN'` | Resets to `'VIP'` (BUG) | Fix: reset to `'MAIN'` |
| Area validation | Allows 0 areas → Clicrs | Requires ≥1 area | Allow 0 (areas are optional) |
| Enter key on area input | No | Yes (`onKeyDown` Enter) | Yes — keep Enter-to-add |
| Edit type dropdown order | MAIN, ENTRY, VIP, ... | MAIN, VIP, ENTRY, ... | Consistent: MAIN, ENTRY, VIP, PATIO, BAR, EVENT_SPACE, OTHER |
| Step display labels | Inline object in JSX | `STEP_DISPLAY` constant | `STEP_DISPLAY` constant |
| `handleDeleteClicr` | Separate function | Inline in JSX | Inline (simpler) |
| `handleCompleteStep3/4` | Separate functions | Inline `setStep()` | Inline (simpler) |
| Error log prefix | `[onboarding]` | `[new-business]` | `[wizard]` |
| Race condition comment | Present | Absent | Remove (not needed in shared component) |

---

## Task 1: Create `BusinessSetupWizard` component with all state and handlers

**Files:**
- Create: `components/wizards/BusinessSetupWizard.tsx`

### Step 1: Create directory and component file

```bash
mkdir -p components/wizards
```

Create `components/wizards/BusinessSetupWizard.tsx` with:

1. **Imports** — merge from both pages, use the minimal set:
```tsx
"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { Area, AreaType, Clicr } from '@/lib/types';
import { Building2, MapPin, Users, Check, Plus, ArrowRight, ArrowLeft, Mail, Shield, Scan, Ban, Trash2, Pencil, X } from 'lucide-react';
import { createBusinessVenueAndAreas, updateBusinessSettings } from '@/app/onboarding/setup-actions';
import { inviteTeamMember } from '@/app/(authenticated)/settings/team-actions';
import type { Role } from '@/lib/types';
```

2. **Constants** — outside the component (new-business style):
```tsx
type Step = 'BUSINESS' | 'VENUE' | 'AREAS' | 'CLICRS' | 'INVITE' | 'SCAN_CONFIG' | 'BAN_CONFIG';

const STEP_LABELS: Step[] = ['BUSINESS', 'VENUE', 'AREAS', 'CLICRS', 'INVITE', 'SCAN_CONFIG', 'BAN_CONFIG'];

const STEP_DISPLAY: Record<Step, string> = {
    BUSINESS: 'Org', VENUE: 'Venue', AREAS: 'Areas', CLICRS: 'Clicrs',
    INVITE: 'Team', SCAN_CONFIG: 'Scan', BAN_CONFIG: 'Bans',
};

const CLICR_TEMPLATES = [
    { id: 'single', label: 'Single door', desc: '1 counter', names: ['Front Door'] },
    { id: 'entry_exit', label: 'Entry + Exit pair', desc: '2 counters', names: ['Entry Door', 'Exit Door'] },
    { id: 'busy', label: 'Busy door setup', desc: '3 counters', names: ['Front Door 1', 'Front Door 2', 'VIP Door'] },
];
```

3. **Props type:**
```tsx
type Props = {
    onComplete?: () => void;
};
```

4. **Component body** — copy ALL state from `businesses/new/page.tsx` (lines 31–76) with these fixes:
   - `areaInput` initial: `{ name: '', capacity: '100', area_type: 'MAIN' as AreaType }` (not VIP)
   - `useApp()`: `const { addClicr, selectBusiness, refreshState } = useApp();`
   - No `useEffect`, no `businesses`/`storeLoading` destructure

5. **Handlers** — copy from `businesses/new/page.tsx` with these changes:
   - `handleAddArea`: reset to `area_type: 'MAIN' as AreaType` (fix bug)
   - `finish`: change `router.push('/dashboard')` to `onComplete ? onComplete() : router.push('/dashboard')`
   - `finish`: change error log to `[wizard] finish error:`
   - No `handleCompleteStep3/4` or `handleDeleteClicr` — use inline in JSX
   - Keep `handleSaveArea`, `handleSaveClicrName`, `handleAddClicr`, `handleApplyTemplate`

6. **Return placeholder** — `return <div>Wizard placeholder</div>;` (JSX comes in Task 2)

### Step 2: TypeScript check

```bash
npx tsc --noEmit 2>&1 | grep "BusinessSetupWizard"
```

Expected: no errors.

---

## Task 2: Move all step JSX into the wizard

**Files:**
- Modify: `components/wizards/BusinessSetupWizard.tsx`
- Reference: `app/(authenticated)/businesses/new/page.tsx` (source of truth for JSX)

### Step 1: Replace placeholder with full JSX

Copy the JSX from `businesses/new/page.tsx` **starting from the step indicator** (line ~273), NOT including:
- The outer `<div className="max-w-xl ...">` wrapper
- The header with "Add New Business" title and Cancel button

The wizard returns:
```tsx
return (
    <>
        {/* Step Indicator */}
        <div className="flex items-center justify-between px-2">
            {STEP_LABELS.map((s, i) => ( ... ))}
        </div>

        {/* STEP 1: BUSINESS */}
        {step === 'BUSINESS' && ( ... )}

        {/* ... remaining steps ... */}
    </>
);
```

### Step 2: Apply these JSX changes

1. **BUSINESS step**: Remove the Cancel + Continue two-button layout. Use single Continue button (onboarding style) since the wrapper handles Cancel:
```tsx
<button type="submit" disabled={isLoading}
    className="w-full py-4 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
    {isLoading ? 'Creating...' : 'Continue'} <ArrowRight className="w-4 h-4" />
</button>
```

2. **AREAS step**:
   - Keep Enter-to-add on area name input (from new-business)
   - Allow 0 areas — Next button enabled regardless: `onClick={() => setStep('CLICRS')}` (no area count check)
   - Edit type dropdown order: MAIN, ENTRY, VIP, PATIO, BAR, EVENT_SPACE, OTHER
   - Add-area type dropdown: same order

3. **CLICRS step**:
   - Use inline `setCreatedClicrs(prev => prev.filter(x => x.id !== c.id))` for delete (no separate handler)
   - Next button: inline `onClick={() => setStep('INVITE')}`

4. **All dropdown options** use lowercase labels: main, entry, vip, patio, bar, event space, other

### Step 3: Remove unused imports

After moving JSX, remove `X` from lucide imports only if it's not used anywhere in the wizard JSX. (It IS used in the area edit Cancel button, so keep it.)

### Step 4: TypeScript check

```bash
npx tsc --noEmit 2>&1 | grep "BusinessSetupWizard"
```

Expected: no errors.

---

## Task 3: Replace `businesses/new/page.tsx` with thin wrapper

**Files:**
- Modify: `app/(authenticated)/businesses/new/page.tsx`

### Step 1: Replace the entire file

```tsx
"use client";

import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import BusinessSetupWizard from '@/components/wizards/BusinessSetupWizard';

export default function NewBusinessPage() {
    const router = useRouter();
    return (
        <div className="max-w-xl mx-auto px-4 py-8 space-y-8">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">Add New Business</h1>
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"
                >
                    <X className="w-4 h-4" /> Cancel
                </button>
            </div>
            <BusinessSetupWizard onComplete={() => router.push('/dashboard')} />
        </div>
    );
}
```

### Step 2: TypeScript check

```bash
npx tsc --noEmit 2>&1 | grep "businesses/new"
```

### Step 3: Verify in browser

Navigate to `/businesses/new` — confirm wizard renders with "Add New Business" title, Cancel button, all steps work.

---

## Task 4: Replace `onboarding/setup/page.tsx` with thin wrapper

**Files:**
- Modify: `app/onboarding/setup/page.tsx`

### Step 1: Replace the entire file

```tsx
"use client";

import BusinessSetupWizard from '@/components/wizards/BusinessSetupWizard';

export default function OnboardingSetupPage() {
    return (
        <div className="min-h-screen bg-slate-950 flex items-start justify-center px-4 py-12">
            <div className="w-full max-w-xl space-y-8">
                <BusinessSetupWizard />
            </div>
        </div>
    );
}
```

### Step 2: TypeScript check

```bash
npx tsc --noEmit 2>&1 | grep "onboarding/setup"
```

### Step 3: Verify in browser

Navigate to `/onboarding/setup` — confirm wizard renders fullscreen (no sidebar), no Cancel button, all steps work end-to-end.

---

## Task 5: Final TypeScript check + cleanup

### Step 1: Full TypeScript check

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```

Expected: no new errors.

### Step 2: Verify `setup-actions.ts` comment

Update the stale comment on line 108:
```ts
// 0 manually added areas is fine — Venue Counter is always auto-created
```
Change to:
```ts
// 0 areas is fine — user can add areas later
```

### Step 3: Smoke test checklist

- [ ] `/businesses/new` — wizard renders inside AppLayout, "Add New Business" title visible, Cancel button visible, all 7 steps work
- [ ] `/onboarding/setup` — wizard renders fullscreen (dark bg, no sidebar), no cancel button, all 7 steps work
- [ ] Areas step: starts empty, can add areas, edit inline (name + type + cap), delete areas
- [ ] Areas step: type dropdown lowercase labels (main, entry, vip, patio, bar, event space, other)
- [ ] Areas step: Enter key adds area from input
- [ ] Areas step: can proceed with 0 areas
- [ ] Clicrs step: templates work, can add/rename/delete clicrs
- [ ] Completing wizard → redirects to `/dashboard`
- [ ] `areaInput` resets to type `'MAIN'` after adding an area (not VIP)
