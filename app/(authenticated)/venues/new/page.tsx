"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { Venue, Area, Clicr } from '@/lib/types';
import { ArrowLeft, Check, Plus, MapPin, Building2, Users, ChevronDown } from 'lucide-react';

type Step = 'VENUE' | 'AREAS' | 'CLICRS';

export default function NewVenuePage() {
    const router = useRouter();
    const { addVenue, addArea, addClicr, business, businesses } = useApp();
    const [step, setStep] = useState<Step>('VENUE');
    const [isLoading, setIsLoading] = useState(false);

    // Data State
    const [venueId, setVenueId] = useState<string>('');
    const [selectedBizId, setSelectedBizId] = useState<string>(business?.id ?? businesses[0]?.id ?? '');
    const [venueData, setVenueData] = useState({
        name: '',
        city: '',
        state: '',
        capacity: 500
    });
    const [createdAreas, setCreatedAreas] = useState<Area[]>([]);

    // Area Form
    const [areaInput, setAreaInput] = useState({ name: '', capacity: 100 });

    // Clicr Form (Map areaId -> List of Clicr Names)
    const [clicrInputs, setClicrInputs] = useState<Record<string, string>>({});
    const [createdClicrs, setCreatedClicrs] = useState<Clicr[]>([]);

    // --- STEP 1: CREATE VENUE ---
    const handleCreateVenue = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedBizId) {
            alert('Please select a business for this venue.');
            return;
        }
        setIsLoading(true);

        const newId = crypto.randomUUID();
        const venue: Venue = {
            id: newId,
            business_id: selectedBizId,
            name: venueData.name,
            city: venueData.city,
            state: venueData.state,
            default_capacity_total: venueData.capacity,
            capacity_enforcement_mode: 'WARN_ONLY',
            status: 'ACTIVE',
            timezone: 'America/New_York',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            active: true
        };

        await addVenue(venue);
        setVenueId(newId);
        setIsLoading(false);
        setStep('AREAS');
    };

    // --- STEP 2: ADD AREAS ---
    const handleAddArea = async () => {
        if (!areaInput.name) return;
        setIsLoading(true);
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
        await addArea(area);
        setCreatedAreas([...createdAreas, area]);
        setAreaInput({ name: '', capacity: 100 });
        setIsLoading(false);
    };

    const nextToClicrs = () => {
        if (createdAreas.length === 0) {
            alert("Please add at least one area (e.g. Main Floor).");
            return;
        }
        setStep('CLICRS');
    };

    // --- STEP 3: ADD CLICRS ---
    const handleAddClicr = async (areaId: string) => {
        const name = clicrInputs[areaId];
        if (!name) return;

        setIsLoading(true);
        const newClicrId = crypto.randomUUID();
        const clicr: Clicr = {
            id: newClicrId,
            area_id: areaId,
            name: name,
            flow_mode: 'BIDIRECTIONAL',
            active: true,
            current_count: 0
        };
        await addClicr(clicr);
        setCreatedClicrs([...createdClicrs, clicr]);
        setClicrInputs({ ...clicrInputs, [areaId]: '' });
        setIsLoading(false);
    };

    const handleFinish = () => {
        router.push('/venues');
    };

    // --- RENDERERS ---

    const renderVenueForm = () => (
        <form onSubmit={handleCreateVenue} className="space-y-6 bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl animate-fade-in">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Building2 className="text-primary" /> Step 1: New Venue
            </h2>

            {/* Business selector — only shown when user has multiple businesses */}
            {businesses.length > 1 && (
                <div className="space-y-2 border-b border-slate-800 pb-6 mb-6">
                    <label className="text-sm font-medium text-slate-300">Business</label>
                    <div className="relative">
                        <select
                            value={selectedBizId}
                            onChange={e => setSelectedBizId(e.target.value)}
                            required
                            className="w-full appearance-none bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none pr-10"
                        >
                            <option value="">Select a business…</option>
                            {businesses.map(biz => (
                                <option key={biz.id} value={biz.id}>{biz.name}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    </div>
                    <p className="text-xs text-slate-500">This venue will be added to the selected business.</p>
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
                    <label className="text-sm font-medium text-slate-300">City</label>
                    <input
                        type="text"
                        required
                        value={venueData.city}
                        onChange={e => setVenueData({ ...venueData, city: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none"
                        placeholder="City"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">State</label>
                    <input
                        type="text"
                        required
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
                    required
                    value={venueData.capacity}
                    onChange={e => setVenueData({ ...venueData, capacity: parseInt(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none"
                />
            </div>
            <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl transition-all shadow-lg shadow-primary/25 disabled:opacity-50"
            >
                {isLoading ? 'Creating...' : 'Next: Set up Areas'}
            </button>
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
                    <div className="space-y-3">
                        {createdAreas.map(area => (
                            <div key={area.id} className="flex items-center justify-between bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                <div>
                                    <h4 className="font-bold text-white">{area.name}</h4>
                                    <span className="text-xs text-slate-400">Cap: {area.default_capacity}</span>
                                </div>
                                <div className="text-green-500 bg-green-500/10 px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                                    <Check className="w-3 h-3" /> Added
                                </div>
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
                                onChange={e => setAreaInput({ ...areaInput, capacity: parseInt(e.target.value) })}
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

                <div className="pt-4 border-t border-slate-800 flex justify-end">
                    <button
                        onClick={nextToClicrs}
                        className="px-8 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/25 transition-all"
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
                                            <div key={clicr.id} className="flex items-center gap-3 bg-slate-800/40 px-3 py-2 rounded-lg border border-slate-700/50">
                                                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                                                <span className="text-sm font-medium text-slate-200">{clicr.name}</span>
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
                                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                                    />
                                    <button
                                        onClick={() => handleAddClicr(area.id)}
                                        disabled={!clicrInputs[area.id] || isLoading}
                                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end">
                    <button
                        onClick={handleFinish}
                        className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-lg shadow-green-500/20 transition-all flex items-center gap-2"
                    >
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
