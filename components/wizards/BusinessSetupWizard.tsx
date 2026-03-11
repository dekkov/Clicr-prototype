"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { Area, AreaType, Clicr, FlowMode } from '@/lib/types';
import { Building2, MapPin, Users, Check, Plus, ArrowRight, ArrowLeft, Mail, Scan, Ban, Trash2, Pencil, X } from 'lucide-react';
import { LogoUploader } from '@/components/ui/logo-uploader';
import { createBusinessVenueAndAreas, updateBusinessSettings } from '@/app/onboarding/setup-actions';
import { inviteTeamMember } from '@/app/(authenticated)/settings/team-actions';
import type { Role } from '@/lib/types';

type Step = 'BUSINESS' | 'VENUE' | 'AREAS' | 'CLICRS' | 'INVITE' | 'SCAN_CONFIG' | 'BAN_CONFIG';

const STEP_LABELS: Step[] = ['BUSINESS', 'VENUE', 'AREAS', 'CLICRS', 'INVITE', 'SCAN_CONFIG', 'BAN_CONFIG'];

const STEP_DISPLAY: Record<Step, string> = {
    BUSINESS: 'Org', VENUE: 'Venue', AREAS: 'Areas', CLICRS: 'Clicrs',
    INVITE: 'Team', SCAN_CONFIG: 'Scan', BAN_CONFIG: 'Bans',
};


type Props = {
    onComplete?: () => void;
};

export default function BusinessSetupWizard({ onComplete }: Props) {
    const router = useRouter();
    const { addClicr, selectBusiness, refreshState } = useApp();

    const [step, setStep] = useState<Step>('BUSINESS');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Business step
    const [businessName, setBusinessName] = useState('');
    const [newBusinessId, setNewBusinessId] = useState('');
    const [timezone, setTimezone] = useState('America/New_York');
    const [logoUrl, setLogoUrl] = useState('');

    // Invite step
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<Role>('STAFF');
    const [inviteVenueIds, setInviteVenueIds] = useState<string[]>([]);
    const [inviteAreaIds, setInviteAreaIds] = useState<string[]>([]);
    const [invitedList, setInvitedList] = useState<{ email: string; role: Role; venueIds: string[]; areaIds: string[] }[]>([]);

    // Scan config step
    const [scanMethod, setScanMethod] = useState<'CAMERA' | 'BLUETOOTH'>('CAMERA');
    const [scanEnabled, setScanEnabled] = useState(true);
    const [scanConfigured, setScanConfigured] = useState(false);

    // Ban config step
    const [banManagerCanBan, setBanManagerCanBan] = useState(true);
    const [banStaffCanBan, setBanStaffCanBan] = useState(false);
    const [banScopeDefault, setBanScopeDefault] = useState<'VENUE' | 'BUSINESS'>('VENUE');
    const [banReasonRequired, setBanReasonRequired] = useState(true);
    const [banConfigured, setBanConfigured] = useState(false);

    // Venue step
    const [venueId, setVenueId] = useState('');
    const [venueData, setVenueData] = useState({ name: '', city: '', state: '', capacity: '500' });

    // Areas step
    const [createdAreas, setCreatedAreas] = useState<Area[]>([]);
    const [areaInput, setAreaInput] = useState({ name: '', capacity: '500', area_type: 'MAIN' as AreaType });

    // Clicrs step
    const [createdClicrs, setCreatedClicrs] = useState<Clicr[]>([]);
    const [clicrInputs, setClicrInputs] = useState<Record<string, string>>({});

    // Inline-edit state
    const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
    const [editingAreaName, setEditingAreaName] = useState('');
    const [editingAreaCapacity, setEditingAreaCapacity] = useState('');
    const [editingAreaType, setEditingAreaType] = useState<AreaType>('MAIN');
    const [editingClicrId, setEditingClicrId] = useState<string | null>(null);
    const [editingClicrName, setEditingClicrName] = useState('');
    const [editingClicrFlowMode, setEditingClicrFlowMode] = useState<FlowMode>('BIDIRECTIONAL');
    const [clicrFlowModes, setClicrFlowModes] = useState<Record<string, FlowMode>>({});

    // Venue counter state
    const [venueCounterName, setVenueCounterName] = useState('Venue Counter');
    const [venueCounterFlowMode, setVenueCounterFlowMode] = useState<FlowMode>('BIDIRECTIONAL');
    const [editingVenueCounter, setEditingVenueCounter] = useState(false);
    const [editingVCName, setEditingVCName] = useState('');
    const [editingVCFlowMode, setEditingVCFlowMode] = useState<FlowMode>('BIDIRECTIONAL');

    const currentIndex = STEP_LABELS.indexOf(step);

    const goToPrevStep = () => {
        const idx = STEP_LABELS.indexOf(step);
        if (idx > 0) setStep(STEP_LABELS[idx - 1]);
    };

    const handleCreateBusiness = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setStep('VENUE');
    };

    const handleCreateVenue = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setStep('AREAS');
    };

    const handleAddArea = () => {
        if (!areaInput.name) return;
        const parsedCap = parseInt(areaInput.capacity, 10);
        const areaId = crypto.randomUUID();
        const area: Area = {
            id: areaId,
            venue_id: '',
            name: areaInput.name,
            default_capacity: !isNaN(parsedCap) && parsedCap > 0 ? parsedCap : 500,
            area_type: areaInput.area_type,
            counting_mode: 'BOTH',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            current_count: 0,
        } as Area;
        setCreatedAreas(prev => [...prev, area]);
        setAreaInput({ name: '', capacity: '500', area_type: 'MAIN' as AreaType });
    };

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
            flow_mode: editingClicrFlowMode,
        } : c));
        setEditingClicrId(null);
    };

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

    const finish = async (opts?: { saveBanConfig?: boolean; saveScanConfig?: boolean }) => {
        const shouldSaveScan = opts?.saveScanConfig ?? scanConfigured;
        const shouldSaveBan = opts?.saveBanConfig ?? banConfigured;

        setIsLoading(true);
        setError(null);

        try {
            let batchBusinessId = newBusinessId;
            let currentAreas = createdAreas;

            if (!batchBusinessId) {
                const parsedCapacity = parseInt(venueData.capacity, 10);
                const result = await createBusinessVenueAndAreas({
                    businessName,
                    timezone,
                    logoUrl: logoUrl || undefined,
                    venue: {
                        name: venueData.name,
                        city: venueData.city || undefined,
                        state: venueData.state || undefined,
                        capacity: !isNaN(parsedCapacity) && parsedCapacity > 0 ? parsedCapacity : 500,
                    },
                    areas: createdAreas.map(a => ({
                        name: a.name,
                        capacity: a.default_capacity ?? undefined,
                        area_type: a.area_type,
                    })),
                    venueCounterName,
                });

                if (!result.success) {
                    setError(result.error);
                    setIsLoading(false);
                    return;
                }

                batchBusinessId = result.businessId;
                setNewBusinessId(result.businessId);
                setVenueId(result.venueId);

                currentAreas = createdAreas.map((a, i) => ({
                    ...a,
                    id: result.areaIds[i],
                    venue_id: result.venueId,
                } as Area));
                setCreatedAreas(currentAreas);
            }

            const areaIdMap: Record<string, string> = {};
            createdAreas.forEach((a, i) => { areaIdMap[a.id] = currentAreas[i].id; });

            for (const c of createdClicrs) {
                await addClicr({ ...c, area_id: c.area_id ? (areaIdMap[c.area_id] ?? c.area_id) : null });
            }

            // Remap temp IDs and invite team members
            const realVenueId = venueId || currentAreas[0]?.venue_id;
            for (const inv of invitedList) {
                const remappedVenueIds = inv.venueIds.map(id => id === '__venue__' ? realVenueId : id).filter(Boolean);
                const remappedAreaIds = inv.areaIds.map(id => areaIdMap[id] ?? id);
                const options =
                    inv.role === 'MANAGER' && remappedVenueIds.length > 0
                        ? { assignedVenueIds: remappedVenueIds }
                        : inv.role === 'STAFF' && remappedAreaIds.length > 0
                          ? { assignedAreaIds: remappedAreaIds }
                          : undefined;
                await inviteTeamMember(inv.email, inv.role, batchBusinessId, options);
            }

            const settingsPayload: Record<string, any> = {};
            if (shouldSaveScan) {
                settingsPayload.scan_method = scanMethod;
                settingsPayload.scan_enabled_default = scanEnabled;
            }
            if (shouldSaveBan) {
                settingsPayload.ban_permissions = { manager: banManagerCanBan, staff: banStaffCanBan };
                settingsPayload.ban_scope_default = banScopeDefault;
                settingsPayload.ban_reason_required = banReasonRequired;
            }
            if (Object.keys(settingsPayload).length > 0) {
                await updateBusinessSettings(batchBusinessId, settingsPayload);
            }

            await refreshState();

            selectBusiness({
                id: batchBusinessId,
                name: businessName,
                timezone,
                settings: {
                    refresh_interval_sec: 2,
                    capacity_thresholds: [80, 90, 100],
                    reset_rule: 'MANUAL',
                    ...(shouldSaveScan ? { scan_method: scanMethod, scan_enabled_default: scanEnabled } : {}),
                    ...(shouldSaveBan ? { ban_permissions: { manager: banManagerCanBan, staff: banStaffCanBan }, ban_scope_default: banScopeDefault, ban_reason_required: banReasonRequired } : {}),
                },
            });

            if (onComplete) {
                onComplete();
            } else {
                router.push('/dashboard');
            }
        } catch (e: any) {
            console.error('[wizard] finish error:', e);
            setError(e.message || 'Setup failed. Please try again.');
            setIsLoading(false);
        }
    };

    return (
        <>
            {/* Step Indicator */}
            <div className="flex items-center justify-between px-2">
                {STEP_LABELS.map((s, i) => (
                    <React.Fragment key={s}>
                        <div className={`flex flex-col items-center gap-2 ${i <= currentIndex ? 'text-primary' : 'text-slate-500'}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-sm font-bold
                                ${i < currentIndex ? 'border-primary bg-primary text-white' : i === currentIndex ? 'border-primary bg-primary/10' : 'border-slate-700'}`}>
                                {i < currentIndex ? <Check className="w-4 h-4" /> : i + 1}
                            </div>
                            <span className="text-[10px] font-bold hidden sm:block">{STEP_DISPLAY[s]}</span>
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
                        <h2 className="text-2xl font-bold text-white">Create your organization</h2>
                    </div>
                    <p className="text-xs text-slate-500">Fields marked <span className="text-slate-400">(optional)</span> can be left blank.</p>
                    <p className="text-slate-400 text-sm">This appears on your dashboard and reports.</p>
                    {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>}
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Organization name <span className="text-red-400">*</span></label>
                        <input
                            type="text"
                            required
                            value={businessName}
                            onChange={e => setBusinessName(e.target.value)}
                            placeholder="e.g. Nightlife Group LLC"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Timezone <span className="text-red-400">*</span></label>
                        <select
                            value={timezone}
                            onChange={e => setTimezone(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none"
                        >
                            <option value="America/New_York">Eastern (New York)</option>
                            <option value="America/Chicago">Central (Chicago)</option>
                            <option value="America/Denver">Mountain (Denver)</option>
                            <option value="America/Los_Angeles">Pacific (Los Angeles)</option>
                            <option value="America/Anchorage">Alaska</option>
                            <option value="Pacific/Honolulu">Hawaii</option>
                            <option value="UTC">UTC</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Logo <span className="text-slate-600">(optional)</span></label>
                        <div className="flex justify-center mt-2">
                            <LogoUploader
                                currentUrl={logoUrl || null}
                                businessId="pending"
                                onUpload={(url) => setLogoUrl(url)}
                                demoMode={true}
                            />
                        </div>
                    </div>
                    <button type="submit" disabled={isLoading}
                        className="w-full py-4 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                        {isLoading ? 'Creating...' : 'Continue'} <ArrowRight className="w-4 h-4" />
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
                    <p className="text-slate-400 text-sm">A venue is a physical location you track occupancy for. You can add more venues later.</p>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Venue name <span className="text-red-400">*</span></label>
                            <input type="text" required value={venueData.name} onChange={e => setVenueData(p => ({ ...p, name: e.target.value }))}
                                placeholder="e.g. Downtown Club"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">City <span className="text-slate-600">(optional)</span></label>
                                <input type="text" value={venueData.city} onChange={e => setVenueData(p => ({ ...p, city: e.target.value }))} placeholder="City"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">State <span className="text-slate-600">(optional)</span></label>
                                <input type="text" value={venueData.state} onChange={e => setVenueData(p => ({ ...p, state: e.target.value }))} placeholder="State"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Max capacity</label>
                            <input type="number" value={venueData.capacity} onChange={e => setVenueData(p => ({ ...p, capacity: e.target.value }))}
                                placeholder="500"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none" />
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button type="button" onClick={goToPrevStep} className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2">
                            <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <button type="submit" disabled={isLoading} className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50">
                            Next: Areas
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
                    {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>}
                    {createdAreas.length > 0 && (
                        <div className="space-y-2">
                            {createdAreas.map(a => (
                                <div key={a.id} className="flex items-center justify-between bg-slate-800/50 px-4 py-3 rounded-lg border border-slate-700">
                                    {editingAreaId !== a.id ? (
                                        <>
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-white font-medium">{a.name}</span>
                                                <span className="text-xs text-slate-500">{(a.area_type || 'main').replace(/_/g, ' ').toLowerCase()}</span>
                                                {a.default_capacity ? <span className="text-xs text-slate-600">{a.default_capacity} cap</span> : null}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button type="button"
                                                    onClick={() => {
                                                        setEditingAreaId(a.id);
                                                        setEditingAreaName(a.name);
                                                        setEditingAreaCapacity(String(a.default_capacity ?? ''));
                                                        setEditingAreaType((a.area_type as AreaType) || 'MAIN');
                                                    }}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors" title="Rename area">
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                                <button type="button"
                                                    onClick={() => {
                                                        setCreatedAreas(prev => prev.filter(x => x.id !== a.id));
                                                        setCreatedClicrs(prev => prev.filter(c => c.area_id !== a.id));
                                                        setClicrInputs(prev => { const next = { ...prev }; delete next[a.id]; return next; });
                                                    }}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Remove area">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-col gap-2 w-full">
                                            <input
                                                autoFocus
                                                type="text"
                                                value={editingAreaName}
                                                onChange={e => setEditingAreaName(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Escape') setEditingAreaId(null); }}
                                                className="flex-1 bg-slate-900 border border-primary/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                            />
                                            <div className="flex gap-2">
                                                <select
                                                    value={editingAreaType}
                                                    onChange={e => setEditingAreaType(e.target.value as AreaType)}
                                                    className="flex-1 bg-slate-900 border border-primary/50 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                                >
                                                    <option value="MAIN">main</option>
                                                    <option value="ENTRY">entry</option>
                                                    <option value="VIP">vip</option>
                                                    <option value="PATIO">patio</option>
                                                    <option value="BAR">bar</option>
                                                    <option value="EVENT_SPACE">event space</option>
                                                    <option value="OTHER">other</option>
                                                </select>
                                                <input
                                                    type="number"
                                                    placeholder="Cap"
                                                    value={editingAreaCapacity}
                                                    onChange={e => setEditingAreaCapacity(e.target.value)}
                                                    className="w-20 bg-slate-900 border border-primary/50 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => handleSaveArea(a.id)}
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
                    <div className="flex gap-2">
                        <input type="text" placeholder="Area name (e.g. Main Floor)" value={areaInput.name}
                            onChange={e => setAreaInput(p => ({ ...p, name: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddArea(); } }}
                            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none text-sm" />
                        <select value={areaInput.area_type} onChange={e => setAreaInput(p => ({ ...p, area_type: e.target.value as AreaType }))}
                            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none text-sm">
                            <option value="MAIN">main</option>
                            <option value="ENTRY">entry</option>
                            <option value="VIP">vip</option>
                            <option value="PATIO">patio</option>
                            <option value="BAR">bar</option>
                            <option value="EVENT_SPACE">event space</option>
                            <option value="OTHER">other</option>
                        </select>
                        <input type="number" value={areaInput.capacity} onChange={e => setAreaInput(p => ({ ...p, capacity: e.target.value }))}
                            className="w-24 bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none text-sm" />
                        <button onClick={handleAddArea} disabled={!areaInput.name}
                            className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-1">
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex gap-3 pt-2 border-t border-slate-800">
                        <button type="button" onClick={goToPrevStep} className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2">
                            <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <button type="button" onClick={() => setStep('CLICRS')}
                            className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all">
                            {createdAreas.length > 0 ? 'Next: Clicrs' : 'Set up later'}
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
                    <p className="text-slate-400 text-sm">Name your counters. The venue counter tracks overall venue occupancy.</p>

                    {/* VENUE COUNTER — dedicated, non-deletable */}
                    <div className="bg-amber-950/10 p-4 rounded-xl border border-amber-500/20">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-3">{venueData.name || 'Venue'}</h3>
                        {!editingVenueCounter ? (
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2 text-amber-300">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                    {venueCounterName}
                                    <span className="text-xs text-amber-600">Guest Flow: {venueCounterFlowMode === 'BIDIRECTIONAL' ? 'Both' : venueCounterFlowMode === 'IN_ONLY' ? 'In Only' : 'Out Only'}</span>
                                </div>
                                <button type="button"
                                    onClick={() => { setEditingVenueCounter(true); setEditingVCName(venueCounterName); setEditingVCFlowMode(venueCounterFlowMode); }}
                                    className="p-1.5 rounded-lg text-amber-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors" title="Edit">
                                    <Pencil className="w-3 h-3" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2 w-full">
                                <input autoFocus type="text" value={editingVCName}
                                    onChange={e => setEditingVCName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Escape') setEditingVenueCounter(false); }}
                                    className="flex-1 bg-slate-900 border border-amber-500/30 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
                                <select value={editingVCFlowMode} onChange={e => setEditingVCFlowMode(e.target.value as FlowMode)}
                                    className="flex-1 bg-slate-900 border border-amber-500/30 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500">
                                    <option value="BIDIRECTIONAL">Both (in + out)</option>
                                    <option value="IN_ONLY">In only</option>
                                    <option value="OUT_ONLY">Out only</option>
                                </select>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => {
                                        if (editingVCName.trim()) { setVenueCounterName(editingVCName.trim()); setVenueCounterFlowMode(editingVCFlowMode); }
                                        setEditingVenueCounter(false);
                                    }} className="flex-1 py-1 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-sm font-medium transition-colors flex items-center justify-center gap-1">
                                        <Check className="w-3.5 h-3.5" /> Save
                                    </button>
                                    <button type="button" onClick={() => setEditingVenueCounter(false)}
                                        className="flex-1 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-sm font-medium transition-colors flex items-center justify-center gap-1">
                                        <X className="w-3.5 h-3.5" /> Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* AREA CLICRS */}
                    <div className="space-y-4">
                        {createdAreas.map(area => {
                            const areaClicrs = createdClicrs.filter(c => c.area_id === area.id);
                            return (
                                <div key={area.id} className="bg-slate-950/30 p-4 rounded-xl border border-slate-800">
                                    <h3 className="font-bold text-white mb-3">{area.name}</h3>
                                    {areaClicrs.map(c => (
                                        <div key={c.id} className="flex items-center justify-between mb-2 text-sm">
                                            {editingClicrId !== c.id ? (
                                                <>
                                                    <div className="flex items-center gap-2 text-slate-300">
                                                        <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                                        {c.name}
                                                        <span className="text-xs text-slate-500">Guest Flow: {c.flow_mode === 'BIDIRECTIONAL' ? 'Both' : c.flow_mode === 'IN_ONLY' ? 'In Only' : 'Out Only'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button type="button"
                                                            onClick={() => { setEditingClicrId(c.id); setEditingClicrName(c.name); setEditingClicrFlowMode(c.flow_mode); }}
                                                            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors" title="Edit">
                                                            <Pencil className="w-3 h-3" />
                                                        </button>
                                                        <button type="button"
                                                            onClick={() => setCreatedClicrs(prev => prev.filter(x => x.id !== c.id))}
                                                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Remove">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex flex-col gap-2 w-full">
                                                    <input autoFocus type="text" value={editingClicrName}
                                                        onChange={e => setEditingClicrName(e.target.value)}
                                                        onKeyDown={e => { if (e.key === 'Escape') setEditingClicrId(null); }}
                                                        className="flex-1 bg-slate-900 border border-primary/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                                                    <select value={editingClicrFlowMode} onChange={e => setEditingClicrFlowMode(e.target.value as FlowMode)}
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
                                    <div className="flex gap-2">
                                        <input type="text" placeholder="Clicr name (e.g. Door 1)"
                                            value={clicrInputs[area.id] || ''}
                                            onChange={e => setClicrInputs(p => ({ ...p, [area.id]: e.target.value }))}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddClicr(area.id); } }}
                                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-primary focus:outline-none" />
                                        <select value={clicrFlowModes[area.id] || 'BIDIRECTIONAL'}
                                            onChange={e => setClicrFlowModes(p => ({ ...p, [area.id]: e.target.value as FlowMode }))}
                                            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm focus:ring-1 focus:ring-primary focus:outline-none">
                                            <option value="BIDIRECTIONAL">Both</option>
                                            <option value="IN_ONLY">In only</option>
                                            <option value="OUT_ONLY">Out only</option>
                                        </select>
                                        <button onClick={() => handleAddClicr(area.id)} disabled={!clicrInputs[area.id]}
                                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                                            Add
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex gap-3 pt-2 border-t border-slate-800">
                        <button type="button" onClick={goToPrevStep} className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2">
                            <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <button type="button" onClick={() => setStep('INVITE')} className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all">
                            {createdClicrs.length > 0 ? 'Next: Invite Team' : 'Set up later'}
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 5: INVITE */}
            {step === 'INVITE' && (
                <div className="space-y-6 bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl">
                    <div className="flex items-center gap-3">
                        <Mail className="text-primary w-6 h-6" />
                        <h2 className="text-2xl font-bold text-white">Invite your team</h2>
                    </div>
                    <p className="text-slate-400 text-sm">Add staff members who will help manage your venue. You can also do this later in Settings → Team.</p>
                    {invitedList.length > 0 && (
                        <div className="space-y-2">
                            {invitedList.map((inv, i) => (
                                <div key={i} className="flex items-center justify-between bg-slate-800/50 px-4 py-3 rounded-lg border border-slate-700">
                                    <div className="flex items-center gap-3">
                                        <span className="text-white text-sm font-mono">{inv.email}</span>
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">{inv.role}</span>
                                    </div>
                                    <button type="button" onClick={() => setInvitedList(prev => prev.filter((_, j) => j !== i))}
                                        className="text-slate-500 hover:text-red-400 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="space-y-3">
                        <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                            placeholder="colleague@example.com"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none text-sm" />
                        <div className="flex gap-2">
                            {(['ADMIN', 'MANAGER', 'STAFF', 'ANALYST'] as Role[]).map(r => (
                                <button key={r} type="button" onClick={() => {
                                    setInviteRole(r);
                                    if (r !== 'MANAGER') setInviteVenueIds([]);
                                    if (r !== 'STAFF') setInviteAreaIds([]);
                                }}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${inviteRole === r ? 'bg-primary/10 border-primary text-primary' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}>
                                    {r}
                                </button>
                            ))}
                        </div>

                        {/* Venue assignment for MANAGER */}
                        {inviteRole === 'MANAGER' && venueData.name && (
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Assign Venue</label>
                                <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-700 hover:bg-slate-800/40 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={inviteVenueIds.includes('__venue__')}
                                        onChange={e => {
                                            if (e.target.checked) setInviteVenueIds(['__venue__']);
                                            else setInviteVenueIds([]);
                                        }}
                                        className="rounded border-slate-600"
                                    />
                                    <span className="text-sm text-white">{venueData.name}</span>
                                </label>
                            </div>
                        )}

                        {/* Area assignment for STAFF */}
                        {inviteRole === 'STAFF' && createdAreas.length > 0 && (
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Assign Areas</label>
                                <div className="max-h-40 overflow-y-auto space-y-1">
                                    {createdAreas.map(area => (
                                        <label key={area.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-700 hover:bg-slate-800/40 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={inviteAreaIds.includes(area.id)}
                                                onChange={e => {
                                                    if (e.target.checked) setInviteAreaIds(prev => [...prev, area.id]);
                                                    else setInviteAreaIds(prev => prev.filter(id => id !== area.id));
                                                }}
                                                className="rounded border-slate-600"
                                            />
                                            <span className="text-sm text-white">{area.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        <button onClick={() => {
                            if (!inviteEmail) return;
                            setInvitedList(prev => [...prev, {
                                email: inviteEmail,
                                role: inviteRole,
                                venueIds: inviteRole === 'MANAGER' ? inviteVenueIds : [],
                                areaIds: inviteRole === 'STAFF' ? inviteAreaIds : [],
                            }]);
                            setInviteEmail('');
                            setInviteVenueIds([]);
                            setInviteAreaIds([]);
                        }}
                            disabled={!inviteEmail}
                            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                            <Plus className="w-4 h-4" /> Add & Invite Another
                        </button>
                    </div>
                    {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>}
                    <div className="flex gap-3 pt-2 border-t border-slate-800">
                        <button type="button" onClick={() => { setError(null); goToPrevStep(); }} className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2">
                            <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <button type="button" onClick={() => { setError(null); setStep('SCAN_CONFIG'); }} className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all">
                            {invitedList.length > 0 ? 'Next: Scan Config' : 'Set up later'}
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 6: SCAN_CONFIG */}
            {step === 'SCAN_CONFIG' && (
                <div className="space-y-6 bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl">
                    <div className="flex items-center gap-3">
                        <Scan className="text-primary w-6 h-6" />
                        <h2 className="text-2xl font-bold text-white">Configure scanning</h2>
                    </div>
                    <p className="text-slate-400 text-sm">Choose how your staff will scan IDs. You can change this later in settings.</p>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 block">Default Scan Method</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setScanMethod('CAMERA')}
                                className={`p-4 rounded-xl border text-left transition-all ${scanMethod === 'CAMERA' ? 'bg-primary/10 border-primary' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}>
                                <div className={`font-bold text-sm ${scanMethod === 'CAMERA' ? 'text-primary' : 'text-white'}`}>Phone Camera</div>
                                <div className="text-xs text-slate-500 mt-1">Use device camera to scan IDs</div>
                            </button>
                            <button type="button" onClick={() => setScanMethod('BLUETOOTH')}
                                className={`p-4 rounded-xl border text-left transition-all ${scanMethod === 'BLUETOOTH' ? 'bg-primary/10 border-primary' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}>
                                <div className={`font-bold text-sm ${scanMethod === 'BLUETOOTH' ? 'text-primary' : 'text-white'}`}>Bluetooth Scanner</div>
                                <div className="text-xs text-slate-500 mt-1">External hardware scanner</div>
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                        <div>
                            <div className="font-bold text-white text-sm">Enable ID scanning on all devices</div>
                            <div className="text-xs text-slate-500 mt-1">New devices will have scanning enabled by default</div>
                        </div>
                        <button type="button" onClick={() => setScanEnabled(!scanEnabled)}
                            className={`w-12 h-7 rounded-full transition-all relative ${scanEnabled ? 'bg-primary' : 'bg-slate-600'}`}>
                            <div className={`w-5 h-5 rounded-full bg-white absolute top-1 transition-all ${scanEnabled ? 'left-6' : 'left-1'}`} />
                        </button>
                    </div>
                    <div className="flex gap-3 pt-2 border-t border-slate-800">
                        <button type="button" onClick={goToPrevStep} className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2">
                            <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <button type="button" onClick={() => { setScanConfigured(true); setStep('BAN_CONFIG'); }}
                            className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all">
                            Save & Next
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 7: BAN_CONFIG */}
            {step === 'BAN_CONFIG' && (
                <div className="space-y-6 bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl">
                    <div className="flex items-center gap-3">
                        <Ban className="text-primary w-6 h-6" />
                        <h2 className="text-2xl font-bold text-white">Ban policy defaults</h2>
                    </div>
                    <p className="text-slate-400 text-sm">Set who can create bans and default scope. Adjustable anytime in settings.</p>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 block">Who can create bans?</label>
                        <p className="text-xs text-slate-600 mb-3">Owners and Admins can always ban. Select additional roles:</p>
                        <div className="space-y-2">
                            <label className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700 cursor-pointer">
                                <span className="font-bold text-white text-sm">Door Managers</span>
                                <input type="checkbox" checked={banManagerCanBan} onChange={e => setBanManagerCanBan(e.target.checked)}
                                    className="w-5 h-5 rounded bg-slate-700 border-slate-600 text-primary focus:ring-primary" />
                            </label>
                            <label className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700 cursor-pointer">
                                <span className="font-bold text-white text-sm">Door Staff</span>
                                <input type="checkbox" checked={banStaffCanBan} onChange={e => setBanStaffCanBan(e.target.checked)}
                                    className="w-5 h-5 rounded bg-slate-700 border-slate-600 text-primary focus:ring-primary" />
                            </label>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 block">Default ban scope</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setBanScopeDefault('VENUE')}
                                className={`p-4 rounded-xl border text-left transition-all ${banScopeDefault === 'VENUE' ? 'bg-primary/10 border-primary' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}>
                                <div className={`font-bold text-sm ${banScopeDefault === 'VENUE' ? 'text-primary' : 'text-white'}`}>This venue only</div>
                                <div className="text-xs text-slate-500 mt-1">Ban applies to a single venue</div>
                            </button>
                            <button type="button" onClick={() => setBanScopeDefault('BUSINESS')}
                                className={`p-4 rounded-xl border text-left transition-all ${banScopeDefault === 'BUSINESS' ? 'bg-primary/10 border-primary' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}>
                                <div className={`font-bold text-sm ${banScopeDefault === 'BUSINESS' ? 'text-primary' : 'text-white'}`}>All venues</div>
                                <div className="text-xs text-slate-500 mt-1">Ban across all locations</div>
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                        <div>
                            <div className="font-bold text-white text-sm">Require reason when banning</div>
                            <div className="text-xs text-slate-500 mt-1">Staff must provide a reason for each ban</div>
                        </div>
                        <button type="button" onClick={() => setBanReasonRequired(!banReasonRequired)}
                            className={`w-12 h-7 rounded-full transition-all relative ${banReasonRequired ? 'bg-primary' : 'bg-slate-600'}`}>
                            <div className={`w-5 h-5 rounded-full bg-white absolute top-1 transition-all ${banReasonRequired ? 'left-6' : 'left-1'}`} />
                        </button>
                    </div>
                    {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>}
                    <div className="flex gap-3 pt-2 border-t border-slate-800">
                        <button type="button" onClick={goToPrevStep} disabled={isLoading} className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                            <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <button type="button" onClick={() => finish({ saveBanConfig: true })} disabled={isLoading} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                            {isLoading ? (
                                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Setting up…</>
                            ) : (
                                <><Check className="w-5 h-5" /> Save & finish setup</>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
