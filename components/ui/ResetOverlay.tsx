"use client";

import { useEffect } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export type ResetOverlayState = 'idle' | 'resetting' | 'success' | 'error';

interface ResetOverlayProps {
    state: ResetOverlayState;
    resettingMessage?: string;
    errorMessage?: string;
    onDismiss: () => void;
}

export function ResetOverlay({ state, resettingMessage, errorMessage, onDismiss }: ResetOverlayProps) {
    useEffect(() => {
        if (state !== 'success') return;
        const t = setTimeout(onDismiss, 1500);
        return () => clearTimeout(t);
    }, [state, onDismiss]);

    if (state === 'idle') return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md">
            <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-card border border-border shadow-2xl animate-fade-in max-w-sm mx-4 text-center">
                {state === 'resetting' && (
                    <>
                        <Loader2 className="w-12 h-12 text-primary animate-spin" />
                        <p className="text-lg font-bold text-foreground">Resetting data...</p>
                        <p className="text-sm text-muted-foreground">{resettingMessage ?? 'Saving summary and zeroing all counts.'}</p>
                    </>
                )}
                {state === 'success' && (
                    <>
                        <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                        <p className="text-lg font-bold text-foreground">Reset complete</p>
                    </>
                )}
                {state === 'error' && (
                    <>
                        <AlertCircle className="w-12 h-12 text-red-500" />
                        <p className="text-lg font-bold text-foreground">Reset failed</p>
                        <p className="text-sm text-muted-foreground">{errorMessage || 'Something went wrong.'}</p>
                        <button onClick={onDismiss} className="mt-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium text-foreground transition-colors">
                            Dismiss
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
