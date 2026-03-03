"use client";
import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { Area, AreaType, CountingMode, FlowMode, ShiftMode, Role } from '@/lib/types';
import { Search, RefreshCw, ArrowUp, ArrowDown, Plus, ChevronDown, Sparkles, Play, Square, Clock, Layers, Maximize2 } from 'lucide-react';
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
    const { areas, clicrs, venues, areaTraffic, activeBusiness, addArea, addClicr, resetCounts, startShift, endShift, updateArea, isLoading, currentUser, activeShiftId, activeShiftAreaId } = useApp();
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

    const CLICR_TEMPLATES: { id: string; label: string; desc: string; names: string[] }[] = [
        { id: 'single', label: 'Single door', desc: '1 counter', names: ['Front Door'] },
        { id: 'entry_exit', label: 'Entry + Exit pair', desc: '2 counters', names: ['Entry Door', 'Exit Door'] },
        { id: 'busy', label: 'Busy door setup', desc: '3 counters', names: ['Front Door 1', 'Front Door 2', 'VIP Door'] },
    ];

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

    const handleApplyTemplate = async (template: typeof CLICR_TEMPLATES[0]) => {
        if (!addClicrAreaId) return;
        setIsAddingClicr(true);
        for (const name of template.names) {
            await addClicr({
                id: crypto.randomUUID(),
                area_id: addClicrAreaId,
                name,
                flow_mode: newClicrFlow,
                current_count: 0,
                active: true,
            });
        }
        setIsAddingClicr(false);
        setAddClicrAreaId(null);
        setNewClicrName('');
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
        await startShift(area.venue_id, area.id);
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
            <div className="p-6 max-w-[1600px]">
                <div className="mb-8">
                    <h1 className="text-3xl mb-1">Areas</h1>
                    <p className="text-gray-400 text-sm">All areas across your venues.</p>
                </div>
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-10 text-center text-gray-400">
                    Select a business from the sidebar.
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="p-6 max-w-[1600px]">
                <div className="mb-8">
                    <h1 className="text-3xl mb-1">Areas</h1>
                    <p className="text-gray-400 text-sm">All areas across your venues.</p>
                </div>
                <div className="space-y-4 animate-pulse">
                    <div className="h-5 bg-gray-800 rounded w-32" />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-3">
                                <div className="h-4 bg-gray-800 rounded w-24" />
                                <div className="h-10 bg-gray-800 rounded w-16" />
                                <div className="h-2 bg-gray-800 rounded-full" />
                                <div className="h-3 bg-gray-800 rounded w-full" />
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
        <div className="p-6 max-w-[1600px]">
            {/* Page Header - Design */}
            <div className="mb-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl mb-1">Areas</h1>
                        <p className="text-gray-400 text-sm">All areas across your venues.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search areas..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="bg-gray-900 border border-gray-800 rounded-lg pl-10 pr-4 py-2 text-white focus:border-purple-500 outline-none"
                            />
                        </div>
                        {canEdit && (
                            <button
                                onClick={() => setIsCreateOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors whitespace-nowrap text-sm"
                            >
                                <Plus className="w-4 h-4" />
                                Add Area
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Venue Groups - Design */}
            {venueGroups.length === 0 ? (
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-10 text-center text-gray-400">
                    No areas found.
                </div>
            ) : (
                venueGroups.map(({ venue, areas: venueAreas }) => (
                    <section key={venue.id} className="space-y-8">
                        <h2 className="text-xl mb-4">{venue.name}</h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {venueAreas.map(area => {
                                const scopeKey = `area:${activeBusiness.id}:${area.venue_id}:${area.id}`;
                                const traffic = areaTraffic[scopeKey] ?? { total_in: 0, total_out: 0 };

                                const areaClicrs = clicrs.filter(c => c.area_id === area.id);
                                const deviceCount = areaClicrs.length;

                                const liveOcc = area.current_occupancy ?? 0;
                                const capacity = area.default_capacity ?? area.capacity_limit ?? 0;
                                const pct = capacity > 0 ? Math.round((liveOcc / capacity) * 100) : 0;

                                return (
                                    <div
                                        key={area.id}
                                        className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors"
                                    >
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-purple-900/30 border border-purple-500/20 flex items-center justify-center">
                                                    <Layers className="w-5 h-5 text-purple-400" />
                                                </div>
                                                <div className="text-lg">{area.name}</div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    className="w-8 h-8 rounded-lg hover:bg-gray-800 flex items-center justify-center transition-colors"
                                                    aria-label="Expand"
                                                >
                                                    <Maximize2 className="w-4 h-4 text-purple-400" />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="w-8 h-8 rounded-lg hover:bg-gray-800 flex items-center justify-center transition-colors"
                                                    aria-label="Refresh"
                                                >
                                                    <RefreshCw className="w-4 h-4 text-gray-400" />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mb-4">
                                            <div className="text-4xl mb-2">{liveOcc}</div>
                                            <div className="text-sm text-gray-400 mb-4">
                                                of {capacity || '—'} · {pct}% full
                                            </div>
                                            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-emerald-500 rounded-full transition-all"
                                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between text-sm mb-3">
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-1 text-emerald-400">
                                                    <ArrowUp className="w-4 h-4" />
                                                    <span>{traffic.total_in}</span>
                                                </div>
                                                <div className="flex items-center gap-1 text-red-400">
                                                    <ArrowDown className="w-4 h-4" />
                                                    <span>{traffic.total_out}</span>
                                                </div>
                                            </div>
                                            <div className="text-gray-400">{deviceCount} device{deviceCount !== 1 ? 's' : ''}</div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {area.shift_mode === 'AUTO' ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 text-[11px] font-medium border border-amber-500/20">
                                                    <Clock className="w-3 h-3" />
                                                    Auto {area.auto_reset_time ?? ''}
                                                </span>
                                            ) : canShift ? (
                                                <div className="flex items-center gap-1">
                                                    {activeShiftId && activeShiftAreaId === area.id ? (
                                                        <button
                                                            onClick={() => endShift(activeShiftId)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-medium border border-red-500/20 transition-colors"
                                                        >
                                                            <Square className="w-3 h-3" />
                                                            End Shift
                                                        </button>
                                                    ) : (
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
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-800 text-gray-500 text-[11px] font-medium border border-gray-700">
                                                    Manual
                                                </span>
                                            )}
                                            {canEdit && (
                                                <button
                                                    onClick={() => openShiftConfig(area)}
                                                    className="text-gray-500 hover:text-gray-300 transition-colors p-1"
                                                    title="Configure shift mode"
                                                >
                                                    <Clock className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            {canAdd && (
                                                <button
                                                    onClick={() => setAddClicrAreaId(area.id)}
                                                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                                                    title="Add Clicr to this area"
                                                >
                                                    <Plus className="w-3 h-3" />
                                                    <Sparkles className="w-3 h-3" />
                                                </button>
                                            )}
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
                            className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold mb-4">Create Area</h2>
                            <form onSubmit={handleCreateArea} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-400">Venue</label>
                                    <div className="relative">
                                        <select
                                            value={newArea.venue_id}
                                            onChange={e => setNewArea(prev => ({ ...prev, venue_id: e.target.value }))}
                                            required
                                            className="w-full appearance-none bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 pr-10"
                                        >
                                            <option value="">Select a venue…</option>
                                            {venues.map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-400">Area Name</label>
                                    <input
                                        type="text"
                                        value={newArea.name}
                                        onChange={e => setNewArea(prev => ({ ...prev, name: e.target.value }))}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                        placeholder="e.g. Main Floor"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-400">Type</label>
                                        <select
                                            value={newArea.area_type}
                                            onChange={e => setNewArea(prev => ({ ...prev, area_type: e.target.value as AreaType }))}
                                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
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
                                        <label className="text-sm font-medium text-gray-400">Capacity</label>
                                        <input
                                            type="number"
                                            value={newArea.default_capacity || ''}
                                            onChange={e => setNewArea(prev => ({ ...prev, default_capacity: parseInt(e.target.value) || 0 }))}
                                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                            placeholder="0 for unlimited"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-400">Counting Mode</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['MANUAL', 'AUTO_FROM_SCANS', 'BOTH'] as CountingMode[]).map(mode => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => setNewArea(prev => ({ ...prev, counting_mode: mode }))}
                                                className={cn(
                                                    "px-2 py-2 rounded-lg text-xs font-medium border transition-colors",
                                                    newArea.counting_mode === mode
                                                        ? "bg-purple-900/30 text-purple-400 border-purple-500/50"
                                                        : "bg-gray-950 border-gray-800 text-gray-400 hover:bg-gray-900"
                                                )}
                                            >
                                                {mode.replace(/_/g, ' ')}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-400">Shift Mode</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(['MANUAL', 'AUTO'] as ShiftMode[]).map(mode => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => setNewArea(prev => ({ ...prev, shift_mode: mode }))}
                                                className={cn(
                                                    "px-3 py-2 rounded-lg text-xs font-medium border transition-colors",
                                                    newArea.shift_mode === mode
                                                        ? "bg-purple-900/30 text-purple-400 border-purple-500/50"
                                                        : "bg-gray-950 border-gray-800 text-gray-400 hover:bg-gray-900"
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
                                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Timezone</label>
                                                <select
                                                    value={newArea.auto_reset_timezone}
                                                    onChange={e => setNewArea(prev => ({ ...prev, auto_reset_timezone: e.target.value }))}
                                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none"
                                                >
                                                    {TIMEZONES.map(tz => (
                                                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-800">
                                    <button
                                        type="button"
                                        onClick={() => setIsCreateOpen(false)}
                                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isAddingArea}
                                        className="px-6 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 font-bold disabled:opacity-50 flex items-center gap-2"
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
                            className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold mb-1">Add Clicr</h2>
                            <p className="text-sm text-gray-400 mb-4">
                                Adding to <span className="text-white font-medium">{areas.find(a => a.id === addClicrAreaId)?.name}</span>
                            </p>
                            <div className="space-y-2 mb-4">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Quick setup</label>
                                <div className="flex flex-wrap gap-2">
                                    {CLICR_TEMPLATES.map(t => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => handleApplyTemplate(t)}
                                            disabled={isAddingClicr}
                                            className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors disabled:opacity-50"
                                        >
                                            {t.label} ({t.desc})
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <form onSubmit={handleAddClicr} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-400">Clicr Name</label>
                                    <input
                                        type="text"
                                        value={newClicrName}
                                        onChange={e => setNewClicrName(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                        placeholder="e.g. Front Door"
                                        required
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-400">Flow Mode</label>
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
                                                        : "bg-gray-950 border-gray-800 text-gray-400 hover:bg-gray-900"
                                                )}
                                            >
                                                {mode === 'BIDIRECTIONAL' ? 'Both' : mode === 'IN_ONLY' ? 'In Only' : 'Out Only'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-800">
                                    <button
                                        type="button"
                                        onClick={() => { setAddClicrAreaId(null); setNewClicrName(''); setNewClicrFlow('BIDIRECTIONAL'); }}
                                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
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
                            className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold mb-1">Shift Configuration</h2>
                            <p className="text-sm text-gray-400 mb-4">
                                {areas.find(a => a.id === editShiftAreaId)?.name}
                            </p>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-400">Shift Mode</label>
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
                                                        : "bg-gray-950 border-gray-800 text-gray-400 hover:bg-gray-900"
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
                                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Timezone</label>
                                            <select
                                                value={editAutoTz}
                                                onChange={e => setEditAutoTz(e.target.value)}
                                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
                                            >
                                                {TIMEZONES.map(tz => (
                                                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}
                                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-800">
                                    <button
                                        type="button"
                                        onClick={() => setEditShiftAreaId(null)}
                                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
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
