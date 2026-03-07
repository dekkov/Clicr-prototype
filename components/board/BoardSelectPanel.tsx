"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/store';
import { listBoardViews, createBoardView } from '@/app/actions/board';
import type { BoardView } from '@/lib/types';

type Props = {
    open: boolean;
    onClose: () => void;
};

export function BoardSelectPanel({ open, onClose }: Props) {
    const router = useRouter();
    const { activeBusiness, venues, areas, clicrs } = useApp();
    const [boards, setBoards] = useState<BoardView[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [boardName, setBoardName] = useState('');
    const [creating, setCreating] = useState(false);

    const handleClose = () => {
        setSelectedIds([]);
        setBoardName('');
        onClose();
    };

    useEffect(() => {
        if (!open || !activeBusiness) return;
        let cancelled = false;
        listBoardViews(activeBusiness.id).then(views => {
            if (!cancelled) setBoards(views);
        });
        return () => { cancelled = true; };
    }, [open, activeBusiness]);

    const navigateToBoard = (boardId: string) => {
        handleClose();
        router.push(`/clicr/board/${boardId}`);
    };

    const toggleDevice = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id)
                ? prev.filter(d => d !== id)
                : prev.length < 5 ? [...prev, id] : prev
        );
    };

    const handleCreate = async () => {
        if (!activeBusiness || !boardName.trim() || selectedIds.length === 0) return;
        setCreating(true);
        const result = await createBoardView(boardName.trim(), selectedIds, {}, activeBusiness.id);
        setCreating(false);
        if (result.success && result.boardView) {
            handleClose();
            router.push(`/clicr/board/${result.boardView.id}`);
        }
    };

    const activeClicrs = clicrs.filter(c => c.active);

    // Build venue > area > device tree
    const venueGroups = venues.map(venue => {
        const venueCounters = activeClicrs.filter(c => c.is_venue_counter && c.venue_id === venue.id);
        const venueAreas = areas
            .filter(a => a.venue_id === venue.id && a.is_active)
            .map(area => ({
                area,
                devices: activeClicrs.filter(c => c.area_id === area.id && !c.is_venue_counter),
            }))
            .filter(g => g.devices.length > 0);

        return { venue, venueCounters, venueAreas };
    }).filter(g => g.venueCounters.length > 0 || g.venueAreas.length > 0);

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 z-40"
                        onClick={handleClose}
                    />

                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#12151e] border-l border-slate-800 z-50 flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-slate-800 shrink-0">
                            <h2 className="text-xl font-bold text-white">Board View</h2>
                            <button onClick={handleClose} className="text-slate-500 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Scrollable content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {/* MY BOARDS */}
                            {boards.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">My Boards</h3>
                                    <div className="space-y-2">
                                        {boards.map(board => {
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

                            {/* SELECT DEVICES */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                                    Select Devices <span className="text-slate-600">({selectedIds.length}/5)</span>
                                </h3>
                                <div className="space-y-5">
                                    {venueGroups.map(({ venue, venueCounters, venueAreas }) => (
                                        <div key={venue.id}>
                                            <div className="text-sm font-bold text-slate-400 mb-2">{venue.name}</div>

                                            {/* Venue counters */}
                                            {venueCounters.length > 0 && (
                                                <div className="mb-2">
                                                    <div className="text-xs font-bold text-slate-600 uppercase tracking-wider px-1 mb-1">Venue Counter</div>
                                                    <div className="space-y-1">
                                                        {venueCounters.map(clicr => (
                                                            <button
                                                                key={clicr.id}
                                                                type="button"
                                                                onClick={() => toggleDevice(clicr.id)}
                                                                className={cn(
                                                                    "w-full flex items-center gap-2.5 p-2.5 rounded-lg border text-left text-sm transition-all",
                                                                    selectedIds.includes(clicr.id)
                                                                        ? "bg-primary/10 border-primary"
                                                                        : "bg-slate-800 border-slate-700 hover:bg-slate-700"
                                                                )}
                                                            >
                                                                <div className={cn(
                                                                    "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                                                    selectedIds.includes(clicr.id) ? "bg-primary border-primary" : "border-slate-600"
                                                                )}>
                                                                    {selectedIds.includes(clicr.id) && <Check className="w-3 h-3 text-black" />}
                                                                </div>
                                                                <span className={selectedIds.includes(clicr.id) ? 'text-primary font-bold' : 'text-white'}>
                                                                    {clicr.name}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Areas with devices */}
                                            {venueAreas.map(({ area, devices }) => (
                                                <div key={area.id} className="mb-2">
                                                    <div className="text-xs font-bold text-slate-600 uppercase tracking-wider px-1 mb-1">{area.name}</div>
                                                    <div className="space-y-1">
                                                        {devices.map(clicr => (
                                                            <button
                                                                key={clicr.id}
                                                                type="button"
                                                                onClick={() => toggleDevice(clicr.id)}
                                                                className={cn(
                                                                    "w-full flex items-center gap-2.5 p-2.5 rounded-lg border text-left text-sm transition-all",
                                                                    selectedIds.includes(clicr.id)
                                                                        ? "bg-primary/10 border-primary"
                                                                        : "bg-slate-800 border-slate-700 hover:bg-slate-700"
                                                                )}
                                                            >
                                                                <div className={cn(
                                                                    "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                                                    selectedIds.includes(clicr.id) ? "bg-primary border-primary" : "border-slate-600"
                                                                )}>
                                                                    {selectedIds.includes(clicr.id) && <Check className="w-3 h-3 text-black" />}
                                                                </div>
                                                                <span className={selectedIds.includes(clicr.id) ? 'text-primary font-bold' : 'text-white'}>
                                                                    {clicr.name}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Sticky bottom: name + create */}
                        <div className="shrink-0 p-6 border-t border-slate-800 space-y-3">
                            <input
                                type="text"
                                value={boardName}
                                onChange={e => setBoardName(e.target.value)}
                                placeholder="Board name"
                                className="w-full bg-black/50 border border-slate-700 rounded-xl p-3 text-white placeholder:text-slate-600 focus:border-primary focus:outline-none text-sm"
                            />
                            <button
                                onClick={handleCreate}
                                disabled={!boardName.trim() || selectedIds.length === 0 || creating}
                                className="w-full py-3 bg-primary text-black font-bold rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50"
                            >
                                {creating ? 'Creating...' : 'Create Board View'}
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
