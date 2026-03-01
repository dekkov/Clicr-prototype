# Clicr Remote Tap Link — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a shareable button page (`/tap/[token]`) so a client can tap GUEST IN / GUEST OUT from their phone without logging in, controlled by a regeneratable token in the clicr settings modal.

**Architecture:** Token is stored in `button_config.tap_token` (existing Supabase JSONB column, no schema migration). A new public API route `/api/tap/[token]` looks up the device by token and calls the existing `apply_occupancy_delta` RPC. A public Next.js page at `/app/tap/[token]` shows two big tap buttons.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase (supabaseAdmin service role)

---

## Context

- Working directory: `/home/king/clicr-v4/.claude/worktrees/clicr-device-settings`
- Branch: `clicr-device-settings`
- Design doc: `docs/plans/2026-03-01-clicr-tap-link-design.md`
- `lib/types.ts` — type definitions for `Clicr`
- `app/(authenticated)/clicr/[id]/ClicrPanel.tsx` — settings modal lives here (lines 952–1063)
- `app/api/sync/route.ts` — reference for how `supabaseAdmin` and RPC calls work
- `lib/supabase-admin.ts` — exports `supabaseAdmin`
- No automated test infrastructure — verification is manual (run dev server and test in browser)

---

### Task 1: Add `tap_token` to the `Clicr` type

**Files:**
- Modify: `lib/types.ts:125-131`

**Step 1: Add `tap_token` field**

In `lib/types.ts`, find this block (around line 125):

```ts
    button_config?: {
        auto_reset?: {
            enabled: boolean;
            time: string;     // "HH:MM" 24-hour format
            timezone: string; // IANA timezone e.g. "America/New_York"
        };
    };
```

Replace with:

```ts
    button_config?: {
        auto_reset?: {
            enabled: boolean;
            time: string;     // "HH:MM" 24-hour format
            timezone: string; // IANA timezone e.g. "America/New_York"
        };
        tap_token?: string;  // Random token for public /tap/[token] page
    };
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: same pre-existing errors as before, no new ones.

**Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add tap_token to Clicr.button_config type"
```

---

### Task 2: Add Remote Tap Link section to settings modal

**Files:**
- Modify: `app/(authenticated)/clicr/[id]/ClicrPanel.tsx`

**Context:** The settings modal JSX spans lines 952–1063. The Cancel/Save buttons are at lines 1043–1059. We need to:
1. Add a `generateTapToken` function (after `saveConfig` at line 278)
2. Add the "Remote Tap Link" UI section just before the Cancel/Save buttons (before line 1043)

**Step 1: Add `generateTapToken` function**

After the closing brace of `saveConfig` (after line 278), add:

```tsx
    const generateTapToken = async () => {
        if (!clicr) return;
        const token = Math.random().toString(36).slice(2, 10);
        await updateClicr({
            ...clicr,
            button_config: { ...(clicr.button_config ?? {}), tap_token: token },
        });
    };
```

**Step 2: Add Remote Tap Link UI section**

Find this exact line (around line 1042) — the closing `</div>` of the auto-reset block just before the Cancel/Save button grid:

```tsx
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2">
```

Insert the following between them:

```tsx
                            {/* Remote Tap Link */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Remote Tap Link</label>
                                {clicr.button_config?.tap_token ? (
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <input
                                                readOnly
                                                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/tap/${clicr.button_config.tap_token}`}
                                                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-400 text-xs font-mono focus:outline-none truncate"
                                            />
                                            <button
                                                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/tap/${clicr.button_config!.tap_token}`)}
                                                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors shrink-0"
                                            >
                                                Copy
                                            </button>
                                        </div>
                                        <button
                                            onClick={generateTapToken}
                                            className="w-full py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-400 text-xs font-bold transition-colors"
                                        >
                                            Regenerate Link
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={generateTapToken}
                                        className="w-full py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-white text-white text-xs font-bold transition-colors"
                                    >
                                        Generate Link
                                    </button>
                                )}
                            </div>

```

**Step 3: Also update `saveConfig` to preserve `tap_token` when saving**

`saveConfig` currently does:
```tsx
button_config: { auto_reset: autoReset }
```

This would wipe `tap_token` on save. Replace with:

```tsx
button_config: { ...(clicr.button_config ?? {}), auto_reset: autoReset }
```

Find the exact old string:
```tsx
            button_config: { auto_reset: autoReset }
```
Replace with:
```tsx
            button_config: { ...(clicr.button_config ?? {}), auto_reset: autoReset }
```

**Step 4: Verify in browser**

- Open settings modal on a clicr device
- Click "Generate Link" → URL appears, token stored
- Click "Copy" → URL copied to clipboard
- Click "Regenerate Link" → new URL appears, old one will 404
- Click "Save Changes" → reopen settings → tap_token still present (not wiped)

**Step 5: Commit**

```bash
git add app/\(authenticated\)/clicr/\[id\]/ClicrPanel.tsx
git commit -m "feat: add Remote Tap Link section to clicr settings modal"
```

---

### Task 3: Create public API route `/api/tap/[token]`

**Files:**
- Create: `app/api/tap/[token]/route.ts`

**Context:** Look at `app/api/sync/route.ts` for how `supabaseAdmin` and `apply_occupancy_delta` are used. The RPC signature is:
```ts
supabaseAdmin.rpc('apply_occupancy_delta', {
    p_business_id: string,
    p_venue_id: string,
    p_area_id: string,
    p_delta: number,        // +1 or -1
    p_source: string,       // 'manual'
    p_device_id: null,
    p_gender: null,
    p_idempotency_key: string | null
})
```

**Step 1: Create the directory and file**

Create `app/api/tap/[token]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

async function lookupDevice(token: string) {
    const { data, error } = await supabaseAdmin
        .from('devices')
        .select('id, name, area_id, business_id, direction_mode, button_config')
        .eq('button_config->>tap_token', token)
        .is('deleted_at', null)
        .single();

    if (error || !data) return null;
    return data;
}

// GET — return device info for the tap page to display
export async function GET(
    _req: Request,
    { params }: { params: { token: string } }
) {
    const device = await lookupDevice(params.token);
    if (!device) {
        return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
    }

    // Look up venue_id from the area
    const { data: area } = await supabaseAdmin
        .from('areas')
        .select('venue_id')
        .eq('id', device.area_id)
        .single();

    return NextResponse.json({
        name: device.name,
        direction_mode: device.direction_mode ?? 'bidirectional',
        venue_id: area?.venue_id ?? null,
    });
}

// POST — record a tap event
export async function POST(
    req: Request,
    { params }: { params: { token: string } }
) {
    const { direction } = await req.json() as { direction: 'IN' | 'OUT' };

    if (direction !== 'IN' && direction !== 'OUT') {
        return NextResponse.json({ error: 'direction must be IN or OUT' }, { status: 400 });
    }

    const device = await lookupDevice(params.token);
    if (!device) {
        return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
    }

    // Look up venue_id from the area
    const { data: area } = await supabaseAdmin
        .from('areas')
        .select('venue_id')
        .eq('id', device.area_id)
        .single();

    if (!area?.venue_id) {
        return NextResponse.json({ error: 'Device not assigned to a venue' }, { status: 422 });
    }

    const delta = direction === 'IN' ? 1 : -1;

    const { error: rpcError } = await supabaseAdmin.rpc('apply_occupancy_delta', {
        p_business_id: device.business_id,
        p_venue_id: area.venue_id,
        p_area_id: device.area_id,
        p_delta: delta,
        p_source: 'manual',
        p_device_id: null,
        p_gender: null,
        p_idempotency_key: `tap-${params.token}-${Date.now()}`,
    });

    if (rpcError) {
        console.error('[tap] RPC error:', rpcError);
        return NextResponse.json({ error: 'Failed to record tap' }, { status: 500 });
    }

    return NextResponse.json({ success: true, delta });
}
```

**Step 2: Check TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

**Step 3: Quick manual test**

With the dev server running on port 3002:

1. Generate a tap link from settings modal — note the token (e.g. `abc12345`)
2. `curl http://localhost:3002/api/tap/abc12345` → should return `{ name, direction_mode, venue_id }`
3. `curl -X POST http://localhost:3002/api/tap/abc12345 -H "Content-Type: application/json" -d '{"direction":"IN"}'` → should return `{ success: true, delta: 1 }`
4. Check the clicr panel — count should have gone up by 1

**Step 4: Commit**

```bash
git add app/api/tap/
git commit -m "feat: add public /api/tap/[token] route for remote tap events"
```

---

### Task 4: Create public tap page `/app/tap/[token]/page.tsx`

**Files:**
- Create: `app/tap/[token]/page.tsx`

**Context:** This is outside `(authenticated)` so no login is required. Next.js App Router — use `"use client"` and `useParams()` to read the token. Style matches the ClicrPanel aesthetic (black background, large buttons).

**Step 1: Create `app/tap/[token]/page.tsx`**

```tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

type DeviceInfo = {
    name: string;
    direction_mode: 'in_only' | 'out_only' | 'bidirectional';
    venue_id: string | null;
};

type TapState = 'idle' | 'loading' | 'success_in' | 'success_out' | 'error';

export default function TapPage() {
    const { token } = useParams<{ token: string }>();
    const [device, setDevice] = useState<DeviceInfo | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [tapState, setTapState] = useState<TapState>('idle');

    useEffect(() => {
        fetch(`/api/tap/${token}`)
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then((d: DeviceInfo) => setDevice(d))
            .catch(() => setNotFound(true));
    }, [token]);

    const tap = async (direction: 'IN' | 'OUT') => {
        setTapState('loading');
        try {
            const res = await fetch(`/api/tap/${token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ direction }),
            });
            if (!res.ok) throw new Error();
            setTapState(direction === 'IN' ? 'success_in' : 'success_out');
            setTimeout(() => setTapState('idle'), 1200);
        } catch {
            setTapState('error');
            setTimeout(() => setTapState('idle'), 2000);
        }
    };

    if (notFound) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-6">
                <div className="text-center space-y-3">
                    <p className="text-2xl font-bold text-white">Link not found</p>
                    <p className="text-slate-500 text-sm">This link may have been regenerated or is invalid.</p>
                </div>
            </div>
        );
    }

    if (!device) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
        );
    }

    const showIn = device.direction_mode !== 'out_only';
    const showOut = device.direction_mode !== 'in_only';
    const isLoading = tapState === 'loading';

    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 gap-6">
            <div className="text-center">
                <p className="text-slate-500 text-xs uppercase tracking-widest font-bold mb-1">Counter</p>
                <h1 className="text-2xl font-bold text-white">{device.name}</h1>
            </div>

            {tapState === 'error' && (
                <p className="text-red-400 text-sm font-semibold">Something went wrong. Try again.</p>
            )}

            <div className="w-full max-w-xs space-y-4">
                {showIn && (
                    <button
                        onClick={() => tap('IN')}
                        disabled={isLoading}
                        className="w-full py-8 rounded-3xl bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white text-2xl font-black tracking-wide transition-all shadow-xl"
                    >
                        {tapState === 'success_in' ? '✓ Checked In' : 'GUEST IN'}
                    </button>
                )}
                {showOut && (
                    <button
                        onClick={() => tap('OUT')}
                        disabled={isLoading}
                        className="w-full py-8 rounded-3xl bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 text-white text-2xl font-black tracking-wide transition-all shadow-xl"
                    >
                        {tapState === 'success_out' ? '✓ Checked Out' : 'GUEST OUT'}
                    </button>
                )}
            </div>
        </div>
    );
}
```

**Step 2: Verify in browser**

1. Open settings modal → generate a link → copy it
2. Open the link in a new tab (or incognito) → device name shows, two buttons visible
3. Tap GUEST IN → button flashes "✓ Checked In" for 1.2s → count on operator's panel goes up
4. Tap GUEST OUT → count goes down
5. Open `/tap/invalidtoken` → "Link not found" message

**Step 3: Commit**

```bash
git add app/tap/
git commit -m "feat: add public /tap/[token] page for remote guest counting"
```

---

## Done

All 4 tasks complete. The operator can:
1. Open clicr settings → Generate Link → Copy
2. Send the URL to the client
3. Client taps GUEST IN / GUEST OUT from their phone
4. Counts update in real time on the operator's dashboard
5. If link leaks → Regenerate → old URL 404s immediately
