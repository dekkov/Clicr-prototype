# Delete Business Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow OWNER-only deletion of a business with a typed-name confirmation modal, wiping all data via Postgres CASCADE.

**Architecture:** New `deleteBusiness` server action in `setup-actions.ts` (server-side OWNER check + single DELETE on `businesses` table; Postgres CASCADE handles all child rows). UI is an inline modal in `settings/page.tsx` — no new files needed. After deletion, `clearBusiness()` + redirect to `/onboarding/setup`.

**Tech Stack:** Next.js 16 server actions, `supabaseAdmin` (bypasses RLS), React state for modal, Lucide React icons, Tailwind CSS 4.

---

### Task 1: Add `deleteBusiness` Server Action

**Files:**
- Modify: `app/onboarding/setup-actions.ts`

**Context:**

`setup-actions.ts` already has `createBusinessVenueAndAreas` and `updateBusinessSettings` using `supabaseAdmin`. All child tables (`venues`, `areas`, `devices`, `occupancy_events`, `id_scans`, `patron_bans`, etc.) reference `businesses(id) ON DELETE CASCADE` — a single DELETE on the businesses row wipes everything.

The server action must re-verify the caller is OWNER server-side (never trust the client role).

**Step 1: Add the function at the end of `app/onboarding/setup-actions.ts`**

```ts
export type DeleteBusinessResult = { success: true } | { success: false; error: string };

export async function deleteBusiness(businessId: string): Promise<DeleteBusinessResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Server-side OWNER check — never trust client role
    const { data: membership, error: memberError } = await supabaseAdmin
        .from('business_members')
        .select('role')
        .eq('business_id', businessId)
        .eq('user_id', user.id)
        .single();

    if (memberError || !membership) {
        return { success: false, error: 'Business not found or access denied' };
    }
    if (membership.role !== 'OWNER') {
        return { success: false, error: 'Only the business owner can delete the business' };
    }

    try {
        const { error } = await supabaseAdmin
            .from('businesses')
            .delete()
            .eq('id', businessId);

        if (error) throw error;

        revalidatePath('/dashboard');
        return { success: true };
    } catch (e: any) {
        console.error('[setup] deleteBusiness error:', e);
        return { success: false, error: e.message || 'Failed to delete business' };
    }
}
```

**Step 2: Verify TypeScript**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no errors related to `deleteBusiness`.

---

### Task 2: Add Delete Modal + Danger Zone to Settings Page

**Files:**
- Modify: `app/(authenticated)/settings/page.tsx`

**Context:**

Settings page already imports `useRouter` — actually it does NOT currently import it. Need to add. It uses `Link` from next/link and `useApp` for `business`, `currentUser`, `clearBusiness`. The Danger Zone section is only rendered when `currentUser?.role === 'OWNER'`.

**Step 1: Update imports**

Find the current imports at the top of `app/(authenticated)/settings/page.tsx`:

```ts
import React, { useState, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { Building2, Save, Users, ShieldAlert, Shield, ChevronRight, LayoutGrid } from 'lucide-react';
import { Role } from '@/lib/types';
import Link from 'next/link';
import { canManageSettings } from '@/lib/permissions';
```

Replace with:

```ts
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { Building2, Save, Users, ShieldAlert, Shield, ChevronRight, LayoutGrid, Trash2, X, AlertTriangle } from 'lucide-react';
import { Role } from '@/lib/types';
import Link from 'next/link';
import { canManageSettings } from '@/lib/permissions';
import { deleteBusiness } from '@/app/onboarding/setup-actions';
```

**Step 2: Add router and modal state**

Find the line:

```ts
export default function SettingsPage() {
    const { business, currentUser, venues, updateBusiness, refreshState } = useApp();
    const [businessName, setBusinessName] = useState(business?.name ?? '');
```

Replace with:

```ts
export default function SettingsPage() {
    const router = useRouter();
    const { business, currentUser, venues, updateBusiness, refreshState, clearBusiness } = useApp();
    const [businessName, setBusinessName] = useState(business?.name ?? '');
```

Then after the existing `const [saved, setSaved] = useState(false);` line, add:

```ts
    // Delete business modal state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const canDelete = deleteConfirmText === business?.name;

    const handleDeleteBusiness = async () => {
        if (!business || !canDelete) return;
        setIsDeleting(true);
        setDeleteError(null);
        const result = await deleteBusiness(business.id);
        if (!result.success) {
            setDeleteError(result.error);
            setIsDeleting(false);
            return;
        }
        clearBusiness();
        router.push('/onboarding/setup');
    };
```

**Step 3: Add Danger Zone section and modal to the JSX**

Find the closing `</div>` of the entire return (the last `</div>` before the final `);`). It currently looks like:

```tsx
            {/* Business Information */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                ...
            </div>
        </div>
    );
}
```

After the Business Information closing `</div>`, and before the outer container's closing `</div>`, add:

```tsx
            {/* Danger Zone — OWNER only */}
            {currentUser?.role === 'OWNER' && (
                <div className="border border-red-900/50 rounded-xl p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-red-900/20 border border-red-500/20 flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-red-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Danger Zone</h2>
                            <p className="text-sm text-gray-500">Irreversible actions — proceed with caution.</p>
                        </div>
                    </div>
                    <div className="flex items-center justify-between bg-gray-950/50 border border-gray-800 rounded-lg p-4">
                        <div>
                            <p className="font-medium text-white text-sm">Delete this business</p>
                            <p className="text-xs text-gray-500 mt-0.5">Permanently deletes all venues, areas, devices, scans, bans, and reports.</p>
                        </div>
                        <button
                            onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(''); setDeleteError(null); }}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-900/20 border border-red-500/30 text-red-400 hover:bg-red-900/40 hover:border-red-500/50 text-sm font-medium transition-all"
                        >
                            <Trash2 className="w-4 h-4" /> Delete Business
                        </button>
                    </div>
                </div>
            )}

            {/* Delete confirmation modal */}
            {showDeleteModal && business && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-5 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-red-900/20 border border-red-500/20 flex items-center justify-center shrink-0">
                                    <AlertTriangle className="w-5 h-5 text-red-400" />
                                </div>
                                <h3 className="text-lg font-bold text-white">Delete business</h3>
                            </div>
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="p-1 text-gray-500 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-sm text-gray-400">
                            This will <span className="text-white font-medium">permanently delete</span> <span className="text-red-400 font-medium">{business.name}</span> and all associated data — venues, areas, devices, scans, bans, and reports. This cannot be undone.
                        </p>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block">
                                Type <span className="text-white font-mono">{business.name}</span> to confirm
                            </label>
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={e => setDeleteConfirmText(e.target.value)}
                                placeholder={business.name}
                                autoFocus
                                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-red-500/40 focus:border-red-500 outline-none text-sm"
                            />
                        </div>

                        {deleteError && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                                {deleteError}
                            </div>
                        )}

                        <div className="flex gap-3 pt-1">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                disabled={isDeleting}
                                className="flex-1 py-3 border border-gray-700 text-gray-400 hover:text-white rounded-xl font-medium transition-all disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteBusiness}
                                disabled={!canDelete || isDeleting}
                                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Deleting…
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-4 h-4" /> Delete forever
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
```

**Step 4: Verify TypeScript**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: clean build, no TypeScript errors.

**Step 5: Manual test**

1. Log in as OWNER → go to `/settings` → Danger Zone section visible at bottom
2. Log in as ADMIN → go to `/settings` → Danger Zone section NOT visible
3. As OWNER: click "Delete Business" → modal opens, Delete button disabled
4. Type the business name wrong → button stays disabled
5. Type the business name exactly (case-sensitive) → button enables
6. Click "Delete forever" → spinner shows → redirects to `/onboarding/setup`
7. Verify in Supabase dashboard: business row gone, all child rows gone (venues, areas, devices, etc.)
8. Press Cancel during typing → modal closes, no deletion
