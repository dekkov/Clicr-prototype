"use client";
import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { Search, RefreshCw, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AreasPage() {
    const { areas, clicrs, venues, areaTraffic, activeBusiness } = useApp();
    const [search, setSearch] = useState('');

    if (!activeBusiness) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">Areas</h1>
                    <p className="text-slate-400">All areas across your venues.</p>
                </div>
                <div className="glass-card p-10 rounded-xl text-center text-slate-400">
                    Select a business from the sidebar.
                </div>
            </div>
        );
    }

    const filteredAreas = areas.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase())
    );

    // Group areas by venue, preserving venue order
    const venueGroups = venues
        .map(venue => ({
            venue,
            areas: filteredAreas.filter(a => a.venue_id === venue.id),
        }))
        .filter(g => g.areas.length > 0);

    return (
        <div className="space-y-8">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Areas</h1>
                    <p className="text-slate-400">All areas across your venues.</p>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search areas..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white focus:border-primary outline-none"
                    />
                </div>
            </div>

            {/* Venue Groups */}
            {venueGroups.length === 0 ? (
                <div className="glass-card p-10 rounded-xl text-center text-slate-400">
                    No areas found.
                </div>
            ) : (
                venueGroups.map(({ venue, areas: venueAreas }) => (
                    <section key={venue.id} className="space-y-4">
                        {/* Venue Section Header */}
                        <h2 className="text-base font-bold text-white">{venue.name}</h2>

                        {/* Area Cards Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {venueAreas.map(area => {
                                const scopeKey = `area:${activeBusiness.id}:${area.venue_id}:${area.id}`;
                                const traffic = areaTraffic[scopeKey] ?? { total_in: 0, total_out: 0 };

                                const areaClicrs = clicrs.filter(c => c.area_id === area.id);
                                const deviceCount = areaClicrs.length;

                                const liveOcc = area.current_occupancy ?? 0;
                                const capacity = area.default_capacity ?? area.capacity_limit ?? 0;
                                const pct = capacity > 0 ? Math.round((liveOcc / capacity) * 100) : null;

                                // Progress bar color
                                let barColor = 'bg-indigo-500';
                                if (pct !== null && pct > 90) barColor = 'bg-red-500';
                                else if (pct !== null && pct > 75) barColor = 'bg-amber-500';

                                return (
                                    <div
                                        key={area.id}
                                        className="glass-card rounded-xl p-5 flex flex-col gap-3"
                                    >
                                        {/* Card Top Row */}
                                        <div className="flex items-start justify-between">
                                            <span className="text-sm font-semibold text-white">{area.name}</span>
                                            <button
                                                type="button"
                                                className="text-slate-500 hover:text-slate-300 transition-colors"
                                                aria-label="Refresh"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                            </button>
                                        </div>

                                        {/* Occupancy Number */}
                                        <div>
                                            <span className="text-4xl font-bold text-white tabular-nums">{liveOcc}</span>
                                            {capacity > 0 && pct !== null && (
                                                <p className="text-xs text-slate-400 mt-0.5">
                                                    of {capacity} &middot; {pct}% full
                                                </p>
                                            )}
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className={cn('h-full rounded-full transition-all duration-500', barColor)}
                                                style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
                                            />
                                        </div>

                                        {/* Bottom Row: traffic + device count */}
                                        <div className="flex items-center justify-between text-xs text-slate-400">
                                            <div className="flex items-center gap-3">
                                                <span className="flex items-center gap-1 text-emerald-400">
                                                    <ArrowUp className="w-3 h-3" />
                                                    {traffic.total_in}
                                                </span>
                                                <span className="flex items-center gap-1 text-red-400">
                                                    <ArrowDown className="w-3 h-3" />
                                                    {traffic.total_out}
                                                </span>
                                            </div>
                                            <span>{deviceCount} device{deviceCount !== 1 ? 's' : ''}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))
            )}
        </div>
    );
}
