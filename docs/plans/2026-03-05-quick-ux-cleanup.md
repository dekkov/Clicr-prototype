# Quick UX Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the Board View step from the onboarding checklist and replace the Guest-In modal with a direct tap-to-increment action.

**Architecture:** Two isolated UI changes — one in the GettingStartedChecklist component, one in ClicrPanel. No data model changes, no API changes, no new files.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4

---

## Task 1: Remove Board View from GettingStartedChecklist

**Files:**
- Modify: `app/(authenticated)/dashboard/_components/GettingStartedChecklist.tsx`

### Step 1: Remove the `listBoardViews` import

In `GettingStartedChecklist.tsx`, delete this line:
```ts
import { listBoardViews } from '@/app/(authenticated)/settings/board-actions';
```

### Step 2: Remove boardViewCount state and loadBoardViews logic

Delete these three blocks:
```ts
const [boardViewCount, setBoardViewCount] = useState(0);
```
```ts
const loadBoardViews = useCallback(async () => {
    if (!activeBusiness?.id) return;
    const views = await listBoardViews(activeBusiness.id);
    setBoardViewCount(views.length);
}, [activeBusiness?.id]);

useEffect(() => {
    loadBoardViews();
}, [loadBoardViews]);
```

### Step 3: Remove the `board` item from the items array

Delete this entry from the `items` array:
```ts
{
    id: 'board',
    label: 'Create a Board View',
    description: 'Display multiple counters on one screen',
    completed: boardViewCount > 0,
    href: '/settings/board-views',
},
```

### Step 4: Verify no TypeScript errors

```bash
cd /home/king/clicr-v4 && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors referencing GettingStartedChecklist.

### Step 5: Manual verification

- Open the app, navigate to `/dashboard`
- Confirm the checklist no longer shows "Create a Board View" step
- Confirm no console errors

### Step 6: Commit

```bash
git add app/(authenticated)/dashboard/_components/GettingStartedChecklist.tsx
git commit -m "feat(onboarding): remove board view step from getting started checklist"
```

---

## Task 2: Remove Guest-In Modal — Direct Tap to Increment

**Files:**
- Modify: `app/(authenticated)/clicr/[id]/ClicrPanel.tsx`

### Step 1: Simplify `handleGuestIn` — remove modal data, keep capacity enforcement

Replace the existing `handleGuestIn` function (lines ~373–431) with this lean version:

```ts
const handleGuestIn = () => {
    if (!clicr || !venueId) return;

    // Capacity enforcement
    const { maxCapacity: maxCap, mode } = getVenueCapacityRules(venue);
    if (maxCap > 0 && currentVenueOccupancy >= maxCap) {
        if (mode === 'HARD_STOP') {
            alert("CAPACITY REACHED: Entry Blocked (Hard Stop Active)");
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            return;
        }
        if (mode === 'MANAGER_OVERRIDE' || mode === 'HARD_BLOCK' as any) {
            if (!window.confirm("WARNING: Capacity Reached. Authorize Override?")) return;
        }
        if (mode === 'WARN_ONLY') {
            if (navigator.vibrate) navigator.vibrate([50, 50, 50, 50]);
        }
    }

    if (navigator.vibrate) navigator.vibrate(50);

    recordEvent({
        venue_id: venueId,
        area_id: clicr.area_id,
        clicr_id: clicr.id,
        delta: 1,
        flow_type: 'IN',
        event_type: 'TAP',
        idempotency_key: Math.random().toString(36)
    });
};
```

### Step 2: Remove modal state declarations

Delete these state declarations (lines ~201–206):
```ts
const [showGuestInModal, setShowGuestInModal] = useState(false);
const [guestDraft, setGuestDraft] = useState<{
    name: string;
    dob: string;
    gender: 'M' | 'F' | 'OTHER' | 'DECLINE' | null;
}>({ name: '', dob: '', gender: null });
```

### Step 3: Remove `showGuestInModal` from `isModalOpenRef` tracking

Current line (~221):
```ts
isModalOpenRef.current = showBulkModal || showConfigModal || showGuestInModal;
```
Replace with:
```ts
isModalOpenRef.current = showBulkModal || showConfigModal;
```

### Step 4: Remove `showGuestInModal` from focus useEffect dependencies

Current (~226):
```ts
if (!showBulkModal && !showConfigModal && !showGuestInModal) {
```
Replace with:
```ts
if (!showBulkModal && !showConfigModal) {
```

Also update the blur handler (~263):
```ts
if (!showBulkModal && !showConfigModal && !showGuestInModal) {
```
Replace with:
```ts
if (!showBulkModal && !showConfigModal) {
```

### Step 5: Wire GUEST IN button to fire directly

In the action buttons section (~822–827), change:
```tsx
<ActionButton
    label="GUEST IN"
    onClick={() => setShowGuestInModal(true)}
    ...
/>
```
To:
```tsx
<ActionButton
    label="GUEST IN"
    onClick={handleGuestIn}
    ...
/>
```

### Step 6: Delete the Guest Check-In modal JSX

Remove the entire `{/* GUEST IN MODAL */}` block (lines ~953–1045):
```tsx
{/* GUEST IN MODAL */}
<AnimatePresence>
    {showGuestInModal && (
        <motion.div
            ...
        >
            ...
        </motion.div>
    )}
</AnimatePresence>
```

### Step 7: Verify no TypeScript errors

```bash
cd /home/king/clicr-v4 && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

### Step 8: Manual verification

- Navigate to `/clicr/[any-id]`
- Tap "GUEST IN" — counter should increment immediately with no modal
- Tap "GUEST OUT" — counter should decrement immediately (unchanged)
- Confirm no console errors

### Step 9: Commit

```bash
git add app/(authenticated)/clicr/[id]/ClicrPanel.tsx
git commit -m "feat(clicr): remove guest-in modal, tap directly increments counter"
```
