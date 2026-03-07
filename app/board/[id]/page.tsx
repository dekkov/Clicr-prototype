"use client";

import React, { useState, useEffect, use } from 'react';
import { LayoutGrid, Maximize, ArrowLeft } from 'lucide-react';
import { getBoardView } from '@/app/actions/board';
import { BoardTile } from '@/components/board/BoardTile';
import type { BoardView, Clicr, Area, Venue } from '@/lib/types';
import Link from 'next/link';
import { useApp } from '@/lib/store';

type TileData = {
    clicr: Clicr;
    area: Area | undefined;
    venue?: Venue;
    label: string;
};

export default function BoardDisplayPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { recordEvent } = useApp();
    const [boardView, setBoardView] = useState<BoardView | null>(null);
    const [tiles, setTiles] = useState<TileData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        getBoardView(id).then(view => {
            if (cancelled) return;
            if (!view) {
                setError('Board view not found');
            } else {
                setBoardView(view);
            }
            setIsLoading(false);
        });
        return () => { cancelled = true; };
    }, [id]);

    useEffect(() => {
        if (!boardView) return;

        const poll = async () => {
            try {
                const res = await fetch('/api/sync');
                if (!res.ok) return;
                const data = await res.json();
                const allClicrs: Clicr[] = data.clicrs || [];
                const allAreas: Area[] = data.areas || [];
                const allVenues: Venue[] = data.venues || [];

                const mapped: TileData[] = boardView.device_ids.map(did => {
                    const clicr = allClicrs.find(c => c.id === did);
                    const area = clicr ? allAreas.find(a => a.id === clicr.area_id) : undefined;
                    const venue = clicr?.is_venue_counter
                        ? allVenues.find(v => v.id === clicr.venue_id)
                        : undefined;
                    return {
                        clicr: clicr || { id: did, name: 'Unknown', area_id: '', active: false, current_count: 0 } as Clicr,
                        area,
                        venue,
                        label: boardView.labels[did] || clicr?.name || 'Unknown',
                    };
                });
                setTiles(mapped);
            } catch { /* polling silently fails */ }
        };

        poll();
        const interval = setInterval(poll, 2000);
        return () => clearInterval(interval);
    }, [boardView]);

    const handleFullscreen = () => {
        document.documentElement.requestFullscreen?.();
    };

    const handleTap = (clicrId: string, delta: number, gender: 'M' | 'F') => {
        const tile = tiles.find(t => t.clicr.id === clicrId);
        if (!tile || !tile.area?.venue_id || !tile.clicr.area_id || !recordEvent) return;
        recordEvent({
            venue_id: tile.area.venue_id,
            area_id: tile.clicr.area_id,
            clicr_id: clicrId,
            delta,
            flow_type: delta > 0 ? 'IN' : 'OUT',
            gender,
            event_type: 'TAP',
            idempotency_key: `board-${clicrId}-${Date.now()}-${delta}`,
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
                <Link href="/clicr" className="text-primary hover:text-emerald-400 text-sm">
                    Back to Clicrs
                </Link>
            </div>
        );
    }

    const gridCols = tiles.length <= 1 ? 'grid-cols-1 max-w-md mx-auto'
        : tiles.length === 2 ? 'grid-cols-2'
        : tiles.length === 3 ? 'grid-cols-3'
        : 'grid-cols-2';

    return (
        <div className="min-h-screen bg-black text-white flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                    <Link href="/clicr" className="text-slate-500 hover:text-white transition-colors">
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
                {tiles.map(tile => (
                    <BoardTile
                        key={tile.clicr.id}
                        clicr={tile.clicr}
                        area={tile.area}
                        venue={tile.venue}
                        label={tile.label}
                        onTap={handleTap}
                    />
                ))}
            </div>
        </div>
    );
}
