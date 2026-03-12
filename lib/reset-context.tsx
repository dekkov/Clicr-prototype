"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useApp } from './store';
import type { ResetOverlayState } from '@/components/ui/ResetOverlay';
import type { NightLog } from '@/lib/types';

interface ResetContextValue {
    overlayState: ResetOverlayState;
    resetMessage: string;
    error?: string;
    daySummary: NightLog | null;
    showSummary: boolean;
    triggerNightReset: (date?: string) => Promise<void>;
    triggerOperationalReset: () => Promise<void>;
    dismissOverlay: () => void;
    dismissSummary: () => void;
}

const ResetContext = createContext<ResetContextValue | undefined>(undefined);

export function ResetProvider({ children }: { children: ReactNode }) {
    const { resetCounts } = useApp();
    const [overlayState, setOverlayState] = useState<ResetOverlayState>('idle');
    const [resetMessage, setResetMessage] = useState('');
    const [error, setError] = useState<string>();
    const [daySummary, setDaySummary] = useState<NightLog | null>(null);
    const [showSummary, setShowSummary] = useState(false);

    const triggerNightReset = useCallback(async (date?: string) => {
        setResetMessage('Saving summary and zeroing all counts.');
        setOverlayState('resetting');
        const resetType = date ? 'NIGHT_MANUAL' : 'NIGHT_AUTO';
        const result = await resetCounts(resetType);
        if (result.success) {
            setOverlayState('success');
            if (result.nightLog) {
                setDaySummary(result.nightLog);
                // Show summary after overlay auto-dismisses (~1500ms) plus a small buffer
                setTimeout(() => {
                    setShowSummary(true);
                }, 1700);
            }
        } else {
            setError(result.error);
            setOverlayState('error');
        }
    }, [resetCounts]);

    const triggerOperationalReset = useCallback(async () => {
        setResetMessage('Zeroing all counts.');
        setOverlayState('resetting');
        const result = await resetCounts('OPERATIONAL');
        if (result.success) {
            setOverlayState('success');
        } else {
            setError(result.error);
            setOverlayState('error');
        }
    }, [resetCounts]);

    const dismissOverlay = useCallback(() => {
        setOverlayState('idle');
        setError(undefined);
    }, []);

    const dismissSummary = useCallback(() => {
        setShowSummary(false);
        setDaySummary(null);
    }, []);

    return (
        <ResetContext.Provider value={{
            overlayState, resetMessage, error, daySummary, showSummary,
            triggerNightReset, triggerOperationalReset,
            dismissOverlay, dismissSummary,
        }}>
            {children}
        </ResetContext.Provider>
    );
}

export function useReset() {
    const ctx = useContext(ResetContext);
    if (!ctx) throw new Error('useReset must be inside ResetProvider');
    return ctx;
}
