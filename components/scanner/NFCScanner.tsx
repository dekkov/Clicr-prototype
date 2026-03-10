'use client';

import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

interface NFCScannerProps {
    active: boolean;
    onScan: (raw: string) => void;
    onError?: (message: string) => void;
}

export function NFCScanner({ active, onScan, onError }: NFCScannerProps) {
    const readerRef = useRef<any>(null);
    const [status, setStatus] = useState<'idle' | 'starting' | 'listening' | 'unsupported' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const isSupported = typeof window !== 'undefined' && 'NDEFReader' in window;

    useEffect(() => {
        if (!active) {
            readerRef.current = null;
            setStatus('idle');
            return;
        }

        if (!isSupported) {
            setStatus('unsupported');
            return;
        }

        setStatus('starting');

        const reader = new (window as any).NDEFReader();
        readerRef.current = reader;

        reader
            .scan()
            .then(() => {
                setStatus('listening');
                reader.onreading = ({ message }: any) => {
                    for (const record of message.records) {
                        if (record.recordType === 'text') {
                            const decoder = new TextDecoder(record.encoding ?? 'utf-8');
                            const text = decoder.decode(record.data);
                            onScan(text);
                            return;
                        }
                        // Fallback: try to decode any data record as UTF-8
                        if (record.data) {
                            try {
                                const decoder = new TextDecoder('utf-8');
                                const text = decoder.decode(record.data);
                                if (text.trim()) onScan(text.trim());
                            } catch {
                                // Unreadable record — skip
                            }
                        }
                    }
                };
                reader.onreadingerror = () => {
                    const msg = 'NFC read error. Hold the ID closer to the device.';
                    setErrorMsg(msg);
                    onError?.(msg);
                };
            })
            .catch((err: Error) => {
                const msg =
                    err.message?.includes('Permission')
                        ? 'NFC permission denied. Allow NFC access and try again.'
                        : 'NFC is not available on this device.';
                setStatus('error');
                setErrorMsg(msg);
                onError?.(msg);
            });

        return () => {
            readerRef.current = null;
        };
    }, [active, isSupported]);

    if (!active) return null;

    return (
        <div className="flex flex-col items-center gap-4 w-full">
            {status === 'unsupported' && (
                <div className="flex flex-col items-center gap-3 py-8 border-4 border-dashed border-amber-800/40 rounded-3xl w-full bg-amber-900/10 px-6">
                    <WifiOff className="w-12 h-12 text-amber-600" />
                    <p className="text-amber-400 font-bold text-lg">NFC Not Supported</p>
                    <p className="text-amber-600/80 text-sm text-center max-w-xs">
                        Web NFC requires Chrome on Android. Switch to Camera or Bluetooth mode.
                    </p>
                </div>
            )}

            {status === 'error' && (
                <div className="flex flex-col items-center gap-3 py-8 border-4 border-dashed border-red-800/40 rounded-3xl w-full bg-red-900/10 px-6 text-center">
                    <WifiOff className="w-12 h-12 text-red-600" />
                    <p className="text-red-400 font-bold">{errorMsg}</p>
                </div>
            )}

            {(status === 'starting' || status === 'listening') && (
                <div className="flex flex-col items-center gap-3 py-8 border-4 border-dashed border-slate-700 rounded-3xl w-full bg-slate-900/20 px-6">
                    {status === 'starting' ? (
                        <Loader2 className="w-12 h-12 text-slate-500 animate-spin" />
                    ) : (
                        <Wifi className="w-12 h-12 text-blue-400 animate-pulse" />
                    )}
                    <p className="text-slate-400 font-bold text-lg">
                        {status === 'starting' ? 'Activating NFC...' : 'Hold ID to Back of Phone'}
                    </p>
                    <p className="text-slate-600 text-sm text-center max-w-xs">
                        Works with NFC-enabled passports and international IDs. US driver&apos;s licenses do not have NFC chips.
                    </p>
                </div>
            )}
        </div>
    );
}
