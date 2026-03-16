'use client';

import { useState, useEffect } from 'react';

export type ScanMode = 'CAMERA' | 'BLUETOOTH' | 'NFC';

export interface ScanModeSupport {
    camera: boolean;
    bluetooth: boolean; // keyboard wedge always true; WebHID is bonus
    nfc: boolean;
}

function detectSupport(): ScanModeSupport {
    if (typeof window === 'undefined') {
        return { camera: false, bluetooth: false, nfc: false };
    }
    return {
        camera: !!(navigator.mediaDevices?.getUserMedia),
        bluetooth: true, // keyboard wedge works everywhere
        nfc: 'NDEFReader' in window,
    };
}

export function useScanMode(businessDefault: ScanMode = 'BLUETOOTH') {
    const [mode, setModeState] = useState<ScanMode>(businessDefault);
    const [support] = useState<ScanModeSupport>(() => detectSupport());

    useEffect(() => {
        // Restore per-session override from sessionStorage
        const stored = sessionStorage.getItem('clicr_scan_mode') as ScanMode | null;
        if (stored && ['CAMERA', 'BLUETOOTH', 'NFC'].includes(stored)) {
            setModeState(stored);
        } else {
            setModeState(businessDefault);
        }
    }, [businessDefault]);

    function setMode(newMode: ScanMode) {
        setModeState(newMode);
        sessionStorage.setItem('clicr_scan_mode', newMode);
    }

    return { mode, setMode, support };
}
