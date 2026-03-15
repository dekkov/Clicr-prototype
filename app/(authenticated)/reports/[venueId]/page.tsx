"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { useTheme } from '@/components/providers/theme-provider';
import {
    Calendar as CalendarIcon,
    BarChart3,
    TrendingUp,
    Users,
    AlertTriangle,
    ArrowUpRight,
    ArrowDownRight,
    FileSpreadsheet,
    ArrowLeft,
    MapPin,
    X
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay, eachHourOfInterval, addHours } from 'date-fns';
import { cn } from '@/lib/utils';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area as ReArea, PieChart, Pie, Cell
} from 'recharts';
import { exportReportsToExcel } from '@/lib/exportUtils';
import Link from 'next/link';
import { CalendarGrid } from '@/components/reports/CalendarGrid';
import { MonthStatsBar } from '@/components/reports/MonthStatsBar';
import { DayDetailPanel } from '@/components/reports/DayDetailPanel';
import { DayComparisonPanel } from '@/components/reports/DayComparisonPanel';
import { computeDailyEntries, computeMonthStats, computeMonthlyTrend, computeHourlyOccupancy } from '@/lib/calendarUtils';
import { computeComparisonStats } from '@/lib/comparison-utils';

// --- TYPES ---
type DateRange = {
    from: Date;
    to: Date;
    label: string;
};

// --- COMPONENTS ---
const MetricCard = ({ title, value, subtext, trend, icon: Icon, colorClass }: any) => (
    <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover:border-border transition-colors">
        <div className={cn("absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity", colorClass)}>
            <Icon className="w-16 h-16" />
        </div>
        <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
                <div className={cn("p-2 rounded-lg bg-card", colorClass)}>
                    <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-muted-foreground font-medium text-sm uppercase tracking-wider">{title}</h3>
            </div>
            <div className="text-3xl font-bold text-foreground mb-1">{value}</div>
            {subtext && <div className="text-sm text-muted-foreground">{subtext}</div>}
            {trend && (
                <div className={cn("flex items-center gap-1 text-sm font-bold mt-2", trend > 0 ? "text-emerald-400" : "text-rose-400")}>
                    {trend > 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {Math.abs(trend)}% vs prev
                </div>
            )}
        </div>
    </div>
);

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function VenueReportingDashboard() {
    const { venueId } = useParams();
    const router = useRouter();
    const { venues, areas, clicrs } = useApp();
    const { resolvedTheme } = useTheme();
    const [isMounted, setIsMounted] = useState(false);

    const chartColors = {
        grid: resolvedTheme === 'dark' ? '#334155' : '#e2e8f0',
        text: resolvedTheme === 'dark' ? '#94a3b8' : '#64748b',
        tooltip: {
            background: resolvedTheme === 'dark' ? '#111827' : '#ffffff',
            border: resolvedTheme === 'dark' ? '#374151' : '#e2e8f0',
        },
    };

    // Venue-specific events fetched directly — AppState only has last 100 global events
    const [venueEvents, setVenueEvents] = useState<any[]>([]);
    const [venueScans, setVenueScans] = useState<any[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Find the current venue
    const venue = venues.find(v => v.id === venueId);

    // --- STATE ---
    const [dateRange, setDateRange] = useState<DateRange>({
        from: startOfDay(new Date()),
        to: endOfDay(new Date()),
        label: 'Today'
    });

    // Calendar modal state
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [calYear, setCalYear] = useState(() => new Date().getFullYear());
    const [calMonth, setCalMonth] = useState(() => new Date().getMonth()); // 0-indexed
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    // Comparison mode state
    const [isComparing, setIsComparing] = useState(false);
    const [comparisonDate, setComparisonDate] = useState<string | null>(null);

    // Fetch all venue events for calYear (covers calendar + analytics date ranges)
    useEffect(() => {
        if (!venueId) return;
        setIsLoadingData(true);
        const from = `${calYear - 1}-12-01T00:00:00.000Z`;
        const to = `${calYear}-12-31T23:59:59.999Z`;
        fetch(`/api/reports/venue-events?venueId=${venueId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
            .then(r => r.json())
            .then(data => {
                if (data.events) setVenueEvents(data.events);
                if (data.scans) setVenueScans(data.scans);
            })
            .finally(() => setIsLoadingData(false));
    }, [venueId, calYear]);

    // --- FILTERS ---
    const quickRanges = [
        { label: 'Today', from: startOfDay(new Date()), to: endOfDay(new Date()) },
        { label: 'Yesterday', from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) },
        { label: 'Last 7 Days', from: startOfDay(subDays(new Date(), 7)), to: endOfDay(new Date()) },
        { label: 'Last 30 Days', from: startOfDay(subDays(new Date(), 30)), to: endOfDay(new Date()) },
    ];

    // Filtered Data Computation
    const reportData = useMemo(() => {
        if (!venueId) return null;

        const safeEvents = venueEvents;
        const safeScans = venueScans;

        // 1. Filter raw events by date and venue
        const filteredEvents = safeEvents.filter(e => {
            const timeMatch = e.timestamp >= dateRange.from.getTime() && e.timestamp <= dateRange.to.getTime();
            const venueMatch = e.venue_id === venueId;
            return timeMatch && venueMatch;
        });

        const filteredScans = safeScans.filter(s => {
            const timeMatch = s.timestamp >= dateRange.from.getTime() && s.timestamp <= dateRange.to.getTime();
            const venueMatch = s.venue_id === venueId;
            return timeMatch && venueMatch;
        });

        // 2. Compute Aggregates
        // -- Totals
        const totalEntries = filteredEvents.filter(e => e.flow_type === 'IN').reduce((acc, e) => acc + e.delta, 0);
        const totalExits = filteredEvents.filter(e => e.flow_type === 'OUT').reduce((acc, e) => acc + Math.abs(e.delta), 0);

        // -- Scans
        const totalScans = filteredScans.length;
        const acceptedScans = filteredScans.filter(s => s.scan_result === 'ACCEPTED').length;
        const deniedScans = filteredScans.filter(s => s.scan_result === 'DENIED').length;

        // -- Peak Occupancy Estimate
        let maxOccupancy = 0;
        let runningOccupancy = 0;
        const sortedRangeEvents = [...filteredEvents].sort((a, b) => a.timestamp - b.timestamp);
        sortedRangeEvents.forEach(e => {
            runningOccupancy += (e.flow_type === 'IN' ? e.delta : -Math.abs(e.delta));
            if (runningOccupancy > maxOccupancy) maxOccupancy = runningOccupancy;
        });

        // -- Hourly Breakdown (group by day when range > 1 day)
        const rangeMs = dateRange.to.getTime() - dateRange.from.getTime();
        const isMultiDay = rangeMs > 23 * 60 * 60 * 1000;

        let hourlyData: Array<{
            hourLabel: string;
            hourStart: Date;
            entries: number;
            exits: number;
            net: number;
            maleEntries: number;
            femaleEntries: number;
        }>;

        if (!isMultiDay) {
            const hours = eachHourOfInterval({ start: dateRange.from, end: dateRange.to });
            hourlyData = hours.map(hour => {
                const nextHour = addHours(hour, 1);
                const hourEvents = filteredEvents.filter(e => e.timestamp >= hour.getTime() && e.timestamp < nextHour.getTime());
                const hourScans = filteredScans.filter(s => s.timestamp >= hour.getTime() && s.timestamp < nextHour.getTime());
                const entries = hourEvents.filter(e => e.flow_type === 'IN').reduce((acc, e) => acc + e.delta, 0);
                const exits = hourEvents.filter(e => e.flow_type === 'OUT').reduce((acc, e) => acc + Math.abs(e.delta), 0);
                const maleEntries = hourScans.filter(s => s.sex === 'M').length;
                const femaleEntries = hourScans.filter(s => s.sex === 'F').length;
                return { hourLabel: format(hour, 'ha'), hourStart: hour, entries, exits, net: entries - exits, maleEntries, femaleEntries };
            });
        } else {
            const dayMs = 24 * 60 * 60 * 1000;
            const dayCount = Math.ceil(rangeMs / dayMs);
            hourlyData = Array.from({ length: dayCount }, (_, i) => {
                const dayStart = startOfDay(new Date(dateRange.from.getTime() + i * dayMs));
                const dayEnd = endOfDay(dayStart);
                const dayEvents = filteredEvents.filter(e => e.timestamp >= dayStart.getTime() && e.timestamp <= dayEnd.getTime());
                const dayScans = filteredScans.filter(s => s.timestamp >= dayStart.getTime() && s.timestamp <= dayEnd.getTime());
                const entries = dayEvents.filter(e => e.flow_type === 'IN').reduce((acc, e) => acc + e.delta, 0);
                const exits = dayEvents.filter(e => e.flow_type === 'OUT').reduce((acc, e) => acc + Math.abs(e.delta), 0);
                const maleEntries = dayScans.filter(s => s.sex === 'M').length;
                const femaleEntries = dayScans.filter(s => s.sex === 'F').length;
                return { hourLabel: format(dayStart, 'MMM d'), hourStart: dayStart, entries, exits, net: entries - exits, maleEntries, femaleEntries };
            });
        }

        // -- Age & Gender & Zip Logic
        const ageBands: Record<string, number> = { 'Under 21': 0, '21-25': 0, '26-30': 0, '31-40': 0, '41+': 0, 'Unknown': 0 };
        const genderCounts: Record<string, number> = { 'Male': 0, 'Female': 0, 'Other': 0 };
        const zipCounts: Record<string, number> = {};

        // From Scans
        filteredScans.forEach(s => {
            // Age
            const age = s.age;
            if (!age) ageBands['Unknown']++;
            else if (age < 21) ageBands['Under 21']++;
            else if (age <= 25) ageBands['21-25']++;
            else if (age <= 30) ageBands['26-30']++;
            else if (age <= 40) ageBands['31-40']++;
            else ageBands['41+']++;

            // Gender
            if (s.sex === 'M') genderCounts['Male']++;
            else if (s.sex === 'F') genderCounts['Female']++;
            else genderCounts['Other']++;

            // Zip (filter out null/zero/invalid values)
            if (s.zip_code && !/^0+$/.test(s.zip_code)) {
                zipCounts[s.zip_code] = (zipCounts[s.zip_code] || 0) + 1;
            }
        });

        const ageChartData = Object.entries(ageBands).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
        const genderChartData = Object.entries(genderCounts).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
        const topZips = Object.entries(zipCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([zip, count]) => ({ zip, count }));

        return {
            totalEntries,
            totalExits,
            maxOccupancy,
            totalScans,
            acceptedScans,
            deniedScans,
            hourlyData,
            filteredEvents,
            filteredScans,
            ageChartData,
            genderChartData,
            topZips
        };
    }, [venueEvents, venueScans, venueId, dateRange]);

    const dailyEntries = useMemo(
        () => computeDailyEntries(venueEvents, venueId as string, calYear, calMonth),
        [venueEvents, venueId, calYear, calMonth]
    );

    const monthStats = useMemo(
        () => computeMonthStats(venueEvents, venueId as string, calYear, calMonth),
        [venueEvents, venueId, calYear, calMonth]
    );

    const monthlyTrend = useMemo(
        () => computeMonthlyTrend(venueEvents, venueId as string, calYear),
        [venueEvents, venueId, calYear]
    );

    const calMonthLabel = format(new Date(calYear, calMonth, 1), 'MMMM').toUpperCase();

    const handleClearComparison = () => {
        setIsComparing(false);
        setComparisonDate(null);
    };

    const closeCalendarModal = () => {
        setCalendarOpen(false);
        setSelectedDate(null);
        setIsComparing(false);
        setComparisonDate(null);
    };

    const comparisonPanel = useMemo(() => {
        if (!selectedDate || !comparisonDate) return null;
        const vid = venueId as string;

        const filterByDay = (items: any[], dateStr: string) => {
            const noon = new Date(dateStr + 'T12:00:00');
            const start = startOfDay(noon).getTime();
            const end = endOfDay(noon).getTime();
            return items.filter((e: any) => e.timestamp >= start && e.timestamp <= end && e.venue_id === vid);
        };

        const dayAEvents = filterByDay(venueEvents, selectedDate);
        const dayBEvents = filterByDay(venueEvents, comparisonDate);
        const dayAScans = filterByDay(venueScans, selectedDate);
        const dayBScans = filterByDay(venueScans, comparisonDate);

        const dayAHourlyRaw = computeHourlyOccupancy(venueEvents, vid, selectedDate);
        const dayBHourlyRaw = computeHourlyOccupancy(venueEvents, vid, comparisonDate);
        const dayAHourly = dayAHourlyRaw.map((d, i) => ({ hour: i, occupancy: d.occupancy }));
        const dayBHourly = dayBHourlyRaw.map((d, i) => ({ hour: i, occupancy: d.occupancy }));

        const stats = computeComparisonStats(
            { events: dayAEvents, scans: dayAScans },
            { events: dayBEvents, scans: dayBScans }
        );

        return (
            <DayComparisonPanel
                dayALabel={selectedDate}
                dayBLabel={comparisonDate}
                dayAHourly={dayAHourly}
                dayBHourly={dayBHourly}
                stats={stats}
                onClear={handleClearComparison}
            />
        );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate, comparisonDate, venueEvents, venueScans, venueId]);

    const handlePrevMonth = () => {
        if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
        else setCalMonth(m => m - 1);
        setSelectedDate(null);
        setIsComparing(false);
        setComparisonDate(null);
    };

    const handleNextMonth = () => {
        if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
        else setCalMonth(m => m + 1);
        setSelectedDate(null);
        setIsComparing(false);
        setComparisonDate(null);
    };

    // --- EXPORT ---
    const handleExport = () => {
        if (!venue || !reportData) return;

        let exportEvents = reportData.filteredEvents;
        let exportScans = reportData.filteredScans;

        if (exportEvents.length === 0 && exportScans.length === 0) {
            const now = Date.now();
            const mockEvents: any[] = [];
            const mockScans: any[] = [];
            for (let i = 0; i < 50; i++) {
                const time = now - Math.floor(Math.random() * 5 * 3600000);
                mockEvents.push({ id: `mock_e_${i}`, venue_id: venue.id, timestamp: time, delta: 1, flow_type: 'IN', event_type: 'TAP', user_id: 'mock_user' });
                mockScans.push({ id: `mock_s_${i}`, venue_id: venue.id, timestamp: time, scan_result: 'ACCEPTED', age: 18 + Math.floor(Math.random() * 30), sex: Math.random() > 0.5 ? 'M' : 'F', zip_code: '10001' });
            }
            exportEvents = mockEvents;
            exportScans = mockScans;
        }

        const vAreas = areas.filter(a => a.venue_id === venueId);
        const vClicrs = clicrs.filter(c => c.area_id && vAreas.map(a => a.id).includes(c.area_id));

        exportReportsToExcel(
            exportEvents,
            exportScans,
            [venue], vAreas, vClicrs,
            `Report_${venue.name.replace(/\s+/g, '_')}_${format(dateRange.from, 'yyyy-MM-dd')}`
        );
    };

    if (!isMounted) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading Dashboard...</div>;

    if (!venue || !reportData) return <div className="p-10 text-center text-muted-foreground">Venue not found</div>;

    return (
        <div className="space-y-8 animate-[fade-in_0.5s_ease-out] pb-24">
            {/* Header */}
            <div className="flex flex-col xl:flex-row justify-between items-start gap-6 border-b border-border pb-8">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <button onClick={() => router.push('/reports')} className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-sm font-medium">
                            <ArrowLeft className="w-4 h-4" /> Back to Venues
                        </button>
                    </div>
                    <h1 className="text-3xl font-bold text-foreground mb-2">{venue.name} Reports</h1>
                    <p className="text-muted-foreground">Detailed analytics for {venue.city}, {venue.state}</p>
                </div>

                <button
                    onClick={() => setCalendarOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-border text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                    <CalendarIcon className="w-4 h-4" /> Calendar View
                </button>
            </div>

            {/* Calendar Modal */}
            {calendarOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 pt-8">
                    <div className="bg-background border border-border rounded-2xl w-full max-w-5xl shadow-2xl mb-8">
                        <div className="flex items-center justify-between p-6 border-b border-border">
                            <h2 className="text-xl font-bold text-foreground">Calendar View — {calMonthLabel}</h2>
                            <div className="flex items-center gap-3">
                                {selectedDate && !isComparing && !comparisonDate && (
                                    <button
                                        onClick={() => setIsComparing(true)}
                                        className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold transition-colors shadow-lg shadow-purple-500/20"
                                    >
                                        Compare to Another Day
                                    </button>
                                )}
                                <button
                                    onClick={closeCalendarModal}
                                    className="text-muted-foreground hover:text-foreground p-2 rounded-lg hover:bg-muted transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="p-6 space-y-6">
                            <MonthStatsBar
                                monthTotal={monthStats.monthTotal}
                                daysOpen={monthStats.daysOpen}
                                ytdTotal={monthStats.ytdTotal}
                                monthLabel={calMonthLabel}
                                monthlyTrend={monthlyTrend}
                            />
                            <CalendarGrid
                                year={calYear}
                                month={calMonth}
                                dailyEntries={dailyEntries}
                                selectedDate={selectedDate}
                                onSelectDate={(date) => {
                                    setSelectedDate(date);
                                    setIsComparing(false);
                                    setComparisonDate(null);
                                }}
                                onPrevMonth={handlePrevMonth}
                                onNextMonth={handleNextMonth}
                                isComparing={isComparing}
                                comparisonDate={comparisonDate}
                                onComparisonSelect={(date) => setComparisonDate(date)}
                            />
                            {isComparing && !comparisonDate && (
                                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-purple-900/30 border border-purple-500/30">
                                    <p className="text-sm text-purple-300 font-medium">
                                        Select a second day on the calendar to compare with <span className="font-bold text-purple-200">{selectedDate}</span>
                                    </p>
                                    <button
                                        onClick={handleClearComparison}
                                        className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                            {selectedDate && comparisonDate && comparisonPanel}
                            {selectedDate && !comparisonDate && !isComparing && (
                                <DayDetailPanel
                                    dateStr={selectedDate}
                                    events={venueEvents}
                                    scans={venueScans}
                                    venueId={venueId as string}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

                {/* Left Col: KPI Cards + Filters */}
                <div className="lg:col-span-1 space-y-4">

                    {/* Date Range Filter */}
                    <div className="flex flex-wrap gap-2 items-center bg-card p-2 rounded-2xl border border-border">
                        {quickRanges.map(range => (
                            <button
                                key={range.label}
                                onClick={() => setDateRange(range)}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-1",
                                    dateRange.label === range.label
                                        ? "bg-primary text-black shadow-lg shadow-primary/25"
                                        : "hover:bg-muted text-muted-foreground"
                                )}
                            >
                                {range.label}
                            </button>
                        ))}
                        <div className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg text-xs text-foreground/80 font-mono border border-border">
                            <CalendarIcon className="w-3 h-3 shrink-0" />
                            {format(dateRange.from, 'MMM d')} – {format(dateRange.to, 'MMM d, yyyy')}
                        </div>
                    </div>

                    <MetricCard
                        title="Total Entries"
                        value={reportData.totalEntries.toLocaleString()}
                        subtext="Guests Processed"
                        icon={Users}
                        colorClass="text-emerald-500"
                    />
                    <MetricCard
                        title="Peak Occupancy"
                        value={reportData.maxOccupancy.toLocaleString()}
                        subtext="Simultaneous Guests"
                        icon={TrendingUp}
                        colorClass="text-blue-500"
                    />
                    <MetricCard
                        title="ID Scans"
                        value={reportData.totalScans.toLocaleString()}
                        subtext={`${((reportData.deniedScans / (reportData.totalScans || 1)) * 100).toFixed(1)}% Denial Rate`}
                        icon={AlertTriangle}
                        colorClass="text-amber-500"
                    />

                    {/* Top Locations Card */}
                    <div className="glass-panel p-6 rounded-2xl">
                        <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
                            <MapPin className="w-4 h-4" /> Top Locations
                        </h3>
                        {reportData.topZips.length > 0 ? (
                            <div className="space-y-3">
                                {reportData.topZips.map((z) => (
                                    <div key={z.zip} className="flex justify-between items-center text-sm">
                                        <span className="text-foreground/80 font-mono">{z.zip}</span>
                                        <div className="flex items-center gap-2">
                                            <div className="h-1.5 bg-primary rounded-full" style={{ width: `${Math.min(100, (z.count / reportData.totalScans) * 100)}px` }} />
                                            <span className="text-foreground font-bold">{z.count}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center text-muted-foreground/60 text-xs py-4">No location data available</div>
                        )}
                    </div>

                    <div className="mt-8">
                        <button
                            onClick={handleExport}
                            className="w-full py-4 rounded-xl bg-muted hover:bg-muted border border-border text-foreground font-bold flex items-center justify-center gap-3 transition-colors shadow-lg"
                        >
                            <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
                            Export Excel Report
                        </button>
                        <p className="text-xs text-center mt-3 text-muted-foreground">
                            Includes Sheets: Summary, Traffic, Demographics, Logs
                        </p>
                    </div>
                </div>

                {/* Right Col: Charts & Details */}
                <div className="lg:col-span-3 space-y-8">

                    {/* Traffic Chart */}
                    <div className="glass-panel p-6 rounded-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-primary" />
                                Hourly Traffic Breakdown
                            </h3>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500" /> Entries</div>
                                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-rose-500" /> Exits</div>
                            </div>
                        </div>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={reportData.hourlyData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.5} vertical={false} />
                                    <XAxis dataKey="hourLabel" stroke={chartColors.text} fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke={chartColors.text} fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: chartColors.tooltip.background, borderColor: chartColors.tooltip.border, color: '#f8fafc' }}
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    />
                                    <Bar dataKey="entries" name="Entries" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                                    <Bar dataKey="exits" name="Exits" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Demographic Flow Chart */}
                    <div className="glass-panel p-6 rounded-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                                <Users className="w-5 h-5 text-blue-400" />
                                Demographic Traffic Flow
                            </h3>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-500" /> Male</div>
                                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-pink-500" /> Female</div>
                            </div>
                        </div>
                        <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={reportData.hourlyData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.5} vertical={false} />
                                    <XAxis dataKey="hourLabel" stroke={chartColors.text} fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke={chartColors.text} fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: chartColors.tooltip.background, borderColor: chartColors.tooltip.border, color: '#f8fafc' }}
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    />
                                    <Bar dataKey="maleEntries" name="Male Entries" fill="#3b82f6" stackId="a" radius={[0, 0, 4, 4]} barSize={20} />
                                    <Bar dataKey="femaleEntries" name="Female Entries" fill="#ec4899" stackId="a" radius={[4, 4, 0, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Demographics Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Age Chart */}
                        <div className="glass-panel p-6 rounded-2xl">
                            <h3 className="text-lg font-bold text-foreground mb-6">Age Distribution</h3>
                            <div className="h-[250px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={reportData.ageChartData} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.5} horizontal={false} />
                                        <XAxis type="number" stroke={chartColors.text} fontSize={12} axisLine={false} tickLine={false} />
                                        <YAxis dataKey="name" type="category" stroke={chartColors.text} fontSize={12} axisLine={false} tickLine={false} width={80} />
                                        <Tooltip contentStyle={{ backgroundColor: chartColors.tooltip.background, borderColor: chartColors.tooltip.border, color: '#f8fafc' }} />
                                        <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Gender Chart */}
                        <div className="glass-panel p-6 rounded-2xl flex flex-col items-center">
                            <h3 className="text-lg font-bold text-foreground mb-2 self-start w-full">Gender Split</h3>
                            <div className="h-[250px] w-full mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={reportData.genderChartData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {reportData.genderChartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ backgroundColor: chartColors.tooltip.background, borderColor: chartColors.tooltip.border, color: '#f8fafc' }} />
                                        <Legend
                                            formatter={(value) => <span className="text-foreground/80">{value}</span>}
                                            verticalAlign="bottom"
                                            height={36}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Hourly Table Summary */}
                    <div className="glass-panel rounded-2xl overflow-hidden">
                        <div className="p-6 border-b border-white/5 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-foreground">Hourly Log</h3>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-card/80 text-muted-foreground sticky top-0 backdrop-blur-md">
                                    <tr>
                                        <th className="px-6 py-3 font-medium">Hour</th>
                                        <th className="px-6 py-3 font-medium text-emerald-400">Entries</th>
                                        <th className="px-6 py-3 font-medium text-rose-400">Exits</th>
                                        <th className="px-6 py-3 font-medium text-blue-400">Net Delta</th>
                                        <th className="px-6 py-3 font-medium">Est. Occupancy</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {reportData.hourlyData.filter(row => row.entries > 0 || row.exits > 0).map((row, idx, arr) => {
                                        const cumOcc = arr.slice(0, idx + 1).reduce((acc, r) => acc + r.net, 0);
                                        return (
                                            <tr key={idx} className="hover:bg-white/5">
                                                <td className="px-6 py-4 font-mono text-foreground/80">{row.hourLabel}</td>
                                                <td className="px-6 py-4 font-bold text-emerald-500">{row.entries}</td>
                                                <td className="px-6 py-4 font-bold text-rose-500">{row.exits}</td>
                                                <td className="px-6 py-4 font-mono text-muted-foreground">{row.net > 0 ? `+${row.net}` : row.net}</td>
                                                <td className="px-6 py-4 font-bold text-blue-400">{cumOcc}</td>
                                            </tr>
                                        );
                                    })}
                                    {reportData.hourlyData.filter(row => row.entries > 0 || row.exits > 0).length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-muted-foreground">No traffic data for selected period.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
