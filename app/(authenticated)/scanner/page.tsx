'use client';

import React, { useState, useEffect } from 'react';
import { processScan, banPatron } from './actions';
import { useApp } from '@/lib/store';
import { CheckCircle, XCircle, AlertTriangle, UserX, History, Search, Camera, Bluetooth, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CameraScanner, BluetoothScanner, NFCScanner } from '@/components/scanner';
import { useScanMode } from '@/lib/scanner/use-scan-mode';
import type { ScanMode } from '@/lib/scanner/use-scan-mode';

export default function ScannerPage() {
    const { venues, areas, business } = useApp();
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
            alert("Patron Banned");
        } else {
            alert("Ban failed: " + res.error);
        }
    };

    if (!venueId && venues.length === 0) return <div className="p-8 text-white">Loading configuration...</div>;

    return (
        <div className="min-h-screen text-white flex flex-col md:flex-row -m-6 md:-m-8">
            {/* Left Panel: Scanner View */}
            <div className="flex-1 p-6 flex flex-col items-center justify-center relative border-r border-slate-800 bg-black">
                {/* Configuration Bar */}
                <div className="absolute top-6 left-6 right-6 flex justify-between items-center opacity-50 hover:opacity-100 transition-opacity">
                    <div className="flex gap-4">
                        <select
                            value={venueId} onChange={e => setVenueId(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                        >
                            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                        <select
                            value={areaId} onChange={e => setAreaId(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                        >
                            <option value="">All Areas</option>
                            {areas.filter(a => a.venue_id === venueId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white">
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
                                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
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

                    {/* Result Display */}
                    {result ? (
                        <div className={cn(
                            "rounded-3xl p-8 border-4 shadow-2xl animate-in zoom-in-95 duration-200",
                            result.outcome === 'ACCEPTED' ? "bg-green-600 border-green-400" : "bg-red-600 border-red-400"
                        )}>
                            <div className="flex justify-center mb-6">
                                {result.outcome === 'ACCEPTED' ? <CheckCircle className="w-32 h-32 text-white" /> : <XCircle className="w-32 h-32 text-white" />}
                            </div>
                            <h1 className="text-6xl font-black uppercase tracking-tighter mb-4">{result.outcome}</h1>

                            {result.reason && (
                                <div className="bg-black/20 rounded-xl p-4 mb-6">
                                    <p className="text-2xl font-bold uppercase">{result.reason.replace('_', ' ')}</p>
                                    {result.banDetails && (
                                        <div className="mt-2 text-sm opacity-90 p-2 bg-black/40 rounded">
                                            <p className="font-bold">{result.banDetails.reason}</p>
                                            <p className="italic">{result.banDetails.notes}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 text-left bg-black/10 rounded-xl p-4">
                                <div>
                                    <div className="text-xs uppercase opacity-75">Age</div>
                                    <div className="text-3xl font-mono font-bold">{result.data.age || 'N/A'}</div>
                                </div>
                                <div>
                                    <div className="text-xs uppercase opacity-75">Gender</div>
                                    <div className="text-3xl font-mono font-bold">{result.data.gender || '-'}</div>
                                </div>
                                <div className="col-span-2">
                                    <div className="text-xs uppercase opacity-75">Name</div>
                                    <div className="text-xl font-bold truncate">{result.data.firstName} {result.data.lastName}</div>
                                </div>
                            </div>

                            {result.reason !== 'BANNED' && result.outcome === 'DENIED' && (
                                <button
                                    onClick={() => setIsBanModalOpen(true)}
                                    className="mt-6 w-full py-4 bg-slate-900 rounded-xl font-bold text-white hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                                >
                                    <UserX className="w-5 h-5" /> Ban Patron
                                </button>
                            )}

                            <div className="mt-4 text-xs opacity-50">Scan next ID to continue...</div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-slate-500 py-20 border-4 border-dashed border-slate-800 rounded-3xl bg-slate-900/20">
                            <div className="w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center mb-6 animate-pulse">
                                <Search className="w-10 h-10 text-slate-500" />
                            </div>
                            <h2 className="text-3xl font-bold text-slate-400">Ready to Scan</h2>
                            <p className="mt-2 text-slate-600">
                                {mode === 'CAMERA' ? 'Point camera at ID barcode' :
                                 mode === 'NFC' ? 'Hold ID to back of phone' :
                                 'Waiting for Bluetooth scanner'}
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-500/10 text-red-500 p-4 rounded-xl border border-red-500/20 flex items-center gap-2 justify-center">
                            <AlertTriangle className="w-5 h-5" />
                            {error}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Panel: Recent History (Desktop) */}
            <div className="hidden lg:flex w-80 flex-col border-l border-slate-800 bg-black">
                <div className="p-6 border-b border-slate-800 font-bold flex items-center gap-2 text-white">
                    <History className="w-5 h-5 text-slate-400" /> Recent Scans
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {recentScans.map((scan) => (
                        <div key={scan.id} className="p-3 bg-slate-900 rounded-lg border border-slate-800 flex justify-between items-center">
                            <div>
                                <div className={cn("font-bold text-sm", scan.outcome === 'ACCEPTED' ? "text-green-400" : "text-red-400")}>
                                    {scan.outcome} {scan.outcome === 'DENIED' && `(${scan.reason})`}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">
                                    {scan.data.firstName} • {scan.data.age}yo
                                </div>
                            </div>
                            <div className="text-xs text-slate-600 font-mono">
                                {scan.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    ))}
                    {recentScans.length === 0 && (
                        <div className="text-center text-slate-600 py-10 text-sm italic">No scans yet this session</div>
                    )}
                </div>
            </div>

            {/* Ban Modal */}
            {isBanModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 space-y-6">
                        <div className="flex justify-between items-start">
                            <h2 className="text-2xl font-bold text-white">Ban Patron</h2>
                            <button onClick={() => setIsBanModalOpen(false)}><XCircle className="w-6 h-6 text-slate-400 hover:text-white" /></button>
                        </div>

                        <div className="bg-slate-800 p-4 rounded-xl flex gap-4">
                            <div className="text-4xl font-mono font-bold text-slate-300">{result?.data.age}</div>
                            <div>
                                <div className="font-bold text-white">{result?.data.firstName} {result?.data.lastName}</div>
                                <div className="text-sm text-slate-400">{result?.data.issuingState} License</div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-400 mb-2">Reason</label>
                                <select
                                    className="w-full bg-black border border-slate-700 rounded-lg p-3 text-white"
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
                                <label className="block text-sm font-bold text-slate-400 mb-2">Scope</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setBanScope('VENUE')}
                                        className={cn("p-3 rounded-lg border font-bold text-sm", banScope === 'VENUE' ? "bg-indigo-600 border-indigo-400 text-white" : "bg-black border-slate-700 text-slate-400")}
                                    >
                                        This Venue Only
                                    </button>
                                    <button
                                        onClick={() => setBanScope('BUSINESS')}
                                        className={cn("p-3 rounded-lg border font-bold text-sm", banScope === 'BUSINESS' ? "bg-indigo-600 border-indigo-400 text-white" : "bg-black border-slate-700 text-slate-400")}
                                    >
                                        All Locations
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-400 mb-2">Notes</label>
                                <textarea
                                    className="w-full bg-black border border-slate-700 rounded-lg p-3 text-white h-24 resize-none"
                                    placeholder="Incident details..."
                                    value={banNotes} onChange={e => setBanNotes(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <button onClick={() => setIsBanModalOpen(false)} className="py-3 bg-slate-800 rounded-xl font-bold text-slate-300 hover:text-white">Cancel</button>
                            <button onClick={handleBan} className="py-3 bg-red-600 rounded-xl font-bold text-white hover:bg-red-500 shadow-lg shadow-red-900/20">Confirm Ban</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
