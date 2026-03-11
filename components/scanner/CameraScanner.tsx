'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { CameraOff, Loader2 } from 'lucide-react';

interface CameraScannerProps {
    active: boolean;
    onScan: (raw: string) => void;
    onError?: (message: string) => void;
}

const CONTAINER_ID = 'clicr-camera-scanner';

export function CameraScanner({ active, onScan, onError }: CameraScannerProps) {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!active) {
            const s = scannerRef.current;
            scannerRef.current = null;
            if (s?.isScanning) {
                s.stop().catch(() => {});
            }
            setStatus('idle');
            return;
        }

        setStatus('starting');
        setErrorMsg(null);

        const scanner = new Html5Qrcode(CONTAINER_ID, {
            formatsToSupport: [
                Html5QrcodeSupportedFormats.PDF_417,
                Html5QrcodeSupportedFormats.QR_CODE,
            ],
            verbose: false,
        });
        scannerRef.current = scanner;

        scanner
            .start(
                { facingMode: 'environment' },
                { fps: 15 },
                (decodedText) => {
                    onScan(decodedText);
                },
                () => {
                    // Per-frame errors are normal (no barcode in frame) — ignore
                }
            )
            .then(() => setStatus('running'))
            .catch((err: Error) => {
                const msg =
                    err.message?.includes('Permission')
                        ? 'Camera permission denied. Allow camera access and try again.'
                        : 'Could not start camera. Check permissions and try again.';
                setStatus('error');
                setErrorMsg(msg);
                onError?.(msg);
            });

        return () => {
            const s = scannerRef.current;
            scannerRef.current = null;
            if (s?.isScanning) {
                s.stop().catch(() => {});
            }
        };
    }, [active]);

    if (!active) return null;

    return (
        <div className="flex flex-col items-center gap-4 w-full">
            {status === 'starting' && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting camera...
                </div>
            )}

            {status === 'error' && (
                <div className="flex items-center gap-2 text-red-400 text-sm p-3 bg-red-500/10 rounded-xl border border-red-200 dark:border-red-500/20">
                    <CameraOff className="w-5 h-5 shrink-0" />
                    {errorMsg}
                </div>
            )}

            {/* html5-qrcode mounts into this div by ID */}
            {/* [&_input]:hidden [&_select]:hidden suppresses the file-picker html5-qrcode injects */}
            <div
                id={CONTAINER_ID}
                className="w-full max-w-sm rounded-2xl overflow-hidden border-2 border-border [&_input]:hidden [&_select]:hidden [&_img]:hidden"
            />

            {status === 'running' && (
                <p className="text-muted-foreground text-xs text-center">
                    Point camera at the PDF417 barcode on the back of the ID — hold steady
                </p>
            )}
        </div>
    );
}
