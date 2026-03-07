"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { Venue, Area, AreaType, Clicr, FlowMode } from '@/lib/types';
import { ArrowLeft, Check, Plus, MapPin, Building2, Users, Pencil, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'VENUE' | 'AREAS' | 'CLICRS';

export default function NewVenuePage() {
    const router = useRouter();
    const { addVenue, addArea, addClicr, activeBusiness } = useApp();
    const [step, setStep] = useState<Step>('VENUE');
    const [isLoading, setIsLoading] = useState(false);

    // Data State
    const [venueId, setVenueId] = useState<string>('');
    const [venueData, setVenueData] = useState({
        name: '',
        city: '',
        state: '',
        capacity: 500
    });
    const [createdAreas, setCreatedAreas] = useState<Area[]>([]);

    // Area Form
    const [areaInput, setAreaInput] = useState({ name: '', capacity: 500 });

    // Clicr Form (Map areaId -> List of Clicr Names)
    const [clicrInputs, setClicrInputs] = useState<Record<string, string>>({});
    const [clicrFlowModes, setClicrFlowModes] = useState<Record<string, FlowMode>>({});
    const [createdClicrs, setCreatedClicrs] = useState<Clicr[]>([]);

    // Inline-edit state for areas
    const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
    const [editingAreaName, setEditingAreaName] = useState('');
    const [editingAreaCapacity, setEditingAreaCapacity] = useState('');
    const [editingAreaType, setEditingAreaType] = useState<AreaType>('MAIN');

    // Inline-edit state for clicrs
    const [editingClicrId, setEditingClicrId] = useState<string | null>(null);
    const [editingClicrName, setEditingClicrName] = useState('');
    const [editingClicrFlow, setEditingClicrFlow] = useState<FlowMode>('BIDIRECTIONAL');

    const handleSaveArea = (id: string) => {
        const trimmed = editingAreaName.trim();
        const parsedCap = parseInt(editingAreaCapacity, 10);
        if (trimmed) setCreatedAreas(prev => prev.map(a => a.id === id ? {
            ...a,
            name: trimmed,
            default_capacity: !isNaN(parsedCap) && parsedCap > 0 ? parsedCap : 500,
            area_type: editingAreaType,
        } : a));
        setEditingAreaId(null);
    };

    const handleSaveClicr = (id: string) => {
        const trimmed = editingClicrName.trim();
        if (trimmed) setCreatedClicrs(prev => prev.map(c => c.id === id ? {
            ...c,
            name: trimmed,
            flow_mode: editingClicrFlow,
        } : c));
        setEditingClicrId(null);
    };

    // --- STEP 1: COLLECT VENUE (no network call yet) ---
    const handleCreateVenue = (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeBusiness?.id) {
            alert('Please select a business from the sidebar first.');
            return;
        }
        const newId = crypto.randomUUID();
        setVenueId(newId);
        setStep('AREAS');
    };

    // --- STEP 2: COLLECT AREAS (no network call yet) ---
    const handleAddArea = () => {
        if (!areaInput.name) return;
        const newAreaId = crypto.randomUUID();
        const area: Area = {
            id: newAreaId,
            venue_id: venueId,
            name: areaInput.name,
            default_capacity: areaInput.capacity,
            area_type: 'MAIN',
            counting_mode: 'BOTH',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            current_count: 0
        } as Area;
        setCreatedAreas([...createdAreas, area]);
        setAreaInput({ name: '', capacity: 500 });
    };

    const nextToClicrs = () => setStep('CLICRS');

    // --- STEP 3: COLLECT CLICRS (no network call yet) ---
    const handleAddClicr = (areaId: string) => {
        const name = clicrInputs[areaId];
        if (!name) return;
        const clicr: Clicr = {
            id: crypto.randomUUID(),
            area_id: areaId,
            name,
            flow_mode: clicrFlowModes[areaId] || 'BIDIRECTIONAL',
            active: true,
            current_count: 0,
        };
        setCreatedClicrs(prev => [...prev, clicr]);
        setClicrInputs(prev => ({ ...prev, [areaId]: '' }));
    };

    // --- FINISH: BATCH COMMIT ALL ---
    const handleFinish = async () => {
        if (!activeBusiness?.id) return;
        setIsLoading(true);

        try {
            const venue: Venue = {
                id: venueId,
                business_id: activeBusiness.id,
                name: venueData.name,
                city: venueData.city,
                state: venueData.state,
                default_capacity_total: venueData.capacity || 500,
                capacity_enforcement_mode: 'WARN_ONLY',
                status: 'ACTIVE',
                timezone: 'America/New_York',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                active: true,
            };
            await addVenue(venue);
            // addVenue auto-creates venue counter clicr

            for (const area of createdAreas) {
                await addArea(area);
            }

            for (const clicr of createdClicrs) {
                await addClicr(clicr);
            }

            router.push('/venues');
        } catch (e: any) {
            console.error('Failed to create venue setup:', e);
            setIsLoading(false);
        }
    };

    // --- RENDERERS ---

    const renderVenueForm = () => (
        <form onSubmit={handleCreateVenue} className="space-y-6 bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl animate-fade-in">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Building2 className="text-primary" /> Step 1: New Venue
            </h2>

            {activeBusiness && (
                <div className="flex items-center gap-2 text-sm text-slate-400 border-b border-slate-800 pb-4 mb-2">
                    <Building2 className="w-4 h-4" />
                    <span>Adding to <span className="font-medium text-white">{activeBusiness.name}</span></span>
                </div>
            )}

            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Venue Name</label>
                <input
                    type="text"
                    required
                    value={venueData.name}
                    onChange={e => setVenueData({ ...venueData, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none"
                    placeholder="e.g. Downtown Club"
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">City <span className="text-slate-600">(optional)</span></label>
                    <input
                        type="text"
                        value={venueData.city}
                        onChange={e => setVenueData({ ...venueData, city: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none"
                        placeholder="City"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">State <span className="text-slate-600">(optional)</span></label>
                    <input
                        type="text"
                        value={venueData.state}
                        onChange={e => setVenueData({ ...venueData, state: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none"
                        placeholder="State"
                    />
                </div>
            </div>
            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Total Capacity Limit</label>
                <input
                    type="number"
                    value={venueData.capacity}
                    onChange={e => setVenueData({ ...venueData, capacity: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none"
                    placeholder="500"
                />
            </div>
            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={() => router.push('/venues')}
                    className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all"
                >
                    Skip for now
                </button>
                <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 py-4 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl transition-all shadow-lg shadow-primary/25 disabled:opacity-50"
                >
                    {isLoading ? 'Creating...' : 'Next: Set up Areas'}
                </button>
            </div>
        </form>
    );

    const renderAreasStep = () => (
        <div className="space-y-8 animate-fade-in">
            <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl space-y-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <MapPin className="text-primary" /> Step 2: Define Areas
                </h2>
                <p className="text-slate-400 text-sm">Create distinct zones for your venue (e.g. "Main Floor", "VIP Lounge", "Patio").</p>

                {createdAreas.length > 0 && (
                    <div className="space-y-2">
                        {createdAreas.map(area => (
                            <div key={area.id} className="bg-slate-800/50 px-4 py-3 rounded-lg border border-slate-700">
                                {editingAreaId !== area.id ? (
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-white font-medium">{area.name}</span>
                                            <span className="text-xs text-slate-500">{(area.area_type || 'main').replace(/_/g, ' ').toLowerCase()}</span>
                                            {(area.default_capacity ?? 0) > 0 && <span className="text-xs text-slate-600">· cap {area.default_capacity}</span>}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button type="button"
                                                onClick={() => { setEditingAreaId(area.id); setEditingAreaName(area.name); setEditingAreaCapacity(String(area.default_capacity ?? '')); setEditingAreaType((area.area_type as AreaType) || 'MAIN'); }}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button type="button"
                                                onClick={() => { setCreatedAreas(prev => prev.filter(x => x.id !== area.id)); setCreatedClicrs(prev => prev.filter(c => c.area_id !== area.id)); setClicrInputs(prev => { const n = { ...prev }; delete n[area.id]; return n; }); }}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2 w-full">
                                        <input autoFocus type="text" value={editingAreaName}
                                            onChange={e => setEditingAreaName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Escape') setEditingAreaId(null); }}
                                            className="flex-1 bg-slate-900 border border-primary/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                                        <div className="flex gap-2">
                                            <select value={editingAreaType} onChange={e => setEditingAreaType(e.target.value as AreaType)}
                                                className="flex-1 bg-slate-900 border border-primary/50 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                                                <option value="MAIN">main</option>
                                                <option value="ENTRY">entry</option>
                                                <option value="VIP">vip</option>
                                                <option value="PATIO">patio</option>
                                                <option value="BAR">bar</option>
                                                <option value="EVENT_SPACE">event space</option>
                                                <option value="OTHER">other</option>
                                            </select>
                                            <input type="number" placeholder="Cap" value={editingAreaCapacity}
                                                onChange={e => setEditingAreaCapacity(e.target.value)}
                                                className="w-20 bg-slate-900 border border-primary/50 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => handleSaveArea(area.id)}
                                                className="flex-1 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-sm font-medium transition-colors flex items-center justify-center gap-1">
                                                <Check className="w-3.5 h-3.5" /> Save
                                            </button>
                                            <button type="button" onClick={() => setEditingAreaId(null)}
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

                <div className="bg-slate-950/50 p-4 rounded-xl border border-dashed border-slate-700 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2 space-y-1">
                            <label className="text-xs font-medium text-slate-400">Area Name</label>
                            <input
                                type="text"
                                placeholder="e.g. VIP Lounge"
                                value={areaInput.name}
                                onChange={e => setAreaInput({ ...areaInput, name: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                        <div className="col-span-1 space-y-1">
                            <label className="text-xs font-medium text-slate-400">Capacity</label>
                            <input
                                type="number"
                                value={areaInput.capacity}
                                onChange={e => setAreaInput({ ...areaInput, capacity: parseInt(e.target.value) || 0 })}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                    </div>
                    <button
                        onClick={handleAddArea}
                        disabled={!areaInput.name || isLoading}
                        className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                    >
                        <Plus className="w-4 h-4" /> Add This Area
                    </button>
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-between">
                    <button
                        onClick={handleFinish}
                        disabled={isLoading}
                        className="px-6 py-3 text-slate-400 hover:text-white transition-colors text-sm font-medium disabled:opacity-50"
                    >
                        Skip for now
                    </button>
                    <button
                        onClick={nextToClicrs}
                        disabled={isLoading}
                        className="px-8 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/25 transition-all disabled:opacity-50"
                    >
                        Next: Configure Clicrs
                    </button>
                </div>
            </div>
        </div>
    );

    const renderClicrsStep = () => (
        <div className="space-y-8 animate-fade-in">
            <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl space-y-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Users className="text-primary" /> Step 3: Add Clicrs
                </h2>
                <p className="text-slate-400 text-sm">How many counters do you need for each area? Name them for your staff (e.g. "Front Door", "Stairs").</p>

                <div className="space-y-6">
                    {createdAreas.map(area => {
                        const areaClicrs = createdClicrs.filter(c => c.area_id === area.id);
                        return (
                            <div key={area.id} className="bg-slate-950/30 p-4 rounded-xl border border-slate-800">
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-slate-400" /> {area.name}
                                </h3>

                                {areaClicrs.length > 0 && (
                                    <div className="mb-4 space-y-2">
                                        {areaClicrs.map(clicr => (
                                            <div key={clicr.id} className="bg-slate-800/40 px-3 py-2 rounded-lg border border-slate-700/50">
                                                {editingClicrId !== clicr.id ? (
                                                    <div className="flex items-center justify-between text-sm">
                                                        <div className="flex items-center gap-2 text-slate-300">
                                                            <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                                            <span className="font-medium">{clicr.name}</span>
                                                            <span className="text-xs text-slate-500">{clicr.flow_mode === 'BIDIRECTIONAL' ? 'Both' : clicr.flow_mode === 'IN_ONLY' ? 'In Only' : 'Out Only'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <button type="button"
                                                                onClick={() => { setEditingClicrId(clicr.id); setEditingClicrName(clicr.name); setEditingClicrFlow(clicr.flow_mode); }}
                                                                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors">
                                                                <Pencil className="w-3 h-3" />
                                                            </button>
                                                            <button type="button"
                                                                onClick={() => setCreatedClicrs(prev => prev.filter(x => x.id !== clicr.id))}
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
                                                            <button type="button" onClick={() => handleSaveClicr(clicr.id)}
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

                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Clicr Name (e.g. Door 1)"
                                        value={clicrInputs[area.id] || ''}
                                        onChange={e => setClicrInputs({ ...clicrInputs, [area.id]: e.target.value })}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddClicr(area.id); } }}
                                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                                    />
                                    <select value={clicrFlowModes[area.id] || 'BIDIRECTIONAL'}
                                        onChange={e => setClicrFlowModes(p => ({ ...p, [area.id]: e.target.value as FlowMode }))}
                                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm focus:ring-1 focus:ring-primary focus:outline-none">
                                        <option value="BIDIRECTIONAL">Both</option>
                                        <option value="IN_ONLY">In only</option>
                                        <option value="OUT_ONLY">Out only</option>
                                    </select>
                                    <button
                                        onClick={() => handleAddClicr(area.id)}
                                        disabled={!clicrInputs[area.id]}
                                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-between">
                    <button
                        onClick={handleFinish}
                        disabled={isLoading}
                        className="px-6 py-3 text-slate-400 hover:text-white transition-colors text-sm font-medium disabled:opacity-50"
                    >
                        Skip for now
                    </button>
                    <button
                        onClick={handleFinish}
                        disabled={isLoading}
                        className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-lg shadow-green-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        {isLoading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        <Check className="w-5 h-5" /> Finish Setup
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="max-w-xl mx-auto py-12 px-4">
            <div className="flex items-center gap-3 mb-8">
                <button
                    onClick={() => router.push('/venues')}
                    className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-6">
                    {(['VENUE', 'AREAS', 'CLICRS'] as Step[]).map((s, i) => (
                        <React.Fragment key={s}>
                            <div className={`flex flex-col items-center gap-1 ${step === s ? 'text-primary' : 'text-slate-500'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-sm font-bold ${step === s ? 'border-primary bg-primary/10' : ((['AREAS', 'CLICRS'] as Step[]).indexOf(s) < (['VENUE', 'AREAS', 'CLICRS'] as Step[]).indexOf(step) ? 'border-primary bg-primary text-white' : 'border-slate-700')}`}>
                                    {i + 1}
                                </div>
                                <span className="text-xs font-bold">{s === 'VENUE' ? 'Venue' : s === 'AREAS' ? 'Areas' : 'Clicrs'}</span>
                            </div>
                            {i < 2 && <div className={`h-0.5 w-8 ${(['AREAS', 'CLICRS'] as Step[]).indexOf(s) < (['VENUE', 'AREAS', 'CLICRS'] as Step[]).indexOf(step) ? 'bg-primary' : 'bg-slate-800'}`} />}
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {step === 'VENUE' && renderVenueForm()}
            {step === 'AREAS' && renderAreasStep()}
            {step === 'CLICRS' && renderClicrsStep()}
        </div>
    );
}
