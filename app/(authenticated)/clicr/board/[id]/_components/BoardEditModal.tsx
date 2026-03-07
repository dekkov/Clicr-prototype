"use client";

import React, { useState } from 'react';
import { XCircle, Trash2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BoardView, Clicr, Area } from '@/lib/types';

type Props = {
    boardView: BoardView;
    clicrs: Clicr[];
    areas: Area[];
    onSave: (name: string, deviceIds: string[], labels: Record<string, string>) => void;
    onDelete: () => void;
    onClose: () => void;
};

export default function BoardEditModal({ boardView, clicrs, areas, onSave, onDelete, onClose }: Props) {
    const [name, setName] = useState(boardView.name);
    const [selectedIds, setSelectedIds] = useState<string[]>(boardView.device_ids);
    const [labels, setLabels] = useState<Record<string, string>>(boardView.labels || {});

    const toggleDevice = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id)
                ? prev.filter(d => d !== id)
                : prev.length < 5 ? [...prev, id] : prev
        );
    };

    const activeClicrs = clicrs.filter(c => c.active);
    const areaGroups = areas
        .map(a => ({ area: a, devices: activeClicrs.filter(c => c.area_id === a.id) }))
        .filter(g => g.devices.length > 0);

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1e2330] border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white">
                    <XCircle className="w-5 h-5" />
                </button>

                <h2 className="text-xl font-bold text-white mb-6">Edit Board View</h2>

                <div className="space-y-5">
                    {/* Name */}
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full bg-black/50 border border-slate-700 rounded-xl p-3 text-white placeholder:text-slate-600 focus:border-primary focus:outline-none mt-1.5"
                        />
                    </div>

                    {/* Select counters */}
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                            Counters <span className="text-slate-600">({selectedIds.length}/5)</span>
                        </label>
                        <div className="space-y-3 mt-1.5 max-h-60 overflow-y-auto">
                            {areaGroups.map(({ area: groupArea, devices }) => (
                                <div key={groupArea.id}>
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 mb-1">{groupArea.name}</div>
                                    <div className="space-y-1">
                                        {devices.map(clicr => (
                                            <button
                                                key={clicr.id}
                                                type="button"
                                                onClick={() => toggleDevice(clicr.id)}
                                                className={cn(
                                                    "w-full flex items-center gap-2.5 p-2.5 rounded-lg border text-left text-sm transition-all",
                                                    selectedIds.includes(clicr.id)
                                                        ? "bg-primary/10 border-primary"
                                                        : "bg-slate-800 border-slate-700 hover:bg-slate-700"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                                    selectedIds.includes(clicr.id)
                                                        ? "bg-primary border-primary"
                                                        : "border-slate-600"
                                                )}>
                                                    {selectedIds.includes(clicr.id) && <Check className="w-3 h-3 text-black" />}
                                                </div>
                                                <span className={selectedIds.includes(clicr.id) ? 'text-primary font-bold' : 'text-white'}>
                                                    {clicr.name}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Custom labels */}
                    {selectedIds.length > 0 && (
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                Custom Labels <span className="text-slate-600">(optional)</span>
                            </label>
                            <div className="space-y-1.5 mt-1.5">
                                {selectedIds.map(did => {
                                    const clicr = clicrs.find(c => c.id === did);
                                    return (
                                        <div key={did} className="flex items-center gap-2">
                                            <span className="text-sm text-slate-400 w-28 truncate">{clicr?.name}</span>
                                            <input
                                                type="text"
                                                value={labels[did] || ''}
                                                onChange={e => setLabels(prev => ({ ...prev, [did]: e.target.value }))}
                                                placeholder={clicr?.name || 'Label'}
                                                className="flex-1 bg-black/50 border border-slate-700 rounded-lg p-2 text-white text-sm placeholder:text-slate-600 focus:border-primary focus:outline-none"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Save */}
                    <button
                        onClick={() => onSave(name, selectedIds, labels)}
                        disabled={!name.trim() || selectedIds.length === 0}
                        className="w-full py-3 bg-primary text-black font-bold rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50"
                    >
                        Save Changes
                    </button>

                    {/* Danger zone */}
                    <div className="pt-3 border-t border-slate-800">
                        <button
                            onClick={onDelete}
                            className="flex items-center gap-2 text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
                        >
                            <Trash2 className="w-4 h-4" /> Delete this board view
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
