"use client";

import { useEffect, useRef, useCallback } from 'react';
import { getBusinessDayStart, getNextResetTime } from './business-day';

/** Pure function: should a scheduled reset fire right now? */
export function shouldResetNow(
    now: Date, lastResetAt: string | undefined,
    resetTime: string, timezone: string,
): boolean {
    const businessDayStart = getBusinessDayStart(now, resetTime, timezone);
    if (now < businessDayStart) return false;
    if (!lastResetAt) return true;
    return new Date(lastResetAt) < businessDayStart;
}

interface UseAutoResetOptions {
    resetRule: 'MANUAL' | 'SCHEDULED';
    resetTime: string;
    timezone: string;
    lastResetAt?: string;
    onReset: () => Promise<void>;
}

export function useAutoReset({
    resetRule, resetTime, timezone, lastResetAt, onReset,
}: UseAutoResetOptions) {
    const firedRef = useRef(false);
    const lastResetAtRef = useRef(lastResetAt);
    lastResetAtRef.current = lastResetAt;

    const tryReset = useCallback(async () => {
        if (firedRef.current) return;
        if (resetRule !== 'SCHEDULED') return;

        const now = new Date();
        if (!shouldResetNow(now, lastResetAtRef.current, resetTime, timezone)) return;

        // Re-fetch business.last_reset_at from server to prevent multi-tab races
        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'POLL' }),
            });
            if (res.ok) {
                const data = await res.json();
                const freshLastReset = data.business?.last_reset_at;
                if (freshLastReset && !shouldResetNow(now, freshLastReset, resetTime, timezone)) {
                    lastResetAtRef.current = freshLastReset;
                    return; // Another tab already reset
                }
            }
        } catch {
            // Network error — proceed with local check
        }

        firedRef.current = true;
        await onReset();
    }, [resetRule, resetTime, timezone, onReset]);

    useEffect(() => {
        if (resetRule !== 'SCHEDULED') return;
        firedRef.current = false;

        tryReset(); // Check immediately

        const now = new Date();
        const nextReset = getNextResetTime(now, resetTime, timezone);
        const msUntilReset = nextReset.getTime() - now.getTime();
        const timeout = setTimeout(() => {
            firedRef.current = false;
            tryReset();
        }, msUntilReset);

        const interval = setInterval(() => {
            firedRef.current = false;
            tryReset();
        }, 60_000);

        return () => { clearTimeout(timeout); clearInterval(interval); };
    }, [resetRule, resetTime, timezone, tryReset]);
}
