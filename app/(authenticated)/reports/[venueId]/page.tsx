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
    MapPin
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
import { computeDailyEntries, computeMonthStats, computeMonthlyTrend } from '@/lib/calendarUtils';

// --- TYPES ---
type DateRange = {
    from: Date;
    to: Date;
    label: string;
};

// --- COMPONENTS ---
const MetricCard = ({ title, value, subtext, trend, icon: Icon, colorClass }: any) => (
    <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover:border-slate-600 transition-colors">
        <div className={cn("absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity", colorClass)}>
            <Icon className="w-16 h-16" />
        </div>
        <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
                <div className={cn("p-2 rounded-lg bg-slate-900/50", colorClass)}>
                    <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-slate-400 font-medium text-sm uppercase tracking-wider">{title}</h3>
            </div>
            <div className="text-3xl font-bold text-white mb-1">{value}</div>
            {subtext && <div className="text-sm text-slate-500">{subtext}</div>}
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

    // Calendar view state
    const [view, setView] = useState<'calendar' | 'analytics'>('calendar');
    const [calYear, setCalYear] = useState(() => new Date().getFullYear());
    const [calMonth, setCalMonth] = useState(() => new Date().getMonth()); // 0-indexed
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

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

        // ... (rest of computation uses filteredEvents/filteredScans which are safe now)

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

        // -- Hourly Breakdown
        const hours = eachHourOfInterval({ start: dateRange.from, end: dateRange.to });
        const hourlyData = hours.map(hour => {
            const nextHour = addHours(hour, 1);
            const hourEvents = filteredEvents.filter(e => e.timestamp >= hour.getTime() && e.timestamp < nextHour.getTime());

            const entries = hourEvents.filter(e => e.flow_type === 'IN').reduce((acc, e) => acc + e.delta, 0);
            const exits = hourEvents.filter(e => e.flow_type === 'OUT').reduce((acc, e) => acc + Math.abs(e.delta), 0);

            // Gender breakdown for flow
            const maleEntries = hourEvents.filter(e => e.flow_type === 'IN' && e.gender === 'M').reduce((acc, e) => acc + e.delta, 0);
            const femaleEntries = hourEvents.filter(e => e.flow_type === 'IN' && e.gender === 'F').reduce((acc, e) => acc + e.delta, 0);

            return {
                hourLabel: format(hour, 'ha'), // 10pm
                hourStart: hour,
                entries,
                exits,
                net: entries - exits,
                maleEntries,
                femaleEntries
            };
        });

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

            // Zip
            if (s.zip_code) {
                zipCounts[s.zip_code] = (zipCounts[s.zip_code] || 0) + 1;
            }
        });

        // Merge manual gender counts from Taps if available
        filteredEvents.forEach(e => {
            if (e.gender === 'M') genderCounts['Male'] += e.delta;
            if (e.gender === 'F') genderCounts['Female'] += e.delta;
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

    const handlePrevMonth = () => {
        if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
        else setCalMonth(m => m - 1);
        setSelectedDate(null);
    };

    const handleNextMonth = () => {
        if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
        else setCalMonth(m => m + 1);
        setSelectedDate(null);
    };

    // --- EXPORT ---
    const handleExport = () => {
        if (!venue || !reportData) return;

        // Inject MOCK Data Logic here if empty, as per previous requirement
        let exportEvents = reportData.filteredEvents;
        let exportScans = reportData.filteredScans;

        if (exportEvents.length === 0 && exportScans.length === 0) {
            const now = Date.now();
            const mockEvents: any[] = [];
            const mockScans: any[] = [];
            for (let i = 0; i < 50; i++) {
                const time = now - Math.floor(Math.random() * 5 * 3600000);
                mockEvents.push({ id: `mock_e_${i}`, venue_id: venue.id, timestamp: time, delta: 1, flow_type: 'IN', event_type: 'TAP', gender: Math.random() > 0.5 ? 'M' : 'F', user_id: 'mock_user' });
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

    if (!isMounted) return <div className="flex h-screen items-center justify-center text-slate-500">Loading Dashboard...</div>;

    if (!venue || !reportData) return <div className="p-10 text-center text-slate-500">Venue not found</div>;

    return (
        <div className="space-y-8 animate-[fade-in_0.5s_ease-out] pb-24">
            {/* Header & Filters */}
            <div className="flex flex-col xl:flex-row justify-between items-start gap-6 border-b border-slate-800 pb-8">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <button onClick={() => router.push('/reports')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-sm font-medium">
                            <ArrowLeft className="w-4 h-4" /> Back to Venues
                        </button>
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">{venue.name} Reports</h1>
                    <p className="text-slate-400">Detailed analytics for {venue.city}, {venue.state}</p>
                </div>

                <div className="flex flex-wrap gap-4 items-center bg-slate-900/50 p-2 rounded-2xl border border-slate-800">
                    {/* Date Presets */}
                    <div className="flex gap-2">
                        {quickRanges.map(range => (
                            <button
                                key={range.label}
                                onClick={() => setDateRange(range)}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                    dateRange.label === range.label
                                        ? "bg-primary text-black shadow-lg shadow-primary/25"
                                        : "hover:bg-slate-800 text-slate-400"
                                )}
                            >
                                {range.label}
                            </button>
                        ))}
                    </div>

                    <div className="h-8 w-px bg-slate-700 mx-2 hidden md:block" />

                    {/* Custom / Display */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg text-xs text-slate-300 font-mono border border-slate-700">
                        <CalendarIcon className="w-3 h-3" />
                        {format(dateRange.from, 'MMM d')} - {format(dateRange.to, 'MMM d, yyyy')}
                    </div>
                </div>
            </div>

            {/* View Toggle */}
            <div className="flex gap-2 mb-6">
                {(['calendar', 'analytics'] as const).map(v => (
                    <button
                        key={v}
                        onClick={() => setView(v)}
                        className={cn(
                            'px-4 py-2 rounded-lg text-sm font-bold capitalize transition-all',
                            view === v
                                ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/25'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        )}
                    >
                        {v === 'calendar' ? 'Calendar' : 'Analytics'}
                    </button>
                ))}
            </div>

            {view === 'calendar' && (
                <div className="space-y-6">
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
                        onSelectDate={setSelectedDate}
                        onPrevMonth={handlePrevMonth}
                        onNextMonth={handleNextMonth}
                    />
                    {selectedDate && (
                        <DayDetailPanel
                            dateStr={selectedDate}
                            events={venueEvents}
                            scans={venueScans}
                            venueId={venueId as string}
                        />
                    )}
                </div>
            )}

            {view === 'analytics' && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

                    {/* Left Col: KPI Cards */}
                    <div className="lg:col-span-1 space-y-4">
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
                            <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                                <MapPin className="w-4 h-4" /> Top Locations
                            </h3>
                            {reportData.topZips.length > 0 ? (
                                <div className="space-y-3">
                                    {reportData.topZips.map((z) => (
                                        <div key={z.zip} className="flex justify-between items-center text-sm">
                                            <span className="text-slate-300 font-mono">{z.zip}</span>
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 bg-primary rounded-full" style={{ width: `${Math.min(100, (z.count / reportData.totalScans) * 100)}px` }} />
                                                <span className="text-white font-bold">{z.count}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center text-slate-600 text-xs py-4">No location data available</div>
                            )}
                        </div>

                        <div className="mt-8">
                            <button
                                onClick={handleExport}
                                className="w-full py-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold flex items-center justify-center gap-3 transition-colors shadow-lg"
                            >
                                <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
                                Export Excel Report
                            </button>
                            <p className="text-xs text-center mt-3 text-slate-500">
                                Includes Sheets: Summary, Traffic, Demographics, Logs
                            </p>
                        </div>
                    </div>

                    {/* Right Col: Charts & Details */}
                    <div className="lg:col-span-3 space-y-8">

                        {/* Traffic Chart */}
                        <div className="glass-panel p-6 rounded-2xl">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <BarChart3 className="w-5 h-5 text-primary" />
                                    Hourly Traffic Breakdown
                                </h3>
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                    <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500" /> Entries</div>
                                    <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-rose-500" /> Exits</div>
                                </div>
                            </div>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={reportData.hourlyData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                                        <XAxis dataKey="hourLabel" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
                                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        />
                                        <Bar dataKey="entries" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                                        <Bar dataKey="exits" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Demographic Flow Chart */}
                        <div className="glass-panel p-6 rounded-2xl">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Users className="w-5 h-5 text-blue-400" />
                                    Demographic Traffic Flow
                                </h3>
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                    <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-500" /> Male</div>
                                    <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-pink-500" /> Female</div>
                                </div>
                            </div>
                            <div className="h-[250px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={reportData.hourlyData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                                        <XAxis dataKey="hourLabel" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
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
                                <h3 className="text-lg font-bold text-white mb-6">Age Distribution</h3>
                                <div className="h-[250px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={reportData.ageChartData} layout="vertical">
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} horizontal={false} />
                                            <XAxis type="number" stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} />
                                            <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} width={80} />
                                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }} />
                                            <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Gender Chart */}
                            <div className="glass-panel p-6 rounded-2xl flex flex-col items-center">
                                <h3 className="text-lg font-bold text-white mb-2 self-start w-full">Gender Split</h3>
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
                                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }} />
                                            <Legend
                                                formatter={(value) => <span className="text-slate-300">{value}</span>}
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
                                <h3 className="text-lg font-bold text-white">Hourly Log</h3>
                            </div>
                            <div className="max-h-[400px] overflow-y-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-900/80 text-slate-400 sticky top-0 backdrop-blur-md">
                                        <tr>
                                            <th className="px-6 py-3 font-medium">Hour</th>
                                            <th className="px-6 py-3 font-medium text-emerald-400">Entries</th>
                                            <th className="px-6 py-3 font-medium text-rose-400">Exits</th>
                                            <th className="px-6 py-3 font-medium text-blue-400">Net Delta</th>
                                            <th className="px-6 py-3 font-medium">Est. Occupancy</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {reportData.hourlyData.map((row, idx) => {
                                            const cumOcc = reportData.hourlyData.slice(0, idx + 1).reduce((acc, r) => acc + r.net, 0);
                                            return (
                                                <tr key={idx} className="hover:bg-white/5">
                                                    <td className="px-6 py-4 font-mono text-slate-300">{row.hourLabel}</td>
                                                    <td className="px-6 py-4 font-bold text-emerald-500">{row.entries}</td>
                                                    <td className="px-6 py-4 font-bold text-rose-500">{row.exits}</td>
                                                    <td className="px-6 py-4 font-mono text-slate-400">{row.net > 0 ? `+${row.net}` : row.net}</td>
                                                    <td className="px-6 py-4 font-bold text-blue-400">{cumOcc}</td>
                                                </tr>
                                            );
                                        })}
                                        {reportData.hourlyData.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center text-slate-500">No traffic data for selected period.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
