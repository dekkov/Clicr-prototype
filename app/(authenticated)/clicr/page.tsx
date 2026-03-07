"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/store';
import { LayoutGrid, Sparkles, ScanLine, ChevronRight, Plus, Wifi } from 'lucide-react';
import { canAddClicr } from '@/lib/permissions';
import type { Role } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Clicr, Area, FlowMode } from '@/lib/types';

export default function ClicrListPage() {
    const { clicrs, areas, venues, isLoading, activeBusiness, currentUser, addClicr } = useApp();
    const [showAddClicr, setShowAddClicr] = useState(false);
    const [newClicrAreaId, setNewClicrAreaId] = useState('');
    const [newClicrName, setNewClicrName] = useState('');
    const [newClicrFlow, setNewClicrFlow] = useState<FlowMode>('BIDIRECTIONAL');

    if (!activeBusiness && !isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
                <Sparkles className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-base">Select a business from the sidebar to view Clicrs.</p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="p-6 max-w-[1600px] pb-20">
                <PageHeader canAddClicr={canAddClicr(currentUser?.role as Role | undefined)} onAddClicr={() => setShowAddClicr(true)} />
                <div className="space-y-6 animate-pulse">
                    <div className="flex items-center gap-4">
                        <div className="h-6 bg-gray-800 rounded w-40" />
                        <div className="flex-1 h-px bg-gray-800" />
                    </div>
                    <div className="space-y-3">
                        <div className="h-4 bg-gray-800 rounded w-24" />
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="bg-gray-900/50 border border-gray-800 p-6 rounded-xl space-y-3">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 bg-gray-800 rounded-lg" />
                                        <div className="flex-1 space-y-1.5">
                                            <div className="h-4 bg-gray-800 rounded w-28" />
                                            <div className="h-3 bg-gray-800 rounded w-20" />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="h-5 bg-gray-800 rounded-full w-16" />
                                        <div className="h-5 bg-gray-800 rounded-full w-20" />
                                    </div>
                                    <div className="h-8 bg-gray-800 rounded w-16" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!clicrs || clicrs.length === 0) {
        return (
            <div className="p-6 max-w-[1600px] pb-20">
                <PageHeader canAddClicr={canAddClicr(currentUser?.role as Role | undefined)} onAddClicr={() => setShowAddClicr(true)} />
                <div className="p-8 text-gray-400">No Clicrs configured yet.</div>
            </div>
        );
    }

    // Grouping Logic: venue -> area -> clicrs (venue counter clicrs shown first)
    const venuesWithContent = (venues || []).map(venue => {
        const venueAreas = (areas || []).filter(a => a.venue_id === venue.id);
        const venueCounterClicrs = (clicrs || []).filter(c => c.is_venue_counter && c.venue_id === venue.id);

        const areasWithClicrs = venueAreas.map(area => {
            const areaClicrs = (clicrs || []).filter(c => c.area_id === area.id);
            return { ...area, clicrs: areaClicrs };
        });

        return { ...venue, areas: areasWithClicrs, venueCounterClicrs };
    });

    return (
        <div className="p-6 max-w-[1600px] pb-20">
            <PageHeader canAddClicr={canAddClicr(currentUser?.role as Role | undefined)} onAddClicr={() => setShowAddClicr(true)} />

            <div className="space-y-8">
                {venuesWithContent.map(venue => (
                    <div key={venue.id}>
                        <h2 className="text-xl mb-4">{venue.name}</h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {venue.venueCounterClicrs.map(clicr => (
                                <ClicrCard key={clicr.id} clicr={clicr} area={null} isVenueCounter />
                            ))}
                            {venue.areas.flatMap(area =>
                                area.clicrs.map(clicr => (
                                    <ClicrCard key={clicr.id} clicr={clicr} area={area} />
                                ))
                            )}
                        </div>

                        {venue.venueCounterClicrs.length === 0 && venue.areas.every(a => a.clicrs.length === 0) && (
                            <div className="p-6 text-gray-500 italic">No Clicrs defined for this venue.</div>
                        )}
                    </div>
                ))}
            </div>

            {showAddClicr && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4">
                        <h3 className="text-lg font-bold text-white">Add Clicr</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-medium text-slate-400 mb-1 block">Area</label>
                                <select value={newClicrAreaId} onChange={e => setNewClicrAreaId(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm">
                                    <option value="">Select area...</option>
                                    {(venues || []).map(v => (
                                        <optgroup key={v.id} label={v.name}>
                                            {(areas || []).filter(a => a.venue_id === v.id && a.is_active).map(a => (
                                                <option key={a.id} value={a.id}>{a.name}</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-400 mb-1 block">Name</label>
                                <input type="text" value={newClicrName} onChange={e => setNewClicrName(e.target.value)}
                                    placeholder="e.g. Front Door"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-400 mb-1 block">Flow Mode</label>
                                <select value={newClicrFlow} onChange={e => setNewClicrFlow(e.target.value as FlowMode)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm">
                                    <option value="BIDIRECTIONAL">Both (in + out)</option>
                                    <option value="IN_ONLY">In only</option>
                                    <option value="OUT_ONLY">Out only</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button onClick={() => { setShowAddClicr(false); setNewClicrName(''); setNewClicrAreaId(''); }}
                                className="flex-1 py-2 border border-slate-700 text-slate-400 hover:text-white rounded-xl text-sm font-medium transition-colors">
                                Cancel
                            </button>
                            <button onClick={async () => {
                                if (!newClicrAreaId || !newClicrName.trim()) return;
                                await addClicr({
                                    id: crypto.randomUUID(),
                                    area_id: newClicrAreaId,
                                    name: newClicrName.trim(),
                                    flow_mode: newClicrFlow,
                                    active: true,
                                    current_count: 0,
                                });
                                setShowAddClicr(false);
                                setNewClicrName('');
                                setNewClicrAreaId('');
                                setNewClicrFlow('BIDIRECTIONAL');
                            }} disabled={!newClicrAreaId || !newClicrName.trim()}
                                className="flex-1 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
                                Add
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function PageHeader({ canAddClicr, onAddClicr }: { canAddClicr: boolean; onAddClicr: () => void }) {
    return (
        <div className="mb-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl mb-1">Clicrs</h1>
                    <p className="text-gray-400 text-sm">Your counting and scanning devices.</p>
                </div>
                <div className="flex items-center gap-3">
                    {canAddClicr && (
                        <button
                            onClick={onAddClicr}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors text-sm"
                        >
                            <Plus className="w-4 h-4" />
                            Add Clicr
                        </button>
                    )}
                    <Link href="/settings/board-views" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 text-sm text-gray-300 transition-colors">
                        <LayoutGrid className="w-4 h-4" />
                        Board View
                    </Link>
                </div>
            </div>
        </div>
    );
}

function getFlowModeLabel(flowMode: string | undefined): string {
    switch (flowMode) {
        case 'IN_ONLY': return 'In Only';
        case 'OUT_ONLY': return 'Out Only';
        case 'BIDIRECTIONAL':
        default:
            return 'Bidirectional';
    }
}

function ClicrCard({ clicr, area, isVenueCounter }: { clicr: Clicr; area: (Area & { clicrs: Clicr[] }) | null; isVenueCounter?: boolean }) {
    const flowModeLabel = getFlowModeLabel(clicr.flow_mode);
    const scanEnabled = clicr.scan_enabled;

    const occupancy = area?.current_occupancy ?? 0;
    const capacity = area?.default_capacity ?? (area as any)?.capacity_limit ?? area?.capacity_max ?? null;
    const capacityDisplay = capacity != null ? String(capacity) : '∞';

    const isScanner = scanEnabled;
    const iconBg = isVenueCounter
        ? 'bg-amber-950/30 border-amber-500/20'
        : isScanner ? 'bg-purple-900/30 border-purple-500/20' : 'bg-emerald-900/30 border-emerald-500/20';

    return (
        <Link
            href={`/clicr/${clicr.id}`}
            className={cn(
                "border rounded-xl p-6 hover:border-opacity-80 transition-colors group",
                isVenueCounter
                    ? "bg-amber-950/10 border-amber-500/20 hover:border-amber-500/40"
                    : "bg-gray-900/50 border-gray-800 hover:border-gray-700"
            )}
        >
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center border',
                        iconBg
                    )}>
                        {isVenueCounter ? (
                            <Sparkles className="w-5 h-5 text-amber-400" />
                        ) : isScanner ? (
                            <ScanLine className="w-5 h-5 text-purple-400" />
                        ) : (
                            <Sparkles className="w-5 h-5 text-emerald-400" />
                        )}
                    </div>
                    <div>
                        <div className={cn("font-medium", isVenueCounter && "text-amber-200")}>{clicr.name}</div>
                        <div className="text-xs text-gray-400">{isVenueCounter ? 'Venue Counter' : area?.name}</div>
                    </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-lg hover:bg-gray-800 flex items-center justify-center">
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
            </div>

            <div className="flex items-center gap-6 text-sm mb-6">
                <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400">Online</span>
                </div>
                <div className="text-gray-400">·</div>
                <div className="text-gray-400">{flowModeLabel}</div>
                {scanEnabled && (
                    <>
                        <div className="text-gray-400">·</div>
                        <div className="text-purple-400">Scan</div>
                    </>
                )}
            </div>

            <div className="text-sm text-gray-400">
                <span className="text-2xl text-white">{occupancy}</span> / {capacityDisplay} in area
            </div>
        </Link>
    );
}
