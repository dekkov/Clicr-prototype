"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, Plus, Trash2, XCircle, Loader2, Eye, Check } from 'lucide-react';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';
import { createBoardView, listBoardViews, deleteBoardView } from '../board-actions';
import type { BoardView } from '@/lib/types';
import Link from 'next/link';

export default function BoardViewsPage() {
    const { activeBusiness, clicrs, areas } = useApp();

    const [boardViews, setBoardViews] = useState<BoardView[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const [newName, setNewName] = useState('');
    const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
    const [deviceLabels, setDeviceLabels] = useState<Record<string, string>>({});
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const loadViews = useCallback(async () => {
        if (!activeBusiness) return;
        setIsLoading(true);
        const views = await listBoardViews(activeBusiness.id);
        setBoardViews(views);
        setIsLoading(false);
    }, [activeBusiness]);

    useEffect(() => {
        loadViews();
    }, [loadViews]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeBusiness || !newName || selectedDeviceIds.length === 0) return;
        setIsCreating(true);
        setCreateError(null);

        const result = await createBoardView(newName, selectedDeviceIds, deviceLabels, activeBusiness.id);
        if (result.success) {
            setShowCreateModal(false);
            setNewName('');
            setSelectedDeviceIds([]);
            setDeviceLabels({});
            loadViews();
        } else {
            setCreateError(result.success === false ? result.error : 'Unknown error');
        }
        setIsCreating(false);
    };

    const handleDelete = async (id: string) => {
        if (!activeBusiness) return;
        if (!confirm('Delete this board view?')) return;
        await deleteBoardView(id, activeBusiness.id);
        setBoardViews(prev => prev.filter(v => v.id !== id));
    };

    const toggleDevice = (deviceId: string) => {
        setSelectedDeviceIds(prev =>
            prev.includes(deviceId)
                ? prev.filter(id => id !== deviceId)
                : prev.length < 5 ? [...prev, deviceId] : prev
        );
    };

    const getAreaName = (areaId: string) => areas.find(a => a.id === areaId)?.name || 'Unknown Area';

    if (!activeBusiness) {
        return <div className="p-6 text-center text-slate-400">Select a business to manage board views.</div>;
    }

    return (
        <div className="p-6 space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
                        <LayoutGrid className="w-8 h-8 text-primary" />
                        Board Views
                    </h1>
                    <p className="text-slate-400 max-w-2xl">
                        Create custom dashboard views that display selected counters with custom labels. Perfect for TVs and door monitors.
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-primary text-black font-bold rounded-xl hover:bg-emerald-400 transition-colors shadow-lg shadow-primary/20"
                >
                    <Plus className="w-5 h-5" />
                    New Board View
                </button>
            </div>

            {isLoading ? (
                <div className="p-12 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
            ) : boardViews.length === 0 ? (
                <div className="bg-[#1e2330]/50 border border-white/5 rounded-3xl p-12 text-center">
                    <LayoutGrid className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-white font-bold text-lg mb-2">No board views yet</h3>
                    <p className="text-slate-500 text-sm mb-6">Create your first board view to display live counter data on a screen.</p>
                    <button onClick={() => setShowCreateModal(true)}
                        className="px-6 py-3 bg-primary text-black font-bold rounded-xl hover:bg-emerald-400 transition-colors">
                        Create Board View
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {boardViews.map(view => (
                        <div key={view.id} className="bg-[#1e2330]/50 border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-all group">
                            <div className="flex items-start justify-between mb-4">
                                <h3 className="text-white font-bold text-lg">{view.name}</h3>
                                <button onClick={() => handleDelete(view.id)}
                                    className="opacity-0 group-hover:opacity-100 p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            <p className="text-slate-500 text-sm mb-4">
                                {view.device_ids.length} counter{view.device_ids.length !== 1 ? 's' : ''}
                            </p>
                            <div className="flex flex-wrap gap-1.5 mb-4">
                                {view.device_ids.map(did => {
                                    const device = clicrs.find(c => c.id === did);
                                    const label = view.labels[did] || device?.name || 'Unknown';
                                    return (
                                        <span key={did} className="text-xs px-2 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                                            {label}
                                        </span>
                                    );
                                })}
                            </div>
                            <Link href={`/board/${view.id}`}
                                className="flex items-center gap-2 text-primary text-sm font-bold hover:text-emerald-400 transition-colors">
                                <Eye className="w-4 h-4" /> Open Fullscreen
                            </Link>
                        </div>
                    ))}
                </div>
            )}

            <AnimatePresence>
                {showCreateModal && (
                    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-[#1e2330] border border-slate-700 rounded-3xl w-full max-w-lg p-8 shadow-2xl relative max-h-[85vh] overflow-y-auto"
                        >
                            <button onClick={() => { setShowCreateModal(false); setCreateError(null); }}
                                className="absolute top-6 right-6 text-slate-500 hover:text-white">
                                <XCircle className="w-6 h-6" />
                            </button>

                            <h2 className="text-2xl font-bold text-white mb-6">Create Board View</h2>

                            {createError && (
                                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{createError}</div>
                            )}

                            <form onSubmit={handleCreate} className="space-y-6">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">View Name</label>
                                    <input type="text" required value={newName} onChange={e => setNewName(e.target.value)}
                                        placeholder="e.g. Front Door Monitor"
                                        className="w-full bg-black/50 border border-slate-700 rounded-xl p-4 text-white placeholder:text-slate-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary mt-2" />
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                        Select Counters <span className="text-slate-600">(up to 5)</span>
                                    </label>
                                    <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
                                        {clicrs.map(device => (
                                            <button key={device.id} type="button" onClick={() => toggleDevice(device.id)}
                                                className={cn(
                                                    "w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all text-sm",
                                                    selectedDeviceIds.includes(device.id)
                                                        ? "bg-primary/10 border-primary"
                                                        : "bg-slate-800 border-slate-700 hover:bg-slate-700"
                                                )}>
                                                <div>
                                                    <span className={selectedDeviceIds.includes(device.id) ? 'text-primary font-bold' : 'text-white'}>
                                                        {device.name}
                                                    </span>
                                                    <span className="text-xs text-slate-500 ml-2">
                                                        {getAreaName(device.area_id)}
                                                    </span>
                                                </div>
                                                {selectedDeviceIds.includes(device.id) && <Check className="w-4 h-4 text-primary" />}
                                            </button>
                                        ))}
                                        {clicrs.length === 0 && (
                                            <p className="text-slate-500 text-sm text-center py-4">No devices available. Create some first.</p>
                                        )}
                                    </div>
                                </div>

                                {selectedDeviceIds.length > 0 && (
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                            Custom Labels <span className="text-slate-600">(optional)</span>
                                        </label>
                                        <div className="space-y-2 mt-2">
                                            {selectedDeviceIds.map(did => {
                                                const device = clicrs.find(c => c.id === did);
                                                return (
                                                    <div key={did} className="flex items-center gap-2">
                                                        <span className="text-sm text-slate-400 w-32 truncate">{device?.name}</span>
                                                        <input type="text" value={deviceLabels[did] || ''}
                                                            onChange={e => setDeviceLabels(prev => ({ ...prev, [did]: e.target.value }))}
                                                            placeholder={device?.name || 'Label'}
                                                            className="flex-1 bg-black/50 border border-slate-700 rounded-lg p-2 text-white text-sm placeholder:text-slate-600 focus:border-primary focus:outline-none" />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <button type="submit" disabled={isCreating || selectedDeviceIds.length === 0}
                                    className="w-full py-4 bg-primary text-black font-bold rounded-xl hover:bg-emerald-400 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2">
                                    {isCreating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : 'Create Board View'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
