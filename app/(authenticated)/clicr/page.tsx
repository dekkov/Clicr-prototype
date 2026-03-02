"use client";

import React from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/store';
import { LayoutGrid, MousePointer2, ChevronRight, Plus } from 'lucide-react';
import { canAddClicr } from '@/lib/permissions';
import type { Role } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Clicr, Area } from '@/lib/types';

export default function ClicrListPage() {
    const { clicrs, areas, venues, isLoading, activeBusiness, currentUser } = useApp();

    if (!activeBusiness && !isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-500">
                <MousePointer2 className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-base">Select a business from the sidebar to view Clicrs.</p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="space-y-10 pb-20">
                <PageHeader canAddClicr={canAddClicr(currentUser?.role as Role | undefined)} />
                <div className="space-y-6 animate-pulse">
                    <div className="flex items-center gap-4">
                        <div className="h-6 bg-slate-800 rounded w-40" />
                        <div className="flex-1 h-px bg-slate-800" />
                    </div>
                    <div className="space-y-3">
                        <div className="h-4 bg-slate-800 rounded w-24" />
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="glass-card p-5 rounded-xl space-y-3">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 bg-slate-800 rounded-full" />
                                        <div className="flex-1 space-y-1.5">
                                            <div className="h-4 bg-slate-800 rounded w-28" />
                                            <div className="h-3 bg-slate-800 rounded w-20" />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="h-5 bg-slate-800 rounded-full w-16" />
                                        <div className="h-5 bg-slate-800 rounded-full w-20" />
                                    </div>
                                    <div className="h-8 bg-slate-800 rounded w-16" />
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
            <div className="space-y-8 pb-20">
                <PageHeader canAddClicr={canAddClicr(currentUser?.role as Role | undefined)} />
                <div className="p-8 text-slate-400">No Clicrs configured yet.</div>
            </div>
        );
    }

    // Grouping Logic: venue -> area -> clicrs
    const venuesWithContent = (venues || []).map(venue => {
        const venueAreas = (areas || []).filter(a => a.venue_id === venue.id);

        const areasWithClicrs = venueAreas.map(area => {
            const areaClicrs = (clicrs || []).filter(c => c.area_id === area.id);
            return { ...area, clicrs: areaClicrs };
        });

        return { ...venue, areas: areasWithClicrs };
    });

    return (
        <div className="space-y-10 pb-20">
            <PageHeader canAddClicr={canAddClicr(currentUser?.role as Role | undefined)} />

            {venuesWithContent.map(venue => (
                <div key={venue.id} className="space-y-6">
                    {/* Venue Header */}
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-bold text-primary whitespace-nowrap">{venue.name}</h2>
                        <div className="flex-1 h-px bg-white/10" />
                    </div>

                    {venue.areas.map(area => (
                        <div key={area.id} className="space-y-3">
                            {/* Area Sub-header */}
                            <p className="text-sm text-slate-400 ml-1">{area.name}</p>

                            {/* Clicrs Grid */}
                            {area.clicrs.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {area.clicrs.map(clicr => (
                                        <ClicrCard key={clicr.id} clicr={clicr} area={area} />
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 rounded-xl border border-dashed border-slate-800 text-slate-600 text-sm">
                                    No Clicrs assigned to this area.
                                </div>
                            )}
                        </div>
                    ))}

                    {venue.areas.length === 0 && (
                        <div className="p-6 text-slate-500 italic">No areas defined for this venue.</div>
                    )}
                </div>
            ))}
        </div>
    );
}

function PageHeader({ canAddClicr }: { canAddClicr: boolean }) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-3xl font-bold text-white">Clicrs</h1>
                <p className="text-slate-400">Your counting and scanning devices.</p>
            </div>
            <div className="flex items-center gap-3">
                {canAddClicr && (
                    <Link
                        href="/areas"
                        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors text-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Add Clicr
                    </Link>
                )}
                <Link href="/settings/board-views" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:text-white transition-colors">
                    <LayoutGrid className="w-4 h-4" />
                    Board View
                </Link>
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

function ClicrCard({ clicr, area }: { clicr: Clicr; area: Area & { clicrs: Clicr[] } }) {
    const flowModeLabel = getFlowModeLabel(clicr.flow_mode);
    const scanEnabled = clicr.scan_enabled;

    const occupancy = area.current_occupancy ?? 0;
    const capacity = area.default_capacity ?? area.capacity_limit ?? area.capacity_max ?? null;
    const capacityDisplay = capacity != null ? String(capacity) : '∞';

    return (
        <Link
            href={`/clicr/${clicr.id}`}
            className="glass-card p-5 rounded-xl hover:bg-slate-800/80 transition-all group relative overflow-hidden border border-white/5 hover:border-primary/50 flex flex-col gap-3"
        >
            {/* Top row: icon + name + chevron */}
            <div className="flex items-start gap-3">
                {/* Device Icon */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <MousePointer2 className="w-5 h-5 text-primary" />
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-white group-hover:text-primary transition-colors truncate">
                        {clicr.name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{area.name}</p>
                </div>

                {/* Chevron */}
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-primary transition-colors flex-shrink-0 mt-0.5" />
            </div>

            {/* Badge row */}
            <div className="flex items-center gap-2 flex-wrap">
                {/* Online badge with animated dot */}
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-medium">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    Online
                </span>

                {/* Flow mode badge */}
                <span className="px-2 py-0.5 rounded-full bg-slate-700/70 text-slate-300 text-[11px] font-medium">
                    {flowModeLabel}
                </span>

                {/* Scan badge */}
                {scanEnabled && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-700/70 text-slate-300 text-[11px] font-medium">
                        Scan
                    </span>
                )}
            </div>

            {/* Occupancy */}
            <div className="text-slate-400 text-sm font-mono">
                <span className="text-2xl font-bold text-slate-100">{occupancy}</span>
                <span className="mx-1 text-slate-500">/</span>
                <span className="text-slate-400">{capacityDisplay}</span>
                <span className="text-slate-600 text-xs ml-1">in area</span>
            </div>
        </Link>
    );
}
