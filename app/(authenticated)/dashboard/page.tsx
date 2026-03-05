"use client";

import React, { useMemo, useEffect, useState } from 'react';
import { useApp } from '@/lib/store';
import {
    Users, TrendingUp, ScanLine, ShieldBan,
    Calendar, RefreshCw, Download
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { GettingStartedChecklist } from './_components/GettingStartedChecklist';

// --- Inline sub-components ---

const KpiCard = ({
    label,
    value,
    detail,
    icon: Icon,
    iconColor,
    valueColor,
    detailColor,
}: {
    label: string;
    value: string | number;
    detail: string;
    icon: React.ElementType;
    iconColor?: string;
    valueColor?: string;
    detailColor?: string;
}) => (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
            <Icon className={cn("w-5 h-5", iconColor ?? "text-gray-500")} />
        </div>
        <div className={cn("text-4xl mb-2", valueColor ?? "text-white")}>{value}</div>
        <div className={cn("text-sm", detailColor ?? "text-gray-400")}>{detail}</div>
    </div>
);

const AgeBand = ({ band, count, max }: { band: string; count: number; max: number }) => (
    <div className="flex items-center gap-4">
        <div className="w-16 text-sm text-gray-400">{band}</div>
        <div className="flex-1 h-10 bg-gray-800 rounded-lg overflow-hidden">
            <div
                className="h-full bg-gradient-to-r from-purple-600 to-purple-500 rounded-lg transition-all"
                style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }}
            />
        </div>
        <div className="w-12 text-right text-sm">{count}</div>
    </div>
);

// --- Helpers ---

function getTodayStart(): number {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

// --- Main Page ---

export default function DashboardPage() {
    const router = useRouter();
    const {
        activeBusiness,
        businesses,
        areas,
        venues,
        events,
        scanEvents,
        currentUser,
        bans,
        isLoading,
        resetCounts,
    } = useApp();

    const [isResetting, setIsResetting] = useState(false);

    // Analyst sees only Reports — redirect from Dashboard
    useEffect(() => {
        if (!isLoading && (currentUser?.role as string) === 'ANALYST') {
            router.push('/reports');
        }
    }, [isLoading, currentUser?.role, router]);

    // Auto-redirect if no businesses exist after load
    useEffect(() => {
        if (!isLoading && businesses.length === 0) {
            router.push('/onboarding/setup');
        }
    }, [isLoading, businesses.length, router]);

    // --- Derived metrics (memoized) ---
    const [todayStart, setTodayStart] = useState(() => getTodayStart());

    useEffect(() => {
        const now = new Date();
        const msUntilMidnight = new Date(now).setHours(24, 0, 0, 0) - now.getTime();
        const timer = setTimeout(() => {
            const d = new Date(); d.setHours(0, 0, 0, 0);
            setTodayStart(d.getTime());
        }, msUntilMidnight);
        return () => clearTimeout(timer);
    }, [todayStart]);

    const todayEvents = useMemo(
        () => events.filter((e) => e.timestamp >= todayStart),
        [events, todayStart]
    );

    const todayScanEvents = useMemo(
        () => scanEvents.filter((s) => s.timestamp >= todayStart),
        [scanEvents, todayStart]
    );

    // Venue occupancy = sum of VENUE_DOOR areas only (one per venue)
    const liveOccupancy = useMemo(
        () => areas
            .filter(a => a.area_type === 'VENUE_DOOR')
            .reduce((sum, a) => sum + (a.current_occupancy ?? 0), 0),
        [areas]
    );

    const peakOccupancy = useMemo(() => {
        // We don't have historical peak in current data model — derive from current as best proxy
        return liveOccupancy;
    }, [liveOccupancy]);

    const totalEntries = useMemo(
        () => todayEvents.filter((e) => e.delta > 0).reduce((sum, e) => sum + e.delta, 0),
        [todayEvents]
    );

    const totalExits = useMemo(
        () => todayEvents.filter((e) => e.delta < 0).reduce((sum, e) => sum + Math.abs(e.delta), 0),
        [todayEvents]
    );

    const totalScans = useMemo(() => todayScanEvents.length, [todayScanEvents]);

    const deniedCount = useMemo(
        () => todayScanEvents.filter((s) => s.scan_result === 'DENIED').length,
        [todayScanEvents]
    );

    const deniedPct = useMemo(
        () => (totalScans > 0 ? Math.round((deniedCount / totalScans) * 100) : 0),
        [deniedCount, totalScans]
    );

    const activeBansCount = useMemo(
        () => bans.filter((b) => b.status === 'ACTIVE').length,
        [bans]
    );

    // Age distribution from accepted scans
    const ageDistribution = useMemo(() => {
        const bands: Record<string, number> = {
            '18-20': 0,
            '21-25': 0,
            '26-30': 0,
            '31-40': 0,
            '40+': 0,
        };
        todayScanEvents
            .filter((s) => s.scan_result === 'ACCEPTED')
            .forEach((s) => {
                const age = s.age;
                if (age == null) return;
                if (age >= 18 && age <= 20) bands['18-20']++;
                else if (age >= 21 && age <= 25) bands['21-25']++;
                else if (age >= 26 && age <= 30) bands['26-30']++;
                else if (age >= 31 && age <= 40) bands['31-40']++;
                else if (age > 40) bands['40+']++;
            });
        return bands;
    }, [todayScanEvents]);

    const maxAgeBandCount = useMemo(
        () => Math.max(1, ...Object.values(ageDistribution)),
        [ageDistribution]
    );

    // Live Event Log — count events only (ENTRY/EXIT), newest first, last 20
    const liveEventLog = useMemo(() => {
        type LogEntry = {
            id: string;
            ts: number;
            kind: 'ENTRY' | 'EXIT';
            areaId?: string;
            venueId?: string;
        };

        return todayEvents
            .map((e): LogEntry => ({
                id: `c-${e.id}`,
                ts: e.timestamp,
                kind: e.delta > 0 ? 'ENTRY' : 'EXIT',
                areaId: e.area_id,
                venueId: e.venue_id,
            }))
            .sort((a, b) => b.ts - a.ts)
            .slice(0, 20);
    }, [todayEvents]);

    const areaMap = useMemo(() => {
        const m: Record<string, string> = {};
        areas.forEach((a) => { m[a.id] = a.name; });
        return m;
    }, [areas]);

    const venueNameMap = useMemo(() => {
        const m: Record<string, string> = {};
        venues.forEach((v) => { m[v.id] = v.name; });
        return m;
    }, [venues]);

    const venueGroups = useMemo(() => {
        const groups: { venueId: string | undefined; label: string; entries: typeof liveEventLog }[] = [];
        const seen = new Set<string>();

        liveEventLog.forEach(entry => {
            const key = entry.venueId ?? '__scan__';
            if (!seen.has(key)) {
                seen.add(key);
                groups.push({
                    venueId: entry.venueId,
                    label: entry.venueId ? (venueNameMap[entry.venueId] ?? 'Unknown Venue') : 'ID Scans',
                    entries: [],
                });
            }
            const group = groups.find(g => (g.venueId ?? '__scan__') === key);
            group?.entries.push(entry);
        });

        return groups;
    }, [liveEventLog, venueNameMap]);

    // --- Render: No businesses (new user / redirecting to onboarding) ---
    if (!isLoading && businesses.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    // --- Render: Loading ---
    if (isLoading) {
        return (
            <div className="space-y-8 animate-pulse">
                <div className="h-10 w-64 bg-slate-800 rounded-xl" />
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="glass-panel p-5 rounded-2xl border border-slate-800 h-32" />
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="glass-panel p-6 rounded-2xl border border-slate-800 h-64" />
                    <div className="glass-panel p-6 rounded-2xl border border-slate-800 h-64" />
                </div>
            </div>
        );
    }

    // --- Render: No business selected ---
    if (activeBusiness === null && businesses.length > 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-slate-400 text-lg">Select a business from the sidebar to view insights</p>
            </div>
        );
    }

    // Badge styling helpers
    const badgeClass: Record<string, string> = {
        ENTRY: 'bg-slate-700 text-slate-200',
        EXIT: 'bg-amber-900/60 text-amber-300',
        ID_ACCEPTED: 'bg-emerald-900/60 text-emerald-300',
        ID_DENIED: 'bg-red-900/60 text-red-300',
    };

    const badgeLabel: Record<string, string> = {
        ENTRY: 'ENTRY',
        EXIT: 'EXIT',
        ID_ACCEPTED: 'ID ACCEPTED',
        ID_DENIED: 'ID DENIED',
    };

    return (
        <div className="space-y-8 animate-[fade-in_0.5s_ease-out]">
            {/* Page Header - Design */}
            <div className="mb-8">
                <div className="flex items-center gap-4 mb-2">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-900/50 to-blue-900/50 border border-purple-500/20 flex items-center justify-center">
                        <TrendingUp className="w-6 h-6 text-purple-400" />
                    </div>
                    <div className="flex-1">
                        <h1 className="text-3xl mb-1">Live Insights</h1>
                        <p className="text-gray-400 text-sm">Real-time data from all connected devices.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="px-4 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors flex items-center gap-2 text-sm">
                            <Calendar className="w-4 h-4" />
                            <span>Tonight</span>
                        </button>
                        <button
                            disabled={isResetting}
                            onClick={async () => {
                                if (activeBusiness && window.confirm('Are you sure you want to reset all occupancy counts to 0?')) {
                                    setIsResetting(true);
                                    await resetCounts();
                                    setIsResetting(false);
                                }
                            }}
                            className={cn(
                                "px-4 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors flex items-center gap-2 text-sm",
                                isResetting && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            <RefreshCw className={cn("w-4 h-4", isResetting && "animate-spin")} />
                            <span>Reset Data</span>
                        </button>
                        <button className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors flex items-center gap-2 text-sm">
                            <Download className="w-4 h-4" />
                            <span>Export</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Getting Started Checklist */}
            <GettingStartedChecklist />

            {/* KPI Cards - Design */}
            <div className={cn("grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6 transition-opacity duration-300", isResetting && "opacity-40 pointer-events-none")}>
                <KpiCard
                    label="Live Occupancy"
                    value={liveOccupancy}
                    detail={`Peak: ${peakOccupancy}`}
                    icon={Users}
                />
                <KpiCard
                    label="Total Entries"
                    value={totalEntries}
                    detail={`Exits: -${totalExits}`}
                    icon={TrendingUp}
                    iconColor="text-emerald-500"
                    valueColor="text-emerald-400"
                    detailColor="text-red-400"
                />
                <KpiCard
                    label="Scans Processed"
                    value={totalScans}
                    detail={`${deniedPct}% Denied`}
                    icon={ScanLine}
                    iconColor="text-purple-500"
                    valueColor="text-purple-400"
                />
                <KpiCard
                    label="Banned Hits"
                    value={activeBansCount}
                    detail="Flagged instantly"
                    icon={ShieldBan}
                    iconColor="text-red-500"
                    valueColor="text-red-400"
                />
            </div>

            {/* Age Distribution + Live Event Log - Design */}
            <div className={cn("grid grid-cols-1 lg:grid-cols-3 gap-6 transition-opacity duration-300", isResetting && "opacity-40 pointer-events-none")}>
                {/* Age Distribution */}
                <div className="lg:col-span-2 bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="text-lg">Age Distribution</div>
                    </div>
                    <div className="text-sm text-gray-400 mb-6">ID scans accepted · Tonight</div>
                    <div className="space-y-3">
                        {Object.entries(ageDistribution).map(([band, count]) => (
                            <AgeBand
                                key={band}
                                band={band}
                                count={count}
                                max={maxAgeBandCount}
                            />
                        ))}
                    </div>
                </div>

                {/* Live Event Log */}
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        <div className="text-lg">Live Event Log</div>
                    </div>
                    <div className="space-y-4">
                        {liveEventLog.length === 0 && (
                            <p className="text-xs text-gray-600 italic">No events recorded tonight.</p>
                        )}
                        {venueGroups.map(group => (
                            <div key={group.venueId ?? '__scan__'} className="mb-3 last:mb-0">
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">{group.label}</p>
                                <div className="space-y-2">
                                    {group.entries.map(entry => (
                                        <div key={entry.id} className="border-l-2 border-gray-800 pl-4 pb-4 relative">
                                            <div className={cn(
                                                "text-xs uppercase tracking-wide mb-1",
                                                entry.kind === "ENTRY" ? "text-emerald-400" :
                                                entry.kind === "EXIT" ? "text-blue-400" : "text-gray-400"
                                            )}>
                                                {badgeLabel[entry.kind]}
                                            </div>
                                            <div className="text-sm text-gray-300 mb-1">
                                                {entry.areaId ? areaMap[entry.areaId] ?? 'Unknown Area' : '—'}
                                            </div>
                                            <div className="text-xs text-gray-500">{formatTime(entry.ts)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
