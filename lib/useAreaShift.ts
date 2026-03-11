"use client";

import { useCallback } from 'react';
import type { Area } from '@/lib/types';

/**
 * Stub — auto-reset logic moved to business-level (Plan 2).
 */
export function useAreaShift(_area: Area | null | undefined) {
    const startShift = useCallback(async (_silent = false) => {
        console.warn('useAreaShift.startShift is deprecated. Use business-level reset.');
    }, []);

    return { startShift };
}
