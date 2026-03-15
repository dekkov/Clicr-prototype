"use client";

import React, { useMemo, useEffect, useState, useRef } from 'react';
import { useApp } from '@/lib/store';
import {
    Users, TrendingUp, ScanLine, ShieldBan,
    Calendar, RefreshCw, Download, MapPin, RotateCcw, Timer, ChevronLeft,
    Pause, Play
} from 'lucide-react';
import { canEditVenuesAndAreas } from '@/lib/permissions';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/providers/theme-provider';
import { GettingStartedChecklist } from './_components/GettingStartedChecklist';
import type { CountEvent, Venue, Clicr, IDScanEvent, NightLog } from '@/lib/types';
import type { HeatmapData } from '@/app/api/reports/heatmap/route';
import { computeTrend } from '@/lib/trend-utils';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useReset } from '@/lib/reset-context';
import { getAutoDateLabel, getBusinessDayStart } from '@/lib/business-day';
import { CalendarGrid } from '@/components/reports/CalendarGrid';
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
    trend,
    trendValue,
}: {
    label: string;
    value: string | number;
    detail: string;
    icon: React.ElementType;
    iconColor?: string;
    valueColor?: string;
    detailColor?: string;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;
}) => (
    <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
            <div className="text-xs text-foreground/60 uppercase tracking-wide">{label}</div>
            <Icon className={cn("w-5 h-5", iconColor ?? "text-gray-500")} />
        </div>
        <div className="flex items-baseline mb-2">
            <div className={cn("text-4xl", valueColor ?? "text-foreground")}>{value}</div>
            {trendValue && (
                <span className={`text-xs font-medium ml-2 ${
                    trend === 'up' ? 'text-green-400' :
                    trend === 'down' ? 'text-red-400' :
                    'text-zinc-400'
                }`}>
                    {trendValue}
                </span>
            )}
        </div>
        <div className={cn("text-sm", detailColor ?? "text-foreground/60")}>{detail}</div>
    </div>
);

const AgeBand = ({ band, count, max }: { band: string; count: number; max: number }) => (
    <div className="flex items-center gap-4">
        <div className="w-16 text-sm text-muted-foreground">{band}</div>
        <div className="flex-1 h-10 bg-purple-100 dark:bg-muted rounded-lg overflow-hidden">
            <div
                className="h-full bg-gradient-to-r from-purple-600 to-purple-500 rounded-lg transition-all"
                style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }}
            />
        </div>
        <div className="w-12 text-right text-sm">{count}</div>
    </div>
);

const LABEL_COLORS = ['bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-purple-500', 'bg-pink-500', 'bg-cyan-500'];

const GENDER_COLORS: Record<string, string> = { 'Male': 'bg-blue-500', 'Female': 'bg-pink-500', 'Other': 'bg-amber-500', 'Unknown': 'bg-gray-500' };

const GenderBreakdown = ({ scanEvents }: { scanEvents: IDScanEvent[] }) => {
    const accepted = scanEvents.filter(s => s.scan_result === 'ACCEPTED' && s.sex);
    const total = accepted.length;

    const counts: Record<string, number> = {};
    accepted.forEach(s => {
        const sex = s.sex?.toUpperCase();
        const label = sex === 'M' || sex === 'MALE' ? 'Male'
            : sex === 'F' || sex === 'FEMALE' ? 'Female'
            : 'Other';
        counts[label] = (counts[label] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);

    return (
        <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-lg">Gender Breakdown</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">Accepted ID scans by gender tonight</p>
            {total === 0 ? (
                <p className="text-xs text-muted-foreground/60 italic">No scan data yet.</p>
            ) : (
                <>
                    <div className="flex h-4 rounded-full overflow-hidden mb-3">
                        {sorted.map(([name, count]) => (
                            <div key={name} className={`${GENDER_COLORS[name] || 'bg-gray-500'} transition-all`} style={{ width: `${(count / total) * 100}%` }} />
                        ))}
                    </div>
                    <div className="flex items-center gap-6 text-sm flex-wrap">
                        {sorted.map(([name, count]) => (
                            <span key={name} className="flex items-center gap-1.5">
                                <span className={`w-2.5 h-2.5 rounded-full ${GENDER_COLORS[name] || 'bg-gray-500'} inline-block`} />
                                {name} <span className="text-foreground ml-1">{Math.round((count / total) * 100)}%</span>
                            </span>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

const STATE_PALETTE = ['bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-rose-500', 'bg-sky-500'];

const StateBreakdown = ({ scanEvents }: { scanEvents: IDScanEvent[] }) => {
    const accepted = scanEvents.filter(s => s.scan_result === 'ACCEPTED' && (s.issuing_state || s.state));
    const total = accepted.length;

    const counts: Record<string, number> = {};
    accepted.forEach(s => {
        const st = (s.issuing_state || s.state || '').toUpperCase();
        if (st) counts[st] = (counts[st] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    const top5 = sorted.slice(0, 5);
    const otherCount = sorted.slice(5).reduce((sum, [, c]) => sum + c, 0);
    if (otherCount > 0) top5.push(['Other', otherCount]);

    return (
        <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-lg">ID State</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">Where patrons' IDs are from tonight</p>
            {total === 0 ? (
                <p className="text-xs text-muted-foreground/60 italic">No scan data yet.</p>
            ) : (
                <>
                    <div className="flex h-4 rounded-full overflow-hidden mb-3">
                        {top5.map(([name, count], i) => (
                            <div key={name} className={`${STATE_PALETTE[i % STATE_PALETTE.length]} transition-all`} style={{ width: `${(count / total) * 100}%` }} />
                        ))}
                    </div>
                    <div className="flex items-center gap-6 text-sm flex-wrap">
                        {top5.map(([name, count], i) => (
                            <span key={name} className="flex items-center gap-1.5">
                                <span className={`w-2.5 h-2.5 rounded-full ${STATE_PALETTE[i % STATE_PALETTE.length]} inline-block`} />
                                {name} <span className="text-foreground ml-1">{Math.round((count / total) * 100)}%</span>
                            </span>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

const CityBreakdown = ({ scanEvents }: { scanEvents: IDScanEvent[] }) => {
    const accepted = scanEvents.filter(s => s.scan_result === 'ACCEPTED' && s.city);
    const counts: Record<string, number> = {};
    accepted.forEach(s => {
        const raw = (s.city || '').trim();
        if (!raw) return;
        // Title case: "SPRINGFIELD" → "Springfield"
        const city = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
        counts[city] = (counts[city] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    const top5 = sorted.slice(0, 5);
    const otherCount = sorted.slice(5).reduce((sum, [, c]) => sum + c, 0);
    if (otherCount > 0) top5.push(['Other', otherCount]);
    const maxCount = top5.length > 0 ? top5[0][1] as number : 0;

    return (
        <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-lg">City</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">Top cities from accepted scans tonight</p>
            {top5.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 italic">No scan data yet.</p>
            ) : (
                <div className="space-y-3">
                    {top5.map(([city, count]) => (
                        <div key={city} className="flex items-center gap-4">
                            <div className="w-20 text-sm text-muted-foreground truncate">{city}</div>
                            <div className="flex-1 h-8 bg-muted rounded-lg overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-teal-600 to-teal-500 rounded-lg transition-all"
                                    style={{ width: `${maxCount > 0 ? ((count as number) / maxCount) * 100 : 0}%` }}
                                />
                            </div>
                            <div className="w-10 text-right text-sm">{count}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const HourlyTraffic = ({ data, colors }: { data: { hour: string; entries: number; exits: number }[]; colors: { grid: string; text: string; tooltipBg: string; tooltipBorder: string } }) => (
    <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="text-lg">Hourly Traffic</span>
        </div>
        <p className="text-xs text-gray-500 mb-4">Entries vs. exits by hour</p>
        <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
                <XAxis dataKey="hour" tick={{ fill: colors.text, fontSize: 11 }} />
                <YAxis tick={{ fill: colors.text, fontSize: 11 }} />
                <Tooltip contentStyle={{ background: colors.tooltipBg, border: '1px solid ' + colors.tooltipBorder, borderRadius: 8 }} />
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

const OccupancyOverTime = ({ data, peak, colors }: { data: { hour: string; occupancy: number }[]; peak: number; colors: { grid: string; text: string; tooltipBg: string; tooltipBorder: string } }) => (
    <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
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
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
                <XAxis dataKey="hour" tick={{ fill: colors.text, fontSize: 11 }} />
                <YAxis tick={{ fill: colors.text, fontSize: 11 }} />
                <Tooltip contentStyle={{ background: colors.tooltipBg, border: '1px solid ' + colors.tooltipBorder, borderRadius: 8 }} />
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
    'bg-zinc-200 dark:bg-muted',
    'bg-purple-200/70 dark:bg-purple-900/60',
    'bg-purple-700/60',
    'bg-primary/80',
    'bg-purple-500',
];
const EVENING_HOURS = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3];

const PeakTimesHeatmap = ({ data }: { data: HeatmapData }) => {
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
        <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-lg">Peak Times Heatmap</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">Entry density by day × hour (since last reset)</p>
            {Object.keys(data).length === 0 ? (
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

const LocationDistribution = ({ data, colors }: { data: { state: string; count: number }[]; colors: { grid: string; text: string; tooltipBg: string; tooltipBorder: string } }) => (
    <div className="bg-card border border-border rounded-xl p-6">
        <div className="text-lg mb-1">Location Distribution</div>
        <p className="text-xs text-gray-500 mb-4">Top states from accepted ID scans</p>
        {data.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No scan data tonight.</p>
        ) : (
            <ResponsiveContainer width="100%" height={data.length * 36 + 20}>
                <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" tick={{ fill: colors.text, fontSize: 11 }} />
                    <YAxis type="category" dataKey="state" tick={{ fill: colors.text, fontSize: 12 }} width={70} />
                    <Tooltip contentStyle={{ background: colors.tooltipBg, border: '1px solid ' + colors.tooltipBorder, borderRadius: 8 }} />
                    <Bar dataKey="count" fill="#6366f1" radius={[0,3,3,0]} />
                </BarChart>
            </ResponsiveContainer>
        )}
    </div>
);

const VenueContribution = ({ data, colors }: { data: { name: string; count: number }[]; colors: { grid: string; text: string; tooltipBg: string; tooltipBorder: string } }) => (
    <div className="bg-card border border-border rounded-xl p-6">
        <div className="text-lg mb-1">Venue Contribution</div>
        <p className="text-xs text-gray-500 mb-4">Entries by venue</p>
        {data.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No entry data tonight.</p>
        ) : (
            <ResponsiveContainer width="100%" height={data.length * 52 + 20}>
                <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" tick={{ fill: colors.text, fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fill: colors.text, fontSize: 12 }} width={100} />
                    <Tooltip contentStyle={{ background: colors.tooltipBg, border: '1px solid ' + colors.tooltipBorder, borderRadius: 8 }} />
                    <Bar dataKey="count" fill="#6366f1" radius={[0,3,3,0]} />
                </BarChart>
            </ResponsiveContainer>
        )}
    </div>
);

const TrafficFlow = ({
    totalEntries, totalScans, accepted, denied, banned, netOcc, areaDistrib,
    turnarounds, netAdjusted,
}: {
    totalEntries: number; totalScans: number; accepted: number;
    denied: number; banned: number; netOcc: number;
    areaDistrib: { name: string; count: number; pct: number }[];
    turnarounds: number; netAdjusted: number;
}) => {
    const funnelRows = [
        { label: 'Total Entries', value: totalEntries, textColor: 'text-foreground' },
        { label: 'IDs Scanned', value: totalScans, textColor: 'text-foreground' },
        { label: 'Accepted', value: accepted, textColor: 'text-emerald-400' },
        { label: 'Denied', value: denied, textColor: 'text-orange-400' },
        { label: 'Banned', value: banned, textColor: 'text-red-400' },
        { label: 'Turnarounds', value: turnarounds, textColor: 'text-amber-400' },
        { label: 'Net Entries', value: netAdjusted, textColor: 'text-teal-400' },
        { label: 'Net Occupancy', value: netOcc, textColor: 'text-cyan-400' },
    ];
    return (
        <div className="bg-card border border-border rounded-xl p-6">
            <div className="text-lg mb-1">Traffic Flow</div>
            <p className="text-xs text-gray-500 mb-4">Where your traffic is concentrated</p>

            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Processing Funnel</p>
            <div className="space-y-1.5 mb-6">
                {funnelRows.map(row => (
                    <div key={row.label} className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{row.label}</span>
                        <span className={cn('text-sm font-semibold tabular-nums', row.textColor)}>{row.value}</span>
                    </div>
                ))}
            </div>

            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Area Distribution</p>
            <div className="space-y-1.5">
                {areaDistrib.length === 0 && <p className="text-xs text-gray-600 italic">No entries yet.</p>}
                {areaDistrib.map(a => (
                    <div key={a.name} className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground truncate">{a.name}</span>
                        <span className="text-sm font-semibold tabular-nums text-foreground">{a.pct}%</span>
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
    <div className="bg-card border border-border rounded-xl p-6">
        <div className="text-lg mb-1">Operational Workflow</div>
        <p className="text-xs text-gray-500 mb-6">How the system updates in real time</p>
        <div className="flex flex-col items-center gap-3 select-none">
            <div className="flex items-center gap-2">
                <WorkflowNode label="ID Scan" icon="🪪" color="border-border bg-muted text-foreground" />
                <span className="text-gray-600">→</span>
                <WorkflowNode label="Verify" icon="✓" color="border-emerald-300 dark:border-emerald-800 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300" />
                <span className="text-gray-600">→</span>
                <WorkflowNode label="Ban Check" icon="🛡" color="border-amber-300 dark:border-amber-800 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300" />
            </div>
            <div className="text-gray-600 text-lg">↓</div>
            <div className="flex items-center gap-8">
                <WorkflowNode label="✓ Accept" icon="" color="border-emerald-300 dark:border-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300" />
                <WorkflowNode label="✗ Deny" icon="" color="border-red-300 dark:border-red-700 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300" />
            </div>
            <div className="text-gray-600 text-lg">↓</div>
            <div className="flex items-center gap-2">
                <WorkflowNode label="Add to Count" icon="📊" color="border-blue-300 dark:border-blue-800 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300" />
                <span className="text-gray-600">→</span>
                <WorkflowNode label="Event Log" icon="📋" color="border-purple-300 dark:border-purple-800 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300" />
                <span className="text-gray-600">→</span>
                <WorkflowNode label="Reports" icon="📈" color="border-indigo-300 dark:border-indigo-800 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300" />
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
        <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
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
                    <div key={venue.id} className="bg-card/60 border border-border rounded-xl p-4">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <p className="font-medium text-foreground">{venue.name}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{areaCount} area{areaCount !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-semibold text-foreground">{occupancy}</p>
                                {capacity && <p className="text-xs text-gray-500">of {capacity}</p>}
                            </div>
                        </div>
                        {pctFull !== null && (
                            <div className="mb-3">
                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                    <span>{pctFull}% full</span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
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

function buildHeatmap(events: CountEvent[]): HeatmapData {
    const heatmap: HeatmapData = {};
    for (const e of events) {
        if (e.delta <= 0) continue;
        const d = new Date(e.timestamp);
        const day = d.getDay();
        const hour = d.getHours();
        if (!heatmap[day]) heatmap[day] = {};
        heatmap[day][hour] = (heatmap[day][hour] ?? 0) + 1;
    }
    return heatmap;
}

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

    events.forEach(e => {
        const hour = new Date(e.timestamp).getHours();
        if (!buckets[hour]) buckets[hour] = 0;
        buckets[hour] += e.delta;
    });

    // Sort hours in evening-first order (18→23, then 0→17) — same as hourly chart
    const hours = Object.keys(buckets).map(Number).sort((a, b) => {
        const aAdj = a < 18 ? a + 24 : a;
        const bAdj = b < 18 ? b + 24 : b;
        return aAdj - bAdj;
    });

    let running = 0;
    return hours.map(h => {
        running = Math.max(0, running + buckets[h]);
        return {
            hour: h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`,
            occupancy: running,
        };
    });
}

/** Compute true peak by replaying events chronologically */
function computePeakOccupancy(events: CountEvent[]): number {
    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    let running = 0;
    let peak = 0;
    for (const e of sorted) {
        running = Math.max(0, running + e.delta);
        if (running > peak) peak = running;
    }
    return peak;
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
    const { resolvedTheme } = useTheme();
    const {
        activeBusiness,
        activeVenueId,
        businesses,
        areas,
        venues,
        clicrs,
        events,
        scanEvents,
        currentUser,
        bans,
        turnarounds,
        isLoading,
        hasSynced,
        updateBusiness,
    } = useApp();

    const chartColors = {
        grid: resolvedTheme === 'dark' ? '#334155' : '#e2e8f0',
        text: resolvedTheme === 'dark' ? '#94a3b8' : '#64748b',
        tooltipBg: resolvedTheme === 'dark' ? '#111827' : '#ffffff',
        tooltipBorder: resolvedTheme === 'dark' ? '#374151' : '#e2e8f0',
    };

    const { triggerNightReset, triggerOperationalReset, overlayState } = useReset();

    const resetTime = activeBusiness?.settings?.reset_time || '05:00';
    const resetTz = activeBusiness?.settings?.reset_timezone || activeBusiness?.timezone || 'UTC';

    const isPaused = activeBusiness?.settings?.is_paused === true;

    const togglePause = async () => {
        if (!activeBusiness) return;
        const newPaused = !isPaused;
        await updateBusiness({ settings: { ...activeBusiness.settings, is_paused: newPaused } });
    };

    const [showAdvanceConfirm, setShowAdvanceConfirm] = useState(false);
    const [showOpResetConfirm, setShowOpResetConfirm] = useState(false);
    const [showSchedulePopover, setShowSchedulePopover] = useState(false);
    const [advanceDate, setAdvanceDate] = useState(() => getAutoDateLabel(new Date(), resetTime, resetTz));
    const [prevNightLog, setPrevNightLog] = useState<NightLog | null>(null);

    // Date picker state
    const [selectedDate, setSelectedDate] = useState<string | null>(null); // null = Today
    const [showCalendar, setShowCalendar] = useState(false);
    const [calYear, setCalYear] = useState(() => new Date().getFullYear());
    const [calMonth, setCalMonth] = useState(() => new Date().getMonth());

    const isToday = selectedDate === null;

    const heatmapData = useMemo(() => buildHeatmap(events), [events]);

    // Analyst sees only Reports — redirect from Dashboard
    useEffect(() => {
        if (!isLoading && (currentUser?.role as string) === 'ANALYST') {
            router.push('/reports');
        }
    }, [isLoading, currentUser?.role, router]);

    // Auto-redirect if no businesses exist after successful sync.
    // Only redirect when hasSynced is true (sync API returned 200 with data).
    // This prevents false redirects when the session isn't ready yet (401).
    const hasCheckedBusinesses = useRef(false);
    useEffect(() => {
        if (!hasSynced || hasCheckedBusinesses.current) return;
        if (businesses.length === 0) {
            hasCheckedBusinesses.current = true;
            router.push('/onboarding/setup');
        }
    }, [hasSynced, businesses.length, router]);

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

    useEffect(() => {
        if (!activeBusiness?.id) return;
        const fetchPrevNight = async () => {
            try {
                const res = await fetch('/api/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'GET_NIGHT_LOGS', payload: { businessId: activeBusiness.id, venueId: activeVenueId } }),
                });
                if (!res.ok) return;
                const data = await res.json();
                const logs: NightLog[] = data.nightLogs || [];
                if (logs.length > 0) setPrevNightLog(logs[0]);
            } catch { /* trends just won't show */ }
        };
        fetchPrevNight();
    }, [activeBusiness?.id]);

    // Dashboard metrics only use venue counter events (area_id is null/empty).
    // Area counter taps track area-level flow only and don't contribute to dashboard metrics.
    const dateFrom = useMemo(() => {
        if (isToday) {
            return getBusinessDayStart(new Date(), resetTime, resetTz).getTime();
        }
        return 0; // Historical uses night_logs, not event filtering
    }, [isToday, resetTime, resetTz]);

    const dateTo = isToday ? Date.now() : 0;

    const todayEvents = useMemo(
        () => isToday
            ? events.filter((e) => e.timestamp >= dateFrom && e.timestamp <= dateTo)
            : [],
        [events, isToday, dateFrom, dateTo]
    );

    const todayScanEvents = useMemo(
        () => isToday
            ? scanEvents.filter((s) => s.timestamp >= dateFrom && s.timestamp <= dateTo)
            : [],
        [scanEvents, isToday, dateFrom, dateTo]
    );

    // Venue occupancy = sum of venues.current_occupancy
    const liveOccupancy = useMemo(
        () => venues.reduce((sum, v) => sum + (v.current_occupancy ?? 0), 0),
        [venues]
    );


    // Only count venue counter events (no area_id) for total entries/exits
    const venueCounterEvents = useMemo(
        () => todayEvents.filter((e) => !e.area_id),
        [todayEvents]
    );

    const totalEntries = useMemo(
        () => venueCounterEvents.filter((e) => e.delta > 0).reduce((sum, e) => sum + e.delta, 0),
        [venueCounterEvents]
    );

    const totalExits = useMemo(
        () => venueCounterEvents.filter((e) => e.delta < 0).reduce((sum, e) => sum + Math.abs(e.delta), 0),
        [venueCounterEvents]
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

    const totalTurnarounds = useMemo(
        () => isToday
            ? (turnarounds || [])
                .filter(t => t.timestamp >= dateFrom && t.timestamp <= dateTo)
                .reduce((sum, t) => sum + t.count, 0)
            : 0,
        [turnarounds, isToday, dateFrom, dateTo]
    );

    const netAdjusted = useMemo(
        () => Math.max(0, totalEntries - totalTurnarounds),
        [totalEntries, totalTurnarounds]
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
            counterLabelId?: string;
        };

        return todayEvents
            .map((e): LogEntry => ({
                id: `c-${e.id}`,
                ts: e.timestamp,
                kind: e.delta > 0 ? 'ENTRY' : 'EXIT',
                areaId: e.area_id ?? undefined,
                counterLabelId: e.counter_label_id ?? undefined,
            }))
            .sort((a, b) => b.ts - a.ts)
            .slice(0, 5);
    }, [todayEvents]);

    const hourlyData = useMemo(() => buildHourlyData(venueCounterEvents), [venueCounterEvents]);
    const occupancyData = useMemo(() => buildOccupancyOverTime(venueCounterEvents), [venueCounterEvents]);
    const peakOccupancyValue = useMemo(
        () => Math.max(computePeakOccupancy(venueCounterEvents), liveOccupancy),
        [venueCounterEvents, liveOccupancy]
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

    // --- Trend computations vs. previous night ---
    const entryTrend = computeTrend(totalEntries, prevNightLog?.total_in ?? null);
    const peakTrend = computeTrend(peakOccupancyValue, prevNightLog?.peak_occupancy ?? null);
    const scanTrend = computeTrend(totalScans, prevNightLog?.scans_total ?? null);

    // Denial Rate — percentage point delta (not percentage change)
    const currentDenialRate = totalScans > 0 ? (deniedCount / totalScans) * 100 : 0;
    const prevDenialRate = prevNightLog && prevNightLog.scans_total > 0
        ? ((prevNightLog.scans_denied ?? 0) / prevNightLog.scans_total) * 100
        : null;
    const denialTrend = prevDenialRate !== null
        ? (() => {
            const diff = Math.round((currentDenialRate - prevDenialRate) * 10) / 10;
            if (diff === 0) return { trend: 'neutral' as const, value: '—' };
            return diff > 0
                ? { trend: 'up' as const, value: `↑${diff}pp` }
                : { trend: 'down' as const, value: `↓${Math.abs(diff)}pp` };
        })()
        : null;

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
                <div className="h-10 w-64 bg-muted rounded-xl" />
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="glass-panel p-5 rounded-2xl border border-border h-32" />
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="glass-panel p-6 rounded-2xl border border-border h-64" />
                    <div className="glass-panel p-6 rounded-2xl border border-border h-64" />
                </div>
            </div>
        );
    }

    // --- Render: No business selected ---
    if (activeBusiness === null && businesses.length > 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground text-lg">Select a business from the sidebar to view insights</p>
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
            {/* Pause Banner */}
            {isPaused && (
                <div className="bg-red-600 text-white px-4 py-3 rounded-lg flex items-center gap-2 mb-4">
                    <Pause className="w-5 h-5" />
                    <span className="font-semibold">OPERATIONS PAUSED</span>
                    <span className="text-red-200">— All counting and scanning suspended</span>
                </div>
            )}

            {/* Page Header - Design */}
            <div className="mb-8">
                <div className="flex items-center gap-4 mb-2">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/50 dark:to-blue-900/50 border border-purple-200 dark:border-purple-500/20 flex items-center justify-center">
                        <TrendingUp className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1">
                        <h1 className="text-3xl mb-1">Live Insights</h1>
                        <p className="text-foreground/60 text-sm">Real-time data from all connected devices.</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Calendar date picker button */}
                        <button
                            onClick={() => setShowCalendar(prev => !prev)}
                            className={cn(
                                "p-2 rounded-lg transition-colors",
                                showCalendar ? "bg-primary text-white" : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                        >
                            <Calendar className="w-4 h-4" />
                        </button>

                        {/* Back to Today button (shown when viewing historical date) */}
                        {!isToday && (
                            <button
                                onClick={() => { setSelectedDate(null); setShowCalendar(false); }}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                            >
                                <ChevronLeft className="w-3 h-3" />
                                Back to Today
                            </button>
                        )}

                        {/* Action buttons — only shown for today's live view */}
                        {isToday && (
                            <>
                                {/* Pause/Resume Toggle — MANAGER+ only */}
                                {canEditVenuesAndAreas(currentUser.role) && (
                                    <button
                                        onClick={togglePause}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm ${
                                            isPaused ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'
                                        }`}
                                    >
                                        {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                                        {isPaused ? 'Resume Operations' : 'Pause Operations'}
                                    </button>
                                )}

                                {/* Advance to Next Day */}
                                <button
                                    onClick={() => {
                                        setAdvanceDate(getAutoDateLabel(new Date(), resetTime, resetTz));
                                        setShowAdvanceConfirm(true);
                                    }}
                                    className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white transition-colors flex items-center gap-2 text-sm font-medium"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Advance to Next Day
                                </button>

                                {/* Operational Reset */}
                                <button
                                    onClick={() => setShowOpResetConfirm(true)}
                                    className="px-4 py-2 rounded-lg bg-card border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2 text-sm"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Operational Reset
                                </button>

                                {/* Auto-Reset Schedule */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowSchedulePopover(prev => !prev)}
                                        className="px-4 py-2 rounded-lg bg-card border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2 text-sm"
                                    >
                                        <Timer className="w-4 h-4" />
                                        Auto-Reset
                                    </button>
                                    {showSchedulePopover && (
                                        <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-white dark:bg-gray-900 border border-border rounded-xl p-4 shadow-xl">
                                            <h4 className="text-sm font-bold text-foreground mb-3">Auto-Reset Schedule</h4>
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-muted-foreground">Enabled</span>
                                                    <button
                                                        onClick={() => {
                                                            const newRule = activeBusiness?.settings?.reset_rule === 'SCHEDULED' ? 'MANUAL' : 'SCHEDULED';
                                                            updateBusiness({ settings: { ...activeBusiness!.settings, reset_rule: newRule } });
                                                        }}
                                                        className={cn(
                                                            "relative w-11 h-6 rounded-full transition-colors",
                                                            activeBusiness?.settings?.reset_rule === 'SCHEDULED' ? "bg-primary" : "bg-muted"
                                                        )}
                                                    >
                                                        <span className={cn(
                                                            "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                                                            activeBusiness?.settings?.reset_rule === 'SCHEDULED' && "translate-x-5"
                                                        )} />
                                                    </button>
                                                </div>
                                                {activeBusiness?.settings?.reset_rule === 'SCHEDULED' && (
                                                    <>
                                                        <div>
                                                            <label className="text-xs text-muted-foreground mb-1 block">Time</label>
                                                            <input
                                                                type="time"
                                                                value={activeBusiness.settings.reset_time || '05:00'}
                                                                onChange={(e) => updateBusiness({ settings: { ...activeBusiness.settings, reset_time: e.target.value } })}
                                                                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-xs text-muted-foreground mb-1 block">Timezone</label>
                                                            <select
                                                                value={activeBusiness.settings.reset_timezone || activeBusiness.timezone || 'UTC'}
                                                                onChange={(e) => updateBusiness({ settings: { ...activeBusiness.settings, reset_timezone: e.target.value } })}
                                                                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm"
                                                            >
                                                                {['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'Pacific/Honolulu', 'America/Anchorage', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'].map(tz => (
                                                                    <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Export */}
                                <button className="px-4 py-2 rounded-lg bg-card border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2 text-sm">
                                    <Download className="w-4 h-4" />
                                    <span>Export</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Calendar Grid (date picker) */}
            {showCalendar && (
                <div className="bg-card border border-border rounded-xl p-4">
                    <CalendarGrid
                        year={calYear}
                        month={calMonth}
                        dailyEntries={{}}
                        selectAllPast
                        selectedDate={selectedDate}
                        onSelectDate={(dateStr) => {
                            setSelectedDate(dateStr);
                            setShowCalendar(false);
                        }}
                        onPrevMonth={() => {
                            if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
                            else setCalMonth(m => m - 1);
                        }}
                        onNextMonth={() => {
                            if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
                            else setCalMonth(m => m + 1);
                        }}
                    />
                </div>
            )}

            {/* Viewing banner for historical dates */}
            {!isToday && selectedDate && (
                <div className="text-sm text-muted-foreground">
                    Viewing <span className="font-medium text-foreground">{selectedDate}</span>
                </div>
            )}

            {/* Historical placeholder */}
            {!isToday && (
                <div className="bg-card border border-border rounded-xl p-8 text-center">
                    <p className="text-muted-foreground text-sm">Historical data not yet available.</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">TODO: In a future task, wire up getNightLogs from the adapter.</p>
                </div>
            )}

            {/* Getting Started Checklist */}
            {isToday && <GettingStartedChecklist />}

            {/* KPI Cards - Design */}
            {isToday && <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                <KpiCard
                    label="Live Occupancy"
                    value={liveOccupancy}
                    detail={`Peak: ${peakOccupancyValue}`}
                    icon={Users}
                    trend={peakTrend?.trend}
                    trendValue={peakTrend?.value}
                />
                <KpiCard
                    label="Total Entries"
                    value={totalEntries}
                    detail={`Exits: -${totalExits}`}
                    icon={TrendingUp}
                    iconColor="text-emerald-500"
                    valueColor="text-emerald-400"
                    detailColor="text-red-400"
                    trend={entryTrend?.trend}
                    trendValue={entryTrend?.value}
                />
                <KpiCard
                    label="Scans Processed"
                    value={totalScans}
                    detail={`${deniedPct}% Denied`}
                    icon={ScanLine}
                    iconColor="text-purple-500"
                    valueColor="text-purple-400"
                    trend={scanTrend?.trend}
                    trendValue={scanTrend?.value}
                />
                <KpiCard
                    label="Banned Hits"
                    value={activeBansCount}
                    detail="Flagged instantly"
                    icon={ShieldBan}
                    iconColor="text-red-500"
                    valueColor="text-red-400"
                    trend={denialTrend?.trend}
                    trendValue={denialTrend?.value}
                />
            </div>}

            {/* Age Distribution + Live Event Log - Design */}
            {isToday && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Age Distribution */}
                <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="text-lg">Age Distribution</div>
                    </div>
                    <div className="text-sm text-muted-foreground mb-6">ID scans accepted · Tonight</div>
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
                <div className="bg-card border border-border rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        <div className="text-lg">Live Event Log</div>
                    </div>
                    <div className="space-y-2">
                        {liveEventLog.length === 0 && (
                            <p className="text-xs text-gray-600 italic">No events recorded tonight.</p>
                        )}
                        {liveEventLog.map(entry => (
                            <div key={entry.id} className="border-l-2 border-border pl-3 py-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className={cn(
                                        "text-xs uppercase tracking-wide",
                                        entry.kind === "ENTRY" ? "text-emerald-400" : "text-red-400"
                                    )}>
                                        {badgeLabel[entry.kind]}
                                    </span>
                                    {entry.counterLabelId && (() => {
                                        let labelName = entry.counterLabelId;
                                        for (const c of clicrs) {
                                            const found = (c.counter_labels ?? []).find((cl: any) => cl.id === entry.counterLabelId);
                                            if (found) { labelName = found.label; break; }
                                        }
                                        return (
                                            <span className="text-[10px] font-bold px-1 rounded bg-muted text-muted-foreground">
                                                {labelName}
                                            </span>
                                        );
                                    })()}
                                </div>
                                <div className="text-sm text-foreground/80">
                                    {entry.areaId ? areaMap[entry.areaId] ?? 'Unknown Area' : '—'}
                                </div>
                                <div className="text-xs text-gray-500">{formatTime(entry.ts)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>}

            {/* Gender Breakdown */}
            {isToday && <GenderBreakdown scanEvents={todayScanEvents} />}

            {/* Location Metrics */}
            {isToday && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <StateBreakdown scanEvents={todayScanEvents} />
                <CityBreakdown scanEvents={todayScanEvents} />
            </div>}

            {/* Hourly Traffic + Occupancy Over Time */}
            {isToday && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <HourlyTraffic data={hourlyData} colors={chartColors} />
                <OccupancyOverTime data={occupancyData} peak={peakOccupancyValue} colors={chartColors} />
            </div>}

            {/* Peak Times Heatmap */}
            {isToday && <PeakTimesHeatmap data={heatmapData} />}

            {/* Location Distribution + Venue Contribution */}
            {isToday && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <LocationDistribution data={locationData} colors={chartColors} />
                <VenueContribution data={venueContribData} colors={chartColors} />
            </div>}

            {/* Traffic Flow + Operational Workflow */}
            {isToday && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TrafficFlow
                    totalEntries={totalEntries}
                    totalScans={totalScans}
                    accepted={totalScans - deniedCount}
                    denied={deniedCount}
                    banned={activeBansCount}
                    netOcc={liveOccupancy}
                    areaDistrib={areaDistribData}
                    turnarounds={totalTurnarounds}
                    netAdjusted={netAdjusted}
                />
                <OperationalWorkflow />
            </div>}

            {/* Live Venues */}
            {isToday && <LiveVenues data={liveVenuesData} onViewAll={() => router.push('/areas')} />}

{/* Advance to Next Day Modal */}
            <ConfirmModal
                open={showAdvanceConfirm}
                title="Advance to Next Day"
                message="Save today's metrics and zero all counts."
                confirmLabel="Save & Reset"
                onConfirm={async () => {
                    setShowAdvanceConfirm(false);
                    await triggerNightReset(advanceDate);
                }}
                onCancel={() => setShowAdvanceConfirm(false)}
            >
                <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Saving log for:</label>
                    <input
                        type="date"
                        value={advanceDate}
                        onChange={(e) => setAdvanceDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white border border-border text-black text-sm"
                    />
                </div>
            </ConfirmModal>

            {/* Operational Reset Modal */}
            <ConfirmModal
                open={showOpResetConfirm}
                title="Operational Reset"
                message="This will zero all counts without saving any data. This cannot be undone."
                confirmLabel="Reset Without Saving"
                destructive
                onConfirm={async () => {
                    setShowOpResetConfirm(false);
                    await triggerOperationalReset();
                }}
                onCancel={() => setShowOpResetConfirm(false)}
            />
        </div>
    );
}
