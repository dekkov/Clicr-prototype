# Design: Quick UX Cleanup

**Date:** 2026-03-05
**Scope:** Two small, independent changes

---

## Task 1 — Remove Board View from Onboarding Checklist

**File:** `app/(authenticated)/dashboard/_components/GettingStartedChecklist.tsx`

**Changes:**
- Remove the `board` item from the `items` array
- Remove `boardViewCount` state variable
- Remove `loadBoardViews` callback and its `useEffect`
- Remove `listBoardViews` import from `board-actions`

**No other files affected.** The `/settings/board-views` page is untouched.

---

## Task 2 — Remove Guest-In Modal (direct tap to increment)

**File:** `app/(authenticated)/clicr/[id]/ClicrPanel.tsx`

**Current behavior:** Tapping "GUEST IN" opens a bottom-sheet modal collecting optional name, DOB, and gender before recording the event.

**New behavior:** Tapping "GUEST IN" immediately calls `handleGuestIn()` — no modal.

**Changes:**
- `handleGuestIn` retains capacity enforcement (hard stop / warn / manager override) but drops name/DOB/gender collection and the `recordScan` call
- Remove state: `showGuestInModal`, `guestDraft`
- Remove the Guest Check-In modal JSX block
- Remove `showGuestInModal` references from `isModalOpenRef` tracking and focus `useEffect`s
