'use client';

import { useEffect, useRef, useState } from 'react';
import { Bluetooth, CheckCircle } from 'lucide-react';

interface BluetoothScannerProps {
    active: boolean;
    onScan: (raw: string) => void;
    paused?: boolean; // pause focus lock when modals are open
}

export function BluetoothScanner({ active, onScan, paused = false }: BluetoothScannerProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [buffer, setBuffer] = useState('');
    const [hidConnected, setHidConnected] = useState(false);
    const hasWebHid = typeof navigator !== 'undefined' && 'hid' in navigator;

    // Focus lock — scanner types into the hidden input
    useEffect(() => {
        if (!active || paused) return;
        const interval = setInterval(() => inputRef.current?.focus(), 800);
        return () => clearInterval(interval);
    }, [active, paused]);

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (!buffer.trim()) return;
            onScan(buffer.trim());
            setBuffer('');
        }
    }

    async function handleConnectHid() {
        try {
            const devices = await (navigator as any).hid.requestDevice({
                filters: [{ usagePage: 0x01, usage: 0x06 }], // HID keyboard usage page
            });
            if (devices?.length > 0) setHidConnected(true);
        } catch {
            // User cancelled or not supported
        }
    }

    if (!active) return null;

    return (
        <div className="flex flex-col items-center gap-4 w-full">
            {/* Invisible focus-locked input — keyboard wedge types here */}
            <input
                ref={inputRef}
                type="text"
                value={buffer}
                onChange={e => setBuffer(e.target.value)}
                onKeyDown={handleKeyDown}
                className="opacity-0 absolute top-0 left-0 h-full w-full cursor-default pointer-events-none"
                autoFocus
                autoComplete="off"
                aria-hidden="true"
            />

            <div className="flex flex-col items-center gap-3 py-8 border-4 border-dashed border-slate-700 rounded-3xl w-full bg-slate-900/20 px-6">
                <Bluetooth className="w-12 h-12 text-slate-500" />
                <p className="text-slate-400 font-bold text-lg">Waiting for Bluetooth Scanner</p>
                <p className="text-slate-600 text-sm text-center max-w-xs">
                    Scan an ID with your paired Bluetooth scanner. The scanner types directly into this page.
                </p>

                {hasWebHid && (
                    <button
                        onClick={handleConnectHid}
                        disabled={hidConnected}
                        className="mt-2 flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white disabled:opacity-50 disabled:cursor-default"
                    >
                        {hidConnected ? (
                            <>
                                <CheckCircle className="w-4 h-4 text-green-400" />
                                HID Scanner Connected
                            </>
                        ) : (
                            <>
                                <Bluetooth className="w-4 h-4" />
                                Connect via WebHID (optional)
                            </>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}
