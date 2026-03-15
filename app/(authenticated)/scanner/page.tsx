'use client';

import React, { useState, useEffect } from 'react';
import { processScan, banPatron } from './actions';
import { useApp } from '@/lib/store';
import { CheckCircle, XCircle, AlertTriangle, UserX, History, Search, Camera, Bluetooth, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CameraScanner, BluetoothScanner, NFCScanner } from '@/components/scanner';
import { useScanMode } from '@/lib/scanner/use-scan-mode';
import type { ScanMode } from '@/lib/scanner/use-scan-mode';
import { ScannerResult } from '@/lib/ui/components/ScannerResult';

export default function ScannerPage() {
    const { venues, areas, business, currentUser } = useApp();
    const [venueId, setVenueId] = useState<string>('');
    const [areaId, setAreaId] = useState<string>('');

    // Scanner Mode
    const businessDefault = (business?.settings?.scan_method as ScanMode | undefined) ?? 'BLUETOOTH';
    const { mode, setMode, support } = useScanMode(businessDefault);

    // Scanner State
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [recentScans, setRecentScans] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Flash banner (replaces browser alerts)
    const [flashBanner, setFlashBanner] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const flashTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const showFlash = (message: string, type: 'success' | 'error', duration = 3000) => {
        if (flashTimer.current) clearTimeout(flashTimer.current);
        setFlashBanner({ message, type });
        flashTimer.current = setTimeout(() => setFlashBanner(null), duration);
    };

    // Ban Modal State
    const [isBanModalOpen, setIsBanModalOpen] = useState(false);
    const [banReason, setBanReason] = useState('AGGRESSIVE');
    const [banNotes, setBanNotes] = useState('');
    const [banScope, setBanScope] = useState('VENUE');

    // Auto-select first venue/area on load
    useEffect(() => {
        if (!venueId && venues.length > 0) {
            setVenueId(venues[0].id);
            // Find default area?
            const vAreas = areas.filter(a => a.venue_id === venues[0].id);
            if (vAreas.length > 0) setAreaId(vAreas[0].id);
        }
    }, [venues, areas]);

    const submitScan = async (raw: string) => {
        if (isProcessing) return;
        setIsProcessing(true);
        setError(null);
        setResult(null);

        try {
            const res = await processScan({
                raw,
                venueId,
                areaId: areaId || undefined
            });

            if (!res.success) {
                setError(res.error || 'Scan failed');
            } else {
                setResult(res.result);
                // Add to history
                setRecentScans(prev => [{
                    id: Date.now(),
                    ...res.result,
                    timestamp: new Date()
                }, ...prev].slice(0, 10));
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleBan = async () => {
        if (!result) return;

        // Use manual data pass for now as we don't have scanId link back solely from result yet (TODO: add scanId to processScan result)
        const res = await banPatron(null, { ...result.data, idNumber: 'FROM_SCAN_CONTEXT' }, {
            reason: banReason,
            notes: banNotes,
            scope: banScope,
            duration: 'PERMANENT',
            venueId: banScope === 'VENUE' ? venueId : undefined
        });

        if (res.success) {
            setIsBanModalOpen(false);
            setResult({ ...result, outcome: 'DENIED', reason: 'BANNED' }); // Update UI
            showFlash('Patron Banned', 'success');
        } else {
            showFlash('Ban failed: ' + res.error, 'error');
        }
    };

    if (!venueId && venues.length === 0) return <div className="p-8 text-foreground">Loading configuration...</div>;

    return (
        <div className="min-h-screen text-foreground flex flex-col md:flex-row -m-6 md:-m-8">
            {/* Flash banner */}
            {flashBanner && (
                <div className={cn(
                    'fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-xl font-bold text-sm shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 max-w-[90vw]',
                    flashBanner.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white',
                )}>
                    {flashBanner.type === 'error' ? <AlertTriangle className="w-5 h-5 shrink-0" /> : <CheckCircle className="w-5 h-5 shrink-0" />}
                    {flashBanner.message}
                    <button onClick={() => setFlashBanner(null)} className="ml-2 opacity-70 hover:opacity-100">✕</button>
                </div>
            )}
            {/* Left Panel: Scanner View */}
            <div className="flex-1 p-6 flex flex-col items-center justify-center relative border-r border-border bg-background">
                {/* Configuration Bar */}
                <div className="absolute top-6 left-6 right-6 flex justify-between items-center opacity-50 hover:opacity-100 transition-opacity">
                    <div className="flex gap-4">
                        <select
                            value={venueId} onChange={e => setVenueId(e.target.value)}
                            className="bg-card border border-border rounded px-2 py-1 text-sm text-foreground"
                        >
                            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                        <select
                            value={areaId} onChange={e => setAreaId(e.target.value)}
                            className="bg-card border border-border rounded px-2 py-1 text-sm text-foreground"
                        >
                            <option value="">All Areas</option>
                            {areas.filter(a => a.venue_id === venueId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-foreground">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Ready
                    </div>
                </div>

                {/* Main Visual */}
                <div className="w-full max-w-md space-y-8 text-center z-10">

                    {/* Mode Selector */}
                    <div className="flex gap-2 justify-center">
                        {([
                            { id: 'CAMERA' as ScanMode, label: 'Camera', Icon: Camera },
                            { id: 'BLUETOOTH' as ScanMode, label: 'Bluetooth', Icon: Bluetooth },
                            { id: 'NFC' as ScanMode, label: 'NFC', Icon: Wifi },
                        ]).map(({ id, label, Icon }) => (
                            <button
                                key={id}
                                onClick={() => setMode(id)}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-all border',
                                    mode === id
                                        ? 'bg-indigo-600 border-indigo-400 text-white'
                                        : 'bg-card border-border text-muted-foreground hover:text-foreground'
                                )}
                            >
                                <Icon className="w-4 h-4" />
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Active Scanner Input */}
                    <CameraScanner
                        active={mode === 'CAMERA' && !isProcessing}
                        onScan={submitScan}
                        onError={setError}
                    />
                    <BluetoothScanner
                        active={mode === 'BLUETOOTH'}
                        onScan={submitScan}
                        paused={isBanModalOpen}
                    />
                    <NFCScanner
                        active={mode === 'NFC' && !isProcessing}
                        onScan={submitScan}
                        onError={setError}
                    />

                    {/* Ready to Scan placeholder */}
                    {!result && (
                        <div className="flex flex-col items-center justify-center text-muted-foreground py-20 border-4 border-dashed border-border rounded-3xl bg-muted/20">
                            <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6 animate-pulse">
                                <Search className="w-10 h-10 text-muted-foreground" />
                            </div>
                            <h2 className="text-3xl font-bold text-muted-foreground">Ready to Scan</h2>
                            <p className="mt-2 text-muted-foreground/60">
                                {mode === 'CAMERA' ? 'Point camera at ID barcode' :
                                 mode === 'NFC' ? 'Hold ID to back of phone' :
                                 'Waiting for Bluetooth scanner'}
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-500/10 text-red-500 p-4 rounded-xl border border-red-200 dark:border-red-500/20 flex items-center gap-2 justify-center">
                            <AlertTriangle className="w-5 h-5" />
                            {error}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Panel: Recent History (Desktop) */}
            <div className="hidden lg:flex w-80 flex-col border-l border-border bg-background">
                <div className="p-6 border-b border-border font-bold flex items-center gap-2 text-foreground">
                    <History className="w-5 h-5 text-muted-foreground" /> Recent Scans
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {recentScans.map((scan) => (
                        <div key={scan.id} className="p-3 bg-card rounded-lg border border-border flex justify-between items-center">
                            <div>
                                <div className={cn("font-bold text-sm", scan.outcome === 'ACCEPTED' ? "text-green-400" : "text-red-400")}>
                                    {scan.outcome} {scan.outcome === 'DENIED' && `(${scan.reason})`}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    {scan.data.firstName} • {scan.data.age}yo
                                </div>
                            </div>
                            <div className="text-xs text-muted-foreground/60 font-mono">
                                {scan.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    ))}
                    {recentScans.length === 0 && (
                        <div className="text-center text-muted-foreground/60 py-10 text-sm italic">No scans yet this session</div>
                    )}
                </div>
            </div>

            {/* ScannerResult full-screen overlay */}
            {result && (
                <div className="fixed inset-0 z-40">
                    <ScannerResult
                        status={
                            result.outcome === 'ACCEPTED' ? 'ALLOWED' :
                            result.reason === 'BANNED' ? 'DENIED_BANNED' :
                            result.reason === 'UNDERAGE' ? 'DENIED_UNDERAGE' :
                            result.reason === 'EXPIRED' ? 'DENIED_EXPIRED' :
                            result.reason === 'OPERATION_PAUSED' ? 'DENIED_PAUSED' :
                            'DENIED_UNDERAGE'
                        }
                        data={{
                            name: `${result.data.firstName || 'GUEST'} ${result.data.lastName || ''}`.trim(),
                            age: result.data.age ?? 0,
                            dob: result.data.dob ?? 'Unknown',
                            exp: result.data.expirationDate ?? 'Unknown',
                        }}
                        onScanNext={() => setResult(null)}
                        enforcementEventId={result.enforcementEventId}
                        areaId={result.areaId}
                        userRole={currentUser?.role}
                        onOverride={async (enfId, aId, reason, notes) => {
                            const { overrideBan } = await import('@/app/(authenticated)/scanner/actions');
                            const res = await overrideBan(enfId, aId, reason, notes);
                            if (!res.success) {
                                console.error('[Override Ban] Failed:', res.error);
                                throw new Error(res.error || 'Override failed');
                            }
                        }}
                    />
                </div>
            )}

            {/* Ban Modal */}
            {isBanModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 space-y-6">
                        <div className="flex justify-between items-start">
                            <h2 className="text-2xl font-bold text-foreground">Ban Patron</h2>
                            <button onClick={() => setIsBanModalOpen(false)}><XCircle className="w-6 h-6 text-muted-foreground hover:text-foreground" /></button>
                        </div>

                        <div className="bg-muted p-4 rounded-xl flex gap-4">
                            <div className="text-4xl font-mono font-bold text-foreground/80">{result?.data.age}</div>
                            <div>
                                <div className="font-bold text-foreground">{result?.data.firstName} {result?.data.lastName}</div>
                                <div className="text-sm text-muted-foreground">{result?.data.issuingState} License</div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-muted-foreground mb-2">Reason</label>
                                <select
                                    className="w-full bg-background border border-border rounded-lg p-3 text-foreground"
                                    value={banReason} onChange={e => setBanReason(e.target.value)}
                                >
                                    <option value="AGGRESSIVE">Aggressive Behavior</option>
                                    <option value="THEFT">Theft / Stealing</option>
                                    <option value="HARASSMENT">Harassment</option>
                                    <option value="VIP_VIOLATION">VIP Violation</option>
                                    <option value="OTHER">Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-muted-foreground mb-2">Scope</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setBanScope('VENUE')}
                                        className={cn("p-3 rounded-lg border font-bold text-sm", banScope === 'VENUE' ? "bg-indigo-600 border-indigo-400 text-white" : "bg-background border-border text-muted-foreground")}
                                    >
                                        This Venue Only
                                    </button>
                                    <button
                                        onClick={() => setBanScope('BUSINESS')}
                                        className={cn("p-3 rounded-lg border font-bold text-sm", banScope === 'BUSINESS' ? "bg-indigo-600 border-indigo-400 text-white" : "bg-background border-border text-muted-foreground")}
                                    >
                                        All Locations
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-muted-foreground mb-2">Notes</label>
                                <textarea
                                    className="w-full bg-background border border-border rounded-lg p-3 text-foreground h-24 resize-none"
                                    placeholder="Incident details..."
                                    value={banNotes} onChange={e => setBanNotes(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <button onClick={() => setIsBanModalOpen(false)} className="py-3 bg-muted rounded-xl font-bold text-foreground/80 hover:text-foreground">Cancel</button>
                            <button onClick={handleBan} className="py-3 bg-red-600 rounded-xl font-bold text-foreground hover:bg-red-500 shadow-lg shadow-red-900/20">Confirm Ban</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
