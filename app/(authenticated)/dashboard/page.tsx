"use client";

import React, { useMemo, useEffect, useState } from 'react';
import { useApp } from '@/lib/store';
import {
    Users, TrendingUp, ScanLine, ShieldBan,
    Calendar, RefreshCw, Download, MapPin
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { GettingStartedChecklist } from './_components/GettingStartedChecklist';
import type { CountEvent, Venue } from '@/lib/types';
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

const GenderBreakdown = ({ events }: { events: CountEvent[] }) => {
    const entries = events.filter(e => e.delta > 0);
    const total = entries.length;
    const male = entries.filter(e => e.gender === 'M').length;
    const female = entries.filter(e => e.gender === 'F').length;
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
            <p className="text-xs text-gray-500 mb-4">Based on gender-tagged entries tonight</p>
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
const EVENING_HOURS = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3];

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
            ) : Object.keys(data).length === 0 ? (
                <p className="text-sm text-gray-600 italic text-center py-8">No historical data yet. Data appears after events are recorded.</p>
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

const TrafficFlow = ({
    totalEntries, totalScans, accepted, denied, banned, netOcc, areaDistrib,
}: {
    totalEntries: number; totalScans: number; accepted: number;
    denied: number; banned: number; netOcc: number;
    areaDistrib: { name: string; count: number; pct: number }[];
}) => {
    const max = Math.max(totalEntries, 1);
    const funnelRows = [
        { label: 'Total Entries', value: totalEntries, color: 'bg-indigo-500', textColor: 'text-white' },
        { label: 'IDs Scanned', value: totalScans, color: 'bg-indigo-400', textColor: 'text-white' },
        { label: 'Accepted', value: accepted, color: 'bg-emerald-500', textColor: 'text-emerald-300' },
        { label: 'Denied', value: denied, color: 'bg-orange-500', textColor: 'text-orange-300' },
        { label: 'Banned', value: banned, color: 'bg-red-500', textColor: 'text-red-300' },
        { label: 'Net Occupancy', value: netOcc, color: 'bg-cyan-500', textColor: 'text-cyan-300' },
    ];
    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <div className="text-lg mb-1">Traffic Flow</div>
            <p className="text-xs text-gray-500 mb-4">Where your traffic is concentrated</p>

            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Processing Funnel</p>
            <div className="space-y-2 mb-6">
                {funnelRows.map(row => (
                    <div key={row.label} className="flex items-center gap-3">
                        <div className="w-28 text-xs text-gray-400 shrink-0">{row.label}</div>
                        <div className="flex-1 h-6 bg-gray-800 rounded overflow-hidden">
                            <div
                                className={cn('h-full rounded transition-all', row.color)}
                                style={{ width: `${(row.value / max) * 100}%` }}
                            />
                        </div>
                        <div className={cn('w-8 text-right text-sm font-medium', row.textColor)}>{row.value}</div>
                    </div>
                ))}
            </div>

            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Area Distribution</p>
            <div className="space-y-2">
                {areaDistrib.length === 0 && <p className="text-xs text-gray-600 italic">No entries yet.</p>}
                {areaDistrib.map(a => (
                    <div key={a.name} className="flex items-center gap-3">
                        <div className="w-28 text-xs text-gray-400 truncate shrink-0">{a.name}</div>
                        <div className="flex-1 h-5 bg-gray-800 rounded overflow-hidden">
                            <div className="h-full bg-purple-600 rounded" style={{ width: `${a.pct}%` }} />
                        </div>
                        <div className="w-10 text-right text-xs text-gray-400">{a.pct}%</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const WorkflowNode = ({ label, icon, color }: { label: string; icon: string; color: string }) => (
    <div className={cn('px-3 py-2 rounded-lg border text-xs text-center min-w-[90px]', color)}>
        <span className="mr-1">{icon}</span>{label}
    </div>
);

const OperationalWorkflow = () => (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="text-lg mb-1">Operational Workflow</div>
        <p className="text-xs text-gray-500 mb-6">How the system updates in real time</p>
        <div className="flex flex-col items-center gap-3 select-none">
            <div className="flex items-center gap-2">
                <WorkflowNode label="ID Scan" icon="🪪" color="border-gray-600 bg-gray-800 text-gray-200" />
                <span className="text-gray-600">→</span>
                <WorkflowNode label="Verify" icon="✓" color="border-emerald-800 bg-emerald-900/30 text-emerald-300" />
                <span className="text-gray-600">→</span>
                <WorkflowNode label="Ban Check" icon="🛡" color="border-amber-800 bg-amber-900/30 text-amber-300" />
            </div>
            <div className="text-gray-600 text-lg">↓</div>
            <div className="flex items-center gap-8">
                <WorkflowNode label="✓ Accept" icon="" color="border-emerald-700 bg-emerald-900/40 text-emerald-300" />
                <WorkflowNode label="✗ Deny" icon="" color="border-red-700 bg-red-900/40 text-red-300" />
            </div>
            <div className="text-gray-600 text-lg">↓</div>
            <div className="flex items-center gap-2">
                <WorkflowNode label="Add to Count" icon="📊" color="border-blue-800 bg-blue-900/30 text-blue-300" />
                <span className="text-gray-600">→</span>
                <WorkflowNode label="Event Log" icon="📋" color="border-purple-800 bg-purple-900/30 text-purple-300" />
                <span className="text-gray-600">→</span>
                <WorkflowNode label="Reports" icon="📈" color="border-indigo-800 bg-indigo-900/30 text-indigo-300" />
            </div>
        </div>
    </div>
);

const LiveVenues = ({ data, onViewAll }: {
    data: { venue: Venue; occupancy: number; capacity: number | null; pctFull: number | null; venueEntries: number; venueExits: number; areaCount: number }[];
    onViewAll: () => void;
}) => {
    if (data.length === 0) return null;
    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="text-lg">Live Venues</span>
                </div>
                <button
                    onClick={onViewAll}
                    className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                    View all →
                </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.map(({ venue, occupancy, capacity, pctFull, venueEntries, venueExits, areaCount }) => (
                    <div key={venue.id} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <p className="font-medium text-white">{venue.name}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{areaCount} area{areaCount !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-semibold text-white">{occupancy}</p>
                                {capacity && <p className="text-xs text-gray-500">of {capacity}</p>}
                            </div>
                        </div>
                        {pctFull !== null && (
                            <div className="mb-3">
                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                    <span>{pctFull}% full</span>
                                </div>
                                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                        className={cn(
                                            'h-full rounded-full transition-all',
                                            pctFull >= 90 ? 'bg-red-500' :
                                            pctFull >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                                        )}
                                        style={{ width: `${Math.min(100, pctFull)}%` }}
                                    />
                                </div>
                            </div>
                        )}
                        <div className="flex gap-3 text-xs">
                            <span className="text-emerald-400">+{venueEntries}</span>
                            <span className="text-red-400">-{venueExits}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- Chart Helpers ---

function buildHourlyData(events: CountEvent[]) {
    const buckets: Record<number, { entries: number; exits: number }> = {};
    // Seed evening hours so they always appear even with no data
    EVENING_HOURS.forEach(h => { buckets[h] = { entries: 0, exits: 0 }; });

    events.forEach(e => {
        const hour = new Date(e.timestamp).getHours();
        // Include any hour, not just EVENING_HOURS
        if (!buckets[hour]) buckets[hour] = { entries: 0, exits: 0 };
        if (e.delta > 0) buckets[hour].entries += e.delta;
        else buckets[hour].exits += Math.abs(e.delta);
    });

    // Sort hours in evening-first order (18→23, then 0→17)
    const hours = Object.keys(buckets).map(Number).sort((a, b) => {
        const aAdj = a < 18 ? a + 24 : a;
        const bAdj = b < 18 ? b + 24 : b;
        return aAdj - bAdj;
    });

    return hours.map(h => ({
        hour: h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`,
        entries: buckets[h].entries,
        exits: buckets[h].exits,
    }));
}

function buildOccupancyOverTime(events: CountEvent[]) {
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

    // Venue occupancy = sum of venues.current_occupancy
    const liveOccupancy = useMemo(
        () => venues.reduce((sum, v) => sum + (v.current_occupancy ?? 0), 0),
        [venues]
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

    // Live Event Log — count events only (ENTRY/EXIT), newest first, last 5
    const liveEventLog = useMemo(() => {
        type LogEntry = {
            id: string;
            ts: number;
            kind: 'ENTRY' | 'EXIT';
            areaId?: string;
            gender?: 'M' | 'F';
        };

        return todayEvents
            .map((e): LogEntry => ({
                id: `c-${e.id}`,
                ts: e.timestamp,
                kind: e.delta > 0 ? 'ENTRY' : 'EXIT',
                areaId: e.area_id ?? undefined,
                gender: e.gender as 'M' | 'F' | undefined,
            }))
            .sort((a, b) => b.ts - a.ts)
            .slice(0, 5);
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

    const areaDistribData = useMemo(() => {
        const counts: Record<string, number> = {};
        todayEvents
            .filter(e => e.delta > 0 && e.area_id)
            .forEach(e => { counts[e.area_id!] = (counts[e.area_id!] ?? 0) + e.delta; });
        const totalIn = Object.values(counts).reduce((s, v) => s + v, 0);
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([areaId, count]) => ({
                name: areaMap[areaId] ?? 'Unknown',
                count,
                pct: totalIn > 0 ? Math.round((count / totalIn) * 100) : 0,
            }));
    }, [todayEvents, areaMap]);

    const liveVenuesData = useMemo(() => {
        return venues.map(venue => {
            const venueAreas = areas.filter(a => a.venue_id === venue.id);
            const occupancy = venue.current_occupancy ?? 0;
            const capacity = venue.total_capacity ?? null;
            const pctFull = capacity && capacity > 0 ? Math.round((occupancy / capacity) * 100) : null;

            const venueEvents = todayEvents.filter(e => e.venue_id === venue.id);
            const venueEntries = venueEvents.filter(e => e.delta > 0).reduce((s, e) => s + e.delta, 0);
            const venueExits = venueEvents.filter(e => e.delta < 0).reduce((s, e) => s + Math.abs(e.delta), 0);
            const areaCount = venueAreas.filter(a => a.is_active).length;

            return { venue, occupancy, capacity, pctFull, venueEntries, venueExits, areaCount };
        });
    }, [venues, areas, todayEvents]);

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
                    <div className="space-y-2">
                        {liveEventLog.length === 0 && (
                            <p className="text-xs text-gray-600 italic">No events recorded tonight.</p>
                        )}
                        {liveEventLog.map(entry => (
                            <div key={entry.id} className="border-l-2 border-gray-800 pl-3 py-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className={cn(
                                        "text-xs uppercase tracking-wide",
                                        entry.kind === "ENTRY" ? "text-emerald-400" : "text-red-400"
                                    )}>
                                        {badgeLabel[entry.kind]}
                                    </span>
                                    {entry.gender && (
                                        <span className={cn(
                                            "text-[10px] font-bold px-1 rounded",
                                            entry.gender === 'M' ? "bg-blue-900/60 text-blue-300" : "bg-pink-900/60 text-pink-300"
                                        )}>
                                            {entry.gender}
                                        </span>
                                    )}
                                </div>
                                <div className="text-sm text-gray-300">
                                    {entry.areaId ? areaMap[entry.areaId] ?? 'Unknown Area' : '—'}
                                </div>
                                <div className="text-xs text-gray-500">{formatTime(entry.ts)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Gender Breakdown */}
            <GenderBreakdown events={todayEvents} />

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

            {/* Traffic Flow + Operational Workflow */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TrafficFlow
                    totalEntries={totalEntries}
                    totalScans={totalScans}
                    accepted={totalScans - deniedCount}
                    denied={deniedCount}
                    banned={activeBansCount}
                    netOcc={liveOccupancy}
                    areaDistrib={areaDistribData}
                />
                <OperationalWorkflow />
            </div>

            {/* Live Venues */}
            <LiveVenues data={liveVenuesData} onViewAll={() => router.push('/areas')} />
        </div>
    );
}
