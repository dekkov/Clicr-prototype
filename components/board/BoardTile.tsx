"use client";

import React from 'react';
import { cn } from '@/lib/utils';
import type { Clicr, Area, Venue } from '@/lib/types';

type BoardTileProps = {
    clicr: Clicr;
    area: Area | undefined;
    venue?: Venue;
    label?: string;
    onTap: (clicrId: string, delta: number, gender: 'M' | 'F') => void;
};

export function BoardTile({ clicr, area, venue, label, onTap }: BoardTileProps) {
    const displayLabel = label || clicr.name;
    const isVenueCounter = clicr.is_venue_counter && venue;

    const occupancy = isVenueCounter
        ? (venue.current_occupancy ?? 0)
        : (area?.current_occupancy ?? 0);

    const capacity = isVenueCounter
        ? (venue.total_capacity ?? venue.default_capacity_total ?? null)
        : (area?.capacity_max ?? area?.default_capacity ?? null);

    const hasCapacity = capacity !== null && capacity > 0;
    const pct = hasCapacity ? Math.min(100, Math.round((occupancy / capacity) * 100)) : null;

    // Status color based on fill percentage
    const statusColor = pct === null ? 'text-foreground'
        : pct >= 100 ? 'text-red-400'
        : pct >= 90 ? 'text-amber-400'
        : pct >= 80 ? 'text-amber-600 dark:text-amber-300'
        : 'text-foreground';

    const barColor = pct === null ? 'bg-muted'
        : pct >= 100 ? 'bg-red-500'
        : pct >= 90 ? 'bg-amber-400'
        : pct >= 80 ? 'bg-amber-300'
        : 'bg-emerald-400';

    const glowColor = pct === null ? 'shadow-transparent'
        : pct >= 100 ? 'shadow-red-500/20'
        : pct >= 90 ? 'shadow-amber-400/20'
        : pct >= 80 ? 'shadow-amber-300/10'
        : 'shadow-emerald-400/10';

    const handleTap = (delta: number, gender: 'M' | 'F') => {
        if (navigator.vibrate) navigator.vibrate(50);
        onTap(clicr.id, delta, gender);
    };

    return (
        <div className={cn(
            "relative bg-background border border-white/[0.06] rounded-2xl flex flex-col items-center justify-center p-6 min-h-[240px]",
            "shadow-lg", glowColor
        )}>
            {/* Venue counter badge */}
            {isVenueCounter && (
                <div className="text-[9px] font-bold uppercase tracking-widest text-amber-400/80 bg-amber-400/10 border border-amber-400/20 rounded-full px-2.5 py-0.5 mb-2">
                    Venue
                </div>
            )}

            {/* Label */}
            <div className="text-sm text-purple-400 font-bold uppercase tracking-widest mb-3 text-center truncate max-w-full">
                {displayLabel}
            </div>

            {/* Count */}
            <div className={cn("text-7xl md:text-8xl font-black tabular-nums leading-none mb-1", statusColor)}>
                {occupancy}
            </div>

            {/* Capacity info */}
            <div className="w-full max-w-[220px] mb-5">
                <div className="text-[11px] text-muted-foreground text-center mb-2 tabular-nums">
                    {hasCapacity ? (
                        <><span className="text-muted-foreground font-medium">{pct}%</span>{' '}&middot; {occupancy} of {capacity}</>
                    ) : (
                        <span className="text-muted-foreground/60">No capacity set</span>
                    )}
                </div>
                {hasCapacity && (
                    <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                            className={cn("h-full rounded-full transition-all duration-300", barColor)}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                )}
            </div>

            {/* Tap buttons */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-[220px]">
                <button
                    onClick={() => handleTap(1, 'M')}
                    className="py-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-sm font-bold border border-emerald-200 dark:border-emerald-500/20 active:scale-[0.96] transition-all"
                >
                    + M
                </button>
                <button
                    onClick={() => handleTap(1, 'F')}
                    className="py-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-sm font-bold border border-emerald-200 dark:border-emerald-500/20 active:scale-[0.96] transition-all"
                >
                    + F
                </button>
                <button
                    onClick={() => handleTap(-1, 'M')}
                    className="py-3 rounded-xl bg-white/[0.03] hover:bg-red-500/10 text-muted-foreground hover:text-red-400 text-sm font-bold border border-white/[0.06] hover:border-red-500/20 active:scale-[0.96] transition-all"
                >
                    &minus; M
                </button>
                <button
                    onClick={() => handleTap(-1, 'F')}
                    className="py-3 rounded-xl bg-white/[0.03] hover:bg-red-500/10 text-muted-foreground hover:text-red-400 text-sm font-bold border border-white/[0.06] hover:border-red-500/20 active:scale-[0.96] transition-all"
                >
                    &minus; F
                </button>
            </div>
        </div>
    );
}
