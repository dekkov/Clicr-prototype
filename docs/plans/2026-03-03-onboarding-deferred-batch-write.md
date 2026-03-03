# Onboarding Deferred Batch Write Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move all onboarding DB writes to a single batch at finish (step 8), so steps 1–8 are pure local state and the wizard is safe to navigate freely with Back/Next.

**Architecture:** All changes are in `app/onboarding/setup/page.tsx` only. No server actions need modification — they already accept the right inputs. The key challenge is remapping temporary client-generated area UUIDs to server-returned real UUIDs before writing clicrs.

**Tech Stack:** React 19, Next.js 16, TypeScript strict, existing server actions (`createBusinessVenueAndAreas`, `inviteTeamMember`, `createBoardView`, `updateBusinessSettings`).

---

## Current Write Points to Remove

| Step | Function/Handler | What to Change |
|---|---|---|
| Step 3 → 4 | `handleCompleteStep3` | Remove DB call; make transition synchronous |
| Step 4 Add | `handleAddClicr` | Already deferred in previous plan (Task 2) — keep local-only |
| Step 4 Next | `handleCompleteStep4` | Remove `addClicr` loop; just `setStep('INVITE')` |
| Step 5 Invite | "Add & Invite Another" onClick | Remove `inviteTeamMember` call; queue only |
| Step 6 Board | "Create & Next" onClick | Remove `createBoardView` call; store in state |
| Step 7 Scan | "Save & Next" onClick | Remove `updateBusinessSettings` call; mark flag only |
| Step 8 Finish | `finish()` | **Add all batch writes here** |

---

### Task 1: Simplify Step 3 → Step 4 Transition

**Files:**
- Modify: `app/onboarding/setup/page.tsx`

**Context:**

`handleCompleteStep3` currently calls `createBusinessVenueAndAreas()`, sets `newBusinessId`/`venueId`/`areaIds`, then transitions. With deferred writes, step 3 just validates and advances.

**Step 1: Replace `handleCompleteStep3`**

Find and replace the entire `handleCompleteStep3` function (currently ~lines 111–143):

```ts
// --- STEP 3: AREAS --- (collect only; batch write happens at finish)
const handleCompleteStep3 = () => {
    if (createdAreas.length === 0) return;
    setStep('CLICRS');
};
```

No async, no loading, no DB call.

**Step 2: Remove the loading overlay from the AREAS step JSX**

Find in the AREAS step JSX (around line 351–359):

```tsx
{step === 'AREAS' && (
    <div className="relative space-y-6 bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl">
        {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-slate-950/80 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-slate-400">Creating your organization…</span>
                </div>
            </div>
        )}
```

Remove the `relative` class and the entire `{isLoading && (...)}` block. The outer div becomes:

```tsx
{step === 'AREAS' && (
    <div className="space-y-6 bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl">
```

**Step 3: Update the "Next: Clicrs" button**

Find (around line 410–413):

```tsx
<button type="button" onClick={handleCompleteStep3} disabled={createdAreas.length === 0 || isLoading}
    className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50">
    {isLoading ? 'Creating...' : 'Next: Clicrs'}
</button>
```

Replace with:

```tsx
<button type="button" onClick={handleCompleteStep3} disabled={createdAreas.length === 0}
    className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50">
    Next: Clicrs
</button>
```

**Step 4: Verify**

Run `npm run build` — no TypeScript errors expected.

Manual test: Step 3 now advances instantly with no spinner. Going Back from step 4 to step 3 and then Next again works without creating anything in DB.

---

### Task 2: Simplify Step 4 → Step 5 Transition

**Files:**
- Modify: `app/onboarding/setup/page.tsx`

**Context:**

If the previous plan (2026-03-03-onboarding-clicr-step-fixes.md Task 2) has already been applied, `handleCompleteStep4` writes all clicrs on Next. Remove that write — just advance the step.

**Step 1: If `handleCompleteStep4` exists, replace it**

Find `handleCompleteStep4` (added by previous plan):

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

Replace with:

```ts
const handleCompleteStep4 = () => {
    setStep('INVITE');
};
```

**Step 2: If `handleCompleteStep4` does not yet exist** (previous plan not applied)

The "Next: Invite Team" button currently has `onClick={() => setStep('INVITE')}` — leave it as-is. No change needed.

**Step 3: Verify**

`npm run build` — no errors.

---

### Task 3: Queue Invites in Step 5 Instead of Sending

**Files:**
- Modify: `app/onboarding/setup/page.tsx` (Step 5 "Add & Invite Another" button onClick)

**Context:**

The "Add & Invite Another" button currently calls `inviteTeamMember(email, role, newBusinessId)` and pushes to `invitedList` on success. We want it to only push to `invitedList` — no server call.

**Step 1: Replace the "Add & Invite Another" button's onClick**

Find the button (around lines 515–532):

```tsx
<button
    onClick={async () => {
        if (!inviteEmail || !newBusinessId) return;
        setIsLoading(true);
        const result = await inviteTeamMember(inviteEmail, inviteRole, newBusinessId);
        if (result.success) {
            setInvitedList(prev => [...prev, { email: inviteEmail, role: inviteRole }]);
            setInviteEmail('');
        } else {
            setError('error' in result ? result.error : 'Invite failed');
        }
        setIsLoading(false);
    }}
    disabled={!inviteEmail || isLoading}
    className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
>
    <Plus className="w-4 h-4" /> {isLoading ? 'Inviting...' : 'Add & Invite Another'}
</button>
```

Replace with:

```tsx
<button
    onClick={() => {
        if (!inviteEmail) return;
        setInvitedList(prev => [...prev, { email: inviteEmail, role: inviteRole }]);
        setInviteEmail('');
    }}
    disabled={!inviteEmail}
    className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
>
    <Plus className="w-4 h-4" /> Add & Invite Another
</button>
```

**Step 2: Also remove the guard `!newBusinessId` from the disabled check**

The old disabled check was `!inviteEmail || isLoading`. The new one is just `!inviteEmail` — already done in the replacement above.

**Step 3: Verify**

`npm run build` — no errors.

Manual test: Adding an invite on step 5 shows it in the list instantly with no spinner. The invite is NOT yet in DB (verifiable via Supabase dashboard).

---

### Task 4: Store Board View Config in State Instead of Writing in Step 6

**Files:**
- Modify: `app/onboarding/setup/page.tsx` (Step 6 "Create & Next" button onClick)

**Context:**

The "Create & Next" button calls `createBoardView(...)` using `newBusinessId`, which won't be set until finish. Replace it with local state marking.

**Step 1: Replace the "Create & Next" button's onClick**

Find the button (around lines 603–618):

```tsx
<button
    type="button"
    onClick={async () => {
        if (newBusinessId && boardViewName.trim() && boardViewDeviceIds.length > 0) {
            setIsLoading(true);
            const result = await createBoardView(boardViewName, boardViewDeviceIds, boardViewLabels, newBusinessId);
            setIsLoading(false);
            if (result.success) setBoardViewCreated(true);
            setStep('SCAN_CONFIG');
        }
    }}
    disabled={isLoading || !boardViewName.trim() || boardViewDeviceIds.length === 0}
    className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50"
>
    {isLoading ? 'Creating...' : 'Create & Next'}
</button>
```

Replace with:

```tsx
<button
    type="button"
    onClick={() => {
        if (boardViewName.trim() && boardViewDeviceIds.length > 0) {
            setBoardViewCreated(true);
            setStep('SCAN_CONFIG');
        }
    }}
    disabled={!boardViewName.trim() || boardViewDeviceIds.length === 0}
    className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50"
>
    Create & Next
</button>
```

**Step 2: Verify**

`npm run build` — no errors.

---

### Task 5: Skip Scan Config DB Write in Step 7

**Files:**
- Modify: `app/onboarding/setup/page.tsx` (Step 7 "Save & Next" button onClick)

**Context:**

The "Save & Next" button calls `updateBusinessSettings(newBusinessId, {...})`. Replace with just marking `scanConfigured` and advancing.

**Step 1: Replace the "Save & Next" button's onClick**

Find the button (around lines 663–678):

```tsx
<button
    type="button"
    onClick={async () => {
        if (newBusinessId) {
            setIsLoading(true);
            setScanConfigured(true);
            await updateBusinessSettings(newBusinessId, { scan_method: scanMethod, scan_enabled_default: scanEnabled });
            setIsLoading(false);
        }
        setStep('BAN_CONFIG');
    }}
    disabled={isLoading}
    className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50"
>
    {isLoading ? 'Saving...' : 'Save & Next'}
</button>
```

Replace with:

```tsx
<button
    type="button"
    onClick={() => {
        setScanConfigured(true);
        setStep('BAN_CONFIG');
    }}
    className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all"
>
    Save & Next
</button>
```

**Step 2: Verify**

`npm run build` — no errors.

---

### Task 6: Rewrite `finish()` as the Single Batch Write

**Files:**
- Modify: `app/onboarding/setup/page.tsx` (`finish` function, ~lines 188–226)

**Context:**

`finish()` currently only calls `updateBusinessSettings` (for scan/ban if configured) then redirects. It must now perform all writes in order:

1. Create business + venue + areas → get `businessId`, `venueId`, `areaIds[]`
2. Build `tempAreaId → realAreaId` map (index-based: `createdAreas[i].id → areaIds[i]`)
3. Write each clicr (with remapped `area_id`)
4. Send each queued invite
5. Create board view if `boardViewCreated` is true and config is set
6. Write scan + ban settings (combined into one `updateBusinessSettings` call)
7. `refreshState()`, `selectBusiness(...)`, `router.push('/dashboard')`

**Idempotency guard:** If `newBusinessId` is already set (e.g. a previous `finish()` attempt partially succeeded), skip step 1 and use the stored `newBusinessId`/`venueId`/`createdAreas` IDs.

**Step 1: Replace the `finish` function**

Find and replace the entire `finish` function:

```ts
const finish = async (opts?: { saveBanConfig?: boolean; saveScanConfig?: boolean }) => {
    const shouldSaveScan = opts?.saveScanConfig ?? scanConfigured;
    const shouldSaveBan = opts?.saveBanConfig ?? banConfigured;

    setIsLoading(true);
    setError(null);

    try {
        // Step 1: Create business + venue + areas (skip if already done)
        let batchBusinessId = newBusinessId;
        let currentAreas = createdAreas;

        if (!batchBusinessId) {
            const parsedCapacity = parseInt(venueData.capacity, 10);
            const result = await createBusinessVenueAndAreas({
                businessName,
                timezone,
                logoUrl: logoUrl || undefined,
                venue: {
                    name: venueData.name,
                    city: venueData.city || undefined,
                    state: venueData.state || undefined,
                    capacity: !isNaN(parsedCapacity) && parsedCapacity > 0 ? parsedCapacity : undefined,
                },
                areas: createdAreas.map(a => ({
                    name: a.name,
                    capacity: a.default_capacity ?? undefined,
                })),
            });

            if (!result.success) {
                setError(result.error);
                setIsLoading(false);
                return;
            }

            batchBusinessId = result.businessId;
            setNewBusinessId(result.businessId);
            setVenueId(result.venueId);

            // Step 2: Remap temp area IDs to real area IDs
            currentAreas = createdAreas.map((a, i) => ({
                ...a,
                id: result.areaIds[i],
                venue_id: result.venueId,
            } as Area));
            setCreatedAreas(currentAreas);
        }

        // Build area remap: tempId → realId (use currentAreas which has real IDs)
        const areaIdMap: Record<string, string> = {};
        createdAreas.forEach((originalArea, i) => {
            areaIdMap[originalArea.id] = currentAreas[i].id;
        });

        // Step 3: Write clicrs (with remapped area_id)
        for (const clicr of createdClicrs) {
            const realAreaId = areaIdMap[clicr.area_id] ?? clicr.area_id;
            await addClicr({ ...clicr, area_id: realAreaId });
        }

        // Step 4: Send queued invites
        for (const inv of invitedList) {
            await inviteTeamMember(inv.email, inv.role, batchBusinessId);
        }

        // Step 5: Create board view if configured
        if (boardViewCreated && boardViewName.trim() && boardViewDeviceIds.length > 0) {
            await createBoardView(boardViewName, boardViewDeviceIds, boardViewLabels, batchBusinessId);
        }

        // Step 6: Write settings (scan + ban combined)
        const settingsPayload: Record<string, unknown> = {};
        if (shouldSaveScan) {
            settingsPayload.scan_method = scanMethod;
            settingsPayload.scan_enabled_default = scanEnabled;
        }
        if (shouldSaveBan) {
            settingsPayload.ban_permissions = {
                manager: banManagerCanBan,
                staff: banStaffCanBan,
            };
            settingsPayload.ban_scope_default = banScopeDefault;
            settingsPayload.ban_reason_required = banReasonRequired;
        }
        if (Object.keys(settingsPayload).length > 0) {
            await updateBusinessSettings(batchBusinessId, settingsPayload);
        }

        // Step 7: Refresh state and redirect
        await refreshState();

        selectBusiness({
            id: batchBusinessId,
            name: businessName,
            timezone,
            settings: {
                refresh_interval_sec: 2,
                capacity_thresholds: [80, 90, 100],
                reset_rule: 'MANUAL',
                ...(shouldSaveScan ? { scan_method: scanMethod, scan_enabled_default: scanEnabled } : {}),
                ...(shouldSaveBan ? {
                    ban_permissions: { manager: banManagerCanBan, staff: banStaffCanBan },
                    ban_scope_default: banScopeDefault,
                    ban_reason_required: banReasonRequired,
                } : {}),
            },
        });

        router.push('/dashboard');
    } catch (e: any) {
        console.error('[onboarding] finish error:', e);
        setError(e.message || 'Setup failed. Please try again.');
        setIsLoading(false);
    }
};
```

**Step 2: Add loading state + error display to BAN_CONFIG step**

The "Save & finish setup" button already has `onClick={() => finish({ saveBanConfig: true })}`. Add `disabled={isLoading}` and a loading label:

Find:
```tsx
<button type="button" onClick={() => finish({ saveBanConfig: true })} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2">
    <Check className="w-5 h-5" /> Save & finish setup
</button>
```

Replace with:
```tsx
<button type="button" onClick={() => finish({ saveBanConfig: true })} disabled={isLoading} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
    {isLoading ? (
        <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Setting up…
        </>
    ) : (
        <>
            <Check className="w-5 h-5" /> Save & finish setup
        </>
    )}
</button>
```

Also add error display just above the button row in the BAN_CONFIG step. Find the `<div className="flex gap-3 pt-2 border-t border-slate-800">` inside BAN_CONFIG and add before it:

```tsx
{error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>}
```

**Step 3: Verify**

`npm run build` — no TypeScript errors expected.

Manual test (full happy path):
1. Go through all 8 steps, adding 1 area, 1 clicr, 1 invite, 1 board view, configuring scan + ban
2. Click "Save & finish setup" — spinner shows
3. After redirect to `/dashboard`, check Supabase: business, venue, area, device, board_view rows all exist
4. Check auth: team invite email sent

Manual test (Back/Next safety):
- Step 3: add areas, click "Next: Clicrs", click "Back", modify areas, click "Next: Clicrs" again — no duplicate DB writes
- Step 5: add invite, go Back, go Next again — invite appears in list once only
- Step 6: configure board view, go Back to step 5, go Next again — board view config preserved, `boardViewCreated` stays true

Manual test (idempotency guard):
- Open browser DevTools → Network
- Click "Save & finish setup"
- If the `createBusinessVenueAndAreas` call succeeds but a subsequent write fails (can simulate by going offline after first request) — clicking finish again skips business creation (because `newBusinessId` is now set) and retries from clicrs

---

### Task 7: Clean Up Unused Imports and State

**Files:**
- Modify: `app/onboarding/setup/page.tsx`

**Step 1: Remove `newBusinessId`-guarded patterns that are now dead code**

After the above changes, `newBusinessId` is only ever set inside `finish()` as an idempotency guard. The following patterns that checked `if (newBusinessId)` before performing actions are now gone:
- Step 6: `if (newBusinessId && boardViewName.trim()...` — removed in Task 4
- Step 7: `if (newBusinessId) { ... updateBusinessSettings ... }` — removed in Task 5

No additional cleanup needed unless `newBusinessId` state is referenced elsewhere in JSX (double-check with a search for `newBusinessId` after all tasks are done).

**Step 2: Confirm `inviteTeamMember` import is still used**

`inviteTeamMember` is now called inside `finish()` rather than inline. It's still imported and used — no change needed.

**Step 3: Final build check**

```bash
npm run build
```

Expected: clean build with zero TypeScript errors and zero warnings about unused variables.
