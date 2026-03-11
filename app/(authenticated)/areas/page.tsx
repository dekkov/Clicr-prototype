"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { Area, AreaType, CountingMode, FlowMode, ShiftMode, Role } from '@/lib/types';
import { Search, RefreshCw, ArrowUp, ArrowDown, Plus, ChevronDown, Play, Square, Settings2, Layers, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { canEditVenuesAndAreas, canStartShift, canAddClicr, hasMinRole } from '@/lib/permissions';

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

const AREA_TYPE_ORDER: Record<string, number> = {
    BAR: 1,
    ENTRY: 2,
    EVENT_SPACE: 3,
    MAIN: 4,
    OTHER: 5,
    PATIO: 6,
    VIP: 7,
};

const AREA_TYPE_LABELS: Record<string, string> = {
    BAR: 'bar',
    ENTRY: 'entry',
    EVENT_SPACE: 'event space',
    MAIN: 'main floor',
    OTHER: 'other',
    PATIO: 'patio',
    VIP: 'vip',
};

export default function AreasPage() {
    const router = useRouter();
    const { areas, clicrs, venues, areaTraffic, activeBusiness, addArea, addClicr, startShift, endShift, updateArea, deleteArea, isLoading, currentUser, activeShiftId, activeShiftAreaId } = useApp();
    const userRole = currentUser?.role as Role | undefined;
    const canDelete = hasMinRole(userRole, 'ADMIN');
    const canEdit = canEditVenuesAndAreas(userRole);
    const canShift = canStartShift(userRole);
    const canAdd = canAddClicr(userRole);
    const [search, setSearch] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isAddingArea, setIsAddingArea] = useState(false);
    const [startingShiftAreaId] = useState<string | null>(null);
    const [configAreaId, setConfigAreaId] = useState<string | null>(null);
    const [configName, setConfigName] = useState('');
    const [configCapacity, setConfigCapacity] = useState(0);
    const [configAreaType, setConfigAreaType] = useState<AreaType>('MAIN');
    const [configCountingMode, setConfigCountingMode] = useState<CountingMode>('BOTH');
    const [configShiftMode, setConfigShiftMode] = useState<ShiftMode>('MANUAL');
    const [configAutoTime, setConfigAutoTime] = useState('09:00');
    const [configAutoTz, setConfigAutoTz] = useState(() => {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
    });
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [isDeletingArea, setIsDeletingArea] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const configArea = configAreaId ? areas.find(a => a.id === configAreaId) : undefined;
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


    // Cascading clicr creation state (shown after area is created)
    const [justCreatedAreaId, setJustCreatedAreaId] = useState<string | null>(null);
    const [cascadeClicrName, setCascadeClicrName] = useState('');
    const [cascadeClicrFlow, setCascadeClicrFlow] = useState<FlowMode>('BIDIRECTIONAL');


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
        setJustCreatedAreaId(area.id);
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
        await startShift(area.venue_id, area.id);
    };

    const openConfigModal = (area: Area) => {
        setConfigAreaId(area.id);
        setConfigName(area.name);
        setConfigCapacity(area.default_capacity ?? (area as any).capacity_limit ?? 0);
        setConfigAreaType(area.area_type);
        setConfigCountingMode(area.counting_mode);
        setConfigShiftMode(area.shift_mode ?? 'MANUAL');
        setConfigAutoTime(area.auto_reset_time ?? '09:00');
        setConfigAutoTz(area.auto_reset_timezone ?? ((() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } })()));
    };

    const handleSaveConfig = async () => {
        if (!configAreaId) return;
        const area = areas.find(a => a.id === configAreaId);
        if (!area) return;
        setIsSavingConfig(true);
        await updateArea({
            ...area,
            name: configName.trim() || area.name,
            default_capacity: configCapacity,
            capacity_max: configCapacity,
            area_type: configAreaType,
            counting_mode: configCountingMode,
            shift_mode: configShiftMode,
            auto_reset_time: configShiftMode === 'AUTO' ? configAutoTime : undefined,
            auto_reset_timezone: configShiftMode === 'AUTO' ? configAutoTz : undefined,
        });
        setIsSavingConfig(false);
        setConfigAreaId(null);
        setConfirmDelete(false);
    };

    const handleDeleteArea = async () => {
        if (!configAreaId) return;
        setIsDeletingArea(true);
        await deleteArea(configAreaId);
        setIsDeletingArea(false);
        setConfigAreaId(null);
        setConfirmDelete(false);
    };

    if (!activeBusiness && !isLoading) {
        return (
            <div className="p-6 max-w-[1600px]">
                <div className="mb-8">
                    <h1 className="text-3xl mb-1">Areas</h1>
                    <p className="text-muted-foreground text-sm">All areas across your venues.</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground">
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
                    <p className="text-muted-foreground text-sm">All areas across your venues.</p>
                </div>
                <div className="space-y-4 animate-pulse">
                    <div className="h-5 bg-muted rounded w-32" />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="bg-card border border-border rounded-xl p-6 space-y-3">
                                <div className="h-4 bg-muted rounded w-24" />
                                <div className="h-10 bg-muted rounded w-16" />
                                <div className="h-2 bg-muted rounded-full" />
                                <div className="h-3 bg-muted rounded w-full" />
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
                        <p className="text-muted-foreground text-sm">All areas across your venues.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search areas..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="bg-card border border-border rounded-lg pl-10 pr-4 py-2 text-foreground focus:border-purple-500 outline-none"
                            />
                        </div>
                        {canEdit && (
                            <button
                                onClick={() => router.push('/areas/new')}
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
                <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground">
                    No areas found.
                </div>
            ) : (
                venueGroups.map(({ venue, areas: venueAreas }) => (
                    <section key={venue.id} className="space-y-8">
                        <div className="mb-4">
                            <span className="text-xs font-bold uppercase tracking-widest text-sky-400 bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 px-3 py-1.5 rounded-full">Venue — {venue.name}</span>
                        </div>

                        <div className="space-y-6">
                            {Object.entries(
                                venueAreas.reduce<Record<string, typeof venueAreas>>((acc, area) => {
                                    if (!acc[area.area_type]) acc[area.area_type] = [];
                                    acc[area.area_type].push(area);
                                    return acc;
                                }, {})
                            )
                                .sort(([a], [b]) => (AREA_TYPE_ORDER[a] ?? 99) - (AREA_TYPE_ORDER[b] ?? 99))
                                .map(([type, typeAreas]) => [type, [...typeAreas].sort((a, b) => a.name.localeCompare(b.name))] as const)
                                .map(([type, typeAreas]) => (
                                    <div key={type}>
                                        <h3 className="text-xs font-bold uppercase tracking-widest mb-3 text-muted-foreground">
                                            {AREA_TYPE_LABELS[type] ?? type}
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {typeAreas.map(area => {
                                                const scopeKey = `area:${activeBusiness!.id}:${area.venue_id}:${area.id}`;
                                                const traffic = areaTraffic[scopeKey] ?? { total_in: 0, total_out: 0 };

                                                const areaClicrs = clicrs.filter(c => c.area_id === area.id);
                                                const deviceCount = areaClicrs.length;

                                                const liveOcc = area.current_occupancy ?? 0;
                                                const capacity = area.default_capacity ?? area.capacity_limit ?? 0;
                                                const pct = capacity > 0 ? Math.round((liveOcc / capacity) * 100) : 0;

                                                return (
                                                    <div
                                                        key={area.id}
                                                        className="border rounded-xl p-6 hover:border-border transition-colors bg-card border-border"
                                                    >
                                                        <div className="flex items-center justify-between mb-6">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-500/20 flex items-center justify-center">
                                                                    <Layers className="w-5 h-5 text-purple-400" />
                                                                </div>
                                                                <div className="text-lg">{area.name}</div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => router.push(`/clicr/board/area-${area.id}`)}
                                                                    className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
                                                                    aria-label="Board View"
                                                                    title="Open board view"
                                                                >
                                                                    <LayoutGrid className="w-4 h-4 text-purple-400" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
                                                                    aria-label="Refresh"
                                                                >
                                                                    <RefreshCw className="w-4 h-4 text-muted-foreground" />
                                                                </button>
                                                                {canEdit && (
                                                                    <button
                                                                        onClick={() => openConfigModal(area)}
                                                                        className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
                                                                        title="Configure area"
                                                                    >
                                                                        <Settings2 className="w-4 h-4 text-muted-foreground" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="mb-4">
                                                            <div className="text-4xl mb-2">{liveOcc}</div>
                                                            <div className="text-sm text-muted-foreground mb-4">
                                                                of {capacity || '—'} · {pct}% full
                                                            </div>
                                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
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
                                                            <div className="text-muted-foreground">{deviceCount} device{deviceCount !== 1 ? 's' : ''}</div>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            {area.shift_mode === 'AUTO' ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 text-[11px] font-medium border border-amber-200 dark:border-amber-500/20">
                                                                    <Settings2 className="w-3 h-3" />
                                                                    Auto {area.auto_reset_time ?? ''}
                                                                </span>
                                                            ) : canShift ? (
                                                                <div className="flex items-center gap-1">
                                                                    {activeShiftId && activeShiftAreaId === area.id ? (
                                                                        <button
                                                                            onClick={() => endShift(activeShiftId)}
                                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-medium border border-red-200 dark:border-red-500/20 transition-colors"
                                                                        >
                                                                            <Square className="w-3 h-3" />
                                                                            End Shift
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => handleStartShift(area)}
                                                                            disabled={startingShiftAreaId === area.id}
                                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-medium border border-emerald-200 dark:border-emerald-500/20 transition-colors disabled:opacity-50"
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
                                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground text-[11px] font-medium border border-border">
                                                                    Manual
                                                                </span>
                                                            )}
                                                            {canAdd && (
                                                                <button
                                                                    onClick={() => setAddClicrAreaId(area.id)}
                                                                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors"
                                                                    title="Add Clicr to this area"
                                                                >
                                                                    <Plus className="w-3.5 h-3.5" />
                                                                    Add Clicr
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
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
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
                        onClick={() => setIsCreateOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold mb-4">Create Area</h2>
                            <form onSubmit={handleCreateArea} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">Venue</label>
                                    <div className="relative">
                                        <select
                                            value={newArea.venue_id}
                                            onChange={e => {
                                                setNewArea(prev => ({
                                                    ...prev,
                                                    venue_id: e.target.value,
                                                }));
                                            }}
                                            required
                                            className="w-full appearance-none bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 pr-10"
                                        >
                                            <option value="">Select a venue…</option>
                                            {venues.map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">Area Name</label>
                                    <input
                                        type="text"
                                        value={newArea.name}
                                        onChange={e => setNewArea(prev => ({ ...prev, name: e.target.value }))}
                                        className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                        placeholder="e.g. Main Floor"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">Type</label>
                                        <select
                                            value={newArea.area_type}
                                            onChange={e => setNewArea(prev => ({ ...prev, area_type: e.target.value as AreaType }))}
                                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                        >
                                            <option value="MAIN">main</option>
                                            <option value="ENTRY">entry</option>
                                            <option value="VIP">vip</option>
                                            <option value="PATIO">patio</option>
                                            <option value="BAR">bar</option>
                                            <option value="EVENT_SPACE">event space</option>
                                            <option value="OTHER">other</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">Capacity</label>
                                        <input
                                            type="number"
                                            value={newArea.default_capacity || ''}
                                            onChange={e => setNewArea(prev => ({ ...prev, default_capacity: parseInt(e.target.value) || 0 }))}
                                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                            placeholder="0 for unlimited"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">Counting Mode</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['MANUAL', 'AUTO_FROM_SCANS', 'BOTH'] as CountingMode[]).map(mode => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => setNewArea(prev => ({ ...prev, counting_mode: mode }))}
                                                className={cn(
                                                    "px-2 py-2 rounded-lg text-xs font-medium border transition-colors",
                                                    newArea.counting_mode === mode
                                                        ? "bg-purple-100 dark:bg-purple-900/30 text-purple-400 border-purple-200 dark:border-purple-500/50"
                                                        : "bg-background border-border text-muted-foreground hover:bg-card"
                                                )}
                                            >
                                                {mode.replace(/_/g, ' ')}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">Shift Mode</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(['MANUAL', 'AUTO'] as ShiftMode[]).map(mode => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => setNewArea(prev => ({ ...prev, shift_mode: mode }))}
                                                className={cn(
                                                    "px-3 py-2 rounded-lg text-xs font-medium border transition-colors",
                                                    newArea.shift_mode === mode
                                                        ? "bg-purple-100 dark:bg-purple-900/30 text-purple-400 border-purple-200 dark:border-purple-500/50"
                                                        : "bg-background border-border text-muted-foreground hover:bg-card"
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
                                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Timezone</label>
                                                <select
                                                    value={newArea.auto_reset_timezone}
                                                    onChange={e => setNewArea(prev => ({ ...prev, auto_reset_timezone: e.target.value }))}
                                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none"
                                                >
                                                    {TIMEZONES.map(tz => (
                                                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                                    <button
                                        type="button"
                                        onClick={() => setIsCreateOpen(false)}
                                        className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
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

            {/* Cascading Clicr Prompt — shown after area creation */}
            {justCreatedAreaId && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-card border border-primary/20 rounded-xl p-4 shadow-xl w-full max-w-md space-y-3">
                    <p className="text-sm text-foreground/80">Add Clicrs to <span className="font-bold text-foreground">{areas.find(a => a.id === justCreatedAreaId)?.name}</span>?</p>
                    <div className="flex gap-2">
                        <input type="text" placeholder="Clicr name" value={cascadeClicrName}
                            onChange={e => setCascadeClicrName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && cascadeClicrName.trim()) { e.preventDefault(); addClicr({ id: crypto.randomUUID(), area_id: justCreatedAreaId, name: cascadeClicrName.trim(), flow_mode: cascadeClicrFlow, active: true, current_count: 0 }); setCascadeClicrName(''); } }}
                            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm" />
                        <select value={cascadeClicrFlow} onChange={e => setCascadeClicrFlow(e.target.value as FlowMode)}
                            className="bg-background border border-border rounded-lg px-2 py-2 text-foreground text-sm">
                            <option value="BIDIRECTIONAL">Both</option>
                            <option value="IN_ONLY">In only</option>
                            <option value="OUT_ONLY">Out only</option>
                        </select>
                        <button onClick={async () => {
                            if (!cascadeClicrName.trim()) return;
                            await addClicr({ id: crypto.randomUUID(), area_id: justCreatedAreaId, name: cascadeClicrName.trim(), flow_mode: cascadeClicrFlow, active: true, current_count: 0 });
                            setCascadeClicrName('');
                        }} disabled={!cascadeClicrName.trim()}
                            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50">
                            Add
                        </button>
                    </div>
                    <button onClick={() => setJustCreatedAreaId(null)} className="text-xs text-muted-foreground hover:text-foreground/80">Done adding clicrs</button>
                </div>
            )}

            {/* Add Clicr Modal */}
            <AnimatePresence>
                {addClicrAreaId && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
                        onClick={() => { setAddClicrAreaId(null); setNewClicrName(''); setNewClicrFlow('BIDIRECTIONAL'); }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold mb-1">Add Clicr</h2>
                            <p className="text-sm text-muted-foreground mb-4">
                                Adding to <span className="text-foreground font-medium">{areas.find(a => a.id === addClicrAreaId)?.name}</span>
                            </p>
                            <form onSubmit={handleAddClicr} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">Clicr Name</label>
                                    <input
                                        type="text"
                                        value={newClicrName}
                                        onChange={e => setNewClicrName(e.target.value)}
                                        className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                        placeholder="e.g. Front Door"
                                        required
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">Flow Mode</label>
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
                                                        : "bg-background border-border text-muted-foreground hover:bg-card"
                                                )}
                                            >
                                                {mode === 'BIDIRECTIONAL' ? 'Both' : mode === 'IN_ONLY' ? 'In Only' : 'Out Only'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                                    <button
                                        type="button"
                                        onClick={() => { setAddClicrAreaId(null); setNewClicrName(''); setNewClicrFlow('BIDIRECTIONAL'); }}
                                        className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
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

            {/* Configure Area Modal */}
            <AnimatePresence>
                {configAreaId && (
                    <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
                            onClick={() => { setConfigAreaId(null); setConfirmDelete(false); }}
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-xl"
                                onClick={e => e.stopPropagation()}
                            >
                                <h2 className="text-xl font-bold mb-1">Configure Area</h2>
                                <p className="text-sm text-muted-foreground mb-4">{configArea?.name}</p>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">Name</label>
                                        <input
                                            type="text"
                                            value={configName}
                                            onChange={e => setConfigName(e.target.value)}
                                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">Capacity</label>
                                        <input
                                            type="number"
                                            value={configCapacity || ''}
                                            onChange={e => setConfigCapacity(parseInt(e.target.value) || 0)}
                                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                            placeholder="0 for unlimited"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">Type</label>
                                        <select
                                            value={configAreaType}
                                            onChange={e => setConfigAreaType(e.target.value as AreaType)}
                                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                        >
                                            <option value="MAIN">Main Floor</option>
                                            <option value="ENTRY">Entry</option>
                                            <option value="VIP">VIP</option>
                                            <option value="PATIO">Patio</option>
                                            <option value="BAR">Bar</option>
                                            <option value="EVENT_SPACE">Event Space</option>
                                            <option value="OTHER">Other</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">Counting Mode</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(['MANUAL', 'AUTO_FROM_SCANS', 'BOTH'] as CountingMode[]).map(mode => (
                                                <button key={mode} type="button"
                                                    onClick={() => setConfigCountingMode(mode)}
                                                    className={cn(
                                                        "px-2 py-2 rounded-lg text-xs font-medium border transition-colors",
                                                        configCountingMode === mode
                                                            ? "bg-purple-100 dark:bg-purple-900/30 text-purple-400 border-purple-200 dark:border-purple-500/50"
                                                            : "bg-background border-border text-muted-foreground hover:bg-card"
                                                    )}
                                                >{mode.replace(/_/g, ' ')}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">Shift Mode</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {(['MANUAL', 'AUTO'] as ShiftMode[]).map(mode => (
                                                <button key={mode} type="button"
                                                    onClick={() => setConfigShiftMode(mode)}
                                                    className={cn(
                                                        "px-3 py-2 rounded-lg text-xs font-medium border transition-colors",
                                                        configShiftMode === mode
                                                            ? "bg-purple-100 dark:bg-purple-900/30 text-purple-400 border-purple-200 dark:border-purple-500/50"
                                                            : "bg-background border-border text-muted-foreground hover:bg-card"
                                                    )}
                                                >{mode === 'MANUAL' ? 'Manual Start' : 'Auto (Scheduled)'}</button>
                                            ))}
                                        </div>
                                        {configShiftMode === 'AUTO' && (
                                            <div className="grid grid-cols-2 gap-2 mt-2">
                                                <div className="space-y-1">
                                                    <label className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Time</label>
                                                    <input type="time" value={configAutoTime}
                                                        onChange={e => setConfigAutoTime(e.target.value)}
                                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Timezone</label>
                                                    <select value={configAutoTz}
                                                        onChange={e => setConfigAutoTz(e.target.value)}
                                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none">
                                                        {TIMEZONES.map(tz => (
                                                            <option key={tz.value} value={tz.value}>{tz.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex justify-between items-center mt-6 pt-4 border-t border-border">
                                        {canDelete ? (
                                            !confirmDelete ? (
                                                <button type="button" onClick={() => setConfirmDelete(true)}
                                                    className="px-4 py-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-sm font-medium transition-colors">
                                                    Delete Area
                                                </button>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-red-400">Are you sure?</span>
                                                    <button type="button" onClick={() => setConfirmDelete(false)}
                                                        className="px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground border border-border text-xs font-medium transition-colors">
                                                        Cancel
                                                    </button>
                                                    <button type="button" onClick={handleDeleteArea} disabled={isDeletingArea}
                                                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors disabled:opacity-50">
                                                        {isDeletingArea ? 'Deleting...' : 'Confirm'}
                                                    </button>
                                                </div>
                                            )
                                        ) : <span />}
                                        <div className="flex gap-3">
                                            <button type="button" onClick={() => { setConfigAreaId(null); setConfirmDelete(false); }}
                                                className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors">
                                                Cancel
                                            </button>
                                            <button type="button" onClick={handleSaveConfig} disabled={isSavingConfig}
                                                className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-bold shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center gap-2">
                                                {isSavingConfig && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                                {isSavingConfig ? 'Saving...' : 'Save'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
