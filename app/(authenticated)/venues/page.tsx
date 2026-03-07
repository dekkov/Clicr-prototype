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
        const venueClicrs = clicrs.filter(c => c.area_id && areaIds.includes(c.area_id));
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
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
                <MapPin className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-base">Select a business from the sidebar to view venues.</p>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-[1600px]">
            {/* Page header - Design */}
            <div className="mb-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl mb-1">Venues</h1>
                        <p className="text-gray-400 text-sm">Manage your venues and track live occupancy.</p>
                    </div>
                    {activeBusiness && showAddVenue && (
                        <Link
                            href={`/venues/new?businessId=${activeBusiness.id}`}
                            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors flex items-center gap-2 text-sm"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add Venue</span>
                        </Link>
                    )}
                </div>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="space-y-4 animate-pulse">
                    {[1, 2].map(i => (
                        <div key={i} className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-800 rounded-xl" />
                                <div className="space-y-1.5 flex-1">
                                    <div className="h-5 bg-gray-800 rounded w-48" />
                                    <div className="h-3.5 bg-gray-800 rounded w-32" />
                                </div>
                            </div>
                            <div className="grid grid-cols-4 gap-6">
                                {[1, 2, 3, 4].map(j => (
                                    <div key={j} className="space-y-1.5">
                                        <div className="h-3 bg-gray-800 rounded w-16" />
                                        <div className="h-7 bg-gray-800 rounded w-20" />
                                    </div>
                                ))}
                            </div>
                            <div className="h-1.5 bg-gray-800 rounded-full" />
                        </div>
                    ))}
                </div>
            ) : allVenues.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                    <MapPin className="w-12 h-12 mb-4 opacity-30" />
                    <p className="text-base font-medium text-gray-400 mb-1">No venues yet</p>
                    <p className="text-sm mb-6">Add your first venue to get started.</p>
                    {activeBusiness && showAddVenue && (
                        <Link
                            href={`/venues/new?businessId=${activeBusiness.id}`}
                            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors flex items-center gap-2 text-sm"
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
                                className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-purple-900/30 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                                        <MapPin className="w-6 h-6 text-purple-400" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <h3 className="text-lg mb-1">{venue.name}</h3>
                                                <p className="text-sm text-gray-400">{address || 'No address'}</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    className="w-10 h-10 rounded-lg hover:bg-gray-800 flex items-center justify-center transition-colors"
                                                    aria-label="Refresh"
                                                >
                                                    <RefreshCw className="w-5 h-5 text-gray-400" />
                                                </button>
                                                <Link
                                                    href={`/venues/${venue.id}`}
                                                    className="w-10 h-10 rounded-lg hover:bg-gray-800 flex items-center justify-center transition-colors"
                                                    aria-label="View venue"
                                                >
                                                    <ChevronRight className="w-5 h-5 text-gray-400" />
                                                </Link>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-4 gap-8 mt-6">
                                            <div>
                                                <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Occupancy</div>
                                                <div className="text-2xl mb-1">{stats.currentOccupancy}</div>
                                                <div className="text-sm text-gray-400">of {capacity || '—'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">% Full</div>
                                                <div className="text-2xl text-emerald-400 mb-1">{pct}%</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Total In</div>
                                                <div className="text-2xl text-emerald-400 mb-1">+{stats.totalIn}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Total Out</div>
                                                <div className="text-2xl text-red-400 mb-1">{stats.totalOut}</div>
                                            </div>
                                        </div>

                                        <div className="mt-4 mb-3">
                                            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-emerald-500 rounded-full transition-all"
                                                    style={{ width: `${pctCapped}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between text-sm text-gray-400">
                                            <div>{stats.areaCount} areas · {stats.deviceCount} devices</div>
                                            <div>Last reset: {lastReset}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
