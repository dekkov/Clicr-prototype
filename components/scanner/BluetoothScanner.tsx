'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Bluetooth } from 'lucide-react';

interface BluetoothScannerProps {
    active: boolean;
    onScan: (raw: string) => void;
    paused?: boolean; // pause focus lock when modals are open
}

export function BluetoothScanner({ active, onScan, paused = false }: BluetoothScannerProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onScanRef = useRef(onScan);
    useEffect(() => {
        onScanRef.current = onScan;
    }, [onScan]);

    // Focus lock — scanner types into the hidden textarea
    useEffect(() => {
        if (!active || paused) return;
        // Focus immediately, then maintain focus
        textareaRef.current?.focus();
        const interval = setInterval(() => textareaRef.current?.focus(), 400);
        return () => clearInterval(interval);
    }, [active, paused]);

    // Debounced scan handler — fires after 600ms of no new input
    // PDF417 data contains embedded \n and \r between fields, so we can't
    // trigger on Enter. Instead we accumulate all input and process after
    // the scanner finishes sending.
    // 600ms gives Bluetooth HID scanners enough time to transmit the full
    // PDF417 payload (~300-500 chars). 300ms caused partial reads.
    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            const trimmed = value.trim();
            if (trimmed.length > 10) {
                onScanRef.current(trimmed);
            }
            // Clear the textarea for the next scan
            if (textareaRef.current) textareaRef.current.value = '';
        }, 600);
    }, []);

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    if (!active) return null;

    return (
        <div className="flex flex-col items-center gap-4 w-full">
            {/* Invisible focus-locked textarea — keyboard wedge types here.
                Using textarea instead of input so newline characters from
                PDF417 AAMVA data are preserved (input drops them). */}
            <textarea
                ref={textareaRef}
                onChange={handleChange}
                className="opacity-0 absolute top-0 left-0 h-full w-full cursor-default pointer-events-none resize-none"
                autoComplete="off"
                inputMode="none"
                aria-hidden="true"
                tabIndex={-1}
            />

            <div className="flex flex-col items-center gap-3 py-8 border-4 border-dashed border-border rounded-3xl w-full bg-muted/20 px-6">
                <Bluetooth className="w-12 h-12 text-muted-foreground" />
                <p className="text-muted-foreground font-bold text-lg">Waiting for Bluetooth Scanner</p>
                <p className="text-muted-foreground/60 text-sm text-center max-w-xs">
                    Scan an ID with your paired Bluetooth scanner. The scanner types directly into this page.
                </p>
            </div>
        </div>
    );
}
