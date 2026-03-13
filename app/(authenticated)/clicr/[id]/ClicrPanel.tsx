"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Wifi, WifiOff, ScanLine, XCircle, Zap,
    Settings2, Bug, RotateCcw, Scan,
    Camera, Bluetooth
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { IDScanEvent, CounterLabel } from '@/lib/types';
import { parseAAMVA } from '@/lib/aamva';
import { evaluateScan } from '@/lib/scan-service';
import { getVenueCapacityRules } from '@/lib/capacity';
import { ScannerResult } from '@/lib/ui/components/ScannerResult';
import { useAreaShift } from '@/lib/useAreaShift';
import { CameraScanner, BluetoothScanner, NFCScanner } from '@/components/scanner';
import { useScanMode } from '@/lib/scanner/use-scan-mode';
import type { ScanMode } from '@/lib/scanner/use-scan-mode';

type Mode = 'count' | 'scan';

/** Isolated config modal body — receives only a ref so it never re-renders when parent updates (fixes focus loss) */
const ConfigModalBody = React.memo(function ConfigModalBody({
    configRef,
}: {
    configRef: React.MutableRefObject<{
        initialName: string;
        clicrId: string;
        initialClassifyMode: boolean;
        counterLabels: Array<{ id: string; device_id: string; label: string; position: number; color?: string | null; deleted_at?: string | null }>;
        onSave: (name: string, labels: Array<{ id: string; device_id: string; label: string; position: number; color?: string | null; deleted_at?: string | null }>) => void;
        onCancel: () => void;
        onClassifyToggle: (newVal: boolean) => void;
    } | null>;
}) {
    const snap = configRef.current;
    if (!snap) return null;
    const [name, setName] = useState(() => snap.initialName);
    const [classifyMode, setClassifyMode] = useState(() => snap.initialClassifyMode);
    const [labels, setLabels] = useState(() => snap.counterLabels.filter(l => !l.deleted_at));
    const [newLabelName, setNewLabelName] = useState('');
    const handleClassifyToggle = () => {
        const newVal = !classifyMode;
        setClassifyMode(newVal);
        snap.onClassifyToggle(newVal);
    };
    const addLabel = () => {
        if (!newLabelName.trim()) return;
        setLabels(prev => [...prev, { id: crypto.randomUUID(), device_id: snap.clicrId, label: newLabelName.trim(), position: prev.length }]);
        setNewLabelName('');
    };
    const deleteLabel = (id: string) => {
        if (labels.length <= 1) return;
        if (!window.confirm('Historical data for this label will still be visible in reports, but the counter will be removed from the clicker.')) return;
        setLabels(prev => prev.filter(l => l.id !== id).map((l, i) => ({ ...l, position: i })));
    };
    return (
        <>
            <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Counter Name</label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground font-bold focus:outline-none focus:border-foreground transition-colors"
                    placeholder="e.g. Main Entrance"
                />
            </div>
            <div className="space-y-2">
                <div className="flex justify-between items-center bg-card p-3 rounded-xl border border-border">
                    <span className="text-sm font-bold text-foreground">Classify Scans</span>
                    <button type="button" onClick={handleClassifyToggle} className={cn("w-12 h-7 rounded-full relative transition-colors", classifyMode ? "bg-emerald-500" : "bg-muted")}>
                        <div className="absolute left-1 top-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform" style={{ transform: classifyMode ? "translateX(20px)" : "translateX(0px)" }} />
                    </button>
                </div>
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Counter Labels</label>
                {labels.map(l => (
                    <div key={l.id} className="flex items-center gap-2">
                        <input value={l.label} onChange={e => setLabels(prev => prev.map(lb => lb.id === l.id ? { ...lb, label: e.target.value } : lb))}
                            className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:border-foreground" />
                        {labels.length > 1 && (
                            <button type="button" onClick={() => deleteLabel(l.id)} className="text-red-400 hover:text-red-300 p-1">
                                <XCircle className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                ))}
                <div className="flex gap-2">
                    <input value={newLabelName} onChange={e => setNewLabelName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }}
                        placeholder="Add label..." className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none" />
                    <button type="button" onClick={addLabel} disabled={!newLabelName.trim()} className="px-3 py-2 bg-card rounded-xl text-sm font-medium disabled:opacity-50">Add</button>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
                <button type="button" onClick={snap.onCancel} className="py-3 rounded-xl text-foreground/60 bg-card border border-border hover:bg-border font-semibold text-sm transition-colors">Cancel</button>
                <button type="button" onClick={() => snap.onSave(name, labels)} className="py-3 rounded-xl bg-white text-black font-bold text-sm hover:bg-muted shadow-lg transition-all active:scale-95">Save Changes</button>
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
        clicrs, areas, events, venues, business,
        recordEvent, recordScan, recordTurnaround,
        endShift, isLoading, patrons, patronBans, updateClicr, debug, currentUser,
        turnarounds, activeShiftId, activeShiftAreaId,
        setPollingPaused, activeBusiness
    } = useApp();

    const id = clicrId;
    const rawClicr = (clicrs || []).find((c) => c.id === id);
    const lastClicrRef = useRef<any>(null);
    if (rawClicr) lastClicrRef.current = rawClicr;
    const clicr = rawClicr || lastClicrRef.current;

    // If business was switched and this clicr no longer exists, redirect to the list.
    useEffect(() => {
        if (!isLoading && !rawClicr && activeBusiness) {
            router.replace('/clicr');
        }
    }, [isLoading, rawClicr, activeBusiness]);

    // Mode: count or scan
    const [mode, setMode] = useState<Mode>('count');

    // Scan input mode (Camera / Bluetooth / NFC)
    const businessScanDefault = (business?.settings?.scan_method as ScanMode | undefined) ?? 'BLUETOOTH';
    const { mode: scanInputMode, setMode: setScanInputMode, support: scanSupport } = useScanMode(businessScanDefault);

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
    // const [generatingToken, setGeneratingToken] = useState(false); // Removed: tap page deleted
    const [turnaroundFlash, setTurnaroundFlash] = useState(false);

    const isModalOpenRef = useRef(false);
    useEffect(() => {
        isModalOpenRef.current = showBulkModal || showConfigModal;
    }, [showBulkModal, showConfigModal]);

    // Area + venue data
    const isVenueCounter = clicr?.is_venue_counter === true;
    const currentArea = isVenueCounter ? undefined : (areas || []).find(a => a.id === clicr?.area_id);
    const lastOccupancyRef = useRef<number | null>(null);

    const venueId = isVenueCounter ? clicr?.venue_id : currentArea?.venue_id;
    const currentVenue = (venues || []).find(v => v.id === venueId);
    const currentVenueOccupancy = currentVenue?.current_occupancy ?? 0;

    if (isVenueCounter) {
        if (currentVenueOccupancy !== undefined) {
            lastOccupancyRef.current = currentVenueOccupancy;
        }
    } else if (currentArea?.current_occupancy !== undefined) {
        lastOccupancyRef.current = currentArea.current_occupancy;
    }
    const totalAreaCount = isVenueCounter
        ? (currentVenueOccupancy ?? lastOccupancyRef.current ?? 0)
        : (currentArea?.current_occupancy ?? lastOccupancyRef.current ?? 0);

    const venueAreas = (areas || []).filter(a => a.venue_id === venueId);
    const venue = currentVenue;

    // Compute traffic directly from events (no flash-of-0, works across tabs)
    const relevantEvents = (events || []).filter(e =>
        isVenueCounter
            ? (e.venue_id === venueId && !e.area_id && e.clicr_id === clicr?.id)
            : (e.area_id === clicr?.area_id)
    );
    const globalIn = relevantEvents.filter(e => e.delta > 0).reduce((sum, e) => sum + e.delta, 0);
    const globalOut = relevantEvents.filter(e => e.delta < 0).reduce((sum, e) => sum + Math.abs(e.delta), 0);

    const turnaroundCount = isVenueCounter
        ? (turnarounds || [])
            .filter(t => t.venue_id === venueId)
            .reduce((s, t) => s + (t.count ?? 1), 0)
        : 0;

    // Capacity
    const capacity = isVenueCounter
        ? (currentVenue?.total_capacity ?? currentVenue?.default_capacity_total ?? null)
        : (currentArea?.capacity_max ?? currentArea?.default_capacity ?? currentArea?.capacity_limit ?? null);
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
    // When Bluetooth scanner is active, it owns focus via its own focus lock
    const bluetoothActive = scanInputMode === 'BLUETOOTH' && mode === 'scan';

    useEffect(() => {
        if (bluetoothActive) return; // Let BluetoothScanner own focus
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
    }, [bluetoothActive]);

    useEffect(() => {
        if (bluetoothActive) return; // Let BluetoothScanner own focus
        if (!showBulkModal && !showConfigModal) {
            const timer = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
            return () => clearTimeout(timer);
        }
    }, [showBulkModal, showConfigModal, bluetoothActive]);

    useEffect(() => {
        if (bluetoothActive) return; // Let BluetoothScanner own focus
        const handleBlur = () => {
            if (!showBulkModal && !showConfigModal) {
                setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100);
            }
        };
        const inputEl = inputRef.current;
        inputEl?.addEventListener('blur', handleBlur);
        return () => inputEl?.removeEventListener('blur', handleBlur);
    }, [showBulkModal, showConfigModal, bluetoothActive]);

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
        initialClassifyMode: boolean;
        counterLabels: Array<{ id: string; device_id: string; label: string; position: number; color?: string | null; deleted_at?: string | null }>;
        onSave: (name: string, labels: Array<{ id: string; device_id: string; label: string; position: number; color?: string | null; deleted_at?: string | null }>) => void;
        onCancel: () => void;
        onClassifyToggle: (newVal: boolean) => void;
    } | null>(null);

    const saveConfig = async (name: string, labels: Array<{ id: string; device_id: string; label: string; position: number; color?: string | null; deleted_at?: string | null }>) => {
        if (clicr) {
            await updateClicr({ ...clicr, name, counter_labels: labels, button_config: { ...(clicr.button_config ?? {}) } });
        }
        setShowConfigModal(false);
        setPollingPaused?.(false);
    };

    // --- COUNT HANDLERS ---
    const activeLabels: CounterLabel[] = (clicr?.counter_labels ?? []).filter((l: CounterLabel) => !l.deleted_at).sort((a: CounterLabel, b: CounterLabel) => a.position - b.position);

    const handleIn = (counterLabelId: string) => {
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
            counter_label_id: counterLabelId,
            event_type: 'TAP',
            idempotency_key: Math.random().toString(36),
        });
    };

    const handleOut = (counterLabelId: string) => {
        if (!clicr || !venueId) return;
        if (navigator.vibrate) navigator.vibrate(50);
        recordEvent({
            venue_id: venueId,
            area_id: clicr.area_id,
            clicr_id: clicr.id,
            delta: -1,
            flow_type: 'OUT',
            counter_label_id: counterLabelId,
            event_type: 'TAP',
            idempotency_key: Math.random().toString(36),
        });
    };


    // --- SCAN LOGIC ---
    const processScan = async (parsed: ReturnType<typeof parseAAMVA>, rawData?: string) => {
        if (!venueId) { console.warn('[CLICR] processScan: no venueId'); return; }
        console.log('[CLICR] processScan start', { rawData: !!rawData, parsed: { firstName: parsed.firstName, age: parsed.age } });

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
                console.log('[CLICR] API response:', json);
                if (json.success) {
                    const { status, message, age } = json.data;
                    const scanEvent: Omit<IDScanEvent, 'id' | 'timestamp'> = {
                        venue_id: venueId,
                        scan_result: status,
                        age: age || parsed.age || 0,
                        age_band: (age || parsed.age || 0) >= 21 ? '21+' : 'Under 21',
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
                    setLastScan({ ...scanEvent, id: 'temp', timestamp: Date.now(), uiMessage: message } as any);
                    if (status === 'ACCEPTED') {
                        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
                        if (addToCountOnAccept && clicr?.id) {
                            const aId = isVenueCounter ? null : (clicr.area_id || null);
                            if (activeLabels.length === 0) {
                                recordEvent({
                                    venue_id: venueId,
                                    area_id: aId,
                                    clicr_id: clicr.id,
                                    delta: 1,
                                    flow_type: 'IN',
                                    event_type: 'SCAN',
                                    idempotency_key: Math.random().toString(36),
                                });
                            }
                            // If labels exist, recordEvent is deferred — ScannerResult will call onLabelSelect
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

        console.log('[CLICR] API failed or no rawData, falling back to local evaluation');
        const result = evaluateScan(parsed, patrons, patronBans, venueId);
        console.log('[CLICR] Local eval result:', result.status, result.message);
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
                if (!clicr?.id) return;
                const aId = isVenueCounter ? null : (clicr.area_id || null);
                if (activeLabels.length === 0) {
                    recordEvent({
                        venue_id: venueId,
                        area_id: aId,
                        clicr_id: clicr.id,
                        delta: 1,
                        flow_type: 'IN',
                        event_type: 'SCAN',
                        idempotency_key: Math.random().toString(36),
                    });
                }
                // If labels exist, recordEvent is deferred — ScannerResult will call onLabelSelect
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

    const handleScanLabelSelect = (labelId: string) => {
        if (!lastScan || !clicr?.id || !venueId) return;
        const aId = isVenueCounter ? null : (clicr.area_id || null);
        recordEvent({
            venue_id: venueId,
            area_id: aId,
            clicr_id: clicr.id,
            delta: 1,
            flow_type: 'IN',
            counter_label_id: labelId,
            event_type: 'SCAN',
            idempotency_key: Math.random().toString(36),
        });
        setLastScan(null);
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

    const scanProcessingRef = useRef(false);
    const handleCameraScan = async (decodedText: string) => {
        if (scanProcessingRef.current) return; // Already processing a scan
        scanProcessingRef.current = true;
        try {
            const parsed = parseAAMVA(decodedText);
            await processScan(parsed, decodedText);
        } catch (err) {
            console.error('[CLICR] Camera scan failed:', err);
        } finally {
            scanProcessingRef.current = false;
        }
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
        <div className="min-h-screen bg-background flex items-center justify-center text-foreground/50 animate-pulse">
            Connecting...
        </div>
    );

    if (!clicr) return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center text-foreground/60 gap-4">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            <div className="text-sm">Syncing device state...</div>
        </div>
    );

    const debugAny = debug as any;
    // debug is boolean in store; treat any loaded, non-loading state as connected.
    // In demo mode there is no Supabase WS — show "Demo" instead of Offline.
    const isDemoMode = process.env.NEXT_PUBLIC_APP_MODE === 'demo';
    const isRealtimeConnected = isDemoMode ? false : (debugAny?.realtimeStatus === 'SUBSCRIBED' || !!debug);

    return (
        <div
            className={cn("flex flex-col min-h-screen bg-background text-foreground", className)}
            onClick={() => { if (!isModalOpenRef.current && !bluetoothActive) inputRef.current?.focus({ preventScroll: true }); }}
        >
            {/* Hidden hardware scanner input */}
            <textarea
                ref={inputRef as any}
                value={scannerInput}
                onChange={(e) => setScannerInput(e.target.value)}
                className="opacity-0 absolute top-0 left-0 w-0 h-0 overflow-hidden pointer-events-none"
                autoComplete="off"
                inputMode="none"
            />

            {/* ── TOPBAR ─────────────────────────────────────────── */}
            <header className="flex items-center px-4 pt-6 pb-3 shrink-0">
                {/* Left slot — same w-[90px] as tabs row */}
                <div className="w-[90px] flex justify-start">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-1.5 text-foreground/60 hover:text-foreground transition-colors p-1 -ml-1"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span className="text-sm font-medium">Back</span>
                    </button>
                </div>

                {/* Center: Name + breadcrumb */}
                <div className="flex-1 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                        <ScanLine className="w-4 h-4 text-indigo-400 shrink-0" />
                        <h1 className="text-base font-bold text-foreground leading-none truncate">{clicr.name}</h1>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
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
                                initialClassifyMode: classifyMode,
                                counterLabels: clicr.counter_labels ?? [],
                                onSave: saveConfig,
                                onCancel: () => { setShowConfigModal(false); setPollingPaused?.(false); },
                                onClassifyToggle: (v) => { setClassifyMode(v); localStorage.setItem(`clicr_classify_mode_${clicr.id}`, String(v)); },
                            };
                        }}
                        className="p-1.5 text-foreground/40 hover:text-foreground/70 hover:bg-card rounded-lg transition-colors"
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
                            ? "bg-muted/60 text-muted-foreground border border-border/50"
                            : isRealtimeConnected
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-200 dark:border-emerald-500/30"
                                : "bg-muted/60 text-muted-foreground border border-border/50"
                    )}>
                        <div className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            isDemoMode ? "bg-muted-foreground" : isRealtimeConnected ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"
                        )} />
                        {isDemoMode ? 'Demo' : isRealtimeConnected ? 'Realtime' : 'Offline'}
                    </div>
                </div>

                {/* Center: Count / Scan tabs — flex-1 + flex center keeps it always in the middle */}
                <div className="flex-1 flex justify-center">
                    <div className="flex bg-card border border-border rounded-full p-1 gap-1">
                        <button
                            onClick={() => setMode('count')}
                            className={cn(
                                "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all",
                                mode === 'count'
                                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                    : "text-foreground/60 hover:text-foreground"
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
                                    : "text-foreground/60 hover:text-foreground"
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
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-200 dark:border-red-500/30 whitespace-nowrap">
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
                    "relative rounded-2xl border p-5",
                    isVenueCounter
                        ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-500/20"
                        : "bg-card border-border/60"
                )}>
                    <p className={cn(
                        "text-[10px] font-bold uppercase tracking-[0.2em] text-center mb-1",
                        isVenueCounter ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"
                    )}>
                        {isVenueCounter ? 'Venue Occupancy' : 'Occupancy'}
                    </p>

                    <div className="text-center">
                        <span className={cn(
                            "text-8xl font-bold leading-none tabular-nums",
                            isVenueCounter ? "text-amber-600 dark:text-amber-300" : "text-foreground"
                        )}>
                            {totalAreaCount}
                        </span>
                    </div>

                    <p className="text-center text-muted-foreground text-sm mt-1">
                        {capacity != null
                            ? `of ${capacity} · ${capacityPercent}% Full`
                            : 'No capacity set'}
                    </p>

                    {/* Progress bar */}
                    <div className="mt-3 h-1.5 bg-border rounded-full overflow-hidden">
                        {capacity != null && (
                            <div
                                className={cn(
                                    "h-full rounded-full transition-all duration-500",
                                    capacityPercent != null && capacityPercent >= 100 ? "bg-red-500" :
                                    capacityPercent != null && capacityPercent >= 90 ? "bg-orange-500" :
                                    capacityPercent != null && capacityPercent >= 80 ? "bg-yellow-500" :
                                    isVenueCounter ? "bg-amber-500" : "bg-emerald-500"
                                )}
                                style={{ width: `${Math.min(100, capacityPercent ?? 0)}%` }}
                            />
                        )}
                    </div>

                    {/* IN / OUT stats */}
                    <div className="flex justify-center gap-8 mt-3">
                        <div className="text-center">
                            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider block">IN</span>
                            <span className="text-emerald-400 font-bold text-lg">+{globalIn}</span>
                        </div>
                        <div className="text-center">
                            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider block">OUT</span>
                            <span className="text-red-400 font-bold text-lg">-{globalOut}</span>
                        </div>
                    </div>

                    {/* Turnaround panel — right side, venue counter only */}
                    {isVenueCounter && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5">
                            {/* Count */}
                            <div className="flex flex-col items-center">
                                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-purple-500 dark:text-purple-400">Turns</span>
                                <span className="text-3xl font-bold tabular-nums text-purple-600 dark:text-purple-300 leading-none">{turnaroundCount}</span>
                            </div>
                            {/* Button */}
                            <button
                                onClick={() => {
                                    if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
                                    setTurnaroundFlash(true);
                                    setTimeout(() => setTurnaroundFlash(false), 600);
                                    if (venueId) recordTurnaround?.(venueId, '', clicr.id, 1);
                                }}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.92] touch-manipulation border",
                                    turnaroundFlash
                                        ? "bg-purple-500/30 text-purple-600 dark:text-purple-200 border-purple-400/50 scale-[1.05]"
                                        : "bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30 hover:bg-purple-200 dark:hover:bg-purple-500/20"
                                )}
                            >
                                <RotateCcw className={cn("w-3.5 h-3.5", turnaroundFlash && "animate-spin")} />
                                Turn
                            </button>
                        </div>
                    )}
                </div>

                {/* ── COUNT MODE ───────────────────────────────────── */}
                {mode === 'count' && (
                    <>
                        {/* Dynamic Counter Label Grid */}
                        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${activeLabels.length || 1}, 1fr)` }}>
                            {/* + ROW */}
                            {activeLabels.map(label => (
                                <button
                                    key={`in-${label.id}`}
                                    onClick={() => handleIn(label.id)}
                                    className="relative overflow-hidden bg-gradient-to-br from-green-500 to-green-700 hover:from-green-400 hover:to-green-600 active:scale-[0.97] transition-all rounded-2xl border-2 border-green-400/40 shadow-lg shadow-green-500/20 py-8 flex flex-col items-center justify-center touch-manipulation"
                                >
                                    <span className="text-4xl font-bold text-foreground leading-none drop-shadow">+</span>
                                    <span className="text-foreground font-bold tracking-[0.2em] text-sm mt-1 uppercase">{label.label}</span>
                                </button>
                            ))}
                            {/* - ROW */}
                            {activeLabels.map(label => (
                                <button
                                    key={`out-${label.id}`}
                                    onClick={() => handleOut(label.id)}
                                    className="relative overflow-hidden bg-gradient-to-br from-red-500 to-red-700 hover:from-red-400 hover:to-red-600 active:scale-[0.97] transition-all rounded-2xl border-2 border-red-400/40 shadow-lg shadow-red-500/20 py-8 flex flex-col items-center justify-center touch-manipulation"
                                >
                                    <span className="text-4xl font-bold text-foreground leading-none drop-shadow">−</span>
                                    <span className="text-foreground font-bold tracking-[0.2em] text-sm mt-1 uppercase">{label.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* End Shift */}
                        {activeShiftId && activeShiftAreaId === clicr?.area_id && (
                            <button
                                onClick={() => endShift(activeShiftId)}
                                className="w-full py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 text-sm font-bold border border-red-200 dark:border-red-500/25 transition-colors"
                            >
                                End Shift
                            </button>
                        )}
                    </>
                )}

                {/* ── SCAN MODE ────────────────────────────────────── */}
                {mode === 'scan' && (
                    <>
                        {/* Scan Input Mode Selector */}
                        <div className="flex gap-1.5 bg-card border border-border/60 rounded-2xl p-2">
                            {([
                                { id: 'CAMERA' as ScanMode, label: 'Camera', Icon: Camera },
                                { id: 'BLUETOOTH' as ScanMode, label: 'Bluetooth', Icon: Bluetooth },
                                { id: 'NFC' as ScanMode, label: 'NFC', Icon: Wifi },
                            ]).map(({ id, label, Icon }) => (
                                <button
                                    key={id}
                                    onClick={() => setScanInputMode(id)}
                                    className={cn(
                                        'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all',
                                        scanInputMode === id
                                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                            : 'text-foreground/60 hover:text-foreground'
                                    )}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {label}
                                </button>
                            ))}
                        </div>

                        {/* Scanner Components */}
                        <div className="bg-card border border-border/60 rounded-2xl p-4 min-h-[180px] flex flex-col items-center justify-center">
                            <CameraScanner
                                active={scanInputMode === 'CAMERA' && mode === 'scan' && !lastScan}
                                onScan={handleCameraScan}
                            />
                            <BluetoothScanner
                                active={scanInputMode === 'BLUETOOTH' && mode === 'scan'}
                                onScan={handleCameraScan}
                            />
                            <NFCScanner
                                active={scanInputMode === 'NFC' && mode === 'scan' && !lastScan}
                                onScan={handleCameraScan}
                            />
                        </div>

                        {/* Manual paste input */}
                        <div className="bg-card border border-border/60 rounded-2xl p-4 space-y-3">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                Paste / Enter Scan Data
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={manualScanInput}
                                    onChange={(e) => setManualScanInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleManualScanProcess(); }}
                                    placeholder="Paste PDF-417 or ID token..."
                                    className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-foreground/30"
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <button
                                    onClick={handleManualScanProcess}
                                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-foreground text-sm font-semibold transition-colors shrink-0"
                                >
                                    Process
                                </button>
                            </div>
                        </div>

                        {/* Add to Count on Accept toggle */}
                        <div className="bg-card border border-border/60 rounded-2xl px-4 py-3.5 flex items-center justify-between">
                            <div>
                                <p className="text-foreground font-semibold text-sm">Add to Count on Accept</p>
                                <p className="text-muted-foreground text-xs mt-0.5">Automatically adjust occupancy when ID accepted</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setAddToCountOnAccept(v => !v)}
                                className={cn(
                                    "w-12 h-7 rounded-full relative transition-colors shrink-0",
                                    addToCountOnAccept ? "bg-indigo-500" : "bg-muted"
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
                            className="text-muted-foreground/60 hover:text-muted-foreground text-xs text-center py-1 transition-colors"
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
                        className="fixed inset-0 z-50"
                    >
                        <ScannerResult
                            status={
                                lastScan.scan_result === 'ACCEPTED' ? 'ALLOWED' :
                                    (lastScan as any).uiMessage?.includes('BANNED') ? 'DENIED_BANNED' :
                                        (lastScan as any).uiMessage?.includes('EXPIRED') ? 'DENIED_EXPIRED' :
                                            'DENIED_UNDERAGE'
                            }
                            data={{
                                name: `${lastScan.first_name || 'GUEST'} ${lastScan.last_name || ''}`,
                                age: lastScan.age || 0,
                                dob: lastScan.dob || 'Unknown',
                                exp: 'Valid',
                            }}
                            onScanNext={() => setLastScan(null)}
                            labels={addToCountOnAccept && lastScan.scan_result === 'ACCEPTED' ? activeLabels : undefined}
                            onLabelSelect={handleScanLabelSelect}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Camera scanner modal removed — camera is now inline in scan mode */}

            {/* Config modal */}
            {showConfigModal && (
                <div className="fixed inset-0 bg-background/90 backdrop-blur-md z-50 flex items-center justify-center p-6">
                    <div className="bg-card border border-border p-6 rounded-3xl w-full max-w-sm shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
                        <div>
                            <h3 className="text-xl font-bold text-foreground">Clicr Settings</h3>
                            <p className="text-muted-foreground text-sm">Customize your counter interface.</p>
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
                        className="fixed inset-y-0 right-0 w-80 bg-background border-l border-border p-6 z-[200] overflow-y-auto shadow-2xl"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-foreground font-bold flex items-center gap-2">
                                <Bug className="w-5 h-5 text-indigo-400" />
                                Sync Debugger
                            </h3>
                            <button onClick={() => setShowDebug(false)} className="text-foreground/60 hover:text-foreground">
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-6">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-muted-foreground uppercase">Context</label>
                                <div className="text-xs text-foreground/80 font-mono bg-card p-2 rounded border border-border break-all">
                                    UID: {currentUser?.id}<br />
                                    BIZ: {venue?.business_id}<br />
                                    VEN: {venueId}<br />
                                    AREA: {clicr?.area_id}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-muted-foreground uppercase">Snapshot Truth</label>
                                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/30 rounded-lg text-emerald-400 font-mono text-2xl font-bold flex items-center justify-between">
                                    {currentArea ? currentArea.current_occupancy : 'N/A'}
                                    <span className="text-[10px] text-emerald-600 uppercase">Server State</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-muted-foreground uppercase">Realtime Status</label>
                                <div className="flex items-center gap-2">
                                    <div className={cn("w-2 h-2 rounded-full", isRealtimeConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500")} />
                                    <span className="text-sm text-foreground font-mono">{debugAny?.realtimeStatus || 'UNKNOWN'}</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-muted-foreground uppercase">Last 5 Writes</label>
                                <div className="space-y-2">
                                    {debugAny?.lastWrites?.map((w: any, i: number) => (
                                        <div key={i} className="bg-card p-2 rounded text-[10px] font-mono border border-border">
                                            <div className={cn("font-bold mb-1", w.type === 'RPC_SUCCESS' ? "text-emerald-400" : "text-red-400")}>{w.type}</div>
                                            <div className="text-muted-foreground truncate">{JSON.stringify(w.payload)}</div>
                                        </div>
                                    ))}
                                    {!debugAny?.lastWrites?.length && <div className="text-xs text-muted-foreground/60 italic">No writes yet</div>}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-muted-foreground uppercase">Last 5 Events</label>
                                <div className="space-y-2">
                                    {debugAny?.lastEvents?.map((e: any, i: number) => (
                                        <div key={i} className="bg-card p-2 rounded text-[10px] font-mono border border-border">
                                            <div className="text-indigo-400 font-bold mb-1">{e.eventType}</div>
                                            <div className="text-muted-foreground break-all">{JSON.stringify(e.new || e.old)}</div>
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


