"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/store';
import { Venue } from '@/lib/types';
import { MapPin, Plus, RefreshCw, ChevronRight } from 'lucide-react';
import { canAddVenue } from '@/lib/permissions';
import type { Role } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';

export default function VenuesPage() {
    const { activeBusiness, areas, clicrs, devices, isLoading: storeLoading, areaTraffic, currentUser } = useApp();
    const showAddVenue = canAddVenue(currentUser?.role as Role | undefined);
    const [allVenues, setAllVenues] = useState<Venue[]>([]);
    const [loadingVenues, setLoadingVenues] = useState(true);

    useEffect(() => {
        if (!activeBusiness) {
            setAllVenues([]);
            setLoadingVenues(false);
            return;
        }

        const controller = new AbortController();

        const load = async () => {
            setLoadingVenues(true);
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (user) {
                headers['x-user-id'] = user.id;
                headers['x-user-email'] = user.email || '';
            }
            try {
                const res = await fetch(`/api/sync?businessId=${activeBusiness.id}`, {
                    cache: 'no-store',
                    headers,
                    signal: controller.signal,
                });
                if (res.ok) {
                    const data = await res.json();
                    setAllVenues(
                        (data.venues || []).sort((a: Venue, b: Venue) => a.name.localeCompare(b.name))
                    );
                }
            } catch (err: unknown) {
                if (err instanceof Error && err.name === 'AbortError') return;
                console.error('Failed to load venues', err);
            }
            setLoadingVenues(false);
        };

        load();
        return () => controller.abort();
    }, [activeBusiness?.id]);

    const getVenueStats = (venueId: string) => {
        const venueAreas = areas.filter(a => a.venue_id === venueId);
        const areaIds = venueAreas.map(a => a.id);
        const venueClicrs = clicrs.filter(c => areaIds.includes(c.area_id));
        const currentOccupancy = venueAreas.reduce((sum, a) => sum + (a.current_occupancy || 0), 0);
        const relevantDevices = devices.filter(
            d => d.venue_id === venueId || (d.area_id && areaIds.includes(d.area_id))
        );
        const deviceCount =
            relevantDevices.filter(d => d.status === 'ACTIVE').length +
            venueClicrs.filter(c => c.active).length;

        // Traffic totals from areaTraffic store
        let totalIn = 0;
        let totalOut = 0;
        for (const area of venueAreas) {
            const scopeKey = `area:${activeBusiness!.id}:${area.venue_id}:${area.id}`;
            const traffic = areaTraffic?.[scopeKey];
            if (traffic) {
                totalIn += traffic.total_in || 0;
                totalOut += traffic.total_out || 0;
            }
        }

        return { areaCount: venueAreas.length, currentOccupancy, deviceCount, totalIn, totalOut };
    };

    const formatLastReset = (venue: Venue): string => {
        const raw = (venue as any).last_reset_at;
        if (!raw) return '—';
        try {
            return new Date(raw).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return '—';
        }
    };

    const isLoading = storeLoading || loadingVenues;

    // No active business selected
    if (!activeBusiness && !isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-500">
                <MapPin className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-base">Select a business from the sidebar to view venues.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Venues</h1>
                    <p className="text-slate-400 mt-1 text-sm">Manage your venues and track live occupancy.</p>
                </div>
                {activeBusiness && showAddVenue && (
                    <Link
                        href={`/venues/new?businessId=${activeBusiness.id}`}
                        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium text-sm transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        Add Venue
                    </Link>
                )}
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="space-y-4 animate-pulse">
                    {[1, 2].map(i => (
                        <div key={i} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-800 rounded-xl" />
                                <div className="space-y-1.5 flex-1">
                                    <div className="h-5 bg-slate-800 rounded w-48" />
                                    <div className="h-3.5 bg-slate-800 rounded w-32" />
                                </div>
                            </div>
                            <div className="grid grid-cols-4 gap-6">
                                {[1, 2, 3, 4].map(j => (
                                    <div key={j} className="space-y-1.5">
                                        <div className="h-3 bg-slate-800 rounded w-16" />
                                        <div className="h-7 bg-slate-800 rounded w-20" />
                                    </div>
                                ))}
                            </div>
                            <div className="h-1.5 bg-slate-800 rounded-full" />
                        </div>
                    ))}
                </div>
            ) : allVenues.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    <MapPin className="w-12 h-12 mb-4 opacity-30" />
                    <p className="text-base font-medium text-slate-400 mb-1">No venues yet</p>
                    <p className="text-sm mb-6">Add your first venue to get started.</p>
                    {activeBusiness && showAddVenue && (
                        <Link
                            href={`/venues/new?businessId=${activeBusiness.id}`}
                            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium text-sm transition-all"
                        >
                            <Plus className="w-4 h-4" />
                            Add Venue
                        </Link>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {allVenues.map(venue => {
                        const stats = getVenueStats(venue.id);
                        const capacity = venue.default_capacity_total ?? venue.total_capacity ?? 0;
                        const pct = capacity
                            ? Math.round((stats.currentOccupancy / capacity) * 100)
                            : 0;
                        const pctCapped = Math.min(pct, 100);
                        const address = [venue.address_line1, venue.city, venue.state]
                            .filter(Boolean)
                            .join(', ');
                        const lastReset = formatLastReset(venue);

                        return (
                            <div
                                key={venue.id}
                                className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden"
                            >
                                {/* Card header */}
                                <div className="flex items-start justify-between px-6 pt-5 pb-4">
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                            <MapPin className="w-5 h-5 text-primary" />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-bold text-white leading-tight">
                                                {venue.name}
                                            </h2>
                                            {address && (
                                                <p className="text-sm text-slate-400 mt-0.5">{address}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            className="p-2 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800/60 transition-colors"
                                            aria-label="Refresh"
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                        </button>
                                        <Link
                                            href={`/venues/${venue.id}`}
                                            className="p-2 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800/60 transition-colors"
                                            aria-label="View venue"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </Link>
                                    </div>
                                </div>

                                {/* Stat blocks */}
                                <div className="grid grid-cols-4 gap-0 px-6 pb-4">
                                    {/* OCCUPANCY */}
                                    <div>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                                            Occupancy
                                        </p>
                                        <p className="text-2xl font-bold font-mono text-white">
                                            {stats.currentOccupancy.toLocaleString()}
                                        </p>
                                        {capacity > 0 && (
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                of {capacity.toLocaleString()}
                                            </p>
                                        )}
                                    </div>

                                    {/* % FULL */}
                                    <div>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                                            % Full
                                        </p>
                                        <p className="text-2xl font-bold font-mono text-emerald-400">
                                            {pct}%
                                        </p>
                                    </div>

                                    {/* TOTAL IN */}
                                    <div>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                                            Total In
                                        </p>
                                        <p className="text-2xl font-bold font-mono text-emerald-400">
                                            +{stats.totalIn.toLocaleString()}
                                        </p>
                                    </div>

                                    {/* TOTAL OUT */}
                                    <div>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                                            Total Out
                                        </p>
                                        <p className="text-2xl font-bold font-mono text-red-400">
                                            -{stats.totalOut.toLocaleString()}
                                        </p>
                                    </div>
                                </div>

                                {/* Progress bar */}
                                <div className="px-6 pb-4">
                                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-500 rounded-full transition-all"
                                            style={{ width: `${pctCapped}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="flex items-center justify-between px-6 pb-4 text-xs text-slate-500">
                                    <span>
                                        {stats.areaCount} area{stats.areaCount !== 1 ? 's' : ''} &middot;{' '}
                                        {stats.deviceCount} device{stats.deviceCount !== 1 ? 's' : ''}
                                    </span>
                                    <span>Last reset: {lastReset}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
