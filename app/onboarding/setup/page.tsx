"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { Area, Clicr, Venue } from '@/lib/types';
import { Building2, MapPin, Users, Check, Plus, ArrowRight, Mail, Shield, Scan, Ban } from 'lucide-react';
import { createInitialBusiness, updateBusinessSettings } from '@/app/onboarding/setup-actions';
import { inviteTeamMember } from '@/app/(authenticated)/settings/team-actions';
import type { Role } from '@/lib/types';

type Step = 'BUSINESS' | 'VENUE' | 'AREAS' | 'CLICRS' | 'INVITE' | 'SCAN_CONFIG' | 'BAN_CONFIG';

export default function OnboardingSetupPage() {
    const router = useRouter();
    const { addVenue, addArea, addClicr, selectBusiness, refreshState } = useApp();

    const [step, setStep] = useState<Step>('BUSINESS');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Business step state
    const [businessName, setBusinessName] = useState('');
    const [newBusinessId, setNewBusinessId] = useState('');
    const [timezone, setTimezone] = useState('America/New_York');
    const [logoUrl, setLogoUrl] = useState('');

    // Invite step state
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<Role>('STAFF');
    const [invitedList, setInvitedList] = useState<{ email: string; role: Role }[]>([]);

    // Scan config step state
    const [scanMethod, setScanMethod] = useState<'CAMERA' | 'BLUETOOTH'>('CAMERA');
    const [scanEnabled, setScanEnabled] = useState(true);
    const [scanConfigured, setScanConfigured] = useState(false);

    // Ban config step state
    const [banManagerCanBan, setBanManagerCanBan] = useState(true);
    const [banStaffCanBan, setBanStaffCanBan] = useState(false);
    const [banScopeDefault, setBanScopeDefault] = useState<'VENUE' | 'BUSINESS'>('VENUE');
    const [banReasonRequired, setBanReasonRequired] = useState(true);
    const [banConfigured, setBanConfigured] = useState(false);

    // Venue step state
    const [venueId, setVenueId] = useState('');
    const [venueData, setVenueData] = useState({ name: '', city: '', state: '', capacity: '500' });

    // Areas step state
    const [createdAreas, setCreatedAreas] = useState<Area[]>([]);
    const [areaInput, setAreaInput] = useState({ name: '', capacity: '100' });

    // Clicrs step state
    const [createdClicrs, setCreatedClicrs] = useState<Clicr[]>([]);
    const [clicrInputs, setClicrInputs] = useState<Record<string, string>>({});

    const STEP_LABELS: Step[] = ['BUSINESS', 'VENUE', 'AREAS', 'CLICRS', 'INVITE', 'SCAN_CONFIG', 'BAN_CONFIG'];
    const currentIndex = STEP_LABELS.indexOf(step);

    // --- STEP 1: BUSINESS ---
    const handleCreateBusiness = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        const fd = new FormData();
        fd.append('businessName', businessName);
        fd.append('timezone', timezone);
        if (logoUrl) fd.append('logoUrl', logoUrl);
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
            timezone,
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

    const finish = async (opts?: { saveBanConfig?: boolean; saveScanConfig?: boolean }) => {
        const shouldSaveBan = opts?.saveBanConfig ?? banConfigured;
        const shouldSaveScan = opts?.saveScanConfig ?? scanConfigured;

        if (newBusinessId) {
            const settingsPayload: Record<string, any> = {};
            if (shouldSaveScan) {
                settingsPayload.scan_method = scanMethod;
                settingsPayload.scan_enabled_default = scanEnabled;
            }
            if (shouldSaveBan) {
                settingsPayload.ban_permissions = {
                    manager: banManagerCanBan,
                    staff: banStaffCanBan,
                };
                settingsPayload.ban_scope_default = banScopeDefault;
                settingsPayload.ban_reason_required = banReasonRequired;
            }

            if (Object.keys(settingsPayload).length > 0) {
                await updateBusinessSettings(newBusinessId, settingsPayload);
                await refreshState();
            }

            selectBusiness({
                id: newBusinessId,
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
        }
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
                                <span className="text-[10px] font-bold hidden sm:block">
                                    {{ BUSINESS: 'Org', VENUE: 'Venue', AREAS: 'Areas', CLICRS: 'Clicrs', INVITE: 'Team', SCAN_CONFIG: 'Scan', BAN_CONFIG: 'Bans' }[s]}
                                </span>
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
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Timezone</label>
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
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Logo URL <span className="text-slate-600">(optional)</span></label>
                            <input
                                type="url"
                                value={logoUrl}
                                onChange={e => setLogoUrl(e.target.value)}
                                placeholder="https://example.com/logo.png"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none placeholder:text-slate-600"
                            />
                        </div>
                        <button type="submit" disabled={isLoading} className="w-full py-4 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
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
                            <button type="button" onClick={() => finish()} className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all">
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
                            <button onClick={() => finish()} className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all">
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
                            <button onClick={() => setStep('INVITE')} className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all">
                                Skip for now
                            </button>
                            <button onClick={() => setStep('INVITE')} className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all">
                                Next: Invite Team
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
                        <p className="text-slate-400 text-sm">Add staff members who will help manage your venue. You can always do this later.</p>

                        {invitedList.length > 0 && (
                            <div className="space-y-2">
                                {invitedList.map((inv, i) => (
                                    <div key={i} className="flex items-center justify-between bg-slate-800/50 px-4 py-3 rounded-lg border border-slate-700">
                                        <div className="flex items-center gap-3">
                                            <span className="text-white text-sm font-mono">{inv.email}</span>
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">{inv.role}</span>
                                        </div>
                                        <span className="text-xs text-emerald-500 font-bold flex items-center gap-1"><Check className="w-3 h-3" /> Invited</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="space-y-3">
                            <input
                                type="email"
                                value={inviteEmail}
                                onChange={e => setInviteEmail(e.target.value)}
                                placeholder="colleague@example.com"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 focus:outline-none text-sm"
                            />
                            <div className="flex gap-2">
                                {(['ADMIN', 'MANAGER', 'STAFF', 'ANALYST'] as Role[]).map(r => (
                                    <button key={r} type="button" onClick={() => setInviteRole(r)}
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${inviteRole === r ? 'bg-primary/10 border-primary text-primary' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}>
                                        {r}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={async () => {
                                    if (!inviteEmail || !newBusinessId) return;
                                    setIsLoading(true);
                                    const result = await inviteTeamMember(inviteEmail, inviteRole, newBusinessId);
                                    if (result.success) {
                                        setInvitedList(prev => [...prev, { email: inviteEmail, role: inviteRole }]);
                                        setInviteEmail('');
                                    } else {
                                        setError('error' in result ? result.error : 'Invite failed');
                                    }
                                    setIsLoading(false);
                                }}
                                disabled={!inviteEmail || isLoading}
                                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <Plus className="w-4 h-4" /> {isLoading ? 'Inviting...' : 'Add & Invite Another'}
                            </button>
                        </div>

                        {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>}

                        <div className="flex gap-3 pt-2 border-t border-slate-800">
                            <button onClick={() => { setError(null); setStep('SCAN_CONFIG'); }} className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all">
                                Skip for now
                            </button>
                            <button onClick={() => { setError(null); setStep('SCAN_CONFIG'); }} className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all">
                                Next: Scanning
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
                            <button onClick={() => setStep('BAN_CONFIG')} className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all">
                                Skip for now
                            </button>
                            <button onClick={() => { setScanConfigured(true); setStep('BAN_CONFIG'); }} className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all">
                                Next: Ban Settings
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

                        <div className="flex gap-3 pt-2 border-t border-slate-800">
                            <button onClick={() => finish()} className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white rounded-xl font-medium transition-all">
                                Skip for now
                            </button>
                            <button onClick={() => finish({ saveBanConfig: true })} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                                <Check className="w-5 h-5" /> Finish Setup
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
