
import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { tokens } from '../tokens';
import { Check, X } from 'lucide-react';
import type { CounterLabel } from '@/lib/types';

export type ScanStatus = 'ALLOWED' | 'DENIED_UNDERAGE' | 'DENIED_BANNED' | 'DENIED_EXPIRED' | 'PENDING';

interface ScannerResultProps {
    status: ScanStatus;
    data: {
        name: string;
        age: number;
        dob: string; // YYYY-MM-DD
        exp: string; // YYYY-MM-DD
        photoUrl?: string;
    };
    onScanNext: () => void;
    labels?: CounterLabel[];
    onLabelSelect?: (labelId: string) => void;
}

const AUTO_DISMISS_MS = 3000;

export function ScannerResult({ status, data, onScanNext, labels, onLabelSelect }: ScannerResultProps) {
    const isAllowed = status === 'ALLOWED';
    const hasLabels = isAllowed && labels && labels.length > 0 && onLabelSelect;
    const bgColor = isAllowed ? tokens.colors.status.allowed : tokens.colors.status.denied;

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
        PENDING: { icon: Check, label: '...', sub: null }
    }[status] || { icon: X, label: 'ERROR', sub: null };

    const Icon = config.icon;

    return (
        <div
            className="flex flex-col h-screen w-full relative overflow-hidden font-sans"
            style={{ backgroundColor: bgColor }}
        >
            {/* Top Status Area */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 pb-32 animate-in fade-in zoom-in duration-300">

                {/* Icon with pulse rings (ALLOWED only) */}
                <div className="relative flex items-center justify-center mb-6">
                    {isAllowed && (
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
                            className={cn('w-16 h-16 stroke-[3]', isAllowed ? 'text-[#00C853]' : 'text-[#D50000]')}
                        />
                    </div>
                </div>

                <h1 className="text-5xl font-black text-white tracking-tight uppercase drop-shadow-md">
                    {config.label}
                </h1>
                {config.sub && (
                    <p className="text-white/90 text-xl font-bold mt-2 uppercase tracking-wide bg-black/10 px-4 py-1 rounded-full">
                        {config.sub}
                    </p>
                )}
            </div>

            {/* Bottom Card */}
            <div className="bg-white absolute bottom-0 left-0 right-0 rounded-t-[32px] p-8 pb-12 shadow-[0_-10px_40px_rgba(0,0,0,0.2)] animate-in slide-in-from-bottom duration-500">
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

                {/* Grid: DOB + EXP */}
                <div className="grid grid-cols-2 gap-8 mb-8 pb-8 border-b border-slate-100">
                    <div>
                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">DOB</span>
                        <p className="text-lg font-mono font-medium text-slate-800 tracking-tight">{data.dob}</p>
                    </div>
                    <div>
                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">EXP</span>
                        <p className="text-lg font-mono font-medium text-slate-800 tracking-tight">{data.exp}</p>
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
                        <>
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
                            {isAllowed && (
                                <p className="text-center text-xs text-slate-400 mt-2">
                                    Auto-dismissing in {Math.ceil((progress / 100) * (AUTO_DISMISS_MS / 1000))}s
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
