"use client";

import React, { useState, useEffect, useCallback, use } from 'react';
import { LayoutGrid, Maximize, ArrowLeft } from 'lucide-react';
import { getBoardView } from '@/app/(authenticated)/settings/board-actions';
import type { BoardView } from '@/lib/types';
import Link from 'next/link';
import { useApp } from '@/lib/store';

type DeviceStatus = {
    id: string;
    name: string;
    current_count: number;
    area_name: string;
    area_id?: string;
    venue_id?: string;
};

export default function BoardDisplayPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { recordEvent, currentUser, business } = useApp();
    const [boardView, setBoardView] = useState<BoardView | null>(null);
    const [devices, setDevices] = useState<DeviceStatus[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const canTap = !!currentUser?.id && !!business?.id;

    const load = useCallback(async () => {
        const view = await getBoardView(id);
        if (!view) {
            setError('Board view not found');
            setIsLoading(false);
            return;
        }
        setBoardView(view);
        setIsLoading(false);
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!boardView) return;

        const poll = async () => {
            try {
                const res = await fetch('/api/sync');
                if (!res.ok) return;
                const data = await res.json();
                const allClicrs = data.clicrs || [];
                const allAreas = data.areas || [];

                const mapped: DeviceStatus[] = boardView.device_ids.map(did => {
                    const clicr = allClicrs.find((c: any) => c.id === did);
                    const area = clicr ? allAreas.find((a: any) => a.id === clicr.area_id) : null;
                    return {
                        id: did,
                        name: boardView.labels[did] || clicr?.name || 'Unknown',
                        current_count: clicr?.current_count ?? 0,
                        area_name: area?.name || '',
                        area_id: clicr?.area_id,
                        venue_id: area?.venue_id,
                    };
                });
                setDevices(mapped);
            } catch { /* polling silently fails */ }
        };

        poll();
        const interval = setInterval(poll, 2000);
        return () => clearInterval(interval);
    }, [boardView]);

    const handleFullscreen = () => {
        document.documentElement.requestFullscreen?.();
    };

    const handleTap = (device: DeviceStatus, delta: number) => {
        if (!device.venue_id || !device.area_id || !recordEvent) return;
        recordEvent({
            venue_id: device.venue_id,
            area_id: device.area_id,
            clicr_id: device.id,
            delta,
            flow_type: delta > 0 ? 'IN' : 'OUT',
            event_type: 'TAP',
            idempotency_key: `board-${device.id}-${Date.now()}-${delta}`,
        });
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="animate-pulse text-primary text-2xl font-bold">Loading board...</div>
            </div>
        );
    }

    if (error || !boardView) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
                <p className="text-red-400 text-lg">{error || 'Board view not found'}</p>
                <Link href="/settings/board-views" className="text-primary hover:text-emerald-400 text-sm">
                    Back to Board Views
                </Link>
            </div>
        );
    }

    const gridCols = devices.length <= 2 ? 'grid-cols-1 md:grid-cols-2'
        : devices.length <= 4 ? 'grid-cols-2'
        : 'grid-cols-2 lg:grid-cols-3';

    return (
        <div className="min-h-screen bg-black text-white flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                    <Link href="/settings/board-views" className="text-slate-500 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <LayoutGrid className="w-5 h-5 text-primary" />
                    <h1 className="text-xl font-bold">{boardView.name}</h1>
                </div>
                <button onClick={handleFullscreen}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:text-white transition-colors">
                    <Maximize className="w-4 h-4" /> Fullscreen
                </button>
            </div>

            <div className={`flex-1 grid ${gridCols} gap-4 p-6`}>
                {devices.map(device => (
                    <div key={device.id}
                        className="bg-slate-900/50 border border-slate-800 rounded-3xl flex flex-col items-center justify-center p-8 min-h-[200px]">
                        <div className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2">
                            {device.area_name}
                        </div>
                        <div className="text-7xl md:text-9xl font-black tabular-nums text-primary leading-none mb-4">
                            {device.current_count}
                        </div>
                        <div className="text-lg text-slate-300 font-bold mb-4">
                            {device.name}
                        </div>
                        {canTap && device.venue_id && device.area_id && (
                            <div className="flex flex-wrap gap-2 justify-center">
                                {[1, 2, 3].map(n => (
                                    <button key={`in-${n}`} onClick={() => handleTap(device, n)}
                                        className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-sm font-bold border border-emerald-500/30 active:scale-95 transition-all">
                                        +{n} IN
                                    </button>
                                ))}
                                {[1, 2, 3].map(n => (
                                    <button key={`out-${n}`} onClick={() => handleTap(device, -n)}
                                        className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-bold border border-red-500/30 active:scale-95 transition-all">
                                        -{n} OUT
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
