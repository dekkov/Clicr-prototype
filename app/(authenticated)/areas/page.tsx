"use client";
import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { Area, AreaType, CountingMode, FlowMode, ShiftMode, Role } from '@/lib/types';
import { Search, RefreshCw, ArrowUp, ArrowDown, Plus, ChevronDown, MousePointer2, Play, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { canEditVenuesAndAreas, canStartShift, canAddClicr } from '@/lib/permissions';

const TIMEZONES = [
    { value: 'America/New_York', label: 'Eastern (ET)' },
    { value: 'America/Chicago', label: 'Central (CT)' },
    { value: 'America/Denver', label: 'Mountain (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
    { value: 'America/Anchorage', label: 'Alaska (AKT)' },
    { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
    { value: 'Europe/London', label: 'London (GMT/BST)' },
    { value: 'Europe/Berlin', label: 'Berlin (CET)' },
    { value: 'Asia/Dubai', label: 'Dubai (GST)' },
    { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
    { value: 'UTC', label: 'UTC' },
];

export default function AreasPage() {
    const { areas, clicrs, venues, areaTraffic, activeBusiness, addArea, addClicr, resetCounts, updateArea, isLoading, currentUser } = useApp();
    const userRole = currentUser?.role as Role | undefined;
    const canEdit = canEditVenuesAndAreas(userRole);
    const canShift = canStartShift(userRole);
    const canAdd = canAddClicr(userRole);
    const [search, setSearch] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isAddingArea, setIsAddingArea] = useState(false);
    const [startingShiftAreaId, setStartingShiftAreaId] = useState<string | null>(null);
    const [editShiftAreaId, setEditShiftAreaId] = useState<string | null>(null);
    const [editShiftMode, setEditShiftMode] = useState<ShiftMode>('MANUAL');
    const [editAutoTime, setEditAutoTime] = useState('09:00');
    const [editAutoTz, setEditAutoTz] = useState(() => {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
    });
    const [newArea, setNewArea] = useState<Partial<Area> & { venue_id: string }>({
        venue_id: '',
        name: '',
        area_type: 'MAIN',
        default_capacity: 0,
        counting_mode: 'BOTH',
        is_active: true,
        shift_mode: 'MANUAL',
        auto_reset_time: '09:00',
        auto_reset_timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } })(),
    });

    // Add Clicr modal state
    const [addClicrAreaId, setAddClicrAreaId] = useState<string | null>(null);
    const [newClicrName, setNewClicrName] = useState('');
    const [newClicrFlow, setNewClicrFlow] = useState<FlowMode>('BIDIRECTIONAL');
    const [isAddingClicr, setIsAddingClicr] = useState(false);

    const handleAddClicr = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!addClicrAreaId || !newClicrName.trim()) return;
        setIsAddingClicr(true);
        await addClicr({
            id: crypto.randomUUID(),
            area_id: addClicrAreaId,
            name: newClicrName.trim(),
            flow_mode: newClicrFlow,
            current_count: 0,
            active: true,
        });
        setIsAddingClicr(false);
        setAddClicrAreaId(null);
        setNewClicrName('');
        setNewClicrFlow('BIDIRECTIONAL');
    };

    const handleCreateArea = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newArea.name || !newArea.venue_id) return;

        setIsAddingArea(true);
        const area: Area = {
            id: crypto.randomUUID(),
            venue_id: newArea.venue_id,
            name: newArea.name,
            area_type: newArea.area_type || 'MAIN',
            default_capacity: newArea.default_capacity || 0,
            capacity_max: newArea.default_capacity || 0,
            counting_mode: newArea.counting_mode || 'BOTH',
            is_active: true,
            shift_mode: newArea.shift_mode ?? 'MANUAL',
            auto_reset_time: newArea.shift_mode === 'AUTO' ? newArea.auto_reset_time : undefined,
            auto_reset_timezone: newArea.shift_mode === 'AUTO' ? newArea.auto_reset_timezone : undefined,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        } as Area;

        await addArea(area);
        setIsAddingArea(false);
        setIsCreateOpen(false);
        setNewArea({
            venue_id: '',
            name: '',
            area_type: 'MAIN',
            default_capacity: 0,
            counting_mode: 'BOTH',
            is_active: true,
        });
    };

    const handleStartShift = async (area: Area) => {
        setStartingShiftAreaId(area.id);
        await resetCounts(area.venue_id);
        setStartingShiftAreaId(null);
    };

    const openShiftConfig = (area: Area) => {
        setEditShiftAreaId(area.id);
        setEditShiftMode(area.shift_mode ?? 'MANUAL');
        setEditAutoTime(area.auto_reset_time ?? '09:00');
        setEditAutoTz(area.auto_reset_timezone ?? ((() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } })()));
    };

    const handleSaveShiftConfig = async () => {
        if (!editShiftAreaId) return;
        const area = areas.find(a => a.id === editShiftAreaId);
        if (!area) return;
        await updateArea({
            ...area,
            shift_mode: editShiftMode,
            auto_reset_time: editShiftMode === 'AUTO' ? editAutoTime : undefined,
            auto_reset_timezone: editShiftMode === 'AUTO' ? editAutoTz : undefined,
        });
        setEditShiftAreaId(null);
    };

    if (!activeBusiness && !isLoading) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">Areas</h1>
                    <p className="text-slate-400">All areas across your venues.</p>
                </div>
                <div className="glass-card p-10 rounded-xl text-center text-slate-400">
                    Select a business from the sidebar.
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white">Areas</h1>
                        <p className="text-slate-400">All areas across your venues.</p>
                    </div>
                </div>
                <div className="space-y-4 animate-pulse">
                    <div className="h-5 bg-slate-800 rounded w-32" />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="glass-card rounded-xl p-5 space-y-3">
                                <div className="h-4 bg-slate-800 rounded w-24" />
                                <div className="h-10 bg-slate-800 rounded w-16" />
                                <div className="h-1.5 bg-slate-800 rounded-full" />
                                <div className="h-3 bg-slate-800 rounded w-full" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const filteredAreas = areas.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase())
    );

    // Group areas by venue, preserving venue order
    const venueGroups = venues
        .map(venue => ({
            venue,
            areas: filteredAreas.filter(a => a.venue_id === venue.id),
        }))
        .filter(g => g.areas.length > 0);

    return (
        <div className="space-y-8">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Areas</h1>
                    <p className="text-slate-400">All areas across your venues.</p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search areas..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white focus:border-primary outline-none"
                        />
                    </div>
                    {canEdit && (
                        <button
                            onClick={() => setIsCreateOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors whitespace-nowrap"
                        >
                            <Plus className="w-4 h-4" />
                            Add Area
                        </button>
                    )}
                </div>
            </div>

            {/* Venue Groups */}
            {venueGroups.length === 0 ? (
                <div className="glass-card p-10 rounded-xl text-center text-slate-400">
                    No areas found.
                </div>
            ) : (
                venueGroups.map(({ venue, areas: venueAreas }) => (
                    <section key={venue.id} className="space-y-4">
                        {/* Venue Section Header */}
                        <h2 className="text-base font-bold text-white">{venue.name}</h2>

                        {/* Area Cards Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {venueAreas.map(area => {
                                const scopeKey = `area:${activeBusiness.id}:${area.venue_id}:${area.id}`;
                                const traffic = areaTraffic[scopeKey] ?? { total_in: 0, total_out: 0 };

                                const areaClicrs = clicrs.filter(c => c.area_id === area.id);
                                const deviceCount = areaClicrs.length;

                                const liveOcc = area.current_occupancy ?? 0;
                                const capacity = area.default_capacity ?? area.capacity_limit ?? 0;
                                const pct = capacity > 0 ? Math.round((liveOcc / capacity) * 100) : null;

                                // Progress bar color
                                let barColor = 'bg-indigo-500';
                                if (pct !== null && pct > 90) barColor = 'bg-red-500';
                                else if (pct !== null && pct > 75) barColor = 'bg-amber-500';

                                return (
                                    <div
                                        key={area.id}
                                        className="glass-card rounded-xl p-5 flex flex-col gap-3"
                                    >
                                        {/* Card Top Row */}
                                        <div className="flex items-start justify-between">
                                            <span className="text-sm font-semibold text-white">{area.name}</span>
                                            <button
                                                type="button"
                                                className="text-slate-500 hover:text-slate-300 transition-colors"
                                                aria-label="Refresh"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                            </button>
                                        </div>

                                        {/* Occupancy Number */}
                                        <div>
                                            <span className="text-4xl font-bold text-white tabular-nums">{liveOcc}</span>
                                            {capacity > 0 && pct !== null && (
                                                <p className="text-xs text-slate-400 mt-0.5">
                                                    of {capacity} &middot; {pct}% full
                                                </p>
                                            )}
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className={cn('h-full rounded-full transition-all duration-500', barColor)}
                                                style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
                                            />
                                        </div>

                                        {/* Shift controls */}
                                        <div className="flex items-center gap-2">
                                            {area.shift_mode === 'AUTO' ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 text-[11px] font-medium border border-amber-500/20">
                                                    <Clock className="w-3 h-3" />
                                                    Auto {area.auto_reset_time ?? ''}
                                                </span>
                                            ) : canShift ? (
                                                <button
                                                    onClick={() => handleStartShift(area)}
                                                    disabled={startingShiftAreaId === area.id}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-medium border border-emerald-500/20 transition-colors disabled:opacity-50"
                                                >
                                                    {startingShiftAreaId === area.id ? (
                                                        <span className="w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                                                    ) : (
                                                        <Play className="w-3 h-3" />
                                                    )}
                                                    Start Shift
                                                </button>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 text-slate-500 text-[11px] font-medium border border-slate-700">
                                                    Manual
                                                </span>
                                            )}
                                            {canEdit && (
                                                <button
                                                    onClick={() => openShiftConfig(area)}
                                                    className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                                                    title="Configure shift mode"
                                                >
                                                    <Clock className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>

                                        {/* Bottom Row: traffic + device count + add clicr */}
                                        <div className="flex items-center justify-between text-xs text-slate-400">
                                            <div className="flex items-center gap-3">
                                                <span className="flex items-center gap-1 text-emerald-400">
                                                    <ArrowUp className="w-3 h-3" />
                                                    {traffic.total_in}
                                                </span>
                                                <span className="flex items-center gap-1 text-red-400">
                                                    <ArrowDown className="w-3 h-3" />
                                                    {traffic.total_out}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span>{deviceCount} device{deviceCount !== 1 ? 's' : ''}</span>
                                                {canAdd && (
                                                    <button
                                                        onClick={() => setAddClicrAreaId(area.id)}
                                                        className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                                                        title="Add Clicr to this area"
                                                    >
                                                        <Plus className="w-3 h-3" />
                                                        <MousePointer2 className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))
            )}

            {/* Create Area Modal */}
            <AnimatePresence>
                {isCreateOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                        onClick={() => setIsCreateOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold mb-4">Create Area</h2>
                            <form onSubmit={handleCreateArea} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-400">Venue</label>
                                    <div className="relative">
                                        <select
                                            value={newArea.venue_id}
                                            onChange={e => setNewArea(prev => ({ ...prev, venue_id: e.target.value }))}
                                            required
                                            className="w-full appearance-none bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10"
                                        >
                                            <option value="">Select a venue…</option>
                                            {venues.map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-400">Area Name</label>
                                    <input
                                        type="text"
                                        value={newArea.name}
                                        onChange={e => setNewArea(prev => ({ ...prev, name: e.target.value }))}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                                        placeholder="e.g. Main Floor"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-400">Type</label>
                                        <select
                                            value={newArea.area_type}
                                            onChange={e => setNewArea(prev => ({ ...prev, area_type: e.target.value as AreaType }))}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                                        >
                                            <option value="MAIN">Main</option>
                                            <option value="ENTRY">Entry</option>
                                            <option value="VIP">VIP</option>
                                            <option value="PATIO">Patio</option>
                                            <option value="BAR">Bar</option>
                                            <option value="EVENT_SPACE">Event Space</option>
                                            <option value="OTHER">Other</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-400">Capacity</label>
                                        <input
                                            type="number"
                                            value={newArea.default_capacity || ''}
                                            onChange={e => setNewArea(prev => ({ ...prev, default_capacity: parseInt(e.target.value) || 0 }))}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                                            placeholder="0 for unlimited"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-400">Counting Mode</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['MANUAL', 'AUTO_FROM_SCANS', 'BOTH'] as CountingMode[]).map(mode => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => setNewArea(prev => ({ ...prev, counting_mode: mode }))}
                                                className={cn(
                                                    "px-2 py-2 rounded-lg text-xs font-medium border transition-colors",
                                                    newArea.counting_mode === mode
                                                        ? "bg-primary/20 text-primary border-primary/50"
                                                        : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900"
                                                )}
                                            >
                                                {mode.replace(/_/g, ' ')}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-400">Shift Mode</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(['MANUAL', 'AUTO'] as ShiftMode[]).map(mode => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => setNewArea(prev => ({ ...prev, shift_mode: mode }))}
                                                className={cn(
                                                    "px-3 py-2 rounded-lg text-xs font-medium border transition-colors",
                                                    newArea.shift_mode === mode
                                                        ? "bg-primary/20 text-primary border-primary/50"
                                                        : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900"
                                                )}
                                            >
                                                {mode === 'MANUAL' ? 'Manual Start' : 'Auto (Scheduled)'}
                                            </button>
                                        ))}
                                    </div>
                                    {newArea.shift_mode === 'AUTO' && (
                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                            <div className="space-y-1">
                                                <label className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Time</label>
                                                <input
                                                    type="time"
                                                    value={newArea.auto_reset_time ?? '09:00'}
                                                    onChange={e => setNewArea(prev => ({ ...prev, auto_reset_time: e.target.value }))}
                                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Timezone</label>
                                                <select
                                                    value={newArea.auto_reset_timezone}
                                                    onChange={e => setNewArea(prev => ({ ...prev, auto_reset_timezone: e.target.value }))}
                                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
                                                >
                                                    {TIMEZONES.map(tz => (
                                                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setIsCreateOpen(false)}
                                        className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isAddingArea}
                                        className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-bold shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {isAddingArea && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                        {isAddingArea ? 'Adding...' : 'Create Area'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Add Clicr Modal */}
            <AnimatePresence>
                {addClicrAreaId && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                        onClick={() => { setAddClicrAreaId(null); setNewClicrName(''); setNewClicrFlow('BIDIRECTIONAL'); }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold mb-1">Add Clicr</h2>
                            <p className="text-sm text-slate-400 mb-4">
                                Adding to <span className="text-white font-medium">{areas.find(a => a.id === addClicrAreaId)?.name}</span>
                            </p>
                            <form onSubmit={handleAddClicr} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-400">Clicr Name</label>
                                    <input
                                        type="text"
                                        value={newClicrName}
                                        onChange={e => setNewClicrName(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                                        placeholder="e.g. Front Door"
                                        required
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-400">Flow Mode</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['BIDIRECTIONAL', 'IN_ONLY', 'OUT_ONLY'] as FlowMode[]).map(mode => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => setNewClicrFlow(mode)}
                                                className={cn(
                                                    "px-2 py-2 rounded-lg text-xs font-medium border transition-colors",
                                                    newClicrFlow === mode
                                                        ? "bg-primary/20 text-primary border-primary/50"
                                                        : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900"
                                                )}
                                            >
                                                {mode === 'BIDIRECTIONAL' ? 'Both' : mode === 'IN_ONLY' ? 'In Only' : 'Out Only'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => { setAddClicrAreaId(null); setNewClicrName(''); setNewClicrFlow('BIDIRECTIONAL'); }}
                                        className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isAddingClicr}
                                        className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-bold shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {isAddingClicr && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                        {isAddingClicr ? 'Adding...' : 'Add Clicr'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Edit Shift Config Modal */}
            <AnimatePresence>
                {editShiftAreaId && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                        onClick={() => setEditShiftAreaId(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold mb-1">Shift Configuration</h2>
                            <p className="text-sm text-slate-400 mb-4">
                                {areas.find(a => a.id === editShiftAreaId)?.name}
                            </p>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-400">Shift Mode</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(['MANUAL', 'AUTO'] as ShiftMode[]).map(mode => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => setEditShiftMode(mode)}
                                                className={cn(
                                                    "px-3 py-2 rounded-lg text-sm font-medium border transition-colors",
                                                    editShiftMode === mode
                                                        ? "bg-primary/20 text-primary border-primary/50"
                                                        : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900"
                                                )}
                                            >
                                                {mode === 'MANUAL' ? 'Manual Start' : 'Auto (Scheduled)'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {editShiftMode === 'AUTO' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Reset Time</label>
                                            <input
                                                type="time"
                                                value={editAutoTime}
                                                onChange={e => setEditAutoTime(e.target.value)}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Timezone</label>
                                            <select
                                                value={editAutoTz}
                                                onChange={e => setEditAutoTz(e.target.value)}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
                                            >
                                                {TIMEZONES.map(tz => (
                                                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}
                                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setEditShiftAreaId(null)}
                                        className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveShiftConfig}
                                        className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-bold shadow-lg shadow-primary/20"
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
