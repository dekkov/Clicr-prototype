"use client";

import React from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/store';
import { LayoutGrid, Sparkles, ScanLine, ChevronRight, Plus, Wifi } from 'lucide-react';
import { canAddClicr } from '@/lib/permissions';
import type { Role } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Clicr, Area } from '@/lib/types';

export default function ClicrListPage() {
    const { clicrs, areas, venues, isLoading, activeBusiness, currentUser } = useApp();

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
                <PageHeader canAddClicr={canAddClicr(currentUser?.role as Role | undefined)} />
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
                <PageHeader canAddClicr={canAddClicr(currentUser?.role as Role | undefined)} />
                <div className="p-8 text-gray-400">No Clicrs configured yet.</div>
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
        <div className="p-6 max-w-[1600px] pb-20">
            <PageHeader canAddClicr={canAddClicr(currentUser?.role as Role | undefined)} />

            <div className="space-y-8">
                {venuesWithContent.map(venue => (
                    <div key={venue.id}>
                        <h2 className="text-xl mb-4">{venue.name}</h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {venue.areas.flatMap(area =>
                                area.clicrs.map(clicr => (
                                    <ClicrCard key={clicr.id} clicr={clicr} area={area} />
                                ))
                            )}
                        </div>

                        {venue.areas.every(a => a.clicrs.length === 0) && (
                            <div className="p-6 text-gray-500 italic">No Clicrs defined for this venue.</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function PageHeader({ canAddClicr }: { canAddClicr: boolean }) {
    return (
        <div className="mb-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl mb-1">Clicrs</h1>
                    <p className="text-gray-400 text-sm">Your counting and scanning devices.</p>
                </div>
                <div className="flex items-center gap-3">
                    {canAddClicr && (
                        <Link
                            href="/areas"
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors text-sm"
                        >
                            <Plus className="w-4 h-4" />
                            Add Clicr
                        </Link>
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

function ClicrCard({ clicr, area }: { clicr: Clicr; area: Area & { clicrs: Clicr[] } }) {
    const flowModeLabel = getFlowModeLabel(clicr.flow_mode);
    const scanEnabled = clicr.scan_enabled;

    const occupancy = area.current_occupancy ?? 0;
    const capacity = area.default_capacity ?? area.capacity_limit ?? area.capacity_max ?? null;
    const capacityDisplay = capacity != null ? String(capacity) : '∞';

    const isScanner = scanEnabled;
    const iconBg = isScanner ? 'bg-purple-900/30 border-purple-500/20' : 'bg-emerald-900/30 border-emerald-500/20';

    return (
        <Link
            href={`/clicr/${clicr.id}`}
            className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors group"
        >
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center border',
                        iconBg
                    )}>
                        {isScanner ? (
                            <ScanLine className="w-5 h-5 text-purple-400" />
                        ) : (
                            <Sparkles className="w-5 h-5 text-emerald-400" />
                        )}
                    </div>
                    <div>
                        <div className="font-medium">{clicr.name}</div>
                        <div className="text-xs text-gray-400">{area.name}</div>
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
