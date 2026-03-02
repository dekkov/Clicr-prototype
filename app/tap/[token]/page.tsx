'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

type DeviceInfo = {
    name: string;
    direction_mode: 'in_only' | 'out_only' | 'bidirectional';
};

type TapState = 'idle' | 'loading' | 'success_in' | 'success_out' | 'error';
type GuestDraft = { name: string; dob: string; gender: 'M' | 'F' | 'OTHER' | 'DECLINE' | null };

export default function TapPage() {
    const { token } = useParams<{ token: string }>();
    const [device, setDevice] = useState<DeviceInfo | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [tapState, setTapState] = useState<TapState>('idle');
    const [showModal, setShowModal] = useState(false);
    const [draft, setDraft] = useState<GuestDraft>({ name: '', dob: '', gender: null });

    useEffect(() => {
        fetch(`/api/tap/${token}`)
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then((d: DeviceInfo) => setDevice(d))
            .catch(() => setNotFound(true));
    }, [token]);

    const submitTap = async (direction: 'IN' | 'OUT', details?: GuestDraft) => {
        setTapState('loading');
        setShowModal(false);
        try {
            const body: Record<string, unknown> = { direction };
            if (direction === 'IN' && details && (details.name || details.dob || details.gender)) {
                body.details = {
                    name: details.name || undefined,
                    dob: details.dob || undefined,
                    gender: details.gender || undefined,
                };
            }
            const res = await fetch(`/api/tap/${token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error();
            setTapState(direction === 'IN' ? 'success_in' : 'success_out');
            setTimeout(() => { setTapState('idle'); setDraft({ name: '', dob: '', gender: null }); }, 1500);
        } catch {
            setTapState('error');
            setTimeout(() => setTapState('idle'), 2000);
        }
    };

    const handleInPress = () => {
        setDraft({ name: '', dob: '', gender: null });
        setShowModal(true);
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
        <>
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
                            onClick={handleInPress}
                            disabled={tapState !== 'idle'}
                            className="w-full py-8 rounded-3xl bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white text-2xl font-black tracking-wide transition-all shadow-xl"
                        >
                            {tapState === 'success_in' ? '✓ Checked In' : 'GUEST IN'}
                        </button>
                    )}
                    {showOut && (
                        <button
                            onClick={() => submitTap('OUT')}
                            disabled={tapState !== 'idle'}
                            className="w-full py-8 rounded-3xl bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 text-white text-2xl font-black tracking-wide transition-all shadow-xl"
                        >
                            {tapState === 'success_out' ? '✓ Checked Out' : 'GUEST OUT'}
                        </button>
                    )}
                </div>
            </div>

            {/* Client Details Bottom Sheet */}
            {showModal && (
                <div
                    className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center"
                    onClick={() => setShowModal(false)}
                >
                    <div
                        className="w-full max-w-lg bg-[#0f1117] rounded-t-3xl p-6 pb-10 space-y-5"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-2" />
                        <h2 className="text-white font-bold text-xl tracking-tight">Guest Check-In</h2>
                        <p className="text-slate-500 text-sm -mt-3">All fields are optional</p>

                        {/* Name */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Name</label>
                            <input
                                type="text"
                                value={draft.name}
                                onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
                                placeholder="e.g. John Smith"
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>

                        {/* DOB */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Date of Birth</label>
                            <input
                                type="date"
                                value={draft.dob}
                                onChange={e => setDraft(p => ({ ...p, dob: e.target.value }))}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>

                        {/* Gender */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gender</label>
                            <div className="grid grid-cols-4 gap-2">
                                {(['M', 'F', 'OTHER', 'DECLINE'] as const).map(g => (
                                    <button
                                        key={g}
                                        onClick={() => setDraft(p => ({ ...p, gender: p.gender === g ? null : g }))}
                                        className={`py-3 rounded-xl text-sm font-bold transition-all border ${
                                            draft.gender === g
                                                ? 'bg-blue-600 border-blue-500 text-white'
                                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                                        }`}
                                    >
                                        {g}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="grid grid-cols-2 gap-3 pt-1">
                            <button
                                onClick={() => submitTap('IN')}
                                className="py-4 rounded-xl text-slate-400 bg-slate-900 hover:bg-slate-800 font-semibold text-sm transition-colors"
                            >
                                Skip
                            </button>
                            <button
                                onClick={() => submitTap('IN', draft)}
                                className="py-4 rounded-xl bg-white text-black font-bold text-sm hover:bg-slate-100 shadow-lg transition-all active:scale-95"
                            >
                                Check In
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
