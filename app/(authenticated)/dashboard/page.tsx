"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { Building2, MapPin, ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { METRICS } from '@/lib/core/metrics';
import { getTodayWindow } from '@/lib/core/time';
import { Venue, Area, CountEvent } from '@/lib/types';
import { GettingStartedChecklist } from './_components/GettingStartedChecklist';

// Sub-component for individual venue stats
const VenueCard = ({ venue, areas, events }: { venue: Venue, areas: Area[], events: CountEvent[] }) => {
    const [stats, setStats] = useState({ total_in: 0, total_out: 0 });
    const [loading, setLoading] = useState(true);

    // Calculate Live Occupancy from SNAPSHOTS (Source of Truth)
    const occupancy = areas.reduce((sum, a) => sum + (a.current_occupancy || 0), 0);
    const capacity = areas.reduce((sum, a) => sum + ((a as any).capacity || a.default_capacity || 0), 0);

    // Fetch Traffic Stats (In/Out)
    useEffect(() => {
        const fetchStats = async () => {
            if (!venue.business_id) return;
            try {
                const data = await METRICS.getTotals(venue.business_id, { venueId: venue.id }, getTodayWindow());
                setStats(data);
                setLoading(false);
            } catch (e) {
                console.error("Venue stats error", e);
                setLoading(false);
            }
        };
        fetchStats();
    }, [venue.id, venue.business_id, events]);

    return (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 hover:border-slate-700 transition-colors">
            {/* Venue Header */}
            <div className="flex justify-between items-start mb-6">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-slate-800 rounded-xl">
                        <Building2 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">{venue.name}</h3>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                            <MapPin className="w-3 h-3" />
                            {venue.city ? `${venue.city}, ${venue.state}` : 'Location Unset'}
                        </div>
                    </div>
                </div>
                <Link
                    href={`/venues/${venue.id}`}
                    className="text-xs font-bold text-white bg-primary px-4 py-2 rounded-full hover:bg-indigo-500 shadow-lg shadow-primary/25 transition-all flex items-center gap-2 group"
                >
                    Manage
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </Link>
            </div>

            {/* Venue Mini KPIs */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                    <div className="text-xs text-slate-500 mb-1">Occupancy</div>
                    <div className="text-xl font-bold font-mono text-white">{occupancy}</div>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                    <div className="text-xs text-slate-500 mb-1">In</div>
                    <div className="text-xl font-bold font-mono text-emerald-400">+{stats.total_in}</div>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                    <div className="text-xs text-slate-500 mb-1">Out</div>
                    <div className="text-xl font-bold font-mono text-amber-400">-{stats.total_out}</div>
                </div>
            </div>

            {/* Areas List */}
            <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Area Status</h4>
                {areas.length === 0 && <p className="text-xs text-slate-600 italic">No areas configured.</p>}
                {areas.map(area => {
                    const cap = (area as any).capacity || area.default_capacity || 0;
                    const occ = area.current_occupancy || 0;
                    const pct = cap > 0 ? (occ / cap) * 100 : 0;
                    const isHigh = pct > 90;

                    return (
                        <div key={area.id} className="relative">
                            <div className="flex justify-between items-center text-sm mb-1">
                                <span className="font-medium text-slate-300">{area.name}</span>
                                <span className={cn("font-mono", isHigh ? "text-red-400 font-bold" : "text-slate-400")}>
                                    {occ} <span className="text-slate-600 text-xs">/ {cap > 0 ? cap : '∞'}</span>
                                </span>
                            </div>
                            {cap > 0 ? (
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className={cn(
                                            "h-full rounded-full transition-all",
                                            isHigh ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-primary"
                                        )}
                                        style={{ width: `${Math.min(pct, 100)}%` }}
                                    />
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default function DashboardPage() {
    const { business, businesses, activeBusiness, selectBusiness, clearBusiness, venues, areas, events, isLoading, currentUser, resetCounts } = useApp();
    const router = useRouter();

    // Auto-redirect new users with no business to onboarding.
    // Guard on currentUser.id to avoid false redirects when the first sync fails (network error).
    useEffect(() => {
        if (!isLoading && currentUser.id && businesses.length === 0 && !business) {
            router.push('/onboarding/setup');
        }
    }, [isLoading, currentUser.id, businesses.length, business]);

    if (isLoading) {
        return <div className="p-8 text-white">Loading dashboard...</div>;
    }

    // Show picker when multiple businesses exist and none is selected
    const showPicker = businesses.length > 1 && !activeBusiness;

    if (showPicker) {
        return (
            <div className="space-y-8 animate-[fade-in_0.5s_ease-out]">
                <div>
                    <h1 className="text-3xl font-bold text-white">Your Businesses</h1>
                    <p className="text-slate-400 mt-1">Select a business to manage.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {businesses.map(biz => (
                        <div
                            key={biz.id}
                            className="glass-panel border border-slate-800 rounded-2xl overflow-hidden hover:border-primary/40 transition-all group"
                        >
                            {/* Card header */}
                            <div className="bg-primary/5 border-b border-slate-800 px-6 py-5 flex items-center gap-4">
                                <div className="p-2.5 bg-primary/10 rounded-xl">
                                    <Building2 className="w-6 h-6 text-primary" />
                                </div>
                                <div className="min-w-0">
                                    <div className="font-bold text-white text-base truncate">{biz.name}</div>
                                    <div className="text-xs text-slate-500 mt-0.5">Business account</div>
                                </div>
                            </div>
                            {/* Card footer */}
                            <div className="px-6 py-4 flex items-center justify-between">
                                <div className="text-xs text-slate-600">ID: {biz.id.slice(0, 8)}…</div>
                                <button
                                    onClick={() => selectBusiness(biz)}
                                    className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-white bg-primary/10 hover:bg-primary px-4 py-1.5 rounded-lg transition-all"
                                >
                                    Enter <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                                </button>
                            </div>
                        </div>
                    ))}
                    {/* Add new business card */}
                    <Link
                        href="/onboarding/setup"
                        className="glass-panel border border-dashed border-slate-700 rounded-2xl overflow-hidden hover:border-primary/40 transition-all flex flex-col items-center justify-center gap-3 py-10 text-center"
                    >
                        <div className="p-3 bg-slate-800 rounded-xl">
                            <Plus className="w-6 h-6 text-slate-400" />
                        </div>
                        <div>
                            <div className="font-semibold text-slate-300 text-sm">Add New Business</div>
                            <div className="text-xs text-slate-600 mt-0.5">Set up another account</div>
                        </div>
                    </Link>
                </div>
            </div>
        );
    }

    const needsSetup = !business;

    return (
        <div className="space-y-8 animate-[fade-in_0.5s_ease-out]">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Dashboard</h1>
                    {business && (
                        <p className="text-slate-400 mt-1">Real-time overview for <span className="text-primary font-semibold">{business.name}</span></p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                        {businesses.length > 1 && (
                            <button
                                onClick={clearBusiness}
                                className="text-xs text-slate-500 hover:text-primary transition-colors"
                            >
                                ← Switch Business
                            </button>
                        )}
                        <Link
                            href="/onboarding/setup"
                            className="text-xs text-slate-500 hover:text-primary transition-colors flex items-center gap-1"
                        >
                            <Plus className="w-3 h-3" /> Add Business
                        </Link>
                    </div>
                </div>
                {!needsSetup && (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={async () => {
                                if (window.confirm("⚠️ ARE YOU SURE? \n\nThis will reset ALL occupancy counts to 0 for the entire business. This action cannot be undone.")) {
                                    await resetCounts(business!.id);
                                }
                            }}
                            className="px-4 py-2 bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-800/50 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                        >
                            Reset All Counts
                        </button>

                        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-medium border border-emerald-500/20">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            System Operational
                        </div>
                    </div>
                )}
            </div>

            {/* Getting Started checklist — shown after setup while optional items remain */}
            {!needsSetup && <GettingStartedChecklist />}

            {/* Venue cards */}
            {!needsSetup && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {venues.map(venue => {
                        const venueAreas = areas.filter(a => a.venue_id === venue.id);
                        return <VenueCard key={venue.id} venue={venue} areas={venueAreas} events={events} />;
                    })}
                </div>
            )}
        </div>
    );
}
