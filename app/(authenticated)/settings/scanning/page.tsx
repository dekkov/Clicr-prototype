"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '@/lib/store';
import { Scan, ArrowLeft, Save, Loader2, Bluetooth, CheckCircle, XCircle, ChevronDown, ChevronUp, Wifi } from 'lucide-react';
import Link from 'next/link';
import { updateBusinessSettings } from '@/app/onboarding/setup-actions';
import { canManageSettings } from '@/lib/permissions';
import type { Role } from '@/lib/types';
import { parseAAMVA } from '@/lib/aamva';

function TestScanModal({ onClose }: { onClose: () => void }) {
    const [status, setStatus] = useState<'waiting' | 'success' | 'invalid'>('waiting');
    const [scanInput, setScanInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        if (!scanInput || scanInput.length < 20) return;
        const timeout = setTimeout(() => {
            try {
                const parsed = parseAAMVA(scanInput);
                if (parsed.firstName || parsed.lastName || parsed.dateOfBirth) {
                    setStatus('success');
                } else {
                    setStatus('invalid');
                }
            } catch {
                setStatus('invalid');
            }
        }, 300);
        return () => clearTimeout(timeout);
    }, [scanInput]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4" onClick={onClose}>
            <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-foreground mb-2">Test Bluetooth Scanner</h3>
                <p className="text-sm text-muted-foreground mb-4">Scan an ID with your Bluetooth scanner. The scanner types into this page.</p>
                <input
                    ref={inputRef}
                    type="text"
                    value={scanInput}
                    onChange={e => setScanInput(e.target.value)}
                    placeholder="Focus here, then scan..."
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder-muted-foreground mb-4"
                    autoFocus
                />
                {status === 'success' && (
                    <div className="flex items-center gap-2 text-emerald-400 mb-4">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-medium">Scanner connected and working!</span>
                    </div>
                )}
                {status === 'invalid' && scanInput.length > 20 && (
                    <div className="flex items-center gap-2 text-amber-400 mb-4">
                        <XCircle className="w-5 h-5" />
                        <span className="font-medium">Invalid scan. Try a different ID or check scanner.</span>
                    </div>
                )}
                <button onClick={onClose} className="w-full py-2 rounded-xl bg-muted hover:bg-muted text-foreground font-medium">
                    Close
                </button>
            </div>
        </div>
    );
}

export default function ScanningPage() {
    const { business, currentUser, refreshState } = useApp();
    const [scanMethod, setScanMethod] = useState<'CAMERA' | 'BLUETOOTH' | 'NFC'>('CAMERA');
    const [scanEnabled, setScanEnabled] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [showTestScan, setShowTestScan] = useState(false);
    const [showTroubleshooting, setShowTroubleshooting] = useState(false);

    useEffect(() => {
        if (business?.settings) {
            setScanMethod((business.settings.scan_method as 'CAMERA' | 'BLUETOOTH' | 'NFC') || 'CAMERA');
            setScanEnabled(business.settings.scan_enabled_default ?? true);
        }
    }, [business?.settings]);

    if (!canManageSettings(currentUser?.role as Role | undefined)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
                <p className="text-base font-medium">Access restricted</p>
            </div>
        );
    }

    if (!business) return <div className="p-8 text-foreground">Loading...</div>;

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
                <Link href="/settings" className="p-2 bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <h1 className="text-2xl font-bold text-foreground">Scanning Configuration</h1>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 space-y-6">
                <div>
                    <label className="block text-sm font-bold text-muted-foreground uppercase tracking-widest mb-3">Default Scan Method</label>
                    <div className="grid grid-cols-3 gap-3">
                        <button type="button" onClick={() => setScanMethod('CAMERA')}
                            className={`p-4 rounded-xl border text-left transition-all ${scanMethod === 'CAMERA' ? 'bg-primary/10 border-primary' : 'bg-muted border-border hover:bg-muted'}`}>
                            <div className={`font-bold text-sm ${scanMethod === 'CAMERA' ? 'text-primary' : 'text-foreground'}`}>Phone Camera</div>
                            <div className="text-xs text-muted-foreground mt-1">Use device camera to scan IDs</div>
                        </button>
                        <button type="button" onClick={() => setScanMethod('BLUETOOTH')}
                            className={`p-4 rounded-xl border text-left transition-all ${scanMethod === 'BLUETOOTH' ? 'bg-primary/10 border-primary' : 'bg-muted border-border hover:bg-muted'}`}>
                            <div className={`font-bold text-sm ${scanMethod === 'BLUETOOTH' ? 'text-primary' : 'text-foreground'}`}>Bluetooth Scanner</div>
                            <div className="text-xs text-muted-foreground mt-1">External hardware scanner</div>
                        </button>
                        <button type="button" onClick={() => setScanMethod('NFC')}
                            className={`p-4 rounded-xl border text-left transition-all ${scanMethod === 'NFC' ? 'bg-primary/10 border-primary' : 'bg-muted border-border hover:bg-muted'}`}>
                            <div className={`font-bold text-sm ${scanMethod === 'NFC' ? 'text-primary' : 'text-foreground'}`}>NFC</div>
                            <div className="text-xs text-muted-foreground mt-1">Passports &amp; international IDs</div>
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-between bg-muted/50 p-4 rounded-xl border border-border">
                    <div>
                        <div className="font-bold text-foreground text-sm">Enable ID scanning on all devices</div>
                        <div className="text-xs text-muted-foreground mt-1">New devices will have scanning enabled by default</div>
                    </div>
                    <button type="button" onClick={() => setScanEnabled(!scanEnabled)}
                        className={`w-12 h-7 rounded-full transition-all relative ${scanEnabled ? 'bg-primary' : 'bg-muted'}`}>
                        <div className={`w-5 h-5 rounded-full bg-white absolute top-1 transition-all ${scanEnabled ? 'left-6' : 'left-1'}`} />
                    </button>
                </div>

                <button onClick={handleSave} disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-foreground font-bold rounded-xl transition-all disabled:opacity-50">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saved ? 'Saved!' : isSaving ? 'Saving...' : 'Save Scan Config'}
                </button>
            </div>

            {scanMethod === 'BLUETOOTH' && (
                <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <Bluetooth className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-bold text-foreground">Bluetooth Scanner Setup</h2>
                    </div>
                    <div className="bg-muted/50 p-4 rounded-xl border border-border">
                        <div className="font-bold text-foreground text-sm mb-2">1. Pair your scanner</div>
                        <p className="text-sm text-muted-foreground">Go to System Settings → Bluetooth and pair your scanner. Most Bluetooth ID scanners emulate a keyboard — once paired, they type into the scanner page automatically.</p>
                    </div>
                    <div className="bg-muted/50 p-4 rounded-xl border border-border">
                        <div className="font-bold text-foreground text-sm mb-2">2. Open the scanner page</div>
                        <p className="text-sm text-muted-foreground">Navigate to Scanner, select Bluetooth mode. The page maintains focus automatically. Scan an ID to verify.</p>
                    </div>
                    <button
                        onClick={() => setShowTestScan(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-medium"
                    >
                        <Scan className="w-4 h-4" />
                        Test Scanner
                    </button>
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowTroubleshooting(!showTroubleshooting)}
                            className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm transition-colors"
                        >
                            {showTroubleshooting ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            Troubleshooting tips
                        </button>
                        {showTroubleshooting && (
                            <ul className="mt-2 text-sm text-muted-foreground space-y-1 list-disc list-inside">
                                <li>Ensure scanner is paired and powered on</li>
                                <li>Scanner must output AAMVA/PDF417 format (US driver licenses)</li>
                                <li>On the scanner page, focus is locked automatically</li>
                                <li>Chrome or Edge offer optional WebHID direct connection</li>
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {scanMethod === 'NFC' && (
                <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <Wifi className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-bold text-foreground">NFC Mode</h2>
                    </div>
                    <div className="bg-amber-100 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700/40 p-4 rounded-xl">
                        <p className="text-amber-400 text-sm font-medium">Chrome on Android only</p>
                        <p className="text-amber-600/80 text-xs mt-1">Web NFC is not supported on iOS, desktop, or other browsers.</p>
                    </div>
                    <div className="bg-muted/50 p-4 rounded-xl border border-border">
                        <p className="text-sm text-muted-foreground">NFC mode reads NFC-enabled ID cards — primarily passports and some international IDs. <strong className="text-foreground">US driver&apos;s licenses do not have NFC chips</strong> and will not work in this mode.</p>
                    </div>
                </div>
            )}

            {showTestScan && <TestScanModal onClose={() => setShowTestScan(false)} />}
        </div>
    );
}
