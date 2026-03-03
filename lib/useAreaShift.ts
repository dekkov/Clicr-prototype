"use client";

import { useCallback, useEffect } from 'react';
import { useApp } from '@/lib/store';
import type { Area } from '@/lib/types';

/**
 * Hook that manages area-level shift logic:
 * - AUTO mode: checks every 60s if the scheduled reset time has passed
 * - MANUAL mode: exposes startShift() for the operator
 */
export function useAreaShift(area: Area | null | undefined) {
    const { startShift: storeStartShift, resetCounts, refreshTrafficStats } = useApp();

    const venueId = area?.venue_id;

    const startShift = useCallback(async (silent = false) => {
        if (!venueId || !area) return;
        if (!silent && !window.confirm('Start new shift? This resets all counts to zero.')) return;
        await storeStartShift(venueId, area.id);
        await resetCounts(venueId);
        await refreshTrafficStats?.(venueId, area.id);
    }, [venueId, area, storeStartShift, resetCounts, refreshTrafficStats]);

    const checkAutoReset = useCallback(() => {
        if (!area || area.shift_mode !== 'AUTO') return;
        if (!area.auto_reset_time || !area.auto_reset_timezone || !venueId) return;

        const now = new Date();
        const tz = area.auto_reset_timezone;
        const resetTime = area.auto_reset_time;

        const currentTimeInTZ = now.toLocaleTimeString('en-US', {
            timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
        }).replace(/^24:/, '00:');

        if (currentTimeInTZ < resetTime) return;

        const todayInTZ = now.toLocaleDateString('en-CA', { timeZone: tz });

        const lastResetTs = area.last_reset_at
            ? new Date(area.last_reset_at).getTime()
            : 0;

        if (lastResetTs > 0) {
            const lastResetDate = new Date(lastResetTs).toLocaleDateString('en-CA', { timeZone: tz });
            const lastResetTime = new Date(lastResetTs).toLocaleTimeString('en-US', {
                timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
            }).replace(/^24:/, '00:');

            if (lastResetDate === todayInTZ && lastResetTime >= resetTime) return;
        }

        startShift(true);
    }, [area, venueId, startShift]);

    useEffect(() => {
        if (!area || area.shift_mode !== 'AUTO') return;
        checkAutoReset();
        const interval = setInterval(checkAutoReset, 60_000);
        return () => clearInterval(interval);
    }, [checkAutoReset, area]);

    return { startShift };
}
