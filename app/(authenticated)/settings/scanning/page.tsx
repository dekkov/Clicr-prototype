"use client";

import React, { useState, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { Scan, ArrowLeft, Save, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { updateBusinessSettings } from '@/app/onboarding/setup-actions';
import { canManageSettings } from '@/lib/permissions';
import type { Role } from '@/lib/types';

export default function ScanningPage() {
    const { business, currentUser, refreshState } = useApp();
    const [scanMethod, setScanMethod] = useState<'CAMERA' | 'BLUETOOTH'>('CAMERA');
    const [scanEnabled, setScanEnabled] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (business?.settings) {
            setScanMethod((business.settings.scan_method as 'CAMERA' | 'BLUETOOTH') || 'CAMERA');
            setScanEnabled(business.settings.scan_enabled_default ?? true);
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
            scan_method: scanMethod,
            scan_enabled_default: scanEnabled,
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
                <h1 className="text-2xl font-bold text-white">Scanning Configuration</h1>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-6">
                <div>
                    <label className="block text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Default Scan Method</label>
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

                <button onClick={handleSave} disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all disabled:opacity-50">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saved ? 'Saved!' : isSaving ? 'Saving...' : 'Save Scan Config'}
                </button>
            </div>
        </div>
    );
}
