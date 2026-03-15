"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Settings, Users, Plus, Pencil, Trash2,
    MoreVertical, ChevronDown, CheckCircle2, AlertCircle,
    ArrowRightLeft, LogIn, LogOut, Save, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Clicr } from '@/lib/types';
import type { CapacityEnforcementMode } from '@/lib/types';
import Link from 'next/link';

export default function AreaDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const { areas, venues, clicrs, events, updateArea, addClicr, updateClicr, isLoading } = useApp();

    const area = areas.find(a => a.id === id);
    const venue = venues.find(v => v.id === area?.venue_id);
    const areaClicrs = clicrs.filter(c => c.area_id === id);

    // Live Stats
    // Source of Truth: area.current_occupancy (Server Snapshot) > Fallback to summing clicrs if snapshot missing
    const liveOccupancy = area?.current_occupancy !== undefined
        ? area.current_occupancy
        : areaClicrs.reduce((acc, c) => acc + c.current_count, 0);

    const percentage = area?.capacity_limit ? Math.round((liveOccupancy / area.capacity_limit) * 100) : 0;

    // In/Out Today (Aggregated from all clicrs in this area)
    // We need to filter events by area_id
    const areaEvents = events.filter(e => e.area_id === id);
    const totalIn = areaEvents.reduce((acc, e) => e.flow_type === 'IN' ? acc + Math.abs(e.delta) : acc, 0);
    const totalOut = areaEvents.reduce((acc, e) => e.flow_type === 'OUT' ? acc + Math.abs(e.delta) : acc, 0);

    // States
    const [isEditingArea, setIsEditingArea] = useState(false);
    const [showAddClicr, setShowAddClicr] = useState(false);
    const [clicrToDelete, setClicrToDelete] = useState<Clicr | null>(null);

    // Edit Form State
    const [editName, setEditName] = useState('');
    const [editCap, setEditCap] = useState(0);
    const [editEnforcementMode, setEditEnforcementMode] = useState<CapacityEnforcementMode>('WARN_ONLY');

    // Add Clicr Form State
    const [newClicrName, setNewClicrName] = useState('');
    const [newClicrCommand, setNewClicrCommand] = useState('');
    const [newClicrLabels, setNewClicrLabels] = useState<string[]>(['General']);
    const [isSavingClicr, setIsSavingClicr] = useState(false);

    useEffect(() => {
        if (area) {
            setEditName(area.name);
            setEditCap(area.capacity_limit || 0);
            setEditEnforcementMode(area.capacity_enforcement_mode || 'WARN_ONLY');
        }
    }, [area]);

    if (isLoading) return <div className="p-8 text-foreground">Loading Area...</div>;
    if (!area) return <div className="p-8 text-foreground">Area not found</div>;

    // Handlers
    const handleSaveArea = async () => {
        if (!editName.trim()) return;
        const success = await updateArea({
            ...area,
            name: editName,
            capacity_limit: editCap > 0 ? editCap : undefined,
            capacity_max: editCap > 0 ? editCap : undefined,
            capacity_enforcement_mode: editEnforcementMode,
        });
        if (success) {
            setIsEditingArea(false);
        } else {
            alert('Failed to update area');
        }
    };

    const handleAddClicr = async () => {
        if (!newClicrName.trim()) return;
        setIsSavingClicr(true);

        const deviceId = crypto.randomUUID();
        const res = await addClicr({
            id: deviceId,
            area_id: area.id,
            name: newClicrName,
            command: newClicrCommand.trim() || undefined,
            counter_labels: newClicrLabels.map((lbl, i) => ({
                id: crypto.randomUUID(),
                device_id: deviceId,
                label: lbl,
                position: i,
            })),
            current_count: 0,
            active: true
        });

        setIsSavingClicr(false);
        if (res.success) {
            setShowAddClicr(false);
            setNewClicrName('');
            setNewClicrCommand('');
            setNewClicrLabels(['General']);
        } else {
            alert(`Failed to save Clicr: ${res.error || 'Unknown error'}`);
        }
    };

    // New Delete Handler
    const useAppHook = useApp as any; // Temporary cast if type update is delayed
    const { deleteClicr } = useAppHook();
    // Ideally useApp() returns properly typed object if store.tsx is updated.
    // If strict type checking fails, we might need to rely on the updated interface.
    // Let's assume useApp() is typed correctly by now.

    const confirmDeleteClicr = async () => {
        if (!clicrToDelete) return;

        // Call delete action
        const res = await deleteClicr(clicrToDelete.id);

        if (res.success) {
            setClicrToDelete(null); // Close modal
        } else {
            alert(`Failed to remove Clicr: ${res.error || 'Check console/logs'}`);
            // Keep modal open
        }
    };

    const handleArchiveClicr = async (clicr: Clicr) => {
        if (confirm(`Archive ${clicr.name}? This will hide it from the dashboard.`)) {
            await updateClicr({ ...clicr, active: false });
        }
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Header / Breadcrumb */}
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-4">
                <Link href="/areas" className="hover:text-foreground transition-colors flex items-center gap-1">
                    <ArrowLeft className="w-4 h-4" /> Areas
                </Link>
                <span>/</span>
                <span className="text-foreground/80">{venue?.name}</span>
            </div>

            {/* Main Title & Stats Strip */}
            <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between">
                <div>
                    {!isEditingArea ? (
                        <div className="flex items-center gap-3 group">
                            <h1 className="text-4xl font-bold text-foreground">{area.name}</h1>
                            <button onClick={() => setIsEditingArea(true)} className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-foreground transition-all">
                                <Pencil className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 bg-card p-2 rounded-xl border border-border">
                            <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="bg-transparent text-2xl font-bold text-foreground outline-none w-[200px]"
                                autoFocus
                            />
                            <input
                                type="number"
                                value={editCap}
                                onChange={(e) => setEditCap(parseInt(e.target.value))}
                                className="bg-muted text-lg font-mono text-foreground outline-none w-[80px] p-1 rounded"
                                placeholder="Cap"
                            />
                            <select
                                value={editEnforcementMode}
                                onChange={(e) => setEditEnforcementMode(e.target.value as CapacityEnforcementMode)}
                                className="bg-muted text-sm text-foreground outline-none p-1 rounded border border-border"
                            >
                                <option value="WARN_ONLY">Warn Only</option>
                                <option value="HARD_STOP">Hard Stop (Block Entry)</option>
                                <option value="MANAGER_OVERRIDE">Manager Override Required</option>
                            </select>
                            <button onClick={handleSaveArea} className="p-2 bg-emerald-600 rounded-lg text-white hover:bg-emerald-500"><Save className="w-5 h-5" /></button>
                            <button onClick={() => setIsEditingArea(false)} className="p-2 bg-muted rounded-lg text-foreground/80 hover:bg-muted"><X className="w-5 h-5" /></button>
                        </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                        <span className={cn("px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider", percentage >= 100 ? "bg-red-500/20 text-red-500" : "bg-emerald-500/20 text-emerald-500")}>
                            {percentage >= 100 ? 'At Capacity' : 'Live'}
                        </span>
                        {area.capacity_limit && <span className="text-xs text-muted-foreground">{percentage}% Full</span>}
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-3 gap-4 w-full lg:w-auto">
                    <KPICard label="Occupancy" value={liveOccupancy} sub={area.capacity_limit ? `/ ${area.capacity_limit}` : 'No Limit'} />
                    <KPICard label="Total In" value={totalIn} color="text-emerald-400" />
                    <KPICard label="Total Out" value={totalOut} color="text-rose-400" />
                </div>
            </div>

            {/* Clicrs Management Section */}
            <div className="glass-panel p-6 rounded-2xl border border-white/5">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                            <Users className="w-5 h-5 text-primary" />
                            Assigned Clicrs
                        </h3>
                        <p className="text-sm text-muted-foreground">Manage monitoring points for this area</p>
                    </div>
                    <button
                        onClick={() => setShowAddClicr(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold transition-colors shadow-lg shadow-primary/20"
                    >
                        <Plus className="w-4 h-4" />
                        Add Clicr
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {areaClicrs.filter(c => c.active).map(clicr => (
                        <ClicrCard
                            key={clicr.id}
                            clicr={clicr}
                            onArchive={() => setClicrToDelete(clicr)}
                        />
                    ))}
                    {areaClicrs.filter(c => c.active).length === 0 && (
                        <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
                            No active clicrs in this area. Add one to start tracking.
                        </div>
                    )}
                </div>
            </div>

            {/* Placeholder for Staff / Insight Sections */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl border border-dashed border-border bg-muted/30">
                    <h3 className="text-muted-foreground font-bold mb-2">Staff Assignment</h3>
                    <p className="text-xs text-muted-foreground">Assign specific staff members to this area's clickers coming in v2.1.</p>
                </div>
                <div className="p-6 rounded-2xl border border-dashed border-border bg-muted/30">
                    <h3 className="text-muted-foreground font-bold mb-2">Area Insights</h3>
                    <p className="text-xs text-muted-foreground">Hourly breakdown and peak times analysis coming in v2.1.</p>
                </div>
            </div>


            {/* Add Clicr Modal */}
            <AnimatePresence>
                {showAddClicr && (
                    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-card border border-border p-6 rounded-2xl w-full max-w-md"
                        >
                            <h2 className="text-xl font-bold text-foreground mb-4">Add New Clicr</h2>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Name</label>
                                    <input
                                        type="text"
                                        value={newClicrName}
                                        onChange={e => setNewClicrName(e.target.value)}
                                        placeholder="e.g. Front Door, VIP Entrance"
                                        className="w-full bg-background border border-border rounded-lg p-3 text-foreground focus:border-primary outline-none"
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Command / Mapping (Optional)</label>
                                    <input
                                        type="text"
                                        value={newClicrCommand}
                                        onChange={e => setNewClicrCommand(e.target.value)}
                                        placeholder="e.g. DOOR_1_IN or Hardware Code"
                                        className="w-full bg-background border border-border rounded-lg p-3 text-foreground focus:border-primary outline-none font-mono text-sm"
                                    />
                                    <p className="text-[10px] text-muted-foreground mt-1">Unique identifier for hardware or keyboard mapping.</p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Counter Labels</label>
                                    {newClicrLabels.map((lbl, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <input value={lbl} onChange={e => setNewClicrLabels(prev => prev.map((l, j) => j === i ? e.target.value : l))}
                                                className="flex-1 bg-background border border-border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Label name" />
                                            {newClicrLabels.length > 1 && (
                                                <button type="button" onClick={() => setNewClicrLabels(prev => prev.filter((_, j) => j !== i))}
                                                    className="text-red-400 hover:text-red-300">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => setNewClicrLabels(prev => [...prev, ''])}
                                        className="text-xs text-primary hover:text-primary/80">+ Add label</button>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-8">
                                <button onClick={() => setShowAddClicr(false)} className="flex-1 p-3 rounded-lg bg-muted text-foreground/80 font-bold hover:bg-muted">Cancel</button>
                                <button
                                    onClick={handleAddClicr}
                                    disabled={isSavingClicr || !newClicrName.trim()}
                                    className="flex-1 p-3 rounded-lg bg-primary text-foreground font-bold hover:bg-primary-hover shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isSavingClicr ? 'Saving...' : 'Create Clicr'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {clicrToDelete && (
                    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-card border border-border p-6 rounded-2xl w-full max-w-sm"
                        >
                            <h2 className="text-xl font-bold text-foreground mb-2">Remove Clicr?</h2>
                            <p className="text-muted-foreground text-sm mb-6">
                                Are you sure you want to remove <strong className="text-foreground">{clicrToDelete.name}</strong>?
                                Historical data and analytics will remain, but this device will be removed from your dashboard.
                            </p>

                            <div className="flex gap-3">
                                <button onClick={() => setClicrToDelete(null)} className="flex-1 p-3 rounded-lg bg-muted text-foreground/80 font-bold hover:bg-muted">Cancel</button>
                                <button
                                    onClick={confirmDeleteClicr}
                                    className="flex-1 p-3 rounded-lg bg-red-500/10 text-red-500 border border-red-200 dark:border-red-500/20 font-bold hover:bg-red-500/20 hover:border-red-500/50 transition-all"
                                >
                                    Remove
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* DEBUG PANEL */}
            <div className="mt-8 p-4 border border-border rounded-lg bg-background/20 text-[10px] font-mono text-muted-foreground">
                <div className="flex items-center justify-between mb-2">
                    <p className="font-bold text-muted-foreground">DEBUG: SYNC STATUS</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <span className="block text-muted-foreground/60">AREA ID:</span> {area.id}
                        <span className="block text-muted-foreground/60 mt-1">CURRENT SNAPSHOT:</span> {area.current_occupancy !== undefined ? area.current_occupancy : 'UNDEFINED (Using fallback)'}
                        <span className="block text-muted-foreground/60 mt-1">FALLBACK SUM:</span> {areaClicrs.reduce((acc, c) => acc + c.current_count, 0)}
                    </div>
                    <div>
                        <span className="block text-muted-foreground/60">CLICRS:</span> {areaClicrs.length}
                        <span className="block text-muted-foreground/60 mt-1">SYNC MODE:</span> Realtime (Strict)
                        <span className="block text-muted-foreground/60 mt-1">LAST ERROR:</span> {useAppHook.lastError || 'None'}
                    </div>
                </div>
            </div>

        </div>
    );
}

function KPICard({ label, value, sub, color = "text-foreground" }: { label: string, value: number, sub?: string, color?: string }) {
    return (
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</span>
            <span className={cn("text-2xl font-mono font-bold leading-none", color)}>{value}</span>
            {sub && <span className="text-[10px] text-muted-foreground/60 mt-1 font-mono">{sub}</span>}
        </div>
    )
}

function ClicrCard({ clicr, onArchive }: { clicr: Clicr, onArchive: () => void }) {
    return (
        <div className="bg-background/40 border border-border rounded-xl p-4 flex items-center justify-between group hover:border-border transition-colors">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg text-muted-foreground">
                    <ArrowRightLeft className="w-4 h-4" />
                </div>
                <div>
                    <h4 className="text-foreground font-bold">{clicr.name}</h4>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono bg-card px-1 py-0.5 rounded text-foreground/80">{clicr.current_count}</span>
                        <span>recorded today</span>
                        {(clicr.counter_labels ?? []).filter(l => !l.deleted_at).length > 0 && (
                            <span className="text-muted-foreground/60">· {(clicr.counter_labels ?? []).filter(l => !l.deleted_at).map(l => l.label).join(', ')}</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Link href={`/clicr/${clicr.id}`} className="p-2 text-primary hover:bg-primary/10 rounded-lg" title="Open Counter">
                    <ArrowRightLeft className="w-4 h-4" />
                </Link>
                <div className="h-4 w-[1px] bg-muted"></div>
                <button onClick={onArchive} className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-950/30 rounded-lg transition-colors" title="Archive">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}
