"use client";

import React, { useState, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { Building2, MapPin, ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { METRICS } from '@/lib/core/metrics';
import { getTodayWindow } from '@/lib/core/time';
import { Business, Venue, Area, CountEvent } from '@/lib/types';
import { GettingStartedChecklist } from './_components/GettingStartedChecklist';
import { createClient } from '@/utils/supabase/client';

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
    const { businesses, isLoading, currentUser, resetCounts } = useApp();
    const router = useRouter();

    // dashBiz is local — resets to null on every mount so the picker always shows for multi-biz users
    const [dashBiz, setDashBiz] = useState<Business | null>(null);
    const [dashVenues, setDashVenues] = useState<Venue[]>([]);
    const [dashAreas, setDashAreas] = useState<Area[]>([]);
    const [dashEvents, setDashEvents] = useState<CountEvent[]>([]);
    const [loadingDash, setLoadingDash] = useState(false);

    // Auto-redirect new users with no business to onboarding.
    // Guard on currentUser.id to avoid false redirects when the first sync fails (network error).
    useEffect(() => {
        if (!isLoading && currentUser.id && businesses.length === 0) {
            router.push('/onboarding/setup');
        }
    }, [isLoading, currentUser.id, businesses.length]);

    // For single-business users, auto-select so they never see the picker
    useEffect(() => {
        if (!dashBiz && businesses.length === 1) {
            setDashBiz(businesses[0]);
        }
    }, [businesses, dashBiz]);

    // Fetch dashboard data whenever dashBiz changes
    useEffect(() => {
        if (!dashBiz) return;
        setLoadingDash(true);
        const load = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (user) {
                headers['x-user-id'] = user.id;
                headers['x-user-email'] = user.email || '';
            }
            const res = await fetch(`/api/sync?businessId=${dashBiz.id}`, { cache: 'no-store', headers });
            if (res.ok) {
                const data = await res.json();
                setDashVenues(data.venues || []);
                setDashAreas(data.areas || []);
                setDashEvents(data.events || []);
            }
            setLoadingDash(false);
        };
        load();
    }, [dashBiz?.id]);

    if (isLoading) {
        return (
            <div className="space-y-8 animate-pulse">
                <div className="h-10 w-48 bg-slate-800 rounded-xl" />
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {[1, 2].map(i => (
                        <div key={i} className="glass-panel p-6 rounded-2xl border border-slate-800">
                            <div className="flex gap-4 mb-6">
                                <div className="w-12 h-12 bg-slate-800 rounded-xl" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-5 bg-slate-800 rounded w-1/2" />
                                    <div className="h-3 bg-slate-800 rounded w-1/3" />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4 mb-6">
                                {[1, 2, 3].map(j => <div key={j} className="h-16 bg-slate-800 rounded-xl" />)}
                            </div>
                            <div className="space-y-3">
                                <div className="h-3 bg-slate-800 rounded w-1/4" />
                                <div className="h-6 bg-slate-800 rounded" />
                                <div className="h-6 bg-slate-800 rounded" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Show picker when multiple businesses exist and none is selected
    if (businesses.length > 1 && !dashBiz) {
        return (
            <div className="space-y-6 animate-[fade-in_0.5s_ease-out]">
                <div>
                    <h1 className="text-3xl font-bold text-white">Select a Business</h1>
                    <p className="text-slate-400 mt-1">Choose which business to manage.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {businesses.map(biz => (
                        <button
                            key={biz.id}
                            onClick={() => setDashBiz(biz)}
                            className="text-left p-6 rounded-2xl border transition-all hover:border-primary/50 hover:bg-slate-900/60 border-slate-800 bg-slate-900/40"
                        >
                            <Building2 className="w-8 h-8 text-primary mb-3" />
                            <div className="font-bold text-white text-lg">{biz.name}</div>
                        </button>
                    ))}
                    <Link
                        href="/onboarding/setup"
                        className="text-left p-6 rounded-2xl border border-dashed border-slate-700 hover:border-primary/50 transition-all flex flex-col items-start gap-3"
                    >
                        <Plus className="w-8 h-8 text-slate-500" />
                        <div className="font-bold text-slate-400">Add New Business</div>
                    </Link>
                </div>
            </div>
        );
    }

    if (loadingDash || !dashBiz) {
        return (
            <div className="space-y-8 animate-pulse">
                <div className="h-10 w-48 bg-slate-800 rounded-xl" />
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {[1, 2].map(i => (
                        <div key={i} className="glass-panel p-6 rounded-2xl border border-slate-800">
                            <div className="flex gap-4 mb-6">
                                <div className="w-12 h-12 bg-slate-800 rounded-xl" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-5 bg-slate-800 rounded w-1/2" />
                                    <div className="h-3 bg-slate-800 rounded w-1/3" />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4 mb-6">
                                {[1, 2, 3].map(j => <div key={j} className="h-16 bg-slate-800 rounded-xl" />)}
                            </div>
                            <div className="space-y-3">
                                <div className="h-3 bg-slate-800 rounded w-1/4" />
                                <div className="h-6 bg-slate-800 rounded" />
                                <div className="h-6 bg-slate-800 rounded" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-[fade-in_0.5s_ease-out]">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Dashboard</h1>
                    <p className="text-slate-400 mt-1">Real-time overview for <span className="text-primary font-semibold">{dashBiz.name}</span></p>
                    <div className="flex items-center gap-3 mt-1">
                        {businesses.length > 1 && (
                            <button
                                onClick={() => setDashBiz(null)}
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
                <div className="flex items-center gap-3">
                    <button
                        onClick={async () => {
                            if (window.confirm("⚠️ ARE YOU SURE? \n\nThis will reset ALL occupancy counts to 0 for the entire business. This action cannot be undone.")) {
                                await resetCounts(dashBiz.id);
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
            </div>

            {/* Getting Started checklist — shown after setup while optional items remain */}
            <GettingStartedChecklist />

            {/* Venue cards */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {dashVenues.map(venue => {
                    const venueAreas = dashAreas.filter(a => a.venue_id === venue.id);
                    return <VenueCard key={venue.id} venue={venue} areas={venueAreas} events={dashEvents} />;
                })}
            </div>
        </div>
    );
}
