# Turnaround Tracking & Display — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface turnaround data (already recorded to DB) in the dashboard Traffic Flow section and venue page, and fix the sync gap so turnarounds persist across page refreshes.

**Architecture:** Turnarounds are venue-counter only. The DB table, RPC, and recording flow already work. We add a turnarounds query to the sync API response, then consume the synced array in two UI locations: the dashboard's TrafficFlow funnel and the venue page's Overview/Logs tabs.

**Tech Stack:** Next.js App Router, React 19, Supabase (PostgreSQL), TypeScript, Recharts, Lucide React

---

### Task 1: Sync turnarounds from server

**Files:**
- Modify: `lib/sync-data.ts:35-53` (add turnarounds to DBData type)
- Modify: `app/api/sync/route.ts:262-316` (query turnarounds table, add to response)
- Modify: `lib/store.tsx:298-311` (populate turnarounds from sync response)

**Step 1: Add turnarounds to DBData type**

In `lib/sync-data.ts`, add the import and field:

```typescript
// Add to imports (line 6-23):
import type {
    // ...existing imports...
    TurnaroundEvent,
} from './types';

// Add to DBData type (after line 52 "tickets"):
    turnarounds: TurnaroundEvent[];

// Add to createInitialDBData() return (after line 73 "tickets"):
        turnarounds: [],
```

**Step 2: Query turnarounds in buildSyncResponse**

In `app/api/sync/route.ts`, after the `filteredScans` line (line 268), add:

```typescript
    // Turnarounds — today only, scoped to visible venues
    let filteredTurnarounds: any[] = [];
    if (activeBizId) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const { data: turnaroundRows } = await supabaseAdmin
            .from('turnarounds')
            .select('*')
            .eq('business_id', activeBizId)
            .gte('created_at', todayStart.toISOString())
            .order('created_at', { ascending: false });

        filteredTurnarounds = (turnaroundRows || [])
            .filter((t: any) => !t.venue_id || visibleVenueIds.includes(t.venue_id))
            .map((t: any) => ({
                id: t.id,
                timestamp: new Date(t.created_at).getTime(),
                business_id: t.business_id,
                venue_id: t.venue_id || undefined,
                area_id: t.area_id || undefined,
                device_id: t.device_id || undefined,
                count: t.count,
                reason: t.reason || undefined,
                created_by: t.created_by,
            }));
    }
```

Then add `turnarounds: filteredTurnarounds` to the return object (line 305-316), alongside `scanEvents`:

```typescript
    return {
        ...hydrated,
        // ...existing fields...
        scanEvents: filteredScans,
        turnarounds: filteredTurnarounds,
        // ...rest...
    };
```

**Step 3: Populate turnarounds from sync in store**

In `lib/store.tsx`, in the `setState` callback inside `refreshState()` (around line 298-311), add turnarounds to the state update. After the `scanEvents` line (305):

```typescript
                        turnarounds: data.turnarounds || [],
```

**Step 4: Verify turnarounds survive page refresh**

- Record a turnaround via ClicrPanel button
- Refresh the page
- Check React DevTools or console: `turnarounds` array in AppState should still contain the event

**Step 5: Commit**

```bash
git add lib/sync-data.ts app/api/sync/route.ts lib/store.tsx
git commit -m "fix: sync turnarounds from server on page load"
```

---

### Task 2: Add turnarounds to Dashboard Traffic Flow

**Files:**
- Modify: `app/(authenticated)/dashboard/page.tsx:277-329` (TrafficFlow component)
- Modify: `app/(authenticated)/dashboard/page.tsx:492-505` (useApp destructure)
- Modify: `app/(authenticated)/dashboard/page.tsx:919-929` (TrafficFlow usage)

**Step 1: Add turnarounds to useApp destructure**

In `app/(authenticated)/dashboard/page.tsx`, add `turnarounds` to the useApp() destructure (around line 494):

```typescript
    const {
        // ...existing...
        turnarounds,
    } = useApp();
```

**Step 2: Compute turnaround metrics**

After the `activeBansCount` useMemo (around line 595), add:

```typescript
    const totalTurnarounds = useMemo(
        () => (turnarounds || [])
            .filter(t => t.timestamp >= todayStart)
            .reduce((sum, t) => sum + t.count, 0),
        [turnarounds, todayStart]
    );

    const netAdjusted = useMemo(
        () => Math.max(0, totalEntries - totalTurnarounds),
        [totalEntries, totalTurnarounds]
    );
```

**Step 3: Update TrafficFlow component props and funnel rows**

Update the `TrafficFlow` component type signature (line 277-283) to accept new props:

```typescript
const TrafficFlow = ({
    totalEntries, totalScans, accepted, denied, banned, netOcc, areaDistrib,
    turnarounds, netAdjusted,
}: {
    totalEntries: number; totalScans: number; accepted: number;
    denied: number; banned: number; netOcc: number;
    areaDistrib: { name: string; count: number; pct: number }[];
    turnarounds: number; netAdjusted: number;
}) => {
```

Update `funnelRows` array (line 285-292) — insert two rows before "Net Occupancy":

```typescript
    const funnelRows = [
        { label: 'Total Entries', value: totalEntries, color: 'bg-indigo-500', textColor: 'text-white' },
        { label: 'IDs Scanned', value: totalScans, color: 'bg-indigo-400', textColor: 'text-white' },
        { label: 'Accepted', value: accepted, color: 'bg-emerald-500', textColor: 'text-emerald-300' },
        { label: 'Denied', value: denied, color: 'bg-orange-500', textColor: 'text-orange-300' },
        { label: 'Banned', value: banned, color: 'bg-red-500', textColor: 'text-red-300' },
        { label: 'Turnarounds', value: turnarounds, color: 'bg-amber-500', textColor: 'text-amber-300' },
        { label: 'Net Entries', value: netAdjusted, color: 'bg-teal-500', textColor: 'text-teal-300' },
        { label: 'Net Occupancy', value: netOcc, color: 'bg-cyan-500', textColor: 'text-cyan-300' },
    ];
```

**Step 4: Pass new props to TrafficFlow**

Update the TrafficFlow usage (around line 921-929):

```typescript
                <TrafficFlow
                    totalEntries={totalEntries}
                    totalScans={totalScans}
                    accepted={totalScans - deniedCount}
                    denied={deniedCount}
                    banned={activeBansCount}
                    netOcc={liveOccupancy}
                    areaDistrib={areaDistribData}
                    turnarounds={totalTurnarounds}
                    netAdjusted={netAdjusted}
                />
```

**Step 5: Visual verify**

- Open dashboard with turnaround data present
- Traffic Flow funnel should show 8 rows including Turnarounds (amber) and Net Entries (teal)
- Net Entries = Total Entries - Turnarounds

**Step 6: Commit**

```bash
git add app/(authenticated)/dashboard/page.tsx
git commit -m "feat(dashboard): add turnarounds and net entries to Traffic Flow funnel"
```

---

### Task 3: Add turnaround KPI card to Venue Overview

**Files:**
- Modify: `app/(authenticated)/venues/[venueId]/_components/VenueOverview.tsx:1-130`

**Step 1: Add turnarounds to useApp and compute metrics**

Add `turnarounds` to the useApp destructure (line 21) and add `RotateCcw` to the lucide import:

```typescript
import {
    Users, Layers, MonitorSmartphone, Plus, Settings, LogIn, LogOut,
    RotateCcw
} from 'lucide-react';

// In the component:
const { venues, areas, clicrs, devices, events, turnarounds } = useApp();
```

After `trafficStats` useMemo (around line 42), add:

```typescript
    const turnaroundStats = useMemo(() => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const venueTurnarounds = (turnarounds || []).filter(
            t => t.venue_id === venueId && t.timestamp >= todayStart.getTime()
        );
        const total = venueTurnarounds.reduce((sum, t) => sum + t.count, 0);
        const netEntries = Math.max(0, trafficStats.ins - total);
        return { total, netEntries };
    }, [turnarounds, venueId, trafficStats.ins]);
```

**Step 2: Change grid to 5 columns and add KPI card**

Update the grid from `lg:grid-cols-4` to `lg:grid-cols-5` (line 100):

```typescript
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
```

Add the turnaround KPI card after the Exits card (after line 119, before the Active Zones card):

```typescript
                <KpiCard
                    title="Turnarounds"
                    value={turnaroundStats.total}
                    subtitle={`Net Entries: ${turnaroundStats.netEntries}`}
                    icon={RotateCcw}
                    className="bg-slate-900/50 border-slate-800 text-purple-400"
                />
```

Note: Check the KpiCard component props — if it doesn't support `subtitle`, use `trend` or add the subtitle text as the value detail. Read `components/ui/KpiCard.tsx` to verify available props.

**Step 3: Visual verify**

- Open a venue page, Overview tab
- 5 KPI cards: Live Occupancy, Entries, Exits, Turnarounds, Active Zones
- Turnarounds card shows count and "Net Entries: X"

**Step 4: Commit**

```bash
git add app/(authenticated)/venues/[venueId]/_components/VenueOverview.tsx
git commit -m "feat(venue): add turnaround KPI card to venue overview"
```

---

### Task 4: Show turnaround entries in Venue Logs

**Files:**
- Modify: `app/(authenticated)/venues/[venueId]/_components/VenueLogs.tsx:1-49`

**Step 1: Add turnarounds and users to the component**

Replace the component to merge turnarounds into the log list:

```typescript
"use client";

import React, { useMemo } from 'react';
import { useApp } from '@/lib/store';
import { FileText, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function VenueLogs({ venueId }: { venueId: string }) {
    const { venueAuditLogs, turnarounds, users } = useApp();

    const userMap = useMemo(() => {
        const m: Record<string, string> = {};
        (users || []).forEach(u => { m[u.id] = u.name || u.email; });
        return m;
    }, [users]);

    // Merge audit logs + turnarounds into a single timeline
    const allEntries = useMemo(() => {
        const auditEntries = venueAuditLogs
            .filter(l => l.venue_id === venueId)
            .map(l => ({
                id: l.id,
                type: 'AUDIT' as const,
                action: l.action.replace(/_/g, ' '),
                userId: l.performed_by_user_id,
                timestamp: new Date(l.timestamp).getTime(),
                details: l.details_json,
            }));

        const turnaroundEntries = (turnarounds || [])
            .filter(t => t.venue_id === venueId)
            .map(t => ({
                id: t.id,
                type: 'TURNAROUND' as const,
                action: 'TURNAROUND',
                userId: t.created_by,
                timestamp: t.timestamp,
                details: { count: t.count, reason: t.reason },
            }));

        return [...auditEntries, ...turnaroundEntries]
            .sort((a, b) => b.timestamp - a.timestamp);
    }, [venueAuditLogs, turnarounds, venueId]);

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold">Audit Logs</h2>
            <div className="space-y-4">
                {allEntries.length === 0 && (
                    <div className="p-8 text-center bg-slate-900/30 rounded-2xl border border-slate-800 border-dashed">
                        <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm">No audit logs recorded yet.</p>
                    </div>
                )}
                {allEntries.map(entry => (
                    <div key={entry.id} className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                                {entry.type === 'TURNAROUND' && (
                                    <RotateCcw className="w-4 h-4 text-purple-400 shrink-0" />
                                )}
                                <span className={cn(
                                    "text-sm font-bold px-2 py-0.5 rounded",
                                    entry.type === 'TURNAROUND'
                                        ? "bg-purple-900/50 text-purple-300"
                                        : "bg-slate-800 text-white"
                                )}>
                                    {entry.action}
                                </span>
                                <span className="text-slate-400 text-sm">
                                    by {userMap[entry.userId] || 'Unknown'}
                                </span>
                            </div>
                            <span className="text-xs text-slate-500">
                                {new Date(entry.timestamp).toLocaleString()}
                            </span>
                        </div>
                        {entry.details && (
                            <pre className="mt-2 text-[10px] text-slate-500 bg-black/30 p-2 rounded overflow-x-auto">
                                {JSON.stringify(entry.details, null, 2)}
                            </pre>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
```

**Step 2: Visual verify**

- Open a venue page, Logs tab
- Turnaround entries appear with purple badge and RotateCcw icon
- Audit logs and turnarounds are interleaved by timestamp (newest first)
- Each entry shows user name (not raw ID)

**Step 3: Commit**

```bash
git add app/(authenticated)/venues/[venueId]/_components/VenueLogs.tsx
git commit -m "feat(venue): show turnaround entries in venue logs tab"
```
