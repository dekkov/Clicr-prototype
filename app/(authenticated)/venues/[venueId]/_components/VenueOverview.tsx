"use client";

import React, { useMemo } from 'react';
import { useApp } from '@/lib/store';
import { Area, Venue } from '@/lib/types';
import {
    Users,
    Layers,
    MonitorSmartphone,
    Plus,
    Settings,
    LogIn,
    LogOut,
    RotateCcw,
    Tag
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { KpiCard } from '@/components/ui/KpiCard';
import { getVenueCapacityRules } from '@/lib/capacity';
import { AreaChart, Area as RechartsArea, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function VenueOverview({ venueId, setActiveTab }: { venueId: string, setActiveTab: (tab: any) => void }) {
    const { venues, areas, clicrs, devices, events, turnarounds } = useApp();
    const venue = venues.find(v => v.id === venueId);

    // Filtered Data
    const venueAreas = useMemo(() => areas.filter(a => a.venue_id === venueId), [areas, venueId]);
    const areaIds = useMemo(() => venueAreas.map(a => a.id), [venueAreas]);
    const venueClicrs = useMemo(() => clicrs.filter(c =>
        (c.area_id && areaIds.includes(c.area_id)) || (c.is_venue_counter && c.venue_id === venueId)
    ), [clicrs, areaIds, venueId]);

    // Live Stats (Source of truth: Venue Counter)
    const currentOccupancy = venue?.current_occupancy ?? 0;

    const { maxCapacity } = getVenueCapacityRules(venue);
    const capacityPct = maxCapacity
        ? (currentOccupancy / maxCapacity) * 100
        : 0;

    // Traffic Stats (Source of truth: Server Synced Stats on Area)
    const trafficStats = useMemo(() => {
        const ins = venueAreas.reduce((sum, a) => sum + (a.current_traffic_in || 0), 0);
        const outs = venueAreas.reduce((sum, a) => sum + (a.current_traffic_out || 0), 0);
        return { ins, outs };
    }, [venueAreas]);

    const turnaroundStats = useMemo(() => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const venueTurnarounds = (turnarounds || []).filter(
            t => t.venue_id === venueId && t.timestamp >= todayStart.getTime()
        );
        const total = venueTurnarounds.reduce((sum, t) => sum + t.count, 0);
        const netEntries = Math.max(0, trafficStats.ins - total);
        return { total, netEntries };
    }, [turnarounds, venueId, trafficStats.ins]);

    // Counter Label Breakdown — scoped to venue counters only
    const venueCounterClicrs = useMemo(() => venueClicrs.filter(c => c.is_venue_counter), [venueClicrs]);
    const venueCounterIds = useMemo(() => new Set(venueCounterClicrs.map(c => c.id)), [venueCounterClicrs]);

    const labelBreakdown = useMemo(() => {
        // Build label name map from venue counter clicrs only
        const labelMap = new Map<string, string>();
        venueCounterClicrs.forEach(c => (c.counter_labels ?? []).forEach(l => labelMap.set(l.id, l.label)));

        // Only include events from venue counter devices (no area_id, matching device)
        const vcEvents = events.filter(e => e.venue_id === venueId && !e.area_id && venueCounterIds.has(e.clicr_id));
        // Aggregate by label NAME (same name from different devices = combined)
        const counts: Record<string, { in: number; out: number }> = {};
        vcEvents.forEach(e => {
            const name = (e.counter_label_id && labelMap.get(e.counter_label_id)) || 'Unlabeled';
            if (!counts[name]) counts[name] = { in: 0, out: 0 };
            if (e.delta > 0) counts[name].in += e.delta;
            else counts[name].out += Math.abs(e.delta);
        });
        return Object.entries(counts)
            .sort(([, a], [, b]) => (b.in + b.out) - (a.in + a.out));
    }, [events, venueId, venueCounterClicrs, venueCounterIds]);

    // Chart Data (Last 6 Hours) - Occupancy from venue counters only
    const chartData = useMemo(() => {
        const vcEvents = events.filter(e => e.venue_id === venueId && !e.area_id && venueCounterIds.has(e.clicr_id));
        const sortedEvents = [...vcEvents].sort((a, b) => a.timestamp - b.timestamp);
        const now = Date.now();
        const points = [];

        for (let i = 5; i >= 0; i--) {
            const timePoint = new Date(now - i * 3600000);
            timePoint.setMinutes(59, 59, 999);

            let occ = 0;
            sortedEvents.forEach(e => {
                if (e.timestamp <= timePoint.getTime()) {
                    occ += e.delta;
                }
            });

            if (occ < 0) occ = 0;

            const hour = timePoint.getHours();
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const hour12 = hour % 12 || 12;

            points.push({
                time: `${hour12}${ampm}`,
                occupancy: occ,
            });
        }
        return points;
    }, [events, venueId, venueCounterIds]);


    if (!venue) return null;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <KpiCard
                    title="Live Occupancy"
                    value={currentOccupancy}
                    icon={Users}
                    trend={currentOccupancy > 0 ? 'up' : 'neutral'}
                    className="bg-card border-border"
                />
                <KpiCard
                    title="Entries (Today)"
                    value={trafficStats.ins}
                    icon={LogIn}
                    className="bg-card border-border text-emerald-400"
                />
                <KpiCard
                    title="Exits (Today)"
                    value={trafficStats.outs}
                    icon={LogOut}
                    className="bg-card border-border text-amber-400"
                />
                <KpiCard
                    title="Turnarounds"
                    value={turnaroundStats.total}
                    subtext={`Net Entries: ${turnaroundStats.netEntries}`}
                    icon={RotateCcw}
                    className="bg-card border-border"
                />
                <div onClick={() => setActiveTab('AREAS')} className="bg-card border border-border p-6 rounded-2xl cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                            <Layers className="w-5 h-5" />
                        </div>
                        <span className="text-xs text-muted-foreground">View Areas</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground">{venueAreas.length}</div>
                    <div className="text-xs text-muted-foreground mt-1">Active Zones</div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart Section */}
                <div className="lg:col-span-2 bg-muted/30 border border-border rounded-2xl p-6 self-start">
                    <h3 className="text-lg font-bold text-foreground mb-6">Occupancy Flow</h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorOccupancy" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                                <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
                                />
                                <RechartsArea
                                    type="monotone"
                                    dataKey="occupancy"
                                    stroke="#10b981"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorOccupancy)"
                                    name="Occupancy"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Right Column: Quick Actions & Top Areas */}
                <div className="space-y-6">
                    {/* Quick Actions */}
                    <div className="bg-card border border-border p-6 rounded-2xl">
                        <h3 className="text-muted-foreground text-sm font-medium mb-4">Quick Actions</h3>
                        <div className="space-y-3">
                            <button
                                onClick={() => setActiveTab('AREAS')}
                                className="w-full flex items-center gap-3 p-3 bg-muted/50 hover:bg-muted rounded-xl transition-colors text-left"
                            >
                                <Plus className="w-4 h-4 text-primary" />
                                <span className="text-sm font-medium text-foreground/80">Add New Area</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('DEVICES')}
                                className="w-full flex items-center gap-3 p-3 bg-muted/50 hover:bg-muted rounded-xl transition-colors text-left"
                            >
                                <MonitorSmartphone className="w-4 h-4 text-purple-400" />
                                <span className="text-sm font-medium text-foreground/80">Assign Device</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('SETTINGS')}
                                className="w-full flex items-center gap-3 p-3 bg-muted/50 hover:bg-muted rounded-xl transition-colors text-left"
                            >
                                <Settings className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm font-medium text-foreground/80">Edit Venue Settings</span>
                            </button>
                        </div>
                    </div>

                    {/* Top Areas List (Compact) */}
                    <div className="bg-muted/30 border border-border rounded-2xl p-6">
                        <h3 className="text-sm font-bold text-muted-foreground mb-4 uppercase tracking-wider">Area Status</h3>
                        <div className="space-y-4">
                            {venueAreas.slice(0, 5).map(area => {
                                const areaCount = area.current_occupancy || 0;
                                const areaCap = area.default_capacity;
                                const areaPct = areaCap ? (areaCount / areaCap) * 100 : 0;

                                return (
                                    <div key={area.id}>
                                        <div className="flex justify-between items-center mb-1 text-sm">
                                            <span className="font-medium text-foreground">{area.name}</span>
                                            <span className="text-muted-foreground">{areaCount} <span className="text-slate-700">/ {areaCap || '∞'}</span></span>
                                        </div>
                                        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className={cn(
                                                    "h-full rounded-full transition-all",
                                                    areaPct > 90 ? "bg-red-500" : areaPct > 75 ? "bg-amber-500" : "bg-primary"
                                                )}
                                                style={{ width: `${Math.min(areaPct, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                            {venueAreas.length === 0 && <p className="text-muted-foreground/60 text-xs italic">No areas configured.</p>}
                        </div>
                    </div>

                    {/* Counter Label Breakdown */}
                    {labelBreakdown.length > 0 && (
                        <div className="bg-card border border-border rounded-2xl p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Tag className="w-4 h-4 text-muted-foreground" />
                                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Counter Labels</h3>
                            </div>
                            <div className="space-y-3">
                                {labelBreakdown.map(([name, counts], i) => {
                                    const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-purple-500', 'bg-pink-500', 'bg-cyan-500'];
                                    return (
                                        <div key={name}>
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className={cn("w-2.5 h-2.5 rounded-full", colors[i % colors.length])} />
                                                <span className="text-sm font-medium text-foreground">{name}</span>
                                            </div>
                                            <div className="flex items-center gap-4 pl-[18px] text-xs text-muted-foreground">
                                                <span className="text-emerald-400">+{counts.in} in</span>
                                                <span className="text-red-400">-{counts.out} out</span>
                                                <span className="text-foreground/60">= {counts.in - counts.out} net</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
