"use client";

import React, { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Maximize, Settings2 } from 'lucide-react';
import { useApp } from '@/lib/store';
import { BoardTile } from '@/components/board/BoardTile';
import { getBoardView, updateBoardView, deleteBoardView } from '@/app/actions/board';
import type { BoardView, Clicr, Area, Venue } from '@/lib/types';
import { getVenueCapacityRules } from '@/lib/capacity';
import BoardEditModal from './_components/BoardEditModal';

type ResolvedTile = {
    clicr: Clicr;
    area: Area | undefined;
    venue?: Venue;
    label?: string;
};

export default function BoardViewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { clicrs, areas, venues, recordEvent, business } = useApp();
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
            const venue = clicr.is_venue_counter
                ? venues.find(v => v.id === clicr.venue_id)
                : undefined;
            return { clicr, area, venue, label: boardView.labels[did] || clicr.name };
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

    const handleTap = (clicrId: string, delta: number, counterLabelId: string) => {
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
            counter_label_id: counterLabelId,
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
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <button onClick={() => router.push('/clicr')} className="text-muted-foreground/60 hover:text-foreground transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-xl font-semibold text-foreground tracking-tight">{boardName}</h1>
                        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!isAutoBoard && (
                        <button
                            onClick={() => setShowEdit(true)}
                            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit board"
                        >
                            <Settings2 className="w-5 h-5" />
                        </button>
                    )}
                    <button
                        onClick={handleFullscreen}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.08] transition-all"
                    >
                        <Maximize className="w-3.5 h-3.5" /> Fullscreen
                    </button>
                </div>
            </div>

            {/* Tile grid */}
            {tiles.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                    No counters in this board. {!isAutoBoard && 'Edit the board to add counters.'}
                </div>
            ) : (
                <div className={`grid ${gridCols} gap-4`}>
                    {tiles.map(tile => (
                        <BoardTile
                            key={tile.clicr.id}
                            clicr={tile.clicr}
                            area={tile.area}
                            venue={tile.venue}
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
                    onSave={handleSaveEdit}
                    onDelete={handleDelete}
                    onClose={() => setShowEdit(false)}
                />
            )}
        </div>
    );
}
