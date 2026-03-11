"use client";

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { Area, AreaType, CountingMode, ShiftMode } from '@/lib/types';
import {
    Plus,
    Edit2,
    Trash2,
    Move
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const TIMEZONES = [
    { value: 'America/New_York', label: 'Eastern (ET)' },
    { value: 'America/Chicago', label: 'Central (CT)' },
    { value: 'America/Denver', label: 'Mountain (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
    { value: 'America/Anchorage', label: 'Alaska (AKT)' },
    { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
    { value: 'UTC', label: 'UTC' },
];

export default function VenueAreas({ venueId }: { venueId: string }) {
    const router = useRouter();
    const { areas, venues, addArea, updateArea } = useApp();

    // Use Standardized Metrics Selector
    const venueAreas = useMemo(() => {
        const venue = venues.find(v => v.id === venueId);
        const venueCap = venue?.total_capacity || venue?.default_capacity_total || 0;

        return areas
            .filter(a => a.venue_id === venueId)
            .map(area => {
                const occ = area.current_occupancy || 0;
                // Prefer DB field 'capacity_max', fall back to legacy 'default_capacity', then Venue Fallback
                const cap = area.capacity_max || area.default_capacity || venueCap || 0;
                return {
                    ...area,
                    capacity: cap,
                    percent_full: cap > 0 ? Math.round((occ / cap) * 100) : 0
                };
            });
    }, [areas, venues, venueId]);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingArea, setEditingArea] = useState<Partial<Area> | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleCreate = () => {
        router.push(`/areas/new?venueId=${venueId}`);
    };

    const handleEdit = (summary: any) => {
        const fullArea = areas.find(a => a.id === summary.id);
        if (fullArea) {
            setEditingArea({
                ...fullArea,
                // Ensure edit form sees the effective capacity
                default_capacity: fullArea.capacity_max || fullArea.default_capacity || 0
            });
            setIsEditModalOpen(true);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingArea || !editingArea.name) return;

        setIsSaving(true);
        const areaToSave = {
            ...editingArea,
            capacity_max: editingArea.default_capacity,
            shift_mode: editingArea.shift_mode ?? 'MANUAL',
            auto_reset_time: editingArea.shift_mode === 'AUTO' ? editingArea.auto_reset_time : undefined,
            auto_reset_timezone: editingArea.shift_mode === 'AUTO' ? editingArea.auto_reset_timezone : undefined,
        } as Area;

        if (editingArea.id) {
            await updateArea(areaToSave);
        } else {
            const newArea: Area = {
                ...areaToSave,
                id: crypto.randomUUID(),
                venue_id: venueId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            } as Area;
            await addArea(newArea);
        }
        setIsSaving(false);
        setIsEditModalOpen(false);
        setEditingArea(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Venue Areas</h2>
                <button
                    onClick={handleCreate}
                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Area
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {venueAreas.length === 0 && (
                    <div className="p-8 text-center bg-muted/30 rounded-2xl border border-border border-dashed">
                        <p className="text-muted-foreground">No areas configured yet. Add one to start tracking occupancy.</p>
                    </div>
                )}

                {venueAreas.map(area => (
                    <div
                        key={area.id}
                        className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:border-border transition-colors group"
                    >
                        <div className="text-muted-foreground/60 cursor-grab active:cursor-grabbing">
                            <Move className="w-5 h-5" />
                        </div>

                        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center font-bold text-muted-foreground">
                            {area.name.slice(0, 2).toUpperCase()}
                        </div>

                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-foreground">{area.name}</h3>
                                {area.area_type && (
                                    <span className="text-[10px] px-2 py-0.5 bg-muted rounded-full text-muted-foreground uppercase tracking-wider">
                                        {area.area_type}
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-col gap-2 mt-2 w-full max-w-[200px]">
                                <div className="flex justify-between text-xs font-mono">
                                    <span className={cn(
                                        "font-bold",
                                        area.percent_full >= 100 && area.capacity > 0 ? "text-red-400" : "text-foreground/80"
                                    )}>
                                        {area.current_occupancy} / {area.capacity > 0 ? area.capacity : '∞'}
                                    </span>
                                    <span className="text-muted-foreground">
                                        {area.capacity > 0 ? `${area.percent_full}%` : '-'}
                                    </span>
                                </div>
                                {area.capacity > 0 && (
                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className={cn("h-full transition-all duration-500",
                                                area.percent_full > 90 ? "bg-red-500" : "bg-primary"
                                            )}
                                            style={{ width: `${Math.min(area.percent_full, 100)}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => handleEdit(area)}
                                className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <Edit2 className="w-4 h-4" />
                            </button>
                            {/* Archive/Delete (Mock) */}
                            <button className="p-2 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-500 transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Edit Modal */}
            <AnimatePresence>
                {isEditModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
                        onClick={() => setIsEditModalOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold mb-4">{editingArea?.id ? 'Edit Area' : 'Create Area'}</h2>
                            <form onSubmit={handleSave} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">Area Name</label>
                                    <input
                                        type="text"
                                        value={editingArea?.name}
                                        onChange={e => setEditingArea(prev => ({ ...prev, name: e.target.value }))}
                                        className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                        placeholder="e.g. Main Floor"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">Type</label>
                                        <select
                                            value={editingArea?.area_type}
                                            onChange={e => setEditingArea(prev => ({ ...prev, area_type: e.target.value as AreaType }))}
                                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
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
                                        <label className="text-sm font-medium text-muted-foreground">Capacity</label>
                                        <input
                                            type="number"
                                            value={editingArea?.default_capacity || ''}
                                            onChange={e => setEditingArea(prev => ({ ...prev, default_capacity: parseInt(e.target.value) || 0 }))}
                                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
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
                                                onClick={() => setEditingArea(prev => ({ ...prev, counting_mode: mode }))}
                                                className={cn(
                                                    "px-2 py-2 rounded-lg text-xs font-medium border transition-colors",
                                                    editingArea?.counting_mode === mode
                                                        ? "bg-primary/20 text-primary border-primary/50"
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
                                                onClick={() => setEditingArea(prev => prev ? ({ ...prev, shift_mode: mode }) : prev)}
                                                className={cn(
                                                    "px-3 py-2 rounded-lg text-xs font-medium border transition-colors",
                                                    editingArea?.shift_mode === mode
                                                        ? "bg-primary/20 text-primary border-primary/50"
                                                        : "bg-background border-border text-muted-foreground hover:bg-card"
                                                )}
                                            >
                                                {mode === 'MANUAL' ? 'Manual Start' : 'Auto (Scheduled)'}
                                            </button>
                                        ))}
                                    </div>
                                    {editingArea?.shift_mode === 'AUTO' && (
                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                            <div className="space-y-1">
                                                <label className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Time</label>
                                                <input
                                                    type="time"
                                                    value={editingArea?.auto_reset_time ?? '09:00'}
                                                    onChange={e => setEditingArea(prev => prev ? ({ ...prev, auto_reset_time: e.target.value }) : prev)}
                                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Timezone</label>
                                                <select
                                                    value={editingArea?.auto_reset_timezone ?? 'UTC'}
                                                    onChange={e => setEditingArea(prev => prev ? ({ ...prev, auto_reset_timezone: e.target.value }) : prev)}
                                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
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
                                        onClick={() => setIsEditModalOpen(false)}
                                        className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSaving}
                                        className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-bold shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {isSaving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                        {isSaving ? 'Adding...' : 'Save Area'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
