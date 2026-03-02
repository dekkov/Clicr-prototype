"use client";

import React, { useState, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { updateBusinessSettings } from '@/app/onboarding/setup-actions';
import { canManageSettings } from '@/lib/permissions';
import type { Role } from '@/lib/types';

export default function BanPoliciesPage() {
    const { business, currentUser, refreshState } = useApp();
    const [banManagerCanBan, setBanManagerCanBan] = useState(true);
    const [banStaffCanBan, setBanStaffCanBan] = useState(false);
    const [banScopeDefault, setBanScopeDefault] = useState<'VENUE' | 'BUSINESS'>('VENUE');
    const [banReasonReq, setBanReasonReq] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (business?.settings) {
            setBanManagerCanBan(business.settings.ban_permissions?.manager ?? true);
            setBanStaffCanBan(business.settings.ban_permissions?.staff ?? false);
            setBanScopeDefault((business.settings.ban_scope_default as 'VENUE' | 'BUSINESS') || 'VENUE');
            setBanReasonReq(business.settings.ban_reason_required ?? true);
        }
    }, [business?.settings]);

    if (!canManageSettings(currentUser?.role as Role | undefined)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-500">
                <p className="text-base font-medium">Access restricted</p>
            </div>
        );
    }

    if (!business) return <div className="p-8 text-white">Loading...</div>;

    const handleSave = async () => {
        if (!business) return;
        setIsSaving(true);
        setSaved(false);
        await updateBusinessSettings(business.id, {
            ban_permissions: { manager: banManagerCanBan, staff: banStaffCanBan },
            ban_scope_default: banScopeDefault,
            ban_reason_required: banReasonReq,
        });
        await refreshState();
        setIsSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="flex items-center gap-4">
                <Link href="/settings" className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <h1 className="text-2xl font-bold text-white">Ban Policy Defaults</h1>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-6">
                <div>
                    <label className="block text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Who can create bans?</label>
                    <p className="text-xs text-slate-500 mb-3">Owners and Admins can always ban. Select additional roles:</p>
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
                    <label className="block text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Default ban scope</label>
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
                    <button type="button" onClick={() => setBanReasonReq(!banReasonReq)}
                        className={`w-12 h-7 rounded-full transition-all relative ${banReasonReq ? 'bg-primary' : 'bg-slate-600'}`}>
                        <div className={`w-5 h-5 rounded-full bg-white absolute top-1 transition-all ${banReasonReq ? 'left-6' : 'left-1'}`} />
                    </button>
                </div>

                <button onClick={handleSave} disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saved ? 'Saved!' : isSaving ? 'Saving...' : 'Save Ban Policies'}
                </button>
            </div>
        </div>
    );
}
