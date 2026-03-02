"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';

import { useApp } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings2, Plus, Minus, XCircle, Check, Zap, Bug, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IDScanEvent } from '@/lib/types';
import { parseAAMVA } from '@/lib/aamva';
import { evaluateScan } from '@/lib/scan-service';
import { Html5Qrcode } from 'html5-qrcode';
import { getVenueCapacityRules } from '@/lib/capacity';
import { tokens } from '@/lib/ui/tokens';
import { MetricCard, ActionButton, OccupancyDisplay } from '@/lib/ui/components/ClicrComponents';
import { ScannerResult, ScanStatus } from '@/lib/ui/components/ScannerResult';
import { METRICS } from '@/lib/core/metrics';
import { getTodayWindow } from '@/lib/core/time';

// Mock data generator for simulation
const generateMockID = () => {
    const isUnderage = Math.random() < 0.15; // 15% chance of underage
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
    clicrId?: string,
    className?: string,
}) {
    const {
        clicrs, areas, events, venues,
        recordEvent, recordScan, recordTurnaround,
        resetCounts, isLoading, patrons, patronBans, updateClicr, debug, currentUser,
        turnarounds, trafficSessionStart
    } = useApp();

    const id = clicrId;
    const rawClicr = (clicrs || []).find((c) => c.id === id);
    const lastClicrRef = useRef<any>(null);
    if (rawClicr) lastClicrRef.current = rawClicr;
    const clicr = rawClicr || lastClicrRef.current;
    const [showCameraScanner, setShowCameraScanner] = useState(false);

    // Flashlight State (Moved to top to avoid Hook Rule violation)
    const [torchOn, setTorchOn] = useState(false);

    // cleanup torch on unmount
    useEffect(() => {
        return () => {
            if ((window as any).localStream) {
                (window as any).localStream.getTracks().forEach((t: any) => t.stop());
            }
        };
    }, []);

    // Calculate total area occupancy from SNAPSHOT (Source of Truth)
    const currentArea = (areas || []).find(a => a.id === clicr?.area_id);
    const lastOccupancyRef = useRef<number | null>(null);

    if (currentArea?.current_occupancy !== undefined) {
        lastOccupancyRef.current = currentArea.current_occupancy;
    }

    // Prevents flash to 0 if data momentarily disappears during sync
    const totalAreaCount = currentArea?.current_occupancy ?? lastOccupancyRef.current;

    // Calculate aggregated stats for the ENTIRE VENUE from SNAPSHOTS
    const venueId = currentArea?.venue_id;

    // Venue Occupancy = Sum of all areas in venue (Realtime)
    const venueAreas = (areas || []).filter(a => a.venue_id === venueId);
    const currentVenueOccupancy = venueAreas.reduce((acc, a) => acc + (a.current_occupancy || 0), 0);
    const venue = (venues || []).find(v => v.id === venueId);

    // Keep event-based stats for "Session" view if needed, but rely on snapshots for enforcement
    const venueEvents = (events || []).filter(e => e.venue_id === venueId);

    /**
     * TRAFFIC STATS (IN / OUT)
     * - Source: occupancy_events (via RPC)
     * - Scope: Filtered by Area if device is assigned, else Venue.
     */
    const { areaTraffic, refreshTrafficStats } = useApp();
    const scopeKey = (venue?.business_id && venueId && clicr?.area_id)
        ? `area:${venue.business_id}:${venueId}:${clicr.area_id}`
        : null;

    // Subscribe to store updates
    const areaStats = scopeKey ? (areaTraffic || {})[scopeKey] : null;

    useEffect(() => {
        if (!venueId || !venue?.business_id || !clicr?.area_id) return;

        // Fetch on mount and whenever events change (e.g. from tap route or polling)
        refreshTrafficStats?.(venueId, clicr.area_id);
    }, [venueId, venue?.business_id, clicr?.area_id, events]); // Re-run when events update

    const globalIn = areaStats?.total_in;
    const globalOut = areaStats?.total_out;

    // DEBUG PANEL STATE
    const [showDebug, setShowDebug] = useState(false);

    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkValue, setBulkValue] = useState(0);

    const [showConfigModal, setShowConfigModal] = useState(false);

    // --- GUEST IN MODAL ---
    const [showGuestInModal, setShowGuestInModal] = useState(false);
    const [guestDraft, setGuestDraft] = useState<{
        name: string;
        dob: string;
        gender: 'M' | 'F' | 'OTHER' | 'DECLINE' | null;
    }>({ name: '', dob: '', gender: null });

    // Classification Mode State
    const [classifyMode, setClassifyMode] = useState(false);
    const [showScanBreakdown, setShowScanBreakdown] = useState(false);
    const [pendingScan, setPendingScan] = useState<IDScanEvent | null>(null);

    // Scanner State
    const [lastScan, setLastScan] = useState<IDScanEvent | null>(null);
    const [scannerInput, setScannerInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Track modal state via ref to avoid listener re-binding
    const isModalOpenRef = useRef(false);
    useEffect(() => {
        isModalOpenRef.current = showBulkModal || showConfigModal || showGuestInModal;
    }, [showBulkModal, showConfigModal, showGuestInModal]);

    // Force focus when modals close
    useEffect(() => {
        if (!showBulkModal && !showConfigModal && !showGuestInModal) {
            const timer = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
            return () => clearTimeout(timer);
        }
    }, [showBulkModal, showConfigModal, showGuestInModal]);

    // Focus management for hardware scanner
    useEffect(() => {
        // Global keydown listener to catch hardware scans even if focus is lost
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check ref to see if we should ignore (modal open)
            if (isModalOpenRef.current) return;

            // Ignore if user is typing in a real input field (like bulk modal)
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' && target !== inputRef.current) return;

            // If input is not focused, refocus it and append the key
            if (document.activeElement !== inputRef.current) {
                inputRef.current?.focus({ preventScroll: true });
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        // Initial focus
        const timer = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('keydown', handleKeyDown);
        };

    }, []); // Run once on mount! Stable listener.

    useEffect(() => {
        const handleBlur = () => {
            if (!showBulkModal && !showConfigModal && !showGuestInModal) {
                setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100);
            }
        };
        const inputEl = inputRef.current;
        inputEl?.addEventListener('blur', handleBlur);
        return () => inputEl?.removeEventListener('blur', handleBlur);
    }, [showBulkModal, showConfigModal, showGuestInModal]);


    const [editName, setEditName] = useState('');
    const [generatingToken, setGeneratingToken] = useState(false);
    const [copied, setCopied] = useState(false);

    const TIMEZONES = [
        { value: 'America/New_York', label: 'Eastern (ET)' },
        { value: 'America/Chicago', label: 'Central (CT)' },
        { value: 'America/Denver', label: 'Mountain (MT)' },
        { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
        { value: 'America/Phoenix', label: 'Arizona (no DST)' },
        { value: 'America/Anchorage', label: 'Alaska (AKT)' },
        { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
        { value: 'Europe/London', label: 'London (GMT/BST)' },
        { value: 'Europe/Paris', label: 'Paris / Berlin (CET)' },
        { value: 'Asia/Dubai', label: 'Dubai (GST)' },
        { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
        { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
        { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
        { value: 'UTC', label: 'UTC' },
    ];

    const [autoReset, setAutoReset] = useState<{ enabled: boolean; time: string; timezone: string }>({
        enabled: false,
        time: '09:00',
        timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } })(),
    });

    // Auto-reset: check if the scheduled reset time has passed and we haven't reset yet today.
    // Uses the server-authoritative last_reset_at from the area (survives page refresh),
    // falling back to trafficSessionStart for backwards compatibility.
    const checkAutoReset = useCallback(() => {
        if (!autoReset.enabled || !venueId || !clicr?.area_id) return;

        const now = new Date();
        const currentTimeInTZ = now.toLocaleTimeString('en-US', {
            timeZone: autoReset.timezone, hour: '2-digit', minute: '2-digit', hour12: false
        }).replace(/^24:/, '00:');

        if (currentTimeInTZ < autoReset.time) return;

        const todayInTZ = now.toLocaleDateString('en-CA', { timeZone: autoReset.timezone });

        const lastResetSource = currentArea?.last_reset_at
            ? new Date(currentArea.last_reset_at).getTime()
            : trafficSessionStart;
        const lastResetDate = new Date(lastResetSource).toLocaleDateString('en-CA', { timeZone: autoReset.timezone });
        const lastResetTime = new Date(lastResetSource).toLocaleTimeString('en-US', {
            timeZone: autoReset.timezone, hour: '2-digit', minute: '2-digit', hour12: false
        }).replace(/^24:/, '00:');

        if (lastResetDate === todayInTZ && lastResetTime >= autoReset.time) return;

        handleReset(true);
    }, [autoReset, venueId, clicr?.area_id, currentArea?.last_reset_at, trafficSessionStart]);

    useEffect(() => {
        checkAutoReset();
        const interval = setInterval(checkAutoReset, 60_000); // check every minute
        return () => clearInterval(interval);
    }, [checkAutoReset]);

    // Load from local storage or Server on mount/update
    useEffect(() => {
        // Load Classify Mode
        const savedClassify = localStorage.getItem(`clicr_classify_mode_${id}`);
        if (savedClassify === 'true') {
            setClassifyMode(true);
        }

        // Load Auto-Reset config — skip while settings modal is open so polling
        // doesn't overwrite the operator's in-progress edits.
        if (!showConfigModal && clicr?.button_config?.auto_reset) {
            setAutoReset(clicr.button_config.auto_reset);
        }
    }, [id, clicr, showConfigModal]);

    const saveConfig = async (name: string) => {
        if (clicr) {
            await updateClicr({
                ...clicr,
                name: name,
                button_config: { ...(clicr.button_config ?? {}), auto_reset: autoReset }
            });
        }
        setShowConfigModal(false);
    };

    const generateTapToken = async () => {
        if (!clicr || generatingToken) return;
        setGeneratingToken(true);
        try {
            const token = Math.random().toString(36).slice(2, 10);
            await updateClicr({
                ...clicr,
                button_config: { ...(clicr.button_config ?? {}), tap_token: token },
            });
        } finally {
            setGeneratingToken(false);
        }
    };

    // ...

    // if (isLoading) return <div className="p-8 text-white">Connecting...</div>;
    // if (!clicr) return <div className="p-8 text-white">Clicr not found</div>;

    const handleBulkSubmit = () => {
        if (!clicr || !venueId) return;
        if (bulkValue !== 0) {
            recordEvent({
                venue_id: venueId,
                area_id: clicr.area_id,
                clicr_id: clicr.id,
                delta: bulkValue,
                // Always attribute corrections to 'IN' flow as requested
                flow_type: 'IN',
                event_type: 'BULK',
                idempotency_key: Math.random().toString(36)
            });
            setBulkValue(0);
            setShowBulkModal(false);
        }
    };

    const handleGuestIn = () => {
        if (!clicr || !venueId) return;

        // Capacity enforcement
        const { maxCapacity: maxCap, mode } = getVenueCapacityRules(venue);
        if (maxCap > 0 && currentVenueOccupancy >= maxCap) {
            if (mode === 'HARD_STOP') {
                alert("CAPACITY REACHED: Entry Blocked (Hard Stop Active)");
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                return;
            }
            if (mode === 'MANAGER_OVERRIDE' || mode === 'HARD_BLOCK' as any) {
                if (!window.confirm("WARNING: Capacity Reached. Authorize Override?")) return;
            }
            if (mode === 'WARN_ONLY') {
                if (navigator.vibrate) navigator.vibrate([50, 50, 50, 50]);
            }
        }

        if (navigator.vibrate) navigator.vibrate(50);

        // Parse name into first/last
        const nameTrimmed = guestDraft.name.trim();
        const spaceIdx = nameTrimmed.indexOf(' ');
        const firstName = spaceIdx >= 0 ? nameTrimmed.slice(0, spaceIdx) : nameTrimmed;
        const lastName = spaceIdx >= 0 ? nameTrimmed.slice(spaceIdx + 1) : undefined;

        // Convert YYYY-MM-DD (from date input) to YYYYMMDD
        const formattedDob = guestDraft.dob ? guestDraft.dob.replace(/-/g, '') : undefined;

        recordEvent({
            venue_id: venueId,
            area_id: clicr.area_id,
            clicr_id: clicr.id,
            delta: 1,
            flow_type: 'IN',
            gender: guestDraft.gender ?? undefined,
            first_name: firstName || undefined,
            last_name: lastName || undefined,
            dob: formattedDob,
            event_type: 'TAP',
            idempotency_key: Math.random().toString(36)
        });

        recordScan({
            venue_id: venueId,
            scan_result: 'ACCEPTED',
            age: 21,
            age_band: '21+',
            sex: guestDraft.gender === 'M' ? 'M' : guestDraft.gender === 'F' ? 'F' : 'U',
            zip_code: '00000',
            first_name: firstName || undefined,
            last_name: lastName || undefined,
            dob: formattedDob,
        });

        setGuestDraft({ name: '', dob: '', gender: null });
        setShowGuestInModal(false);
    };

    const handleGuestOut = () => {
        if (!clicr || !venueId) return;
        if (navigator.vibrate) navigator.vibrate(50);
        recordEvent({
            venue_id: venueId,
            area_id: clicr.area_id,
            clicr_id: clicr.id,
            delta: -1,
            flow_type: 'OUT',
            event_type: 'TAP',
            idempotency_key: Math.random().toString(36)
        });
    };

    // Reset Logic
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
            if (!silent) alert("Failed to reset. Please try again or check connection.");
        }
    };

    // --- ADVANCED SCANNER LOGIC ---
    // (Hooks moved to top)

    // Unified Scan Processor (The Brain)
    const processScan = async (parsed: ReturnType<typeof parseAAMVA>, rawData?: string) => {
        if (!venueId) return;
        // 1. API Verification (Preferred for Hardware Scans)
        if (rawData) {
            try {
                const res = await fetch('/api/verify-id', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        scan_data: rawData,
                        business_id: venue?.business_id,
                        venue_id: venueId,
                        area_id: clicr?.area_id
                    })
                });

                const json = await res.json();

                if (json.success) {
                    const { status, message, age, dob, name } = json.data;

                    const scanEvent: any = {
                        venue_id: venueId || '',
                        scan_result: status,
                        age: age,
                        age_band: age >= 21 ? '21+' : 'Under 21',
                        sex: 'U', // API enhancement needed for Sex if crucial
                        zip_code: '00000',
                        uiMessage: message,
                        timestamp: Date.now()
                    };

                    setLastScan(scanEvent);

                    // Haptic Feedback
                    if (status === 'ACCEPTED') {
                        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
                    } else {
                        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                    }
                    setShowCameraScanner(false);
                    return; // API handled everything
                }
            } catch (e) {
                console.error("API Scan Failed, falling back to local", e);
            }
        }

        // 2. Fallback (Simulation or API Failure or Manual Parsing)
        // We use the NEW scan-service logic here
        const result = evaluateScan(parsed, patrons, patronBans, venueId);

        // ... Local Logic (Same as before) ...
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
            city: parsed.city || undefined
        };

        recordScan(scanEvent);

        setLastScan({
            ...scanEvent,
            id: 'temp',
            timestamp: Date.now(),
            uiMessage: result.message
        } as any);

        if (result.status === 'ACCEPTED') {
            if (classifyMode) {
                setPendingScan({ ...scanEvent, id: 'temp_pending', timestamp: Date.now() } as any);
                if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
            } else {
                // Check Capacity Locally if fallback
                if (venue) {
                    const maxCap = venue.default_capacity_total || 0;
                    if (maxCap > 0 && currentVenueOccupancy >= maxCap) {
                        alert("CAPACITY REACHED");
                        return;
                    }
                }

                recordEvent({
                    venue_id: venueId,
                    area_id: clicr?.area_id || 'area_001',
                    clicr_id: clicr?.id || 'dev_001',
                    delta: 1,
                    flow_type: 'IN',
                    gender: parsed.sex || 'M',
                    event_type: 'SCAN',
                    idempotency_key: Math.random().toString(36)
                });
                if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
            }
        } else {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
        setShowCameraScanner(false);
    };

    // Hardware Scanner Input Handler (Keyboard Wedge)
    const handleHardwareSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!scannerInput) return;
        try {
            console.log("Processing Hardware Scan...");
            const parsed = parseAAMVA(scannerInput);
            processScan(parsed, scannerInput); // Pass Raw String!
        } catch (err) {
            console.error("Scan Parse Error", err);
            alert("Failed to parse ID. Please try again.");
        }
        setScannerInput('');
    };

    // Simulation Handler
    const handleSimulateScan = () => {
        // Create a random mock ID but structurally correct for parsing helper
        const mock = generateMockID();
        // Since we need ParsedID structure, let's just make a fake one compatible with logic
        const fakeParsed = {
            firstName: 'Sim',
            lastName: 'User',
            dateOfBirth: mock.age < 21 ? '20100101' : '19900101',
            sex: mock.sex as any,
            postalCode: mock.zip,
            expirationDate: '20300101',
            age: mock.age,
            isExpired: false,
            // ... fields needed for ban check logic
            idNumber: `SIM${Math.floor(Math.random() * 10000)}`,
            state: 'CA',
            addressStreet: null, city: null, eyeColor: null, hairColor: null, height: null, weight: null
        };
        processScan(fakeParsed);
    };

    const handleCameraScan = (decodedText: string) => {
        try {
            console.log("Camera Scan Success");
            const parsed = parseAAMVA(decodedText);
            processScan(parsed, decodedText);
        } catch (e) {
            console.error("Camera scan invalid data", e);
        }
    };

    // Flashlight Toggle Function
    const toggleTorch = async () => {
        try {
            if (torchOn) {
                // Turn OFF
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
                const track = stream.getVideoTracks()[0];
                await track.applyConstraints({ advanced: [{ torch: false }] as any });
                track.stop(); // Stop stream to release camera
                setTorchOn(false);
            } else {
                // Turn ON
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
                const track = stream.getVideoTracks()[0];
                // Check if torch is supported
                const capabilities = track.getCapabilities() as any;
                if (!capabilities.torch) {
                    alert("Flashlight not supported on this device.");
                    track.stop();
                    return;
                }
                await track.applyConstraints({ advanced: [{ torch: true }] as any });
                // We must keep the track alive for torch to stay on? 
                // Usually yes. We'll store it in a ref if strictly needed, but let's see if simple track active works.
                // Actually, stopping the track turns off the torch usually.
                // So we need to KEEP the stream active. 
                // But we don't want to show the video element if we just want the torch.
                // So we just hold the stream in a ref.
                (window as any).localStream = stream; // Hacky globals or just let it float? better use Ref.
                setTorchOn(true);
            }
        } catch (err) {
            console.error("Flashlight error", err);
            alert("Could not access flashlight. Ensure camera permissions are granted.");
            setTorchOn(false);
        }
    };

    // Debounce Scanner Input (Wait for scanner to finish dumping string)
    useEffect(() => {
        if (!scannerInput) return;
        const timeout = setTimeout(() => {
            if (scannerInput.length > 10) { // Minimal length check
                console.log("Processing Hardware Scan (Debounced)...");
                try {
                    const parsed = parseAAMVA(scannerInput);
                    // Only process if we actually got something useful
                    if (parsed.firstName || parsed.idNumber || parsed.city) {
                        processScan(parsed);
                        setScannerInput(''); // Clear after success
                    }
                } catch (err) {
                    // Silent fail if it's just garbage input, otherwise alert?
                    // console.warn("Parse attempt failed", err);
                }
            }
        }, 300); // 300ms wait after last character
        return () => clearTimeout(timeout);
    }, [scannerInput]);

    if (isLoading) return <div className="min-h-screen bg-black flex items-center justify-center text-slate-500 animate-pulse">Connecting...</div>;

    // Robust check: If clicr missing but we have ID, maybe wait a bit or show helpful error
    if (!clicr) {
        // Fallback: This might happen during a hard sync or if the device was just added/removed.
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center text-slate-400 gap-4">
                <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <div className="text-sm">Syncing Device State...</div>
                {/* Hidden debug info just in case */}
                <div className="hidden">ID: {id}</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[100vh] bg-black relative overflow-hidden" onClick={() => inputRef.current?.focus({ preventScroll: true })}>
            {/* Hidden Input */}
            <textarea
                ref={inputRef as any}
                value={scannerInput}
                onChange={(e) => setScannerInput(e.target.value)}
                className="opacity-0 absolute top-0 left-0 w-0 h-0 overflow-hidden pointer-events-none"
                autoComplete="off"
            />

            {/* UI LAYER - PIXEL MATCH */}
            <div className="flex flex-col h-full relative z-10">

                {/* 1. Header */}
                <header className="flex justify-between items-start pt-8 pb-4 px-6 shrink-0">
                    <div>
                        <h2 className="text-slate-500 font-bold text-[10px] uppercase tracking-[0.2em] mb-1">
                            {venue?.name || 'VENUE'}
                        </h2>
                        <div className="flex items-center gap-2">
                            <h1 className="text-white font-bold text-2xl tracking-tight">
                                {clicr.name}
                            </h1>
                            <button onClick={() => { setEditName(clicr.name); setShowConfigModal(true); }} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 active:bg-slate-700 transition-colors">
                                <Settings2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    {/* Status Dot */}
                    <div className="flex gap-4 items-center">
                        <div className={cn("w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)]",
                            isLoading ? "bg-yellow-500" : "bg-[#00C853]"
                        )} />
                    </div>
                </header>

                {/* 2. Main Occupancy */}
                <div className="flex-1 flex flex-col items-center justify-center min-h-0">
                    <OccupancyDisplay
                        count={totalAreaCount ?? 0}
                        capacity={(currentArea?.capacity_max || venue?.default_capacity_total) || undefined}
                        percent={
                            (currentArea?.capacity_max || venue?.default_capacity_total)
                                ? Math.round((totalAreaCount || 0) / (currentArea?.capacity_max || venue?.default_capacity_total || 1) * 100)
                                : undefined
                        }
                    />
                </div>

                {/* 3. Stats Row & Turnarounds */}
                <div className="flex flex-col gap-2 px-6 mb-6 shrink-0">
                    <div className="grid grid-cols-3 gap-3">
                        <MetricCard label="TOTAL IN" value={globalIn || 0} />
                        <MetricCard label="NET" value={totalAreaCount || 0} />
                        <MetricCard label="TOTAL OUT" value={globalOut || 0} />
                    </div>

                    {/* Turnaround & Adjusted Net Row (P0) */}
                    <div className="grid grid-cols-3 gap-3">
                        <button
                            onClick={() => handleReset()}
                            className="bg-slate-900/50 rounded-lg p-2 flex flex-col items-center justify-center border border-white/5 active:bg-slate-800 transition-colors gap-1"
                        >
                            <RefreshCw className="w-3 h-3 text-slate-600" />
                            <span className="text-[9px] text-slate-600 font-bold uppercase tracking-wider">Reset</span>
                        </button>
                        <div className="bg-slate-900/50 rounded-lg p-2 flex flex-col items-center justify-center border border-white/5 cursor-pointer" onClick={() => setShowScanBreakdown(!showScanBreakdown)}>
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">NET (ADJ)</span>
                            {/* Placeholder logic until store updates propagate */}
                            <span className="text-white font-mono font-bold">
                                {(totalAreaCount || 0) - ((turnarounds || []).filter((t: any) => t.area_id === clicr.area_id).reduce((a, b) => a + b.count, 0) || 0)}
                            </span>
                        </div>
                        <div className="bg-slate-900/50 rounded-lg p-2 flex flex-col items-center justify-center border border-white/5 active:bg-slate-800 transition-colors cursor-pointer"
                            onClick={() => {
                                if (navigator.vibrate) navigator.vibrate(50);
                                recordTurnaround?.(venueId || '', clicr.area_id, clicr.id, 1);
                            }}
                        >
                            <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">TURNAROUND</span>
                            <span className="text-purple-300 font-mono font-bold">+</span>
                        </div>
                    </div>

                    {/* Scan Breakdown (P0) */}
                    {showScanBreakdown && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="bg-slate-950 rounded-md border border-slate-800 p-2 text-xs text-slate-400 flex justify-between px-4 mt-1">
                            <span>Manual: <span className="text-white font-bold">--</span></span>
                            <span>Scans: <span className="text-white font-bold">--</span></span>
                            <span>Turns: <span className="text-white font-bold">{(turnarounds || []).filter((t: any) => t.area_id === clicr.area_id).reduce((a, b) => a + b.count, 0)}</span></span>
                        </motion.div>
                    )}
                </div>

                {/* 4. Action Buttons */}
                <div className="flex flex-col gap-3 px-6 pb-8 shrink-0">
                    <ActionButton
                        label="GUEST IN"
                        onClick={() => setShowGuestInModal(true)}
                        className="h-24 md:h-28 text-lg"
                        icon={<div className="mb-[-4px]"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4V20M4 12H20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></div>}
                    />

                    {/* Only show OUT if bidirectional */}
                    {(clicr.direction_mode !== 'in_only') && (
                        <ActionButton
                            label="GUEST OUT"
                            variant="out"
                            onClick={handleGuestOut}
                            className="h-24 md:h-28 text-lg bg-[#1E3A8A] hover:bg-[#1E40AF]"
                            icon={<div className="mb-[-4px]"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 12H19" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></div>}
                        />
                    )}
                </div>
            </div>

            {/* SCANNER OVERLAY (Absolute z-50) */}
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
                                    lastScan.scan_result === 'DENIED' && ((lastScan as any).uiMessage?.includes('BANNED') || (lastScan as any).reason === 'BANNED') ? 'DENIED_BANNED' :
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


            {/* CAMERA SCANNER MODAL */}
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

            {/* Bulk Modal (Reference Design Match) */}
            <AnimatePresence>
                {showBulkModal && (
                    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#0f1218] border border-slate-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl space-y-6"
                        >
                            <h3 className="text-xl font-bold text-white text-center">Adjust Counts</h3>

                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setBulkValue(v => v - 1)}
                                    className="w-12 h-12 flex items-center justify-center bg-[#1e2330] rounded-xl text-white hover:bg-[#2a3040] active:scale-95 transition-all text-xl font-medium"
                                >
                                    <Minus className="w-5 h-5" />
                                </button>

                                <div className="flex-1 bg-black border border-slate-800 rounded-xl h-12 flex items-center px-4">
                                    <input
                                        type="number"
                                        value={bulkValue}
                                        onChange={(e) => setBulkValue(parseInt(e.target.value) || 0)}
                                        className="w-full bg-transparent text-center text-xl font-bold text-white outline-none"
                                    />
                                </div>

                                <button
                                    onClick={() => setBulkValue(v => v + 1)}
                                    className="w-12 h-12 flex items-center justify-center bg-[#1e2330] rounded-xl text-white hover:bg-[#2a3040] active:scale-95 transition-all text-xl font-medium"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => { setShowBulkModal(false); setBulkValue(0); }}
                                    className="py-3 rounded-xl text-slate-400 bg-[#1e2330] hover:bg-[#2a3040] font-semibold text-sm transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleBulkSubmit}
                                    className="py-3 rounded-xl bg-[#6366f1] text-white font-semibold text-sm hover:bg-[#4f46e5] shadow-lg shadow-indigo-500/30 transition-all active:scale-95"
                                >
                                    Apply
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* GUEST IN MODAL */}
            <AnimatePresence>
                {showGuestInModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center"
                        onClick={() => {
                            setGuestDraft({ name: '', dob: '', gender: null });
                            setShowGuestInModal(false);
                        }}
                    >
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                            className="w-full max-w-lg bg-[#0f1117] rounded-t-3xl p-6 pb-10 space-y-5"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-2" />
                            <h2 className="text-white font-bold text-xl tracking-tight">Guest Check-In</h2>

                            {/* Name */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Name (optional)</label>
                                <input
                                    type="text"
                                    value={guestDraft.name}
                                    onChange={(e) => setGuestDraft(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g. John Smith"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>

                            {/* DOB */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Date of Birth (optional)</label>
                                <input
                                    type="date"
                                    value={guestDraft.dob}
                                    onChange={(e) => setGuestDraft(prev => ({ ...prev, dob: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>

                            {/* Gender */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gender (optional)</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {(['M', 'F', 'OTHER', 'DECLINE'] as const).map((g) => (
                                        <button
                                            key={g}
                                            onClick={() => setGuestDraft(prev => ({
                                                ...prev,
                                                gender: prev.gender === g ? null : g
                                            }))}
                                            className={cn(
                                                "py-3 rounded-xl text-sm font-bold transition-all border",
                                                guestDraft.gender === g
                                                    ? "bg-blue-600 border-blue-500 text-white"
                                                    : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500"
                                            )}
                                        >
                                            {g}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <button
                                    onClick={() => {
                                        setGuestDraft({ name: '', dob: '', gender: null });
                                        setShowGuestInModal(false);
                                    }}
                                    className="py-4 rounded-xl text-slate-400 bg-slate-900 hover:bg-slate-800 font-semibold text-sm transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleGuestIn}
                                    className="py-4 rounded-xl bg-white text-black font-bold text-sm hover:bg-slate-100 shadow-lg transition-all active:scale-95"
                                >
                                    Check In
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* CONFIG MODAL */}
            <AnimatePresence>
                {showConfigModal && (
                    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#0f1218] border border-slate-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
                        >
                            <div>
                                <h3 className="text-xl font-bold text-white">Clicr Settings</h3>
                                <p className="text-slate-500 text-sm">Customize your counter interface.</p>
                            </div>

                            {/* Counter Name Input */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Counter Name</label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-white transition-colors"
                                    placeholder="e.g. Main Entrance"
                                />
                            </div>

                            {/* Classify Toggle */}
                            <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-xl border border-white/5">
                                <span className="text-sm font-bold text-white">Classify Scans</span>
                                <button
                                    onClick={() => {
                                        const newVal = !classifyMode;
                                        setClassifyMode(newVal);
                                        localStorage.setItem(`clicr_classify_mode_${clicr.id}`, String(newVal));
                                    }}
                                    className={cn("w-12 h-7 rounded-full relative transition-colors",
                                        classifyMode ? "bg-emerald-500" : "bg-slate-700"
                                    )}
                                >
                                    <div className="absolute left-1 top-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform" style={{ transform: classifyMode ? "translateX(20px)" : "translateX(0px)" }} />
                                </button>
                            </div>

                            {/* Auto-Reset */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-xl border border-white/5">
                                    <div>
                                        <span className="text-sm font-bold text-white">Auto-Reset Daily</span>
                                        <p className="text-[11px] text-slate-500 mt-0.5">Resets all counts at a set time</p>
                                    </div>
                                    <button
                                        onClick={() => setAutoReset(prev => ({ ...prev, enabled: !prev.enabled }))}
                                        className={cn("w-12 h-7 rounded-full relative transition-colors shrink-0",
                                            autoReset.enabled ? "bg-amber-500" : "bg-slate-700"
                                        )}
                                    >
                                        <div className="absolute left-1 top-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
                                            style={{ transform: autoReset.enabled ? "translateX(20px)" : "translateX(0px)" }} />
                                    </button>
                                </div>

                                {autoReset.enabled && (
                                    <div className="space-y-2 pl-1" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex gap-2">
                                            <div className="flex-1 space-y-1">
                                                <label className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Time</label>
                                                <input
                                                    type="time"
                                                    value={autoReset.time}
                                                    onChange={(e) => setAutoReset(prev => ({ ...prev, time: e.target.value }))}
                                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-bold text-sm focus:outline-none focus:border-amber-500 transition-colors"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Timezone</label>
                                            <select
                                                value={autoReset.timezone}
                                                onChange={(e) => setAutoReset(prev => ({ ...prev, timezone: e.target.value }))}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-bold text-sm focus:outline-none focus:border-amber-500 transition-colors appearance-none"
                                            >
                                                {TIMEZONES.map(tz => (
                                                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Remote Tap Link */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Remote Tap Link</label>
                                {clicr.button_config?.tap_token ? (
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <input
                                                readOnly
                                                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/tap/${clicr.button_config.tap_token}`}
                                                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-400 text-xs font-mono focus:outline-none truncate"
                                            />
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await navigator.clipboard.writeText(`${window.location.origin}/tap/${clicr.button_config!.tap_token}`);
                                                        setCopied(true);
                                                        setTimeout(() => setCopied(false), 1500);
                                                    } catch {
                                                        // clipboard unavailable (HTTP context, permission denied, etc.)
                                                    }
                                                }}
                                                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors shrink-0"
                                            >
                                                {copied ? 'Copied!' : 'Copy'}
                                            </button>
                                        </div>
                                        <button
                                            onClick={generateTapToken}
                                            disabled={generatingToken}
                                            className="w-full py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-400 text-xs font-bold transition-colors disabled:opacity-50"
                                        >
                                            Regenerate Link
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={generateTapToken}
                                        disabled={generatingToken}
                                        className="w-full py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-white text-white text-xs font-bold transition-colors disabled:opacity-50"
                                    >
                                        Generate Link
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <button
                                    onClick={() => {
                                        // Just close, discard draft
                                        setShowConfigModal(false);
                                    }}
                                    className="py-3 rounded-xl text-slate-400 bg-[#1e2330] hover:bg-[#2a3040] font-semibold text-sm transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => saveConfig(editName)}
                                    className="py-3 rounded-xl bg-white text-black font-bold text-sm hover:bg-slate-200 shadow-lg transition-all active:scale-95"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* DEBUG PANEL - OWNER ONLY */}
            <AnimatePresence>
                {showDebug && (
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        className="fixed inset-y-0 right-0 w-80 bg-slate-950 border-l border-slate-800 p-6 z-[200] overflow-y-auto shadow-2xl"
                    >
                        <h3 className="text-white font-bold mb-6 flex items-center gap-2">
                            <Bug className="w-5 h-5 text-indigo-400" />
                            Sync Debugger
                        </h3>

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
                                    <div className={cn("w-2 h-2 rounded-full", debug?.realtimeStatus === 'SUBSCRIBED' ? "bg-emerald-500 animate-pulse" : "bg-amber-500")} />
                                    <span className="text-sm text-white font-mono">{debug?.realtimeStatus || 'UNKNOWN'}</span>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Last 5 Writes</label>
                                <div className="space-y-2">
                                    {debug?.lastWrites?.map((w: any, i: number) => (
                                        <div key={i} className="bg-slate-900 p-2 rounded text-[10px] font-mono border border-slate-800">
                                            <div className={cn("font-bold mb-1", w.type === 'RPC_SUCCESS' ? "text-emerald-400" : "text-red-400")}>
                                                {w.type}
                                            </div>
                                            <div className="text-slate-400 truncate">
                                                {JSON.stringify(w.payload)}
                                            </div>
                                        </div>
                                    ))}
                                    {!debug?.lastWrites?.length && <div className="text-xs text-slate-600 italic">No writes yet</div>}
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Last 5 Events</label>
                                <div className="space-y-2">
                                    {debug?.lastEvents?.map((e: any, i: number) => (
                                        <div key={i} className="bg-slate-900 p-2 rounded text-[10px] font-mono border border-slate-800">
                                            <div className="text-indigo-400 font-bold mb-1">{e.eventType}</div>
                                            <div className="text-slate-400 break-all">
                                                {JSON.stringify(e.new || e.old)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
}


function CameraScanner({ onScan }: { onScan: (text: string) => void }) {
    const [torch, setTorch] = useState(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [status, setStatus] = useState<'INIT' | 'SCANNING' | 'ERROR'>('INIT');

    useEffect(() => {
        // Init Scanner
        const config = { fps: 10, qrbox: { width: 300, height: 200 } };
        const html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;

        const startScanner = async () => {
            try {
                // PDF417 is critical for ID cards
                await html5QrCode.start(
                    { facingMode: "environment" },
                    config,
                    (decodedText) => {
                        onScan(decodedText);
                    },
                    (errorMessage) => {
                        // ignore failures, they happen on every frame
                    }
                );
                setStatus('SCANNING');
            } catch (err) {
                console.error("Camera Start Error", err);
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
            await scannerRef.current.applyVideoConstraints({
                advanced: [{ torch: !torch } as any]
            });
            setTorch(!torch);
        } catch (err) {
            console.error("Torch Error", err);
            // alert("Flashlight not available on this device."); // Optional
        }
    };

    return (
        <div className="relative w-full h-[400px] bg-black">
            {/* Scanner Box */}
            <div id="reader" className="w-full h-full" />

            {/* Overlay UI */}
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
                    <p>Camera access failed. Please ensure permissions are granted and you are on a mobile device.</p>
                </div>
            )}
        </div>
    );
}


