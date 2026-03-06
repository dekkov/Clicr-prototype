"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Wifi, WifiOff, ScanLine, XCircle, Zap,
    RefreshCw, Settings2, Bug, RotateCcw, Scan
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { IDScanEvent } from '@/lib/types';
import { parseAAMVA } from '@/lib/aamva';
import { evaluateScan } from '@/lib/scan-service';
import { Html5Qrcode } from 'html5-qrcode';
import { getVenueCapacityRules } from '@/lib/capacity';
import { ScannerResult } from '@/lib/ui/components/ScannerResult';
import { useAreaShift } from '@/lib/useAreaShift';

type Mode = 'count' | 'scan';

/** Isolated config modal body — receives only a ref so it never re-renders when parent updates (fixes focus loss) */
const ConfigModalBody = React.memo(function ConfigModalBody({
    configRef,
}: {
    configRef: React.MutableRefObject<{
        initialName: string;
        clicrId: string;
        hasTapToken: boolean;
        tapToken: string;
        initialClassifyMode: boolean;
        onSave: (name: string) => void;
        onCancel: () => void;
        onGenerateToken: () => void;
        onClassifyToggle: (newVal: boolean) => void;
        onCopy: () => void;
    } | null>;
}) {
    const snap = configRef.current;
    if (!snap) return null;
    const [name, setName] = useState(() => snap.initialName);
    const [classifyMode, setClassifyMode] = useState(() => snap.initialClassifyMode);
    const [copyFeedback, setCopyFeedback] = useState(false);
    const handleCopy = () => {
        snap.onCopy();
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 1500);
    };
    const handleClassifyToggle = () => {
        const newVal = !classifyMode;
        setClassifyMode(newVal);
        snap.onClassifyToggle(newVal);
    };
    return (
        <>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Counter Name</label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-white transition-colors"
                    placeholder="e.g. Main Entrance"
                />
            </div>
            <div className="space-y-2">
                <div className="flex justify-between items-center bg-slate-900/50 p-3 rounded-xl border border-white/5">
                    <span className="text-sm font-bold text-white">Classify Scans</span>
                    <button type="button" onClick={handleClassifyToggle} className={cn("w-12 h-7 rounded-full relative transition-colors", classifyMode ? "bg-emerald-500" : "bg-slate-700")}>
                        <div className="absolute left-1 top-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform" style={{ transform: classifyMode ? "translateX(20px)" : "translateX(0px)" }} />
                    </button>
                </div>
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Remote Tap Link</label>
                {snap.hasTapToken ? (
                    <div className="space-y-2">
                        <div className="flex gap-2">
                            <input readOnly value={`${typeof window !== 'undefined' ? window.location.origin : ''}/tap/${snap.tapToken}`} className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-400 text-xs font-mono focus:outline-none truncate" />
                            <button type="button" onClick={handleCopy} className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors shrink-0">{copyFeedback ? 'Copied!' : 'Copy'}</button>
                        </div>
                        <button type="button" onClick={snap.onGenerateToken} className="w-full py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-400 text-xs font-bold transition-colors">Regenerate Link</button>
                    </div>
                ) : (
                    <button type="button" onClick={snap.onGenerateToken} className="w-full py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-white text-white text-xs font-bold transition-colors">Generate Link</button>
                )}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
                <button type="button" onClick={snap.onCancel} className="py-3 rounded-xl text-slate-400 bg-[#1e2330] hover:bg-[#2a3040] font-semibold text-sm transition-colors">Cancel</button>
                <button type="button" onClick={() => snap.onSave(name)} className="py-3 rounded-xl bg-white text-black font-bold text-sm hover:bg-slate-200 shadow-lg transition-all active:scale-95">Save Changes</button>
            </div>
        </>
    );
}, (prev, next) => prev.configRef === next.configRef);

// Mock data generator for simulation
const generateMockID = () => {
    const isUnderage = Math.random() < 0.15;
    const age = isUnderage ? Math.floor(Math.random() * (20 - 16 + 1) + 16) : Math.floor(Math.random() * (65 - 21 + 1) + 21);
    const sex = Math.random() > 0.5 ? 'M' : 'F';
    const zip = Math.floor(Math.random() * 90000 + 10000).toString();
    let age_band = '21-25';
    if (age < 21) age_band = 'Under 21';
    else if (age > 25 && age <= 30) age_band = '26-30';
    else if (age > 30 && age <= 40) age_band = '31-40';
    else if (age > 40) age_band = '41+';
    return { age, sex, zip, age_band };
};

export default function ClicrPanel({
    clicrId,
    className,
}: {
    clicrId?: string;
    className?: string;
}) {
    const router = useRouter();
    const {
        clicrs, areas, events, venues,
        recordEvent, recordScan, recordTurnaround,
        resetCounts, endShift, isLoading, patrons, patronBans, updateClicr, debug, currentUser,
        turnarounds, activeShiftId, activeShiftAreaId,
        setPollingPaused, areaTraffic, refreshTrafficStats
    } = useApp();

    const id = clicrId;
    const rawClicr = (clicrs || []).find((c) => c.id === id);
    const lastClicrRef = useRef<any>(null);
    if (rawClicr) lastClicrRef.current = rawClicr;
    const clicr = rawClicr || lastClicrRef.current;

    // Mode: count or scan
    const [mode, setMode] = useState<Mode>('count');

    // Scan state
    const [addToCountOnAccept, setAddToCountOnAccept] = useState(true);
    const [manualScanInput, setManualScanInput] = useState('');
    const [lastScan, setLastScan] = useState<IDScanEvent | null>(null);
    const [showCameraScanner, setShowCameraScanner] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [classifyMode, setClassifyMode] = useState(false);
    const [pendingScan, setPendingScan] = useState<IDScanEvent | null>(null);

    // Hardware scanner input (keyboard wedge)
    const [scannerInput, setScannerInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Modal state
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkValue, setBulkValue] = useState(0);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [showDebug, setShowDebug] = useState(false);
    const [generatingToken, setGeneratingToken] = useState(false);

    const isModalOpenRef = useRef(false);
    useEffect(() => {
        isModalOpenRef.current = showBulkModal || showConfigModal;
    }, [showBulkModal, showConfigModal]);

    // Area + venue data
    const currentArea = (areas || []).find(a => a.id === clicr?.area_id);
    const lastOccupancyRef = useRef<number | null>(null);
    if (currentArea?.current_occupancy !== undefined) {
        lastOccupancyRef.current = currentArea.current_occupancy;
    }
    const totalAreaCount = currentArea?.current_occupancy ?? lastOccupancyRef.current ?? 0;

    const venueId = currentArea?.venue_id;
    const venueAreas = (areas || []).filter(a => a.venue_id === venueId);
    const venueDoorArea = venueAreas.find(a => a.area_type === 'VENUE_DOOR');
    const currentVenueOccupancy = venueDoorArea?.current_occupancy ?? 0;
    const isVenueDoor = currentArea?.area_type === 'VENUE_DOOR';
    const venue = (venues || []).find(v => v.id === venueId);

    const scopeKey = (venue?.business_id && venueId && clicr?.area_id)
        ? `area:${venue.business_id}:${venueId}:${clicr.area_id}`
        : null;
    const areaStats = scopeKey ? (areaTraffic || {})[scopeKey] : null;
    const globalIn = areaStats?.total_in ?? 0;
    const globalOut = areaStats?.total_out ?? 0;

    useEffect(() => {
        if (!venueId || !venue?.business_id || !clicr?.area_id) return;
        refreshTrafficStats?.(venueId, clicr.area_id);
    }, [venueId, venue?.business_id, clicr?.area_id, events]);

    // Capacity
    const capacity = currentArea?.capacity_max ?? null;
    const capacityPercent = capacity && capacity > 0
        ? Math.min(100, Math.round((totalAreaCount / capacity) * 100))
        : null;

    // Torch cleanup
    useEffect(() => {
        return () => {
            if ((window as any).localStream) {
                (window as any).localStream.getTracks().forEach((t: any) => t.stop());
            }
        };
    }, []);

    // Area shift management
    useAreaShift(currentArea);

    // Load classify mode from localStorage
    useEffect(() => {
        const saved = localStorage.getItem(`clicr_classify_mode_${id}`);
        if (saved === 'true') setClassifyMode(true);
    }, [id, clicr, showConfigModal]);

    useEffect(() => {
        if (!showConfigModal) setPollingPaused?.(false);
    }, [showConfigModal, setPollingPaused]);

    // Hardware scanner focus management
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isModalOpenRef.current) return;
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' && target !== inputRef.current) return;
            if (document.activeElement !== inputRef.current) {
                inputRef.current?.focus({ preventScroll: true });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        const timer = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    useEffect(() => {
        if (!showBulkModal && !showConfigModal) {
            const timer = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
            return () => clearTimeout(timer);
        }
    }, [showBulkModal, showConfigModal]);

    useEffect(() => {
        const handleBlur = () => {
            if (!showBulkModal && !showConfigModal) {
                setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100);
            }
        };
        const inputEl = inputRef.current;
        inputEl?.addEventListener('blur', handleBlur);
        return () => inputEl?.removeEventListener('blur', handleBlur);
    }, [showBulkModal, showConfigModal]);

    // Hardware scan debounce
    useEffect(() => {
        if (!scannerInput) return;
        const timeout = setTimeout(() => {
            if (scannerInput.length > 10) {
                try {
                    const parsed = parseAAMVA(scannerInput);
                    if (parsed.firstName || parsed.idNumber || parsed.city) {
                        processScan(parsed);
                        setScannerInput('');
                    }
                } catch { }
            }
        }, 300);
        return () => clearTimeout(timeout);
    }, [scannerInput]);

    // Config modal ref
    const configModalRef = useRef<{
        initialName: string;
        clicrId: string;
        hasTapToken: boolean;
        tapToken: string;
        initialClassifyMode: boolean;
        onSave: (name: string) => void;
        onCancel: () => void;
        onGenerateToken: () => void;
        onClassifyToggle: (newVal: boolean) => void;
        onCopy: () => void;
    } | null>(null);

    const saveConfig = async (name: string) => {
        if (clicr) {
            await updateClicr({ ...clicr, name, button_config: { ...(clicr.button_config ?? {}) } });
        }
        setShowConfigModal(false);
        setPollingPaused?.(false);
    };

    const generateTapToken = async () => {
        if (!clicr || generatingToken) return;
        setGeneratingToken(true);
        try {
            const token = Math.random().toString(36).slice(2, 10);
            await updateClicr({ ...clicr, button_config: { ...(clicr.button_config ?? {}), tap_token: token } });
        } finally {
            setGeneratingToken(false);
        }
    };

    // --- COUNT HANDLERS ---
    const handleIn = (gender: 'M' | 'F') => {
        if (!clicr || !venueId) return;
        const { maxCapacity, mode: capMode } = getVenueCapacityRules(venue);
        if (maxCapacity > 0 && currentVenueOccupancy >= maxCapacity) {
            if (capMode === 'HARD_STOP') {
                alert("CAPACITY REACHED: Entry Blocked");
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                return;
            }
            if (capMode === 'MANAGER_OVERRIDE' || capMode === 'HARD_BLOCK' as any) {
                if (!window.confirm("WARNING: Capacity Reached. Authorize Override?")) return;
            }
            if (capMode === 'WARN_ONLY') {
                if (navigator.vibrate) navigator.vibrate([50, 50, 50, 50]);
            }
        }
        if (navigator.vibrate) navigator.vibrate(50);
        recordEvent({
            venue_id: venueId,
            area_id: clicr.area_id,
            clicr_id: clicr.id,
            delta: 1,
            flow_type: 'IN',
            gender,
            event_type: 'TAP',
            idempotency_key: Math.random().toString(36),
        });
    };

    const handleOut = (gender: 'M' | 'F') => {
        if (!clicr || !venueId) return;
        if (navigator.vibrate) navigator.vibrate(50);
        recordEvent({
            venue_id: venueId,
            area_id: clicr.area_id,
            clicr_id: clicr.id,
            delta: -1,
            flow_type: 'OUT',
            gender,
            event_type: 'TAP',
            idempotency_key: Math.random().toString(36),
        });
    };

    const handleReset = async (silent = false) => {
        if (!silent && !window.confirm('Reset all counts to zero? This cannot be undone.')) return;
        if (!venueId) return;
        try {
            await resetCounts(venueId);
            setBulkValue(0);
            setLastScan(null);
            setScannerInput('');
            await refreshTrafficStats?.(venueId, clicr.area_id);
        } catch (e) {
            console.error("Reset failed", e);
            if (!silent) alert("Failed to reset. Please try again.");
        }
    };

    // --- SCAN LOGIC ---
    const processScan = async (parsed: ReturnType<typeof parseAAMVA>, rawData?: string) => {
        if (!venueId) return;

        if (rawData) {
            try {
                const res = await fetch('/api/verify-id', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        scan_data: rawData,
                        business_id: venue?.business_id,
                        venue_id: venueId,
                        area_id: clicr?.area_id,
                    }),
                });
                const json = await res.json();
                if (json.success) {
                    const { status, message, age } = json.data;
                    const scanEvent: any = {
                        venue_id: venueId,
                        scan_result: status,
                        age,
                        age_band: age >= 21 ? '21+' : 'Under 21',
                        sex: 'U',
                        zip_code: '00000',
                        uiMessage: message,
                        timestamp: Date.now(),
                    };
                    setLastScan(scanEvent);
                    if (status === 'ACCEPTED') {
                        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
                        if (addToCountOnAccept && clicr?.area_id && clicr?.id) {
                            recordEvent({
                                venue_id: venueId,
                                area_id: clicr.area_id,
                                clicr_id: clicr.id,
                                delta: 1,
                                flow_type: 'IN',
                                event_type: 'SCAN',
                                idempotency_key: Math.random().toString(36),
                            });
                        }
                    } else {
                        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                    }
                    setShowCameraScanner(false);
                    return;
                }
            } catch (e) {
                console.error("API Scan failed, falling back to local", e);
            }
        }

        const result = evaluateScan(parsed, patrons, patronBans, venueId);
        const scanEvent: Omit<IDScanEvent, 'id' | 'timestamp'> = {
            venue_id: venueId,
            scan_result: result.status === 'ACCEPTED' ? 'ACCEPTED' : 'DENIED',
            age: result.age || 0,
            age_band: result.age ? (result.age >= 21 ? '21+' : 'Under 21') : 'Unknown',
            sex: parsed.sex || 'U',
            zip_code: parsed.postalCode || '00000',
            first_name: parsed.firstName || undefined,
            last_name: parsed.lastName || undefined,
            dob: parsed.dateOfBirth || undefined,
            id_number: parsed.idNumber || undefined,
            issuing_state: parsed.state || undefined,
            address_street: parsed.addressStreet || undefined,
            city: parsed.city || undefined,
        };
        recordScan(scanEvent);
        setLastScan({ ...scanEvent, id: 'temp', timestamp: Date.now(), uiMessage: result.message } as any);

        if (result.status === 'ACCEPTED') {
            if (addToCountOnAccept) {
                if (!clicr?.area_id || !clicr?.id) return;
                recordEvent({
                    venue_id: venueId,
                    area_id: clicr.area_id,
                    clicr_id: clicr.id,
                    delta: 1,
                    flow_type: 'IN',
                    gender: parsed.sex as 'M' | 'F' | undefined,
                    event_type: 'SCAN',
                    idempotency_key: Math.random().toString(36),
                });
                if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
            } else {
                if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
            }
        } else {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
        setShowCameraScanner(false);
    };

    const handleHardwareSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!scannerInput) return;
        try {
            const parsed = parseAAMVA(scannerInput);
            processScan(parsed, scannerInput);
        } catch {
            alert("Failed to parse ID. Please try again.");
        }
        setScannerInput('');
    };

    const handleManualScanProcess = () => {
        if (!manualScanInput.trim()) return;
        try {
            const parsed = parseAAMVA(manualScanInput);
            processScan(parsed, manualScanInput);
        } catch {
            alert("Failed to parse scan data. Please check the input.");
        }
        setManualScanInput('');
    };

    const handleSimulateScan = () => {
        const mock = generateMockID();
        const fakeParsed = {
            firstName: 'Sim', lastName: 'User',
            dateOfBirth: mock.age < 21 ? '20100101' : '19900101',
            sex: mock.sex as any,
            postalCode: mock.zip,
            expirationDate: '20300101',
            age: mock.age,
            isExpired: false,
            idNumber: `SIM${Math.floor(Math.random() * 10000)}`,
            state: 'CA',
            addressStreet: null, city: null, eyeColor: null, hairColor: null, height: null, weight: null,
        };
        processScan(fakeParsed);
    };

    const handleCameraScan = (decodedText: string) => {
        try {
            const parsed = parseAAMVA(decodedText);
            processScan(parsed, decodedText);
        } catch { }
    };

    const toggleTorch = async () => {
        try {
            if (torchOn) {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
                const track = stream.getVideoTracks()[0];
                await track.applyConstraints({ advanced: [{ torch: false }] as any });
                track.stop();
                setTorchOn(false);
            } else {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
                const track = stream.getVideoTracks()[0];
                const capabilities = track.getCapabilities() as any;
                if (!capabilities.torch) {
                    alert("Flashlight not supported on this device.");
                    track.stop();
                    return;
                }
                await track.applyConstraints({ advanced: [{ torch: true }] as any });
                (window as any).localStream = stream;
                setTorchOn(true);
            }
        } catch {
            alert("Could not access flashlight.");
            setTorchOn(false);
        }
    };

    // --- LOADING / NOT FOUND ---
    if (isLoading) return (
        <div className="min-h-screen bg-[#0a0b0f] flex items-center justify-center text-slate-500 animate-pulse">
            Connecting...
        </div>
    );

    if (!clicr) return (
        <div className="min-h-screen bg-[#0a0b0f] flex flex-col items-center justify-center text-slate-400 gap-4">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            <div className="text-sm">Syncing device state...</div>
        </div>
    );

    const showOutButtons = clicr.direction_mode !== 'in_only' && clicr.flow_mode !== 'IN_ONLY';
    const debugAny = debug as any;
    // debug is boolean in store; treat any loaded, non-loading state as connected.
    // In demo mode there is no Supabase WS — show "Demo" instead of Offline.
    const isDemoMode = process.env.NEXT_PUBLIC_APP_MODE === 'demo';
    const isRealtimeConnected = isDemoMode ? false : (debugAny?.realtimeStatus === 'SUBSCRIBED' || !!debug);

    return (
        <div
            className={cn("flex flex-col min-h-screen bg-[#0a0b0f] text-white", className)}
            onClick={() => { if (!isModalOpenRef.current) inputRef.current?.focus({ preventScroll: true }); }}
        >
            {/* Hidden hardware scanner input */}
            <textarea
                ref={inputRef as any}
                value={scannerInput}
                onChange={(e) => setScannerInput(e.target.value)}
                className="opacity-0 absolute top-0 left-0 w-0 h-0 overflow-hidden pointer-events-none"
                autoComplete="off"
            />

            {/* ── TOPBAR ─────────────────────────────────────────── */}
            <header className="flex items-center px-4 pt-6 pb-3 shrink-0">
                {/* Left slot — same w-[90px] as tabs row */}
                <div className="w-[90px] flex justify-start">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors p-1 -ml-1"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span className="text-sm font-medium">Back</span>
                    </button>
                </div>

                {/* Center: Name + breadcrumb */}
                <div className="flex-1 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                        <ScanLine className="w-4 h-4 text-indigo-400 shrink-0" />
                        <h1 className="text-base font-bold text-white leading-none truncate">{clicr.name}</h1>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {currentArea?.name}{venue ? ` · ${venue.name}` : ''}
                    </p>
                </div>

                {/* Right slot — same w-[90px] as tabs row */}
                <div className="w-[90px] flex justify-end">
                    <button
                        onClick={() => {
                            setShowConfigModal(true);
                            setPollingPaused?.(true);
                            configModalRef.current = {
                                initialName: clicr.name,
                                clicrId: clicr.id,
                                hasTapToken: !!clicr.button_config?.tap_token,
                                tapToken: clicr.button_config?.tap_token ?? '',
                                initialClassifyMode: classifyMode,
                                onSave: saveConfig,
                                onCancel: () => { setShowConfigModal(false); setPollingPaused?.(false); },
                                onGenerateToken: generateTapToken,
                                onClassifyToggle: (v) => { setClassifyMode(v); localStorage.setItem(`clicr_classify_mode_${clicr.id}`, String(v)); },
                                onCopy: async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/tap/${clicr.button_config!.tap_token}`); } catch { } },
                            };
                        }}
                        className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <Settings2 className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {/* ── MODE TABS + STATUS PILLS ───────────────────────── */}
            <div className="flex items-center px-4 pb-4 shrink-0">
                {/* Left slot — fixed width, left-aligned pill */}
                <div className="w-[90px] flex justify-start">
                    <div className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap",
                        isDemoMode
                            ? "bg-slate-800/60 text-slate-400 border border-slate-700/50"
                            : isRealtimeConnected
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                : "bg-slate-800/60 text-slate-500 border border-slate-700/50"
                    )}>
                        <div className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            isDemoMode ? "bg-slate-500" : isRealtimeConnected ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                        )} />
                        {isDemoMode ? 'Demo' : isRealtimeConnected ? 'Realtime' : 'Offline'}
                    </div>
                </div>

                {/* Center: Count / Scan tabs — flex-1 + flex center keeps it always in the middle */}
                <div className="flex-1 flex justify-center">
                    <div className="flex bg-slate-900/60 border border-slate-800 rounded-full p-1 gap-1">
                        <button
                            onClick={() => setMode('count')}
                            className={cn(
                                "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all",
                                mode === 'count'
                                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                    : "text-slate-400 hover:text-white"
                            )}
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 4V20M4 12H20" />
                            </svg>
                            Count
                        </button>
                        <button
                            onClick={() => setMode('scan')}
                            className={cn(
                                "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all",
                                mode === 'scan'
                                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                    : "text-slate-400 hover:text-white"
                            )}
                        >
                            <Scan className="w-3.5 h-3.5" />
                            Scan
                        </button>
                    </div>
                </div>

                {/* Right slot — fixed width, right-aligned pill */}
                <div className="w-[90px] flex justify-end">
                    {!clicr.scan_enabled && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30 whitespace-nowrap">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                            No Scanner
                        </div>
                    )}
                </div>
            </div>

            {/* ── CONTENT ────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col px-4 pb-6 gap-4 overflow-y-auto">

                {/* ── OCCUPANCY CARD (always visible) ──────────────── */}
                <div className={cn(
                    "rounded-2xl border p-5",
                    isVenueDoor
                        ? "bg-amber-950/20 border-amber-500/20"
                        : "bg-slate-900/60 border-slate-800/60"
                )}>
                    <p className={cn(
                        "text-[10px] font-bold uppercase tracking-[0.2em] text-center mb-1",
                        isVenueDoor ? "text-amber-500" : "text-slate-500"
                    )}>
                        {isVenueDoor ? 'Venue Occupancy' : 'Occupancy'}
                    </p>

                    <div className="text-center">
                        <span className={cn(
                            "text-8xl font-bold leading-none tabular-nums",
                            isVenueDoor ? "text-amber-300" : "text-white"
                        )}>
                            {totalAreaCount}
                        </span>
                    </div>

                    <p className="text-center text-slate-500 text-sm mt-1">
                        {capacity != null
                            ? `of ${capacity} · ${capacityPercent}% Full`
                            : 'No capacity set'}
                    </p>

                    {/* Progress bar */}
                    <div className="mt-3 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        {capacity != null && (
                            <div
                                className={cn(
                                    "h-full rounded-full transition-all duration-500",
                                    capacityPercent != null && capacityPercent >= 100 ? "bg-red-500" :
                                    capacityPercent != null && capacityPercent >= 90 ? "bg-orange-500" :
                                    capacityPercent != null && capacityPercent >= 80 ? "bg-yellow-500" :
                                    isVenueDoor ? "bg-amber-500" : "bg-emerald-500"
                                )}
                                style={{ width: `${Math.min(100, capacityPercent ?? 0)}%` }}
                            />
                        )}
                    </div>

                    {/* IN / OUT stats */}
                    <div className="flex justify-center gap-8 mt-3">
                        <div className="text-center">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block">IN</span>
                            <span className="text-emerald-400 font-bold text-lg">+{globalIn}</span>
                        </div>
                        <div className="text-center">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block">OUT</span>
                            <span className="text-red-400 font-bold text-lg">-{globalOut}</span>
                        </div>
                    </div>
                </div>

                {/* ── COUNT MODE ───────────────────────────────────── */}
                {mode === 'count' && (
                    <>
                        {/* M/F Counter Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* +MALE */}
                            <button
                                onClick={() => handleIn('M')}
                                className="relative overflow-hidden bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 active:scale-[0.97] transition-all rounded-2xl border-2 border-blue-400/40 shadow-lg shadow-blue-500/20 py-8 flex flex-col items-center justify-center touch-manipulation"
                            >
                                <span className="text-4xl font-bold text-white leading-none drop-shadow">+</span>
                                <span className="text-white font-bold tracking-[0.2em] text-sm mt-1">MALE</span>
                            </button>

                            {/* +FEMALE */}
                            <button
                                onClick={() => handleIn('F')}
                                className="relative overflow-hidden bg-gradient-to-br from-pink-500 to-pink-700 hover:from-pink-400 hover:to-pink-600 active:scale-[0.97] transition-all rounded-2xl border-2 border-pink-400/40 shadow-lg shadow-pink-500/20 py-8 flex flex-col items-center justify-center touch-manipulation"
                            >
                                <span className="text-4xl font-bold text-white leading-none drop-shadow">+</span>
                                <span className="text-white font-bold tracking-[0.2em] text-sm mt-1">FEMALE</span>
                            </button>

                            {/* -MALE */}
                            {showOutButtons && (
                                <button
                                    onClick={() => handleOut('M')}
                                    className="relative overflow-hidden bg-gradient-to-br from-blue-700 to-blue-900 hover:from-blue-600 hover:to-blue-800 active:scale-[0.97] transition-all rounded-2xl border-2 border-blue-600/40 shadow-lg shadow-blue-900/20 py-5 flex items-center justify-center touch-manipulation"
                                >
                                    <span className="text-3xl font-bold text-white/80 leading-none">−</span>
                                </button>
                            )}

                            {/* -FEMALE */}
                            {showOutButtons && (
                                <button
                                    onClick={() => handleOut('F')}
                                    className="relative overflow-hidden bg-gradient-to-br from-pink-700 to-pink-900 hover:from-pink-600 hover:to-pink-800 active:scale-[0.97] transition-all rounded-2xl border-2 border-pink-600/40 shadow-lg shadow-pink-900/20 py-5 flex items-center justify-center touch-manipulation"
                                >
                                    <span className="text-3xl font-bold text-white/80 leading-none">−</span>
                                </button>
                            )}
                        </div>

                        {/* Turnaround + Reset */}
                        <div className="flex items-center justify-center gap-6 pt-1">
                            <button
                                onClick={() => {
                                    if (navigator.vibrate) navigator.vibrate(50);
                                    recordTurnaround?.(venueId || '', clicr.area_id, clicr.id, 1);
                                }}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-slate-400 hover:text-purple-300 hover:bg-purple-500/10 transition-colors text-sm font-medium"
                            >
                                <RotateCcw className="w-4 h-4" />
                                Turnaround
                            </button>
                            <div className="w-px h-4 bg-slate-800" />
                            <button
                                onClick={() => handleReset()}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors text-sm font-medium"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Reset
                            </button>
                        </div>

                        {/* End Shift */}
                        {activeShiftId && activeShiftAreaId === clicr?.area_id && (
                            <button
                                onClick={() => endShift(activeShiftId)}
                                className="w-full py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 text-sm font-bold border border-red-500/25 transition-colors"
                            >
                                End Shift
                            </button>
                        )}
                    </>
                )}

                {/* ── SCAN MODE ────────────────────────────────────── */}
                {mode === 'scan' && (
                    <>
                        {/* Scan Zone */}
                        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 min-h-[180px]">
                            <div className="w-14 h-14 rounded-xl border-2 border-slate-700 flex items-center justify-center">
                                <Scan className="w-7 h-7 text-slate-500" />
                            </div>
                            <div className="text-center">
                                <p className="text-white font-semibold">Ready to Scan</p>
                                <p className="text-slate-500 text-sm mt-0.5">Use scanner or enter data below</p>
                            </div>
                            <button
                                onClick={() => setShowCameraScanner(true)}
                                className="mt-1 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
                            >
                                Open Camera
                            </button>
                        </div>

                        {/* Manual paste input */}
                        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                Paste / Enter Scan Data
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={manualScanInput}
                                    onChange={(e) => setManualScanInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleManualScanProcess(); }}
                                    placeholder="Paste PDF-417 or ID token..."
                                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-slate-600"
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <button
                                    onClick={handleManualScanProcess}
                                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors shrink-0"
                                >
                                    Process
                                </button>
                            </div>
                        </div>

                        {/* Add to Count on Accept toggle */}
                        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl px-4 py-3.5 flex items-center justify-between">
                            <div>
                                <p className="text-white font-semibold text-sm">Add to Count on Accept</p>
                                <p className="text-slate-500 text-xs mt-0.5">Automatically adjust occupancy when ID accepted</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setAddToCountOnAccept(v => !v)}
                                className={cn(
                                    "w-12 h-7 rounded-full relative transition-colors shrink-0",
                                    addToCountOnAccept ? "bg-indigo-500" : "bg-slate-700"
                                )}
                            >
                                <div
                                    className="absolute left-1 top-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
                                    style={{ transform: addToCountOnAccept ? "translateX(20px)" : "translateX(0)" }}
                                />
                            </button>
                        </div>

                        {/* Simulate scan (dev helper) */}
                        <button
                            onClick={handleSimulateScan}
                            className="text-slate-600 hover:text-slate-400 text-xs text-center py-1 transition-colors"
                        >
                            Simulate scan
                        </button>
                    </>
                )}
            </div>

            {/* ── OVERLAYS ───────────────────────────────────────── */}

            {/* Scan result full-screen overlay */}
            <AnimatePresence>
                {lastScan && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        className="absolute inset-0 z-50"
                    >
                        <ScannerResult
                            status={
                                lastScan.scan_result === 'ACCEPTED' ? 'ALLOWED' :
                                    (lastScan as any).uiMessage?.includes('BANNED') ? 'DENIED_BANNED' :
                                        'DENIED_UNDERAGE'
                            }
                            data={{
                                name: `${lastScan.first_name || 'GUEST'} ${lastScan.last_name || ''}`,
                                age: lastScan.age || 0,
                                dob: lastScan.dob || 'Unknown',
                                exp: 'Valid',
                            }}
                            onScanNext={() => setLastScan(null)}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Camera scanner modal */}
            <AnimatePresence>
                {showCameraScanner && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-4"
                    >
                        <div className="absolute top-4 right-4 z-20">
                            <button
                                onClick={() => setShowCameraScanner(false)}
                                className="p-4 bg-slate-900 rounded-full text-white"
                            >
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>
                        <CameraScanner onScan={handleCameraScan} />
                        <div className="absolute bottom-12 text-center text-slate-500 text-sm">
                            Align ID barcode within the frame
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Config modal */}
            {showConfigModal && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6">
                    <div className="bg-[#0f1218] border border-slate-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
                        <div>
                            <h3 className="text-xl font-bold text-white">Clicr Settings</h3>
                            <p className="text-slate-500 text-sm">Customize your counter interface.</p>
                        </div>
                        <ConfigModalBody configRef={configModalRef} />
                    </div>
                </div>
            )}

            {/* Debug panel */}
            <AnimatePresence>
                {showDebug && (
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        className="fixed inset-y-0 right-0 w-80 bg-slate-950 border-l border-slate-800 p-6 z-[200] overflow-y-auto shadow-2xl"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <Bug className="w-5 h-5 text-indigo-400" />
                                Sync Debugger
                            </h3>
                            <button onClick={() => setShowDebug(false)} className="text-slate-500 hover:text-white">
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-6">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Context</label>
                                <div className="text-xs text-slate-300 font-mono bg-slate-900 p-2 rounded border border-slate-800 break-all">
                                    UID: {currentUser?.id}<br />
                                    BIZ: {venue?.business_id}<br />
                                    VEN: {venueId}<br />
                                    AREA: {clicr?.area_id}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Snapshot Truth</label>
                                <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-lg text-emerald-400 font-mono text-2xl font-bold flex items-center justify-between">
                                    {currentArea ? currentArea.current_occupancy : 'N/A'}
                                    <span className="text-[10px] text-emerald-600 uppercase">Server State</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Realtime Status</label>
                                <div className="flex items-center gap-2">
                                    <div className={cn("w-2 h-2 rounded-full", isRealtimeConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500")} />
                                    <span className="text-sm text-white font-mono">{debugAny?.realtimeStatus || 'UNKNOWN'}</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Last 5 Writes</label>
                                <div className="space-y-2">
                                    {debugAny?.lastWrites?.map((w: any, i: number) => (
                                        <div key={i} className="bg-slate-900 p-2 rounded text-[10px] font-mono border border-slate-800">
                                            <div className={cn("font-bold mb-1", w.type === 'RPC_SUCCESS' ? "text-emerald-400" : "text-red-400")}>{w.type}</div>
                                            <div className="text-slate-400 truncate">{JSON.stringify(w.payload)}</div>
                                        </div>
                                    ))}
                                    {!debugAny?.lastWrites?.length && <div className="text-xs text-slate-600 italic">No writes yet</div>}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Last 5 Events</label>
                                <div className="space-y-2">
                                    {debugAny?.lastEvents?.map((e: any, i: number) => (
                                        <div key={i} className="bg-slate-900 p-2 rounded text-[10px] font-mono border border-slate-800">
                                            <div className="text-indigo-400 font-bold mb-1">{e.eventType}</div>
                                            <div className="text-slate-400 break-all">{JSON.stringify(e.new || e.old)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}


function CameraScanner({ onScan }: { onScan: (text: string) => void }) {
    const [torch, setTorch] = useState(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [status, setStatus] = useState<'INIT' | 'SCANNING' | 'ERROR'>('INIT');

    useEffect(() => {
        const config = { fps: 10, qrbox: { width: 300, height: 200 } };
        const html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;
        const startScanner = async () => {
            try {
                await html5QrCode.start(
                    { facingMode: "environment" },
                    config,
                    (decodedText) => { onScan(decodedText); },
                    () => { }
                );
                setStatus('SCANNING');
            } catch {
                setStatus('ERROR');
            }
        };
        startScanner();
        return () => {
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().then(() => scannerRef.current?.clear());
            }
        };
    }, []);

    const toggleTorch = async () => {
        if (!scannerRef.current) return;
        try {
            await scannerRef.current.applyVideoConstraints({ advanced: [{ torch: !torch } as any] });
            setTorch(!torch);
        } catch { }
    };

    return (
        <div className="relative w-full h-[400px] bg-black">
            <div id="reader" className="w-full h-full" />
            <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10">
                <button
                    onClick={toggleTorch}
                    className={cn(
                        "p-4 rounded-full transition-all border",
                        torch
                            ? "bg-yellow-500/20 border-yellow-500 text-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.3)]"
                            : "bg-slate-900/80 border-white/10 text-white"
                    )}
                >
                    {torch ? <Zap className="w-6 h-6 fill-current" /> : <Zap className="w-6 h-6" />}
                </button>
            </div>
            {status === 'ERROR' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white p-6 text-center">
                    <p>Camera access failed. Ensure permissions are granted.</p>
                </div>
            )}
        </div>
    );
}
