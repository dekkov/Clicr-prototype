"use client";

import React, { useMemo, useEffect, useState } from 'react';
import { useApp } from '@/lib/store';
import {
    Users, TrendingUp, ScanLine, ShieldBan,
    Calendar, RefreshCw, Download, ChevronDown
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
    iconBg,
    detailColor,
}: {
    label: string;
    value: string | number;
    detail: string;
    icon: React.ElementType;
    iconBg: string;
    detailColor?: string;
}) => (
    <div className="glass-panel p-5 rounded-2xl border border-slate-800">
        <div className="flex items-start justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{label}</span>
            <div className={cn("p-2 rounded-xl", iconBg)}>
                <Icon className="w-4 h-4" />
            </div>
        </div>
        <div className="text-4xl font-bold font-mono text-white mb-1">{value}</div>
        <div className={cn("text-sm font-medium", detailColor ?? "text-slate-400")}>{detail}</div>
    </div>
);

const AgeBand = ({ band, count, max }: { band: string; count: number; max: number }) => (
    <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 w-12 shrink-0">{band}</span>
        <div className="flex-1 h-5 bg-slate-800/60 rounded overflow-hidden">
            <div
                className="h-full bg-primary/80 rounded transition-all"
                style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }}
            />
        </div>
        <span className="text-sm font-bold text-slate-300 w-6 text-right">{count}</span>
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
    const {
        activeBusiness,
        businesses,
        areas,
        venues,
        events,
        scanEvents,
        bans,
        isLoading,
        resetCounts,
    } = useApp();

    const router = useRouter();

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

    const liveOccupancy = useMemo(
        () => areas.reduce((sum, a) => sum + (a.current_occupancy ?? 0), 0),
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
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Live Insights</h1>
                    <p className="text-slate-400 mt-1">Real-time data from all connected devices.</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Tonight pill */}
                    <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-full text-sm font-medium transition-colors">
                        <Calendar className="w-4 h-4" />
                        Tonight
                        <ChevronDown className="w-3 h-3" />
                    </button>
                    {/* Reset Data */}
                    <button
                        onClick={async () => {
                            if (
                                activeBusiness &&
                                window.confirm(
                                    'Are you sure you want to reset all occupancy counts to 0?'
                                )
                            ) {
                                await resetCounts();
                            }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Reset Data
                    </button>
                    {/* Export */}
                    <button className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-primary/25">
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                </div>
            </div>

            {/* Getting Started Checklist */}
            <GettingStartedChecklist />

            {/* KPI Cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard
                    label="Live Occupancy"
                    value={liveOccupancy}
                    detail={`Peak: ${peakOccupancy}`}
                    icon={Users}
                    iconBg="bg-primary/20 text-primary"
                />
                <KpiCard
                    label="Total Entries"
                    value={totalEntries}
                    detail={`Exits: -${totalExits}`}
                    icon={TrendingUp}
                    iconBg="bg-amber-500/20 text-amber-400"
                    detailColor="text-amber-400"
                />
                <KpiCard
                    label="Scans Processed"
                    value={totalScans}
                    detail={`${deniedPct}% Denied`}
                    icon={ScanLine}
                    iconBg="bg-blue-500/20 text-blue-400"
                />
                <KpiCard
                    label="Banned Hits"
                    value={activeBansCount}
                    detail="Flagged instantly"
                    icon={ShieldBan}
                    iconBg="bg-red-500/20 text-red-400"
                />
            </div>

            {/* Age Distribution + Live Event Log */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Age Distribution */}
                <div className="glass-panel p-6 rounded-2xl border border-slate-800">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                        <h2 className="text-base font-bold text-white">Age Distribution</h2>
                    </div>
                    <p className="text-xs text-slate-500 mb-5">ID scans accepted · Tonight</p>
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
                <div className="glass-panel p-6 rounded-2xl border border-slate-800">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        <h2 className="text-base font-bold text-white">Live Event Log</h2>
                    </div>
                    {/* Live Event Log — grouped by venue */}
                    <div className="mt-4 max-h-72 overflow-y-auto pr-1">
                        {liveEventLog.length === 0 && (
                            <p className="text-xs text-slate-600 italic">No events recorded tonight.</p>
                        )}
                        {venueGroups.map(group => (
                                <div key={group.venueId ?? '__scan__'} className="mb-3 last:mb-0">
                                    {/* Venue label */}
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                        {group.label}
                                    </p>
                                    <div className="space-y-2">
                                        {group.entries.map(entry => (
                                            <div
                                                key={entry.id}
                                                className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-800/60 last:border-0"
                                            >
                                                <span className={cn('text-xs font-bold px-2 py-0.5 rounded-md shrink-0', badgeClass[entry.kind])}>
                                                    {badgeLabel[entry.kind]}
                                                </span>
                                                <span className="text-sm text-slate-400 flex-1 truncate">
                                                    {entry.areaId ? areaMap[entry.areaId] ?? 'Unknown Area' : '—'}
                                                </span>
                                                <span className="text-xs text-slate-500 shrink-0">
                                                    {formatTime(entry.ts)}
                                                </span>
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
