"use client";

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/store';
import { Area, AreaType, CountingMode, ShiftMode, Clicr, FlowMode } from '@/lib/types';
import { ArrowLeft, Check, Plus, Layers, MapPin, Pencil, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'AREA' | 'CLICRS';

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

export default function NewAreaPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const preselectedVenueId = searchParams.get('venueId') ?? '';

    const { venues, addArea, addClicr } = useApp();
    const [step, setStep] = useState<Step>('AREA');
    const [isSaving, setIsSaving] = useState(false);

    const [areaId] = useState(() => crypto.randomUUID());
    const [areaData, setAreaData] = useState({
        venue_id: preselectedVenueId,
        name: '',
        area_type: 'MAIN' as AreaType,
        default_capacity: 0,
        counting_mode: 'BOTH' as CountingMode,
        shift_mode: 'MANUAL' as ShiftMode,
        auto_reset_time: '09:00',
        auto_reset_timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } })(),
    });

    const [clicrInput, setClicrInput] = useState('');
    const [clicrFlow, setClicrFlow] = useState<FlowMode>('BIDIRECTIONAL');
    const [createdClicrs, setCreatedClicrs] = useState<Clicr[]>([]);

    // Inline-edit state for clicrs
    const [editingClicrId, setEditingClicrId] = useState<string | null>(null);
    const [editingClicrName, setEditingClicrName] = useState('');
    const [editingClicrFlow, setEditingClicrFlow] = useState<FlowMode>('BIDIRECTIONAL');

    const handleSaveClicr = (id: string) => {
        const trimmed = editingClicrName.trim();
        if (trimmed) setCreatedClicrs(prev => prev.map(c => c.id === id ? { ...c, name: trimmed, flow_mode: editingClicrFlow } : c));
        setEditingClicrId(null);
    };

    const handleAreaNext = (e: React.FormEvent) => {
        e.preventDefault();
        setStep('CLICRS');
    };

    const handleAddClicr = () => {
        if (!clicrInput.trim()) return;
        setCreatedClicrs(prev => [...prev, {
            id: crypto.randomUUID(),
            area_id: areaId,
            name: clicrInput.trim(),
            flow_mode: clicrFlow,
            active: true,
            current_count: 0,
        }]);
        setClicrInput('');
        setClicrFlow('BIDIRECTIONAL');
    };

    const backTarget = preselectedVenueId ? `/venues/${preselectedVenueId}` : '/areas';

    const handleFinish = async () => {
        setIsSaving(true);
        try {
            const area: Area = {
                id: areaId,
                venue_id: areaData.venue_id,
                name: areaData.name,
                area_type: areaData.area_type,
                default_capacity: areaData.default_capacity,
                capacity_max: areaData.default_capacity,
                counting_mode: areaData.counting_mode,
                shift_mode: areaData.shift_mode,
                auto_reset_time: areaData.shift_mode === 'AUTO' ? areaData.auto_reset_time : undefined,
                auto_reset_timezone: areaData.shift_mode === 'AUTO' ? areaData.auto_reset_timezone : undefined,
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                current_count: 0,
            } as Area;

            await addArea(area);

            for (const clicr of createdClicrs) {
                await addClicr(clicr);
            }

            router.push(backTarget);
        } catch (e) {
            console.error('Failed to create area:', e);
            setIsSaving(false);
        }
    };

    const steps: Step[] = ['AREA', 'CLICRS'];

    return (
        <div className="max-w-xl mx-auto py-12 px-4">
            {/* Step Indicator */}
            <div className="flex items-center gap-3 mb-8">
                <button
                    onClick={() => step === 'AREA' ? router.push(backTarget) : setStep('AREA')}
                    className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-6">
                    {steps.map((s, i) => {
                        const isPast = steps.indexOf(s) < steps.indexOf(step);
                        const isActive = step === s;
                        return (
                            <React.Fragment key={s}>
                                <div className={cn('flex flex-col items-center gap-1', isActive ? 'text-primary' : 'text-slate-500')}>
                                    <div className={cn(
                                        'w-8 h-8 rounded-full flex items-center justify-center border-2 text-sm font-bold',
                                        isActive ? 'border-primary bg-primary/10' :
                                        isPast ? 'border-primary bg-primary text-white' :
                                        'border-slate-700'
                                    )}>
                                        {isPast ? <Check className="w-4 h-4" /> : i + 1}
                                    </div>
                                    <span className="text-xs font-bold">{s === 'AREA' ? 'Area' : 'Clicrs'}</span>
                                </div>
                                {i < steps.length - 1 && (
                                    <div className={cn('h-0.5 w-8', isPast ? 'bg-primary' : 'bg-slate-800')} />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* Step 1: Area Details */}
            {step === 'AREA' && (
                <form onSubmit={handleAreaNext} className="space-y-6 bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl animate-fade-in">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Layers className="text-primary" /> Step 1: New Area
                    </h2>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Venue</label>
                        <select
                            required
                            value={areaData.venue_id}
                            onChange={e => setAreaData(p => ({ ...p, venue_id: e.target.value }))}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none"
                        >
                            <option value="">Select a venue…</option>
                            {venues.map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Area Name</label>
                        <input
                            type="text"
                            required
                            value={areaData.name}
                            onChange={e => setAreaData(p => ({ ...p, name: e.target.value }))}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none"
                            placeholder="e.g. Main Floor"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Type</label>
                            <select
                                value={areaData.area_type}
                                onChange={e => setAreaData(p => ({ ...p, area_type: e.target.value as AreaType }))}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none"
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
                            <label className="text-sm font-medium text-slate-300">Capacity <span className="text-slate-600">(optional)</span></label>
                            <input
                                type="number"
                                value={areaData.default_capacity || ''}
                                onChange={e => setAreaData(p => ({ ...p, default_capacity: parseInt(e.target.value) || 0 }))}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none"
                                placeholder="0 for unlimited"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Counting Mode</label>
                        <div className="grid grid-cols-3 gap-2">
                            {(['MANUAL', 'AUTO_FROM_SCANS', 'BOTH'] as CountingMode[]).map(mode => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setAreaData(p => ({ ...p, counting_mode: mode }))}
                                    className={cn(
                                        'px-2 py-2 rounded-lg text-xs font-medium border transition-colors',
                                        areaData.counting_mode === mode
                                            ? 'bg-primary/20 text-primary border-primary/50'
                                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'
                                    )}
                                >
                                    {mode.replace(/_/g, ' ')}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Shift Mode</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(['MANUAL', 'AUTO'] as ShiftMode[]).map(mode => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setAreaData(p => ({ ...p, shift_mode: mode }))}
                                    className={cn(
                                        'px-3 py-2 rounded-lg text-xs font-medium border transition-colors',
                                        areaData.shift_mode === mode
                                            ? 'bg-primary/20 text-primary border-primary/50'
                                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'
                                    )}
                                >
                                    {mode === 'MANUAL' ? 'Manual Start' : 'Auto (Scheduled)'}
                                </button>
                            ))}
                        </div>
                        {areaData.shift_mode === 'AUTO' && (
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Time</label>
                                    <input
                                        type="time"
                                        value={areaData.auto_reset_time}
                                        onChange={e => setAreaData(p => ({ ...p, auto_reset_time: e.target.value }))}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Timezone</label>
                                    <select
                                        value={areaData.auto_reset_timezone}
                                        onChange={e => setAreaData(p => ({ ...p, auto_reset_timezone: e.target.value }))}
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

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => router.push(backTarget)}
                            className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl transition-all shadow-lg shadow-primary/25"
                        >
                            Next: Add Clicrs
                        </button>
                    </div>
                </form>
            )}

            {/* Step 2: Clicrs */}
            {step === 'CLICRS' && (
                <div className="space-y-6 bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl animate-fade-in">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <MapPin className="text-primary" /> Step 2: Add Clicrs
                    </h2>
                    <p className="text-slate-400 text-sm">
                        Add counting devices for <span className="text-white font-medium">{areaData.name}</span>. You can skip this and add them later.
                    </p>

                    {createdClicrs.length > 0 && (
                        <div className="space-y-2">
                            {createdClicrs.map(c => (
                                <div key={c.id} className="bg-slate-800/40 px-3 py-2 rounded-lg border border-slate-700/50">
                                    {editingClicrId !== c.id ? (
                                        <div className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2 text-slate-300">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                                <span className="font-medium">{c.name}</span>
                                                <span className="text-xs text-slate-500">{c.flow_mode === 'BIDIRECTIONAL' ? 'Both' : c.flow_mode === 'IN_ONLY' ? 'In Only' : 'Out Only'}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button type="button"
                                                    onClick={() => { setEditingClicrId(c.id); setEditingClicrName(c.name); setEditingClicrFlow(c.flow_mode); }}
                                                    className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors">
                                                    <Pencil className="w-3 h-3" />
                                                </button>
                                                <button type="button"
                                                    onClick={() => setCreatedClicrs(prev => prev.filter(x => x.id !== c.id))}
                                                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-2 w-full">
                                            <input autoFocus type="text" value={editingClicrName}
                                                onChange={e => setEditingClicrName(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Escape') setEditingClicrId(null); }}
                                                className="flex-1 bg-slate-900 border border-primary/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                                            <select value={editingClicrFlow} onChange={e => setEditingClicrFlow(e.target.value as FlowMode)}
                                                className="flex-1 bg-slate-900 border border-primary/50 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                                                <option value="BIDIRECTIONAL">Both (in + out)</option>
                                                <option value="IN_ONLY">In only</option>
                                                <option value="OUT_ONLY">Out only</option>
                                            </select>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => handleSaveClicr(c.id)}
                                                    className="flex-1 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-sm font-medium transition-colors flex items-center justify-center gap-1">
                                                    <Check className="w-3.5 h-3.5" /> Save
                                                </button>
                                                <button type="button" onClick={() => setEditingClicrId(null)}
                                                    className="flex-1 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-sm font-medium transition-colors flex items-center justify-center gap-1">
                                                    <X className="w-3.5 h-3.5" /> Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="bg-slate-950/50 p-4 rounded-xl border border-dashed border-slate-700 space-y-3">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Clicr Name (e.g. Front Door)"
                                value={clicrInput}
                                onChange={e => setClicrInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddClicr(); } }}
                                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                            <select
                                value={clicrFlow}
                                onChange={e => setClicrFlow(e.target.value as FlowMode)}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                            >
                                <option value="BIDIRECTIONAL">Both</option>
                                <option value="IN_ONLY">In only</option>
                                <option value="OUT_ONLY">Out only</option>
                            </select>
                        </div>
                        <button
                            type="button"
                            onClick={handleAddClicr}
                            disabled={!clicrInput.trim()}
                            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                        >
                            <Plus className="w-4 h-4" /> Add Clicr
                        </button>
                    </div>

                    <div className="pt-4 border-t border-slate-800 flex justify-between">
                        <button
                            type="button"
                            onClick={handleFinish}
                            disabled={isSaving}
                            className="px-6 py-3 text-slate-400 hover:text-white transition-colors text-sm font-medium disabled:opacity-50"
                        >
                            Skip for now
                        </button>
                        <button
                            type="button"
                            onClick={handleFinish}
                            disabled={isSaving}
                            className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-lg shadow-green-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {isSaving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            <Check className="w-5 h-5" /> Finish Setup
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
