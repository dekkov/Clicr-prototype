"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { Area, Clicr, Venue } from '@/lib/types';
import { Building2, MapPin, Users, Check, Plus, ArrowRight } from 'lucide-react';
import { createInitialBusiness } from '@/app/onboarding/setup-actions';

type Step = 'BUSINESS' | 'VENUE' | 'AREAS' | 'CLICRS';

export default function OnboardingSetupPage() {
    const router = useRouter();
    const { addVenue, addArea, addClicr, businesses, selectBusiness, refreshState } = useApp();

    const [step, setStep] = useState<Step>('BUSINESS');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Business step state
    const [businessName, setBusinessName] = useState('');
    const [newBusinessId, setNewBusinessId] = useState('');

    // Venue step state
    const [venueId, setVenueId] = useState('');
    const [venueData, setVenueData] = useState({ name: '', city: '', state: '', capacity: '500' });

    // Areas step state
    const [createdAreas, setCreatedAreas] = useState<Area[]>([]);
    const [areaInput, setAreaInput] = useState({ name: '', capacity: '100' });

    // Clicrs step state
    const [createdClicrs, setCreatedClicrs] = useState<Clicr[]>([]);
    const [clicrInputs, setClicrInputs] = useState<Record<string, string>>({});

    const STEP_LABELS: Step[] = ['BUSINESS', 'VENUE', 'AREAS', 'CLICRS'];
    const currentIndex = STEP_LABELS.indexOf(step);

    // --- STEP 1: BUSINESS ---
    const handleCreateBusiness = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        const fd = new FormData();
        fd.append('businessName', businessName);
        const result = await createInitialBusiness(fd);
        setIsLoading(false);
        if (!result.success) {
            setError(result.error);
            return;
        }
        if (result.businessId) setNewBusinessId(result.businessId);
        refreshState();
        setStep('VENUE');
    };

    // --- STEP 2: VENUE ---
    const handleCreateVenue = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        const newId = crypto.randomUUID();
        const parsedCapacity = parseInt(venueData.capacity, 10);
        const venue: Venue = {
            id: newId,
            business_id: newBusinessId,
            name: venueData.name,
            city: venueData.city,
            state: venueData.state,
            default_capacity_total: !isNaN(parsedCapacity) && parsedCapacity > 0 ? parsedCapacity : null,
            capacity_enforcement_mode: 'WARN_ONLY',
            status: 'ACTIVE',
            timezone: 'America/New_York',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            active: true,
        };
        await addVenue(venue);
        setVenueId(newId);
        setIsLoading(false);
        setStep('AREAS');
    };

    // --- STEP 3: AREAS ---
    const handleAddArea = async () => {
        if (!areaInput.name) return;
        setIsLoading(true);
        const newAreaId = crypto.randomUUID();
        const parsedAreaCap = parseInt(areaInput.capacity, 10);
        const area: Area = {
            id: newAreaId,
            venue_id: venueId,
            name: areaInput.name,
            default_capacity: !isNaN(parsedAreaCap) && parsedAreaCap > 0 ? parsedAreaCap : null,
            area_type: 'MAIN',
            counting_mode: 'BOTH',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            current_count: 0,
        } as Area;
        await addArea(area);
        setCreatedAreas(prev => [...prev, area]);
        setAreaInput({ name: '', capacity: '100' });
        setIsLoading(false);
    };

    // --- STEP 4: CLICRS ---
    const handleAddClicr = async (areaId: string) => {
        const name = clicrInputs[areaId];
        if (!name) return;
        setIsLoading(true);
        const newClicrId = crypto.randomUUID();
        const clicr: Clicr = {
            id: newClicrId,
            area_id: areaId,
            name,
            flow_mode: 'BIDIRECTIONAL',
            active: true,
            current_count: 0,
        };
        await addClicr(clicr);
        setCreatedClicrs(prev => [...prev, clicr]);
        setClicrInputs(prev => ({ ...prev, [areaId]: '' }));
        setIsLoading(false);
    };

    const finish = () => {
        const newBiz = businesses.find(b => b.id === newBusinessId);
        if (newBiz) selectBusiness(newBiz);
        router.push('/dashboard');
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-start justify-center px-4 py-12">
            <div className="w-full max-w-xl space-y-8">
                {/* Step Indicator */}
                <div className="flex items-center justify-between px-4">
                    {STEP_LABELS.map((s, i) => (
                        <React.Fragment key={s}>
                            <div className={`flex flex-col items-center gap-2 ${i <= currentIndex ? 'text-primary' : 'text-slate-500'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-sm font-bold
                                    ${i < currentIndex ? 'border-primary bg-primary text-white' : i === currentIndex ? 'border-primary bg-primary/10' : 'border-slate-700'}`}>
                                    {i < currentIndex ? <Check className="w-4 h-4" /> : i + 1}
                                </div>
                                <span className="text-xs font-bold hidden sm:block">{s.charAt(0) + s.slice(1).toLowerCase()}</span>
                            </div>
                            {i < STEP_LABELS.length - 1 && (
                                <div className={`h-0.5 flex-1 mx-2 ${i < currentIndex ? 'bg-primary' : 'bg-slate-800'}`} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* STEP 1: BUSINESS */}
                {step === 'BUSINESS' && (
                    <form onSubmit={handleCreateBusiness} className="space-y-6 bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl">
                        <div className="flex items-center gap-3">
                            <Building2 className="text-primary w-6 h-6" />
                            <h2 className="text-2xl font-bold text-white">Name your business</h2>
                        </div>
                        <p className="text-slate-400 text-sm">This appears on your dashboard and reports.</p>
                        {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>}
                        <input
                            type="text"
                            required
                            value={businessName}
                            onChange={e => setBusinessName(e.target.value)}
                            placeholder="e.g. Nightlife Group LLC"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none"
                        />
                        <button type="submit" disabled={isLoading} className="w-full py-4 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                            Continue <ArrowRight className="w-4 h-4" />
                        </button>
                    </form>
                )}

                {/* STEP 2: VENUE */}
                {step === 'VENUE' && (
                    <form onSubmit={handleCreateVenue} className="space-y-6 bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl">
                        <div className="flex items-center gap-3">
                            <MapPin className="text-primary w-6 h-6" />
                            <h2 className="text-2xl font-bold text-white">Add your first venue</h2>
                        </div>
                        <p className="text-slate-400 text-sm">A venue is a physical location you track occupancy for.</p>
                        <div className="space-y-4">
                            <input type="text" required value={venueData.name} onChange={e => setVenueData(p => ({ ...p, name: e.target.value }))}
                                placeholder="Venue name (e.g. Downtown Club)"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none" />
                            <div className="grid grid-cols-2 gap-3">
                                <input type="text" value={venueData.city} onChange={e => setVenueData(p => ({ ...p, city: e.target.value }))} placeholder="City"
                                    className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none" />
                                <input type="text" value={venueData.state} onChange={e => setVenueData(p => ({ ...p, state: e.target.value }))} placeholder="State"
                                    className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none" />
                            </div>
                            <input type="number" value={venueData.capacity} onChange={e => setVenueData(p => ({ ...p, capacity: e.target.value }))}
                                placeholder="Max capacity"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none" />
                        </div>
                        <div className="flex gap-3">
                            <button type="button" onClick={finish} className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all">
                                Skip for now
                            </button>
                            <button type="submit" disabled={isLoading} className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50">
                                {isLoading ? 'Creating...' : 'Next: Areas'}
                            </button>
                        </div>
                    </form>
                )}

                {/* STEP 3: AREAS */}
                {step === 'AREAS' && (
                    <div className="space-y-6 bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl">
                        <div className="flex items-center gap-3">
                            <MapPin className="text-primary w-6 h-6" />
                            <h2 className="text-2xl font-bold text-white">Define areas</h2>
                        </div>
                        <p className="text-slate-400 text-sm">Add zones like Main Floor, VIP, Patio. You can add more later.</p>
                        {createdAreas.length > 0 && (
                            <div className="space-y-2">
                                {createdAreas.map(a => (
                                    <div key={a.id} className="flex items-center justify-between bg-slate-800/50 px-4 py-3 rounded-lg border border-slate-700">
                                        <span className="text-white font-medium">{a.name}</span>
                                        <span className="text-xs text-emerald-500 font-bold flex items-center gap-1"><Check className="w-3 h-3" /> Added</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <input type="text" placeholder="Area name (e.g. Main Floor)" value={areaInput.name}
                                onChange={e => setAreaInput(p => ({ ...p, name: e.target.value }))}
                                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none text-sm" />
                            <input type="number" value={areaInput.capacity} onChange={e => setAreaInput(p => ({ ...p, capacity: e.target.value }))}
                                className="w-24 bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none text-sm" />
                            <button onClick={handleAddArea} disabled={!areaInput.name || isLoading}
                                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-1">
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex gap-3 pt-2 border-t border-slate-800">
                            <button onClick={finish} className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all">
                                Skip for now
                            </button>
                            <button onClick={() => setStep('CLICRS')} disabled={createdAreas.length === 0}
                                className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50">
                                Next: Clicrs
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 4: CLICRS */}
                {step === 'CLICRS' && (
                    <div className="space-y-6 bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl">
                        <div className="flex items-center gap-3">
                            <Users className="text-primary w-6 h-6" />
                            <h2 className="text-2xl font-bold text-white">Add Clicrs</h2>
                        </div>
                        <p className="text-slate-400 text-sm">Name your counters per area (e.g. Front Door, Side Entrance).</p>
                        <div className="space-y-4">
                            {createdAreas.map(area => {
                                const areaClicrs = createdClicrs.filter(c => c.area_id === area.id);
                                return (
                                    <div key={area.id} className="bg-slate-950/30 p-4 rounded-xl border border-slate-800">
                                        <h3 className="font-bold text-white mb-3">{area.name}</h3>
                                        {areaClicrs.map(c => (
                                            <div key={c.id} className="flex items-center gap-2 mb-2 text-sm text-slate-300">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500" /> {c.name}
                                            </div>
                                        ))}
                                        <div className="flex gap-2">
                                            <input type="text" placeholder="Clicr name (e.g. Door 1)"
                                                value={clicrInputs[area.id] || ''}
                                                onChange={e => setClicrInputs(p => ({ ...p, [area.id]: e.target.value }))}
                                                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-primary focus:outline-none" />
                                            <button onClick={() => handleAddClicr(area.id)} disabled={!clicrInputs[area.id] || isLoading}
                                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex gap-3 pt-2 border-t border-slate-800">
                            <button onClick={finish} className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all">
                                Skip for now
                            </button>
                            <button onClick={finish} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                                <Check className="w-5 h-5" /> Finish Setup
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
