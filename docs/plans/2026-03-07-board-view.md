# Board View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a multi-counter Board View accessible from the Clicrs and Areas pages, with auto area boards, custom boards, and full M/F counting per tile.

**Architecture:** Board View is a client-side composition layer over existing store data. Auto area boards are derived at render time (not stored). Custom boards use the existing `board_views` Supabase table. All counting goes through the existing `recordEvent()` flow. No new APIs or adapters needed.

**Tech Stack:** Next.js App Router, React 19, Tailwind CSS, Framer Motion, Lucide React, existing `useApp()` store.

**Design doc:** `docs/plans/2026-03-07-board-view-design.md`

---

### Task 1: Move board-actions.ts to shared location

**Files:**
- Move: `app/(authenticated)/settings/board-actions.ts` -> `app/actions/board.ts`
- Modify: `app/board/[id]/page.tsx` (update import)

**Step 1: Create `app/actions/board.ts`**

Copy `app/(authenticated)/settings/board-actions.ts` to `app/actions/board.ts`. Contents stay identical.

**Step 2: Add `updateBoardView` to `app/actions/board.ts`**

Add this new server action after `deleteBoardView`:

```ts
export async function updateBoardView(
    boardId: string,
    businessId: string,
    updates: { name?: string; device_ids?: string[]; labels?: Record<string, string> }
): Promise<BoardResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
        const { data, error } = await supabaseAdmin
            .from('board_views')
            .update(updates)
            .eq('id', boardId)
            .eq('business_id', businessId)
            .select()
            .single();

        if (error) throw error;
        return { success: true, boardView: data as BoardView };
    } catch (e: any) {
        console.error('[board] updateBoardView error:', e);
        return { success: false, error: e.message || 'Failed to update board view' };
    }
}
```

**Step 3: Update import in `app/board/[id]/page.tsx`**

Change line 5:
```ts
// from:
import { getBoardView } from '@/app/(authenticated)/settings/board-actions';
// to:
import { getBoardView } from '@/app/actions/board';
```

**Step 4: Delete old file**

Delete `app/(authenticated)/settings/board-actions.ts`.

**Step 5: Verify build**

Run: `npx next build 2>&1 | head -30` — or `npx next lint` to check for broken imports.

**Step 6: Commit**

```
feat(board): move board actions to shared location, add updateBoardView
```

---

### Task 2: Create the BoardTile component

This is the core reusable counter tile used in every board view.

**Files:**
- Create: `components/board/BoardTile.tsx`

**Step 1: Create `components/board/BoardTile.tsx`**

```tsx
"use client";

import React from 'react';
import { cn } from '@/lib/utils';
import type { Clicr, Area } from '@/lib/types';

type BoardTileProps = {
    clicr: Clicr;
    area: Area | undefined;
    label?: string; // custom label override
    onTap: (clicrId: string, delta: number, gender: 'M' | 'F') => void;
};

export function BoardTile({ clicr, area, label, onTap }: BoardTileProps) {
    const displayLabel = label || clicr.name;
    const occupancy = area?.current_occupancy ?? 0;
    const capacity = area?.capacity_max ?? area?.default_capacity ?? null;
    const pct = capacity && capacity > 0
        ? Math.min(100, Math.round((occupancy / capacity) * 100))
        : null;

    const barColor = pct === null ? 'bg-slate-600'
        : pct >= 100 ? 'bg-red-500'
        : pct >= 90 ? 'bg-red-400'
        : pct >= 80 ? 'bg-amber-400'
        : 'bg-emerald-500';

    const handleTap = (delta: number, gender: 'M' | 'F') => {
        if (navigator.vibrate) navigator.vibrate(50);
        onTap(clicr.id, delta, gender);
    };

    return (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col items-center justify-center p-6 min-h-[220px]">
            {/* Label */}
            <div className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 text-center truncate max-w-full">
                {displayLabel}
            </div>

            {/* Count */}
            <div className="text-6xl md:text-8xl font-black tabular-nums text-primary leading-none mb-2">
                {occupancy}
            </div>

            {/* Capacity bar */}
            <div className="w-full max-w-[200px] mb-4">
                <div className="text-xs text-slate-500 text-center mb-1">
                    {capacity ? `of ${capacity} · ${pct}% full` : 'No capacity set'}
                </div>
                {capacity && (
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className={cn("h-full rounded-full transition-all", barColor)}
                            style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
                        />
                    </div>
                )}
            </div>

            {/* 4 tap buttons: +M +F / -M -F */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-[200px]">
                <button
                    onClick={() => handleTap(1, 'M')}
                    className="py-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-sm font-bold border border-emerald-500/30 active:scale-95 transition-all"
                >
                    +M
                </button>
                <button
                    onClick={() => handleTap(1, 'F')}
                    className="py-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-sm font-bold border border-emerald-500/30 active:scale-95 transition-all"
                >
                    +F
                </button>
                <button
                    onClick={() => handleTap(-1, 'M')}
                    className="py-2.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-bold border border-red-500/30 active:scale-95 transition-all"
                >
                    -M
                </button>
                <button
                    onClick={() => handleTap(-1, 'F')}
                    className="py-2.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-bold border border-red-500/30 active:scale-95 transition-all"
                >
                    -F
                </button>
            </div>
        </div>
    );
}
```

**Step 2: Verify no build errors**

Run: `npx next lint`

**Step 3: Commit**

```
feat(board): create BoardTile component with M/F counting and capacity bar
```

---

### Task 3: Create the Board View page

**Files:**
- Create: `app/(authenticated)/clicr/board/[id]/page.tsx`

This page handles both custom boards (`/clicr/board/[boardId]`) and auto area boards (`/clicr/board/area-[areaId]`). Distinguish by checking if the id starts with `area-`.

**Step 1: Create the page**

```tsx
"use client";

import React, { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Maximize, Settings2 } from 'lucide-react';
import { useApp } from '@/lib/store';
import { BoardTile } from '@/components/board/BoardTile';
import { getBoardView, updateBoardView, deleteBoardView } from '@/app/actions/board';
import type { BoardView, Clicr, Area } from '@/lib/types';
import { getVenueCapacityRules } from '@/lib/capacity';
import BoardEditModal from './_components/BoardEditModal';

type ResolvedTile = {
    clicr: Clicr;
    area: Area | undefined;
    label?: string;
};

export default function BoardViewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { clicrs, areas, venues, recordEvent, currentUser, business } = useApp();
    const isAutoBoard = id.startsWith('area-');
    const autoAreaId = isAutoBoard ? id.replace('area-', '') : null;

    const [boardView, setBoardView] = useState<BoardView | null>(null);
    const [loading, setLoading] = useState(!isAutoBoard);
    const [showEdit, setShowEdit] = useState(false);

    // Load custom board from DB
    useEffect(() => {
        if (isAutoBoard) return;
        (async () => {
            const view = await getBoardView(id);
            setBoardView(view);
            setLoading(false);
        })();
    }, [id, isAutoBoard]);

    // Resolve tiles
    const tiles: ResolvedTile[] = (() => {
        if (isAutoBoard) {
            const areaClicrs = clicrs.filter(c => c.area_id === autoAreaId && c.active);
            const area = areas.find(a => a.id === autoAreaId);
            return areaClicrs.map(c => ({ clicr: c, area, label: c.name }));
        }
        if (!boardView) return [];
        return boardView.device_ids.map(did => {
            const clicr = clicrs.find(c => c.id === did);
            if (!clicr) return null;
            const area = areas.find(a => a.id === clicr.area_id);
            return { clicr, area, label: boardView.labels[did] || clicr.name };
        }).filter(Boolean) as ResolvedTile[];
    })();

    // Board name
    const boardName = isAutoBoard
        ? areas.find(a => a.id === autoAreaId)?.name || 'Area Board'
        : boardView?.name || 'Board View';

    // Venue/area subtitle
    const subtitle = (() => {
        if (isAutoBoard) {
            const area = areas.find(a => a.id === autoAreaId);
            const venue = venues.find(v => v.id === area?.venue_id);
            return venue ? `${venue.name}` : '';
        }
        if (tiles.length > 0) {
            const firstArea = tiles[0].area;
            const venue = venues.find(v => v.id === firstArea?.venue_id);
            return venue?.name || '';
        }
        return '';
    })();

    const handleTap = (clicrId: string, delta: number, gender: 'M' | 'F') => {
        const clicr = clicrs.find(c => c.id === clicrId);
        if (!clicr) return;
        const area = areas.find(a => a.id === clicr.area_id);
        const venueId = area?.venue_id || clicr.venue_id;
        if (!venueId) return;

        // Capacity check
        const venue = venues.find(v => v.id === venueId);
        if (delta > 0 && venue) {
            const { maxCapacity, mode: capMode } = getVenueCapacityRules(venue);
            if (maxCapacity > 0 && (venue.current_occupancy ?? 0) >= maxCapacity) {
                if (capMode === 'HARD_STOP') {
                    alert("CAPACITY REACHED: Entry Blocked");
                    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                    return;
                }
                if (capMode === 'MANAGER_OVERRIDE') {
                    if (!window.confirm("WARNING: Capacity Reached. Authorize Override?")) return;
                }
            }
        }

        recordEvent({
            venue_id: venueId,
            area_id: clicr.area_id,
            clicr_id: clicr.id,
            delta,
            flow_type: delta > 0 ? 'IN' : 'OUT',
            gender,
            event_type: 'TAP',
            idempotency_key: Math.random().toString(36),
        });
    };

    const handleFullscreen = () => {
        document.documentElement.requestFullscreen?.();
    };

    const handleSaveEdit = async (name: string, deviceIds: string[], labels: Record<string, string>) => {
        if (!boardView || !business) return;
        const result = await updateBoardView(boardView.id, business.id, { name, device_ids: deviceIds, labels });
        if (result.success && result.boardView) {
            setBoardView(result.boardView);
        }
        setShowEdit(false);
    };

    const handleDelete = async () => {
        if (!boardView || !business) return;
        if (!confirm('Delete this board view?')) return;
        await deleteBoardView(boardView.id, business.id);
        router.push('/clicr');
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-pulse text-primary text-lg font-bold">Loading board...</div>
            </div>
        );
    }

    if (!isAutoBoard && !boardView) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <p className="text-red-400">Board view not found</p>
                <button onClick={() => router.push('/clicr')} className="text-primary text-sm hover:text-emerald-400">
                    Back to Clicrs
                </button>
            </div>
        );
    }

    const gridCols = tiles.length <= 1 ? 'grid-cols-1 max-w-md mx-auto'
        : tiles.length === 2 ? 'grid-cols-2'
        : tiles.length === 3 ? 'grid-cols-3'
        : 'grid-cols-2';

    return (
        <div className="p-6 max-w-[1600px]">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <button onClick={() => router.push('/clicr')} className="text-slate-500 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-white">{boardName}</h1>
                        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!isAutoBoard && (
                        <button
                            onClick={() => setShowEdit(true)}
                            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                            title="Edit board"
                        >
                            <Settings2 className="w-5 h-5" />
                        </button>
                    )}
                    <button
                        onClick={handleFullscreen}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:text-white transition-colors"
                    >
                        <Maximize className="w-4 h-4" /> Fullscreen
                    </button>
                </div>
            </div>

            {/* Tile grid */}
            {tiles.length === 0 ? (
                <div className="text-center text-slate-500 py-12">
                    No counters in this board. {!isAutoBoard && 'Edit the board to add counters.'}
                </div>
            ) : (
                <div className={`grid ${gridCols} gap-4`}>
                    {tiles.map(tile => (
                        <BoardTile
                            key={tile.clicr.id}
                            clicr={tile.clicr}
                            area={tile.area}
                            label={tile.label}
                            onTap={handleTap}
                        />
                    ))}
                </div>
            )}

            {/* Edit modal (custom boards only) */}
            {showEdit && boardView && (
                <BoardEditModal
                    boardView={boardView}
                    clicrs={clicrs}
                    areas={areas}
                    venues={venues}
                    onSave={handleSaveEdit}
                    onDelete={handleDelete}
                    onClose={() => setShowEdit(false)}
                />
            )}
        </div>
    );
}
```

**Step 2: Verify route loads**

Run: `npx next lint`

**Step 3: Commit**

```
feat(board): create board view page with auto/custom board support
```

---

### Task 4: Create the BoardEditModal component

**Files:**
- Create: `app/(authenticated)/clicr/board/[id]/_components/BoardEditModal.tsx`

**Step 1: Create the modal**

```tsx
"use client";

import React, { useState } from 'react';
import { XCircle, Trash2, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BoardView, Clicr, Area, Venue } from '@/lib/types';

type Props = {
    boardView: BoardView;
    clicrs: Clicr[];
    areas: Area[];
    venues: Venue[];
    onSave: (name: string, deviceIds: string[], labels: Record<string, string>) => void;
    onDelete: () => void;
    onClose: () => void;
};

export default function BoardEditModal({ boardView, clicrs, areas, venues, onSave, onDelete, onClose }: Props) {
    const [name, setName] = useState(boardView.name);
    const [selectedIds, setSelectedIds] = useState<string[]>(boardView.device_ids);
    const [labels, setLabels] = useState<Record<string, string>>(boardView.labels || {});

    const toggleDevice = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id)
                ? prev.filter(d => d !== id)
                : prev.length < 5 ? [...prev, id] : prev
        );
    };

    const getAreaName = (areaId: string | null) => areas.find(a => a.id === areaId)?.name || '';
    const getVenueName = (areaId: string | null) => {
        const area = areas.find(a => a.id === areaId);
        return venues.find(v => v.id === area?.venue_id)?.name || '';
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1e2330] border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white">
                    <XCircle className="w-5 h-5" />
                </button>

                <h2 className="text-xl font-bold text-white mb-6">Edit Board View</h2>

                <div className="space-y-5">
                    {/* Name */}
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full bg-black/50 border border-slate-700 rounded-xl p-3 text-white placeholder:text-slate-600 focus:border-primary focus:outline-none mt-1.5"
                        />
                    </div>

                    {/* Select counters */}
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                            Counters <span className="text-slate-600">({selectedIds.length}/5)</span>
                        </label>
                        <div className="space-y-1.5 mt-1.5 max-h-48 overflow-y-auto">
                            {clicrs.filter(c => c.active).map(clicr => (
                                <button
                                    key={clicr.id}
                                    type="button"
                                    onClick={() => toggleDevice(clicr.id)}
                                    className={cn(
                                        "w-full flex items-center justify-between p-2.5 rounded-lg border text-left text-sm transition-all",
                                        selectedIds.includes(clicr.id)
                                            ? "bg-primary/10 border-primary"
                                            : "bg-slate-800 border-slate-700 hover:bg-slate-700"
                                    )}
                                >
                                    <div>
                                        <span className={selectedIds.includes(clicr.id) ? 'text-primary font-bold' : 'text-white'}>
                                            {clicr.name}
                                        </span>
                                        <span className="text-xs text-slate-500 ml-2">
                                            {getVenueName(clicr.area_id)} · {getAreaName(clicr.area_id)}
                                        </span>
                                    </div>
                                    {selectedIds.includes(clicr.id) && <Check className="w-4 h-4 text-primary" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Custom labels */}
                    {selectedIds.length > 0 && (
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                Custom Labels <span className="text-slate-600">(optional)</span>
                            </label>
                            <div className="space-y-1.5 mt-1.5">
                                {selectedIds.map(did => {
                                    const clicr = clicrs.find(c => c.id === did);
                                    return (
                                        <div key={did} className="flex items-center gap-2">
                                            <span className="text-sm text-slate-400 w-28 truncate">{clicr?.name}</span>
                                            <input
                                                type="text"
                                                value={labels[did] || ''}
                                                onChange={e => setLabels(prev => ({ ...prev, [did]: e.target.value }))}
                                                placeholder={clicr?.name || 'Label'}
                                                className="flex-1 bg-black/50 border border-slate-700 rounded-lg p-2 text-white text-sm placeholder:text-slate-600 focus:border-primary focus:outline-none"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Save */}
                    <button
                        onClick={() => onSave(name, selectedIds, labels)}
                        disabled={!name.trim() || selectedIds.length === 0}
                        className="w-full py-3 bg-primary text-black font-bold rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50"
                    >
                        Save Changes
                    </button>

                    {/* Danger zone */}
                    <div className="pt-3 border-t border-slate-800">
                        <button
                            onClick={onDelete}
                            className="flex items-center gap-2 text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
                        >
                            <Trash2 className="w-4 h-4" /> Delete this board view
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
```

**Step 2: Verify lint**

Run: `npx next lint`

**Step 3: Commit**

```
feat(board): create BoardEditModal for custom board editing
```

---

### Task 5: Create the BoardSelectPanel (slide-over)

**Files:**
- Create: `components/board/BoardSelectPanel.tsx`

**Step 1: Create the slide-over component**

```tsx
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus } from 'lucide-react';
import { useApp } from '@/lib/store';
import { listBoardViews, createBoardView } from '@/app/actions/board';
import type { BoardView } from '@/lib/types';
import BoardCreateModal from './BoardCreateModal';

type Props = {
    open: boolean;
    onClose: () => void;
};

export function BoardSelectPanel({ open, onClose }: Props) {
    const router = useRouter();
    const { activeBusiness, venues, areas, clicrs } = useApp();
    const [boards, setBoards] = useState<BoardView[]>([]);
    const [loading, setLoading] = useState(true);
    const [createForAreaId, setCreateForAreaId] = useState<string | null>(null);
    const [hoveredAreaId, setHoveredAreaId] = useState<string | null>(null);

    const loadBoards = useCallback(async () => {
        if (!activeBusiness) return;
        setLoading(true);
        const views = await listBoardViews(activeBusiness.id);
        setBoards(views);
        setLoading(false);
    }, [activeBusiness]);

    useEffect(() => {
        if (open) loadBoards();
    }, [open, loadBoards]);

    const navigateToBoard = (boardId: string) => {
        onClose();
        router.push(`/clicr/board/${boardId}`);
    };

    const navigateToAreaBoard = (areaId: string) => {
        onClose();
        router.push(`/clicr/board/area-${areaId}`);
    };

    const handleCreateSave = async (name: string, deviceIds: string[], labels: Record<string, string>) => {
        if (!activeBusiness) return;
        const result = await createBoardView(name, deviceIds, labels, activeBusiness.id);
        if (result.success && result.boardView) {
            setCreateForAreaId(null);
            onClose();
            router.push(`/clicr/board/${result.boardView.id}`);
        }
    };

    // Group areas by venue
    const venueGroups = venues.map(v => ({
        venue: v,
        areas: areas.filter(a => a.venue_id === v.id && a.is_active),
    })).filter(g => g.areas.length > 0);

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Overlay */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 z-40"
                        onClick={onClose}
                    />

                    {/* Panel */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#12151e] border-l border-slate-800 z-50 flex flex-col overflow-y-auto"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-slate-800">
                            <h2 className="text-xl font-bold text-white">Board View</h2>
                            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-8 flex-1">
                            {/* MY BOARDS */}
                            {boards.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">My Boards</h3>
                                    <div className="space-y-2">
                                        {boards.map(board => {
                                            // derive context: find first device's area/venue
                                            const firstClicr = clicrs.find(c => board.device_ids.includes(c.id));
                                            const firstArea = firstClicr ? areas.find(a => a.id === firstClicr.area_id) : null;
                                            const firstVenue = firstArea ? venues.find(v => v.id === firstArea.venue_id) : null;
                                            const context = [firstVenue?.name, firstArea?.name].filter(Boolean).join(' · ');

                                            return (
                                                <button
                                                    key={board.id}
                                                    onClick={() => navigateToBoard(board.id)}
                                                    className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-800 hover:border-slate-600 bg-slate-900/30 transition-all text-left"
                                                >
                                                    <div>
                                                        <div className="text-white font-bold">{board.name}</div>
                                                        {context && <div className="text-xs text-slate-500 mt-0.5">{context}</div>}
                                                    </div>
                                                    <span className="text-xs text-slate-600">{board.device_ids.length} clicker{board.device_ids.length !== 1 ? 's' : ''}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* BROWSE AREAS & CREATE */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Browse Areas & Create</h3>
                                <div className="space-y-6">
                                    {venueGroups.map(({ venue, areas: venueAreas }) => (
                                        <div key={venue.id}>
                                            <div className="text-sm text-slate-500 mb-2">{venue.name}</div>
                                            <div className="space-y-1.5">
                                                {venueAreas.map(area => {
                                                    const areaClicrCount = clicrs.filter(c => c.area_id === area.id && c.active).length;
                                                    return (
                                                        <div
                                                            key={area.id}
                                                            className="flex items-center justify-between p-3 rounded-xl border border-slate-800 hover:border-slate-600 transition-all group"
                                                            onMouseEnter={() => setHoveredAreaId(area.id)}
                                                            onMouseLeave={() => setHoveredAreaId(null)}
                                                        >
                                                            <button
                                                                onClick={() => navigateToAreaBoard(area.id)}
                                                                className="text-white font-medium text-sm text-left flex-1"
                                                            >
                                                                {area.name}
                                                            </button>
                                                            {hoveredAreaId === area.id ? (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setCreateForAreaId(area.id);
                                                                    }}
                                                                    className="text-xs text-primary font-bold hover:text-emerald-400 transition-colors"
                                                                >
                                                                    Create View +
                                                                </button>
                                                            ) : (
                                                                areaClicrCount > 0 && (
                                                                    <span className="text-xs text-slate-600">{areaClicrCount} device{areaClicrCount !== 1 ? 's' : ''}</span>
                                                                )
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Create modal */}
                    {createForAreaId && (
                        <BoardCreateModal
                            areaId={createForAreaId}
                            clicrs={clicrs}
                            areas={areas}
                            venues={venues}
                            onSave={handleCreateSave}
                            onClose={() => setCreateForAreaId(null)}
                        />
                    )}
                </>
            )}
        </AnimatePresence>
    );
}
```

**Step 2: Create `components/board/BoardCreateModal.tsx`**

```tsx
"use client";

import React, { useState } from 'react';
import { XCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Clicr, Area, Venue } from '@/lib/types';

type Props = {
    areaId: string;
    clicrs: Clicr[];
    areas: Area[];
    venues: Venue[];
    onSave: (name: string, deviceIds: string[], labels: Record<string, string>) => void;
    onClose: () => void;
};

export default function BoardCreateModal({ areaId, clicrs, areas, venues, onSave, onClose }: Props) {
    const area = areas.find(a => a.id === areaId);
    const venue = venues.find(v => v.id === area?.venue_id);
    const areaClicrs = clicrs.filter(c => c.area_id === areaId && c.active);
    const allClicrs = clicrs.filter(c => c.active);

    const [name, setName] = useState(area?.name || 'New Board');
    const [selectedIds, setSelectedIds] = useState<string[]>(areaClicrs.map(c => c.id));
    const [labels, setLabels] = useState<Record<string, string>>({});

    const toggleDevice = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id)
                ? prev.filter(d => d !== id)
                : prev.length < 5 ? [...prev, id] : prev
        );
    };

    const getAreaName = (aid: string | null) => areas.find(a => a.id === aid)?.name || '';

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-[#1e2330] border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white">
                    <XCircle className="w-5 h-5" />
                </button>

                <h2 className="text-xl font-bold text-white mb-1">Create Board View</h2>
                {venue && area && (
                    <p className="text-sm text-slate-500 mb-5">{venue.name} · {area.name}</p>
                )}

                <div className="space-y-5">
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Board Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Entry Door"
                            className="w-full bg-black/50 border border-slate-700 rounded-xl p-3 text-white placeholder:text-slate-600 focus:border-primary focus:outline-none mt-1.5"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                            Counters <span className="text-slate-600">({selectedIds.length}/5)</span>
                        </label>
                        <div className="space-y-1.5 mt-1.5 max-h-48 overflow-y-auto">
                            {allClicrs.map(clicr => (
                                <button
                                    key={clicr.id}
                                    type="button"
                                    onClick={() => toggleDevice(clicr.id)}
                                    className={cn(
                                        "w-full flex items-center justify-between p-2.5 rounded-lg border text-left text-sm transition-all",
                                        selectedIds.includes(clicr.id)
                                            ? "bg-primary/10 border-primary"
                                            : "bg-slate-800 border-slate-700 hover:bg-slate-700"
                                    )}
                                >
                                    <div>
                                        <span className={selectedIds.includes(clicr.id) ? 'text-primary font-bold' : 'text-white'}>
                                            {clicr.name}
                                        </span>
                                        <span className="text-xs text-slate-500 ml-2">{getAreaName(clicr.area_id)}</span>
                                    </div>
                                    {selectedIds.includes(clicr.id) && <Check className="w-4 h-4 text-primary" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    {selectedIds.length > 0 && (
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                Custom Labels <span className="text-slate-600">(optional)</span>
                            </label>
                            <div className="space-y-1.5 mt-1.5">
                                {selectedIds.map(did => {
                                    const clicr = clicrs.find(c => c.id === did);
                                    return (
                                        <div key={did} className="flex items-center gap-2">
                                            <span className="text-sm text-slate-400 w-28 truncate">{clicr?.name}</span>
                                            <input
                                                type="text"
                                                value={labels[did] || ''}
                                                onChange={e => setLabels(prev => ({ ...prev, [did]: e.target.value }))}
                                                placeholder={clicr?.name || 'Label'}
                                                className="flex-1 bg-black/50 border border-slate-700 rounded-lg p-2 text-white text-sm placeholder:text-slate-600 focus:border-primary focus:outline-none"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <button
                        onClick={() => onSave(name, selectedIds, labels)}
                        disabled={!name.trim() || selectedIds.length === 0}
                        className="w-full py-3 bg-primary text-black font-bold rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50"
                    >
                        Create Board View
                    </button>
                </div>
            </div>
        </div>
    );
}
```

**Step 3: Verify lint**

Run: `npx next lint`

**Step 4: Commit**

```
feat(board): create slide-over selection panel and create modal
```

---

### Task 6: Wire up the Clicrs page

**Files:**
- Modify: `app/(authenticated)/clicr/page.tsx`

**Step 1: Add slide-over state and import**

Add imports at top:
```ts
import { BoardSelectPanel } from '@/components/board/BoardSelectPanel';
```

Add state inside `ClicrListPage`:
```ts
const [showBoardPanel, setShowBoardPanel] = useState(false);
```

**Step 2: Replace the Board View link in `PageHeader`**

In the `PageHeader` component (around line 200), change the `Link` to `/settings/board-views` to a button that opens the slide-over:

Change the `PageHeader` props to accept `onBoardView`:
```ts
function PageHeader({ canAddClicr, onAddClicr, onBoardView }: { canAddClicr: boolean; onAddClicr: () => void; onBoardView: () => void }) {
```

Replace the `<Link href="/settings/board-views" ...>` with:
```tsx
<button onClick={onBoardView} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 text-sm text-gray-300 transition-colors">
    <LayoutGrid className="w-4 h-4" />
    Board View
</button>
```

**Step 3: Pass the prop and render the panel**

Update all `<PageHeader>` usages to pass `onBoardView={() => setShowBoardPanel(true)}`.

Add before the closing `</div>` of the page return:
```tsx
<BoardSelectPanel open={showBoardPanel} onClose={() => setShowBoardPanel(false)} />
```

**Step 4: Remove the `Link` import if no longer used**

Check if `Link` from `next/link` is still used. If the only usage was the board-views link, remove it.

**Step 5: Verify lint and test**

Run: `npx next lint`

**Step 6: Commit**

```
feat(board): wire slide-over panel to clicr page Board View button
```

---

### Task 7: Wire up the Areas page

**Files:**
- Modify: `app/(authenticated)/areas/page.tsx`

**Step 1: Replace Maximize2 icon with LayoutGrid**

At line 6, change the import:
```ts
// Replace Maximize2 with LayoutGrid in the import:
import { Search, RefreshCw, ArrowUp, ArrowDown, Plus, ChevronDown, Play, Square, Settings2, Layers, LayoutGrid } from 'lucide-react';
```

**Step 2: Wire the icon button to navigate**

At line 335-341, the Maximize2 button currently does nothing. Replace it:

```tsx
<button
    type="button"
    onClick={() => router.push(`/clicr/board/area-${area.id}`)}
    className="w-8 h-8 rounded-lg hover:bg-gray-800 flex items-center justify-center transition-colors"
    aria-label="Board View"
    title="Open board view"
>
    <LayoutGrid className="w-4 h-4 text-purple-400" />
</button>
```

**Step 3: Verify lint**

Run: `npx next lint`

**Step 4: Commit**

```
feat(board): wire area card board icon to auto area board view
```

---

### Task 8: Remove board views from Settings

**Files:**
- Modify: `app/(authenticated)/settings/page.tsx` (remove Board Views card)
- Delete: `app/(authenticated)/settings/board-views/page.tsx`

**Step 1: Remove the Board Views link card from settings page**

In `app/(authenticated)/settings/page.tsx`, remove lines 120-132 (the `<Link href="/settings/board-views" ...>` card).

Also remove `LayoutGrid` from the lucide-react import at line 6 if no longer used.

**Step 2: Delete the old board-views settings page**

Delete `app/(authenticated)/settings/board-views/page.tsx`.

**Step 3: Verify lint and build**

Run: `npx next lint`

**Step 4: Commit**

```
refactor(board): remove board views from settings, feature lives in clicr flow
```

---

### Task 9: Update existing `/board/[id]` kiosk page

**Files:**
- Modify: `app/board/[id]/page.tsx`

**Step 1: Update to use BoardTile and same data pattern**

Replace the existing tile rendering with `BoardTile` component. Update the import:

```ts
import { getBoardView } from '@/app/actions/board';
import { BoardTile } from '@/components/board/BoardTile';
```

Replace the manual tile div (lines 132-161) with `BoardTile` usage. Keep the polling for the kiosk use case (it runs outside auth layout so may not have full store access), but use the same visual component.

Since this page is outside `(authenticated)` and uses its own polling, keep the existing data fetch pattern but swap the tile rendering to use `BoardTile` for visual consistency. Pass the polled data as clicr/area props.

**Step 2: Verify the page still works**

Run: `npx next lint`

**Step 3: Commit**

```
refactor(board): update kiosk page to use shared BoardTile component
```

---

### Task 10: Add "On Board" badge to clicr cards

**Files:**
- Modify: `app/(authenticated)/clicr/page.tsx`

**Step 1: Fetch board views and compute which clicrs are on a board**

In `ClicrListPage`, add state and effect to load boards:

```ts
const [boardDeviceIds, setBoardDeviceIds] = useState<Set<string>>(new Set());

useEffect(() => {
    if (!activeBusiness) return;
    listBoardViews(activeBusiness.id).then(views => {
        const ids = new Set<string>();
        views.forEach(v => v.device_ids.forEach(d => ids.add(d)));
        setBoardDeviceIds(ids);
    });
}, [activeBusiness]);
```

Add import:
```ts
import { listBoardViews } from '@/app/actions/board';
```

**Step 2: Pass `isOnBoard` prop to ClicrCard**

Update `ClicrCard` to accept and display it:

```tsx
function ClicrCard({ clicr, area, isVenueCounter, isOnBoard }: { clicr: Clicr; area: (Area & { clicrs: Clicr[] }) | null; isVenueCounter?: boolean; isOnBoard?: boolean }) {
```

Inside the badges area (around line 267-280), add after the scan badge:

```tsx
{isOnBoard && (
    <>
        <div className="text-gray-400">·</div>
        <div className="text-primary">On Board</div>
    </>
)}
```

**Step 3: Pass the prop where ClicrCard is rendered**

```tsx
<ClicrCard key={clicr.id} clicr={clicr} area={area} isOnBoard={boardDeviceIds.has(clicr.id)} />
```

Same for venue counter clicrs.

**Step 4: Verify lint**

Run: `npx next lint`

**Step 5: Commit**

```
feat(board): show "On Board" badge on clicr cards
```

---

### Task 11: Final verification

**Step 1: Full lint check**

Run: `npx next lint`

**Step 2: Build check**

Run: `npx next build 2>&1 | tail -20`

**Step 3: Manual smoke test checklist**

- [ ] `/clicr` page: "Board View" button opens slide-over
- [ ] Slide-over: "My Boards" section shows custom boards (or hidden if none)
- [ ] Slide-over: "Browse Areas" lists all areas, hover shows "Create View +"
- [ ] Click area name in slide-over → opens auto board at `/clicr/board/area-[id]`
- [ ] Auto board: shows all area clicrs as tiles, no edit icon
- [ ] Tile: shows label, area occupancy, capacity bar, 4 tap buttons (+M/+F/-M/-F)
- [ ] Tap buttons update occupancy correctly with gender attribution
- [ ] "Create View +" → modal with pre-selected clicrs, custom labels, save
- [ ] Custom board: edit icon opens modal, can rename/add/remove clicrs/labels
- [ ] Custom board: delete works, redirects to /clicr
- [ ] `/areas` page: board icon on area cards navigates to auto board
- [ ] Settings page: no Board Views card
- [ ] "On Board" badge shows on clicr cards that belong to a custom board
- [ ] Fullscreen button works on board view page

**Step 4: Commit any fixes**

```
chore(board): final cleanup and verification
```
