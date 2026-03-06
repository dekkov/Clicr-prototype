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
import type { IDScanEvent, CountEvent } from '@/lib/types';
import type { HeatmapData } from '@/app/api/reports/heatmap/route';
import {
    BarChart, Bar, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine
} from 'recharts';

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

const GenderBreakdown = ({ scanEvents }: { scanEvents: IDScanEvent[] }) => {
    const accepted = scanEvents.filter(s => s.scan_result === 'ACCEPTED');
    const total = accepted.length;
    const male = accepted.filter(s => s.sex?.toUpperCase().startsWith('M')).length;
    const female = accepted.filter(s => s.sex?.toUpperCase().startsWith('F')).length;
    const unknown = total - male - female;

    const malePct = total > 0 ? Math.round((male / total) * 100) : 0;
    const femalePct = total > 0 ? Math.round((female / total) * 100) : 0;
    const unknownPct = total > 0 ? 100 - malePct - femalePct : 0;

    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-lg">Gender Breakdown</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">Based on accepted ID scans</p>
            <div className="flex h-4 rounded-full overflow-hidden mb-3">
                <div className="bg-blue-500 transition-all" style={{ width: `${malePct}%` }} />
                <div className="bg-pink-500 transition-all" style={{ width: `${femalePct}%` }} />
                <div className="bg-gray-600 transition-all" style={{ width: `${unknownPct}%` }} />
            </div>
            <div className="flex items-center gap-6 text-sm">
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                    Male <span className="text-white ml-1">{malePct}%</span>
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-pink-500 inline-block" />
                    Female <span className="text-white ml-1">{femalePct}%</span>
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-500 inline-block" />
                    Unknown <span className="text-white ml-1">{unknownPct}%</span>
                </span>
            </div>
        </div>
    );
};

const HourlyTraffic = ({ data }: { data: { hour: string; entries: number; exits: number }[] }) => (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            <span className="text-lg">Hourly Traffic</span>
        </div>
        <p className="text-xs text-gray-500 mb-4">Entries vs. exits by hour</p>
        <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                <Bar dataKey="entries" fill="#10b981" radius={[3,3,0,0]} />
                <Bar dataKey="exits" fill="#ef4444" radius={[3,3,0,0]} />
            </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500" /> Entries</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500" /> Exits</span>
        </div>
    </div>
);

const OccupancyOverTime = ({ data, peak }: { data: { hour: string; occupancy: number }[]; peak: number }) => (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            <span className="text-lg">Occupancy Over Time</span>
        </div>
        <p className="text-xs text-gray-500 mb-4">Net occupancy by hour · peak marker shown</p>
        <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data}>
                <defs>
                    <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                <ReferenceLine y={peak} stroke="#a78bfa" strokeDasharray="4 4" label={{ value: 'Peak', fill: '#a78bfa', fontSize: 10 }} />
                <Area type="monotone" dataKey="occupancy" stroke="#6366f1" fill="url(#occGrad)" strokeWidth={2} />
            </AreaChart>
        </ResponsiveContainer>
    </div>
);

const HEATMAP_HOURS = [8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1,2];
const HEATMAP_HOUR_LABELS = ['8a','9a','10a','11a','12p','1p','2p','3p','4p','5p','6p','7p','8p','9p','10p','11p','12a','1a','2a'];
const HEATMAP_DAYS = [
    { label: 'Mon', jsDay: 1 },
    { label: 'Tue', jsDay: 2 },
    { label: 'Wed', jsDay: 3 },
    { label: 'Thu', jsDay: 4 },
    { label: 'Fri', jsDay: 5 },
    { label: 'Sat', jsDay: 6 },
    { label: 'Sun', jsDay: 0 },
];
const INTENSITY_CLASSES = [
    'bg-gray-800',
    'bg-purple-900/60',
    'bg-purple-700/60',
    'bg-purple-600/80',
    'bg-purple-500',
];

const PeakTimesHeatmap = ({ data, loading }: { data: HeatmapData; loading: boolean }) => {
    const maxVal = useMemo(() => {
        let m = 1;
        Object.values(data).forEach(hours =>
            Object.values(hours).forEach(v => { if (v > m) m = v; })
        );
        return m;
    }, [data]);

    const intensityClass = (count: number) => {
        if (count === 0) return INTENSITY_CLASSES[0];
        const ratio = count / maxVal;
        if (ratio < 0.25) return INTENSITY_CLASSES[1];
        if (ratio < 0.5) return INTENSITY_CLASSES[2];
        if (ratio < 0.75) return INTENSITY_CLASSES[3];
        return INTENSITY_CLASSES[4];
    };

    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-lg">Peak Times Heatmap</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">Entry density by day × hour (all time)</p>
            {loading ? (
                <div className="h-40 animate-pulse bg-gray-800/50 rounded-lg" />
            ) : (
                <div className="overflow-x-auto">
                    <div className="min-w-[600px]">
                        <div className="flex mb-1 ml-10">
                            {HEATMAP_HOUR_LABELS.map(h => (
                                <div key={h} className="flex-1 text-center text-[10px] text-gray-500">{h}</div>
                            ))}
                        </div>
                        {HEATMAP_DAYS.map(({ label, jsDay }) => (
                            <div key={label} className="flex items-center gap-1 mb-1">
                                <div className="w-9 text-xs text-gray-500 text-right pr-1">{label}</div>
                                {HEATMAP_HOURS.map(h => {
                                    const count = data[jsDay]?.[h] ?? 0;
                                    return (
                                        <div
                                            key={h}
                                            className={cn('flex-1 h-6 rounded-sm transition-colors', intensityClass(count))}
                                            title={`${label} ${HEATMAP_HOUR_LABELS[HEATMAP_HOURS.indexOf(h)]}: ${count} entries`}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                        <div className="flex items-center justify-end gap-1 mt-2">
                            <span className="text-[10px] text-gray-500 mr-1">Less</span>
                            {INTENSITY_CLASSES.map((cls, i) => (
                                <div key={i} className={cn('w-4 h-4 rounded-sm', cls)} />
                            ))}
                            <span className="text-[10px] text-gray-500 ml-1">More</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const LocationDistribution = ({ data }: { data: { state: string; count: number }[] }) => (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="text-lg mb-1">Location Distribution</div>
        <p className="text-xs text-gray-500 mb-4">Top states from accepted ID scans</p>
        {data.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No scan data tonight.</p>
        ) : (
            <ResponsiveContainer width="100%" height={data.length * 36 + 20}>
                <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <YAxis type="category" dataKey="state" tick={{ fill: '#9ca3af', fontSize: 12 }} width={70} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                    <Bar dataKey="count" fill="#6366f1" radius={[0,3,3,0]} />
                </BarChart>
            </ResponsiveContainer>
        )}
    </div>
);

const VenueContribution = ({ data }: { data: { name: string; count: number }[] }) => (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="text-lg mb-1">Venue Contribution</div>
        <p className="text-xs text-gray-500 mb-4">Entries by venue</p>
        {data.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No entry data tonight.</p>
        ) : (
            <ResponsiveContainer width="100%" height={data.length * 52 + 20}>
                <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={100} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                    <Bar dataKey="count" fill="#6366f1" radius={[0,3,3,0]} />
                </BarChart>
            </ResponsiveContainer>
        )}
    </div>
);

// --- Chart Helpers ---

function buildHourlyData(events: CountEvent[]) {
    const EVENING_HOURS = [18,19,20,21,22,23,0,1,2,3];
    const buckets: Record<number, { entries: number; exits: number }> = {};
    EVENING_HOURS.forEach(h => { buckets[h] = { entries: 0, exits: 0 }; });

    events.forEach(e => {
        const hour = new Date(e.timestamp).getHours();
        if (buckets[hour] !== undefined) {
            if (e.delta > 0) buckets[hour].entries += e.delta;
            else buckets[hour].exits += Math.abs(e.delta);
        }
    });

    return EVENING_HOURS.map(h => ({
        hour: h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`,
        entries: buckets[h].entries,
        exits: buckets[h].exits,
    }));
}

function buildOccupancyOverTime(events: CountEvent[]) {
    const EVENING_HOURS = [18,19,20,21,22,23,0,1,2,3];
    const buckets: Record<number, number> = {};
    EVENING_HOURS.forEach(h => { buckets[h] = 0; });

    events.forEach(e => {
        const hour = new Date(e.timestamp).getHours();
        if (buckets[hour] !== undefined) buckets[hour] += e.delta;
    });

    let running = 0;
    return EVENING_HOURS.map(h => {
        running = Math.max(0, running + buckets[h]);
        return {
            hour: h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`,
            occupancy: running,
        };
    });
}

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

    const [heatmapData, setHeatmapData] = useState<HeatmapData>({});
    const [heatmapLoading, setHeatmapLoading] = useState(true);

    useEffect(() => {
        fetch('/api/reports/heatmap')
            .then(r => r.json())
            .then(d => setHeatmapData(d.heatmap ?? {}))
            .catch(() => setHeatmapData({}))
            .finally(() => setHeatmapLoading(false));
    }, []);

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

    // Venue occupancy = VENUE_DOOR areas only (one per venue)
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

    const hourlyData = useMemo(() => buildHourlyData(todayEvents), [todayEvents]);
    const occupancyData = useMemo(() => buildOccupancyOverTime(todayEvents), [todayEvents]);
    const peakOccupancyValue = useMemo(
        () => Math.max(0, ...occupancyData.map(d => d.occupancy)),
        [occupancyData]
    );

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

    const locationData = useMemo(() => {
        const counts: Record<string, number> = {};
        todayScanEvents
            .filter(s => s.scan_result === 'ACCEPTED' && s.state)
            .forEach(s => { counts[s.state!] = (counts[s.state!] ?? 0) + 1; });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([state, count]) => ({ state, count }));
    }, [todayScanEvents]);

    const venueContribData = useMemo(() => {
        const counts: Record<string, number> = {};
        todayEvents
            .filter(e => e.delta > 0 && e.venue_id)
            .forEach(e => { counts[e.venue_id] = (counts[e.venue_id] ?? 0) + e.delta; });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([venueId, count]) => ({ name: venueNameMap[venueId] ?? 'Unknown', count }));
    }, [todayEvents, venueNameMap]);

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

            {/* Gender Breakdown */}
            <GenderBreakdown scanEvents={todayScanEvents} />

            {/* Hourly Traffic + Occupancy Over Time */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <HourlyTraffic data={hourlyData} />
                <OccupancyOverTime data={occupancyData} peak={peakOccupancyValue} />
            </div>

            {/* Peak Times Heatmap */}
            <PeakTimesHeatmap data={heatmapData} loading={heatmapLoading} />

            {/* Location Distribution + Venue Contribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <LocationDistribution data={locationData} />
                <VenueContribution data={venueContribData} />
            </div>
        </div>
    );
}
