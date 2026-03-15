
import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { tokens } from '../tokens';
import { Check, X, AlertTriangle } from 'lucide-react';
import type { CounterLabel } from '@/lib/types';
import { canManageBans } from '@/lib/permissions';
import { BAN_OVERRIDE_REASONS } from '@/lib/ban-utils';

export type ScanStatus = 'ALLOWED' | 'DENIED_UNDERAGE' | 'DENIED_BANNED' | 'DENIED_EXPIRED' | 'DENIED_PAUSED' | 'PENDING';

interface ScannerResultProps {
    status: ScanStatus;
    data: {
        name: string;
        age: number;
        dob: string; // YYYY-MM-DD
        exp: string; // YYYY-MM-DD
        idLast4?: string; // Last 4 of DL/ID number
        state?: string; // Issuing state
        photoUrl?: string;
    };
    onScanNext: () => void;
    labels?: CounterLabel[];
    onLabelSelect?: (labelId: string) => void;
    banId?: string;
    enforcementEventId?: string;
    areaId?: string;
    userRole?: string;
    onOverride?: (enforcementEventId: string, areaId: string, reason: string, notes: string) => void;
}

const AUTO_DISMISS_MS = 3000;

export function ScannerResult({ status, data, onScanNext, labels, onLabelSelect, banId, enforcementEventId, areaId, userRole, onOverride }: ScannerResultProps) {
    const isAllowed = status === 'ALLOWED';
    const isPaused = status === 'DENIED_PAUSED';
    const isBanned = status === 'DENIED_BANNED';
    const hasLabels = isAllowed && labels && labels.length > 0 && onLabelSelect;
    const bgColor = isPaused
        ? '#B45309' // amber-700
        : isAllowed
            ? tokens.colors.status.allowed
            : tokens.colors.status.denied;

    // Override state
    const [showOverride, setShowOverride] = useState(false);
    const [overrideReason, setOverrideReason] = useState('');
    const [overrideNotes, setOverrideNotes] = useState('');
    const [overrideApproved, setOverrideApproved] = useState(false);
    const [overrideLoading, setOverrideLoading] = useState(false);

    const canOverride = isBanned && canManageBans(userRole as any) && !!onOverride && !!enforcementEventId && !!areaId;

    // Auto-dismiss + countdown for ALLOWED (only when no labels to pick)
    const [progress, setProgress] = useState(100);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const onScanNextRef = useRef(onScanNext);
    onScanNextRef.current = onScanNext;

    useEffect(() => {
        if (!isAllowed || hasLabels) return;
        const startTime = Date.now();
        intervalRef.current = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100);
            setProgress(remaining);
            if (remaining === 0) {
                clearInterval(intervalRef.current!);
                onScanNextRef.current();
            }
        }, 30);
        return () => clearInterval(intervalRef.current!);
    }, [isAllowed, hasLabels]);

    const config = {
        ALLOWED: { icon: Check, label: 'ALLOWED', sub: null },
        DENIED_UNDERAGE: { icon: X, label: 'DENIED', sub: 'UNDERAGE' },
        DENIED_BANNED: { icon: X, label: 'DENIED', sub: 'BANNED: REPEAT OFFENDER' },
        DENIED_EXPIRED: { icon: X, label: 'DENIED', sub: 'ID EXPIRED' },
        DENIED_PAUSED: { icon: AlertTriangle, label: 'PAUSED', sub: 'OPERATIONS PAUSED' },
        PENDING: { icon: Check, label: '...', sub: null }
    }[status] || { icon: X, label: 'ERROR', sub: null };

    const Icon = config.icon;

    const handleConfirmOverride = async () => {
        if (!enforcementEventId || !areaId || !onOverride) return;
        setOverrideLoading(true);
        try {
            await onOverride(enforcementEventId, areaId, overrideReason, overrideNotes);
            setOverrideApproved(true);
            setShowOverride(false);
        } finally {
            setOverrideLoading(false);
        }
    };

    // DENIED_PAUSED: simplified amber banner
    if (isPaused) {
        return (
            <div
                className="flex flex-col h-screen w-full relative overflow-hidden font-sans"
                style={{ backgroundColor: bgColor }}
            >
                <div className="flex-1 flex flex-col items-center justify-center p-8 pb-32 animate-in fade-in zoom-in duration-300">
                    <div className="relative flex items-center justify-center mb-6">
                        <div className="bg-white rounded-full p-6 shadow-xl relative z-10">
                            <Icon className="w-16 h-16 stroke-[3] text-amber-600" />
                        </div>
                    </div>
                    <h1 className="text-5xl font-black text-white tracking-tight uppercase drop-shadow-md">
                        {config.label}
                    </h1>
                    <p className="text-white/90 text-xl font-bold mt-2 uppercase tracking-wide bg-black/10 px-4 py-1 rounded-full">
                        {config.sub}
                    </p>
                </div>
                <div className="bg-white absolute bottom-0 left-0 right-0 rounded-t-[32px] p-8 pb-12 shadow-[0_-10px_40px_rgba(0,0,0,0.2)] animate-in slide-in-from-bottom duration-500">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">NAME</span>
                            <h2 className="text-2xl font-bold text-slate-900 leading-none">{data.name}</h2>
                        </div>
                        <div className="text-right">
                            <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">AGE</span>
                            <span className="text-2xl font-bold text-slate-900 leading-none">{data.age}</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-6 mb-8 pb-8 border-b border-slate-100">
                        <div>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">DOB</span>
                            <p className="text-lg font-mono font-medium text-slate-800 tracking-tight">{data.dob}</p>
                        </div>
                        <div>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">EXP</span>
                            <p className="text-lg font-mono font-medium text-slate-800 tracking-tight">{data.exp}</p>
                        </div>
                        <div>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">ID / DL</span>
                            <p className="text-lg font-mono font-medium text-slate-800 tracking-tight">
                                {data.idLast4 ? `••${data.idLast4}` : '—'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onScanNext}
                        className="w-full bg-[#111827] text-white font-bold text-lg py-4 rounded-xl hover:bg-slate-800 active:scale-[0.98] transition-all shadow-lg"
                    >
                        Scan Next
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="flex flex-col h-screen w-full relative overflow-hidden font-sans"
            style={{ backgroundColor: overrideApproved ? tokens.colors.status.allowed : bgColor }}
        >
            {/* Top Status Area */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 pb-32 animate-in fade-in zoom-in duration-300">

                {/* Icon with pulse rings (ALLOWED or override approved) */}
                <div className="relative flex items-center justify-center mb-6">
                    {(isAllowed || overrideApproved) && (
                        <>
                            <span
                                className="absolute inline-flex rounded-full opacity-30 animate-ping"
                                style={{
                                    width: 140,
                                    height: 140,
                                    backgroundColor: 'rgba(255,255,255,0.5)',
                                    animationDuration: '1s',
                                }}
                            />
                            <span
                                className="absolute inline-flex rounded-full opacity-20 animate-ping"
                                style={{
                                    width: 180,
                                    height: 180,
                                    backgroundColor: 'rgba(255,255,255,0.3)',
                                    animationDuration: '1s',
                                    animationDelay: '0.2s',
                                }}
                            />
                        </>
                    )}
                    <div className="bg-white rounded-full p-6 shadow-xl relative z-10">
                        <Icon
                            className={cn(
                                'w-16 h-16 stroke-[3]',
                                (isAllowed || overrideApproved) ? 'text-[#00C853]' : 'text-[#D50000]'
                            )}
                        />
                    </div>
                </div>

                <h1 className="text-5xl font-black text-white tracking-tight uppercase drop-shadow-md">
                    {overrideApproved ? 'OVERRIDE' : config.label}
                </h1>
                {(config.sub || overrideApproved) && (
                    <p className="text-white/90 text-xl font-bold mt-2 uppercase tracking-wide bg-black/10 px-4 py-1 rounded-full">
                        {overrideApproved ? 'OVERRIDE APPROVED' : config.sub}
                    </p>
                )}
            </div>

            {/* Bottom Card */}
            <div className="bg-white absolute bottom-0 left-0 right-0 rounded-t-[32px] p-8 pb-12 shadow-[0_-10px_40px_rgba(0,0,0,0.2)] animate-in slide-in-from-bottom duration-500">
                {/* Denial reason badge */}
                {!isAllowed && !overrideApproved && config.sub && (
                    <div className="mb-5 inline-flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                        <X className="w-4 h-4 text-red-500 stroke-[3]" />
                        <span className="text-sm font-black text-red-600 uppercase tracking-wide">{config.sub}</span>
                    </div>
                )}

                {/* Header Row: Name + Age */}
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">NAME</span>
                        <h2 className="text-2xl font-bold text-slate-900 leading-none">{data.name}</h2>
                    </div>
                    <div className="text-right">
                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">AGE</span>
                        <span className="text-2xl font-bold text-slate-900 leading-none">{data.age}</span>
                    </div>
                </div>

                {/* Grid: DOB + EXP + ID */}
                <div className="grid grid-cols-3 gap-6 mb-8 pb-8 border-b border-slate-100">
                    <div>
                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">DOB</span>
                        <p className="text-lg font-mono font-medium text-slate-800 tracking-tight">{data.dob}</p>
                    </div>
                    <div>
                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">EXP</span>
                        <p className="text-lg font-mono font-medium text-slate-800 tracking-tight">{data.exp}</p>
                    </div>
                    <div>
                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">ID / DL</span>
                        <p className="text-lg font-mono font-medium text-slate-800 tracking-tight">
                            {data.idLast4 ? `••${data.idLast4}` : '—'}{data.state ? ` ${data.state}` : ''}
                        </p>
                    </div>
                </div>

                {/* Action Area */}
                <div className="relative">
                    {hasLabels ? (
                        <>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3">SELECT CATEGORY</span>
                            <div className={cn(
                                "grid gap-3",
                                labels!.length <= 3 ? "grid-cols-1" : "grid-cols-2",
                                labels!.length > 6 && "max-h-48 overflow-y-auto"
                            )}>
                                {labels!.map((label, i) => {
                                    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4'];
                                    const bg = colors[i % colors.length];
                                    return (
                                        <button
                                            key={label.id}
                                            onClick={() => onLabelSelect!(label.id)}
                                            className="w-full text-white font-bold text-lg py-4 rounded-xl active:scale-[0.97] transition-all shadow-lg"
                                            style={{ backgroundColor: bg }}
                                        >
                                            {label.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div className="space-y-3">
                            {/* Override UI for DENIED_BANNED */}
                            {canOverride && !overrideApproved && (
                                <>
                                    {!showOverride ? (
                                        <button
                                            onClick={() => setShowOverride(true)}
                                            className="w-full bg-amber-500 text-white font-bold text-lg py-4 rounded-xl hover:bg-amber-400 active:scale-[0.98] transition-all shadow-lg"
                                        >
                                            Override Ban
                                        </button>
                                    ) : (
                                        <div className="space-y-3">
                                            <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">OVERRIDE REASON</span>
                                            <select
                                                value={overrideReason}
                                                onChange={e => setOverrideReason(e.target.value)}
                                                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium text-sm bg-white"
                                            >
                                                <option value="">Select a reason...</option>
                                                {BAN_OVERRIDE_REASONS.map(r => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                            </select>
                                            <textarea
                                                value={overrideNotes}
                                                onChange={e => setOverrideNotes(e.target.value)}
                                                placeholder="Notes (optional)..."
                                                rows={2}
                                                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm resize-none bg-white"
                                            />
                                            <div className="grid grid-cols-2 gap-3">
                                                <button
                                                    onClick={() => { setShowOverride(false); setOverrideReason(''); setOverrideNotes(''); }}
                                                    className="w-full bg-slate-100 text-slate-700 font-bold text-base py-3 rounded-xl hover:bg-slate-200 active:scale-[0.98] transition-all"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleConfirmOverride}
                                                    disabled={!overrideReason || overrideLoading}
                                                    className="w-full bg-green-600 text-white font-bold text-base py-3 rounded-xl hover:bg-green-500 active:scale-[0.98] transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {overrideLoading ? 'Saving...' : 'Confirm Override'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            <button
                                onClick={onScanNext}
                                className="w-full bg-[#111827] text-white font-bold text-lg py-4 rounded-xl hover:bg-slate-800 active:scale-[0.98] transition-all shadow-lg overflow-hidden relative"
                            >
                                {isAllowed && (
                                    <span
                                        className="absolute inset-y-0 left-0 rounded-xl transition-none"
                                        style={{
                                            width: `${progress}%`,
                                            backgroundColor: 'rgba(0,200,83,0.25)',
                                            transition: 'width 30ms linear',
                                        }}
                                    />
                                )}
                                <span className="relative z-10">Scan Next</span>
                            </button>
                            {isAllowed && !overrideApproved && (
                                <p className="text-center text-xs text-slate-400 mt-2">
                                    Auto-dismissing in {Math.ceil((progress / 100) * (AUTO_DISMISS_MS / 1000))}s
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
