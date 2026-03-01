'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

type DeviceInfo = {
    name: string;
    direction_mode: 'in_only' | 'out_only' | 'bidirectional';
};

type TapState = 'idle' | 'loading' | 'success_in' | 'success_out' | 'error';

export default function TapPage() {
    const { token } = useParams<{ token: string }>();
    const [device, setDevice] = useState<DeviceInfo | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [tapState, setTapState] = useState<TapState>('idle');

    useEffect(() => {
        fetch(`/api/tap/${token}`)
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then((d: DeviceInfo) => setDevice(d))
            .catch(() => setNotFound(true));
    }, [token]);

    const tap = async (direction: 'IN' | 'OUT') => {
        setTapState('loading');
        try {
            const res = await fetch(`/api/tap/${token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ direction }),
            });
            if (!res.ok) throw new Error();
            setTapState(direction === 'IN' ? 'success_in' : 'success_out');
            setTimeout(() => setTapState('idle'), 1200);
        } catch {
            setTapState('error');
            setTimeout(() => setTapState('idle'), 2000);
        }
    };

    if (notFound) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-6">
                <div className="text-center space-y-3">
                    <p className="text-2xl font-bold text-white">Link not found</p>
                    <p className="text-slate-500 text-sm">This link may have been regenerated or is invalid.</p>
                </div>
            </div>
        );
    }

    if (!device) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
        );
    }

    const showIn = device.direction_mode !== 'out_only';
    const showOut = device.direction_mode !== 'in_only';
    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 gap-6">
            <div className="text-center">
                <p className="text-slate-500 text-xs uppercase tracking-widest font-bold mb-1">Counter</p>
                <h1 className="text-2xl font-bold text-white">{device.name}</h1>
            </div>

            {tapState === 'error' && (
                <p className="text-red-400 text-sm font-semibold">Something went wrong. Try again.</p>
            )}

            <div className="w-full max-w-xs space-y-4">
                {showIn && (
                    <button
                        onClick={() => tap('IN')}
                        disabled={tapState !== 'idle'}
                        className="w-full py-8 rounded-3xl bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white text-2xl font-black tracking-wide transition-all shadow-xl"
                    >
                        {tapState === 'success_in' ? '✓ Checked In' : 'GUEST IN'}
                    </button>
                )}
                {showOut && (
                    <button
                        onClick={() => tap('OUT')}
                        disabled={tapState !== 'idle'}
                        className="w-full py-8 rounded-3xl bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 text-white text-2xl font-black tracking-wide transition-all shadow-xl"
                    >
                        {tapState === 'success_out' ? '✓ Checked Out' : 'GUEST OUT'}
                    </button>
                )}
            </div>
        </div>
    );
}
