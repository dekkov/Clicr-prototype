"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { Building2, Save, Users, ShieldAlert, Shield, ChevronRight, LayoutGrid, Trash2, X, AlertTriangle } from 'lucide-react';
import { Role } from '@/lib/types';
import Link from 'next/link';
import { canManageSettings } from '@/lib/permissions';
import { deleteBusiness } from '@/app/onboarding/setup-actions';

export default function SettingsPage() {
    const router = useRouter();
    const { business, businesses, currentUser, venues, updateBusiness, refreshState, clearBusiness, selectBusiness } = useApp();
    const [businessName, setBusinessName] = useState(business?.name ?? '');

    useEffect(() => {
        if (business?.name) setBusinessName(business.name);
    }, [business?.name]);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Delete business modal state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const canDelete = deleteConfirmText === business?.name;

    const handleDeleteBusiness = async () => {
        if (!business || !canDelete) return;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            const result = await deleteBusiness(business.id);
            if (!result.success) {
                setDeleteError('error' in result ? result.error : 'Failed to delete business');
                return;
            }
            const remaining = businesses.filter(b => b.id !== business.id);
            if (remaining.length > 0) {
                selectBusiness(remaining[0]);
                router.push('/dashboard');
            } else {
                clearBusiness();
                router.push('/onboarding/setup');
            }
        } catch {
            setDeleteError('An unexpected error occurred. Please try again.');
        } finally {
            setIsDeleting(false);
        }
    };

    if (!canManageSettings(currentUser?.role as Role | undefined)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
                <Shield className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-base font-medium">Access restricted</p>
                <p className="text-sm mt-1">Only admins and owners can access settings.</p>
            </div>
        );
    }

    if (!currentUser) return <div className="p-8 text-white">Loading...</div>;
    if (!business) return <div className="p-8 text-white flex items-center gap-4"><div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /> Loading Settings...</div>;

    const capacityHref = venues.length > 0 ? `/venues/${venues[0].id}` : '/venues';

    const handleSaveBusiness = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!business || businessName.trim() === business.name) return;
        setIsSaving(true);
        setSaved(false);
        await updateBusiness({ name: businessName.trim() });
        await refreshState();
        setIsSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="p-6 max-w-[1600px] space-y-8">
            <div className="mb-8">
                <h1 className="text-3xl mb-1">Settings</h1>
                <p className="text-gray-400 text-sm">Configure your account and preferences.</p>
            </div>

            {/* Cards - Design tokens */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link
                    href="/settings/team"
                    className="flex items-center gap-4 p-5 bg-gray-900/50 border border-gray-800 rounded-xl hover:bg-gray-800/50 hover:border-gray-700 transition-all group"
                >
                    <div className="w-10 h-10 rounded-lg bg-purple-900/30 border border-purple-500/20 flex items-center justify-center">
                        <Users className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-white group-hover:text-purple-400 transition-colors">Team</h3>
                        <p className="text-sm text-gray-500">Manage team members & roles</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-purple-400 transition-colors shrink-0" />
                </Link>

                <Link
                    href={capacityHref}
                    className="flex items-center gap-4 p-5 bg-gray-900/50 border border-gray-800 rounded-xl hover:bg-gray-800/50 hover:border-gray-700 transition-all group"
                >
                    <div className="w-10 h-10 rounded-lg bg-purple-900/30 border border-purple-500/20 flex items-center justify-center">
                        <ShieldAlert className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-white group-hover:text-purple-400 transition-colors">Capacity Rules</h3>
                        <p className="text-sm text-gray-500">Warning thresholds & enforcement</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-purple-400 transition-colors shrink-0" />
                </Link>

                <Link
                    href="/settings/board-views"
                    className="flex items-center gap-4 p-5 bg-gray-900/50 border border-gray-800 rounded-xl hover:bg-gray-800/50 hover:border-gray-700 transition-all group"
                >
                    <div className="w-10 h-10 rounded-lg bg-purple-900/30 border border-purple-500/20 flex items-center justify-center">
                        <LayoutGrid className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-white group-hover:text-purple-400 transition-colors">Board Views</h3>
                        <p className="text-sm text-gray-500">Multi-counter display layouts</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-purple-400 transition-colors shrink-0" />
                </Link>

                <Link
                    href="/settings/bans"
                    className="flex items-center gap-4 p-5 bg-gray-900/50 border border-gray-800 rounded-xl hover:bg-gray-800/50 hover:border-gray-700 transition-all group"
                >
                    <div className="w-10 h-10 rounded-lg bg-purple-900/30 border border-purple-500/20 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-white group-hover:text-purple-400 transition-colors">Bans</h3>
                        <p className="text-sm text-gray-500">Manage banned patrons</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-purple-400 transition-colors shrink-0" />
                </Link>
            </div>

            {/* Business Information */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-purple-900/30 border border-purple-500/20 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-purple-400" />
                    </div>
                    <h2 className="text-lg font-bold text-white">Business Information</h2>
                </div>
                <form onSubmit={handleSaveBusiness} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Business Name</label>
                        <input
                            type="text"
                            value={businessName}
                            onChange={e => setBusinessName(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none"
                            placeholder="e.g. CLICR Demo Group"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isSaving || businessName.trim() === business.name}
                        className="flex items-center gap-2 px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save className="w-4 h-4" />
                        {saved ? 'Saved!' : isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </form>
            </div>

            {/* Danger Zone — OWNER only */}
            {currentUser?.role === 'OWNER' && (
                <div className="border border-red-900/50 rounded-xl p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-red-900/20 border border-red-500/20 flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-red-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Danger Zone</h2>
                            <p className="text-sm text-gray-500">Irreversible actions — proceed with caution.</p>
                        </div>
                    </div>
                    <div className="flex items-center justify-between bg-gray-950/50 border border-gray-800 rounded-lg p-4">
                        <div>
                            <p className="font-medium text-white text-sm">Delete this business</p>
                            <p className="text-xs text-gray-500 mt-0.5">Permanently deletes all venues, areas, devices, scans, bans, and reports.</p>
                        </div>
                        <button
                            onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(''); setDeleteError(null); }}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-900/20 border border-red-500/30 text-red-400 hover:bg-red-900/40 hover:border-red-500/50 text-sm font-medium transition-all"
                        >
                            <Trash2 className="w-4 h-4" /> Delete Business
                        </button>
                    </div>
                </div>
            )}

            {/* Delete confirmation modal */}
            {showDeleteModal && business && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-5 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-red-900/20 border border-red-500/20 flex items-center justify-center shrink-0">
                                    <AlertTriangle className="w-5 h-5 text-red-400" />
                                </div>
                                <h3 className="text-lg font-bold text-white">Delete business</h3>
                            </div>
                            <button
                                onClick={() => { if (!isDeleting) setShowDeleteModal(false); }}
                                disabled={isDeleting}
                                className="p-1 text-gray-500 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-sm text-gray-400">
                            This will <span className="text-white font-medium">permanently delete</span> <span className="text-red-400 font-medium">{business.name}</span> and all associated data — venues, areas, devices, scans, bans, and reports. This cannot be undone.
                        </p>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block">
                                Type <span className="text-white font-mono">{business.name}</span> to confirm
                            </label>
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={e => setDeleteConfirmText(e.target.value)}
                                placeholder={business.name}
                                autoFocus
                                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-red-500/40 focus:border-red-500 outline-none text-sm"
                            />
                        </div>

                        {deleteError && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                                {deleteError}
                            </div>
                        )}

                        <div className="flex gap-3 pt-1">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                disabled={isDeleting}
                                className="flex-1 py-3 border border-gray-700 text-gray-400 hover:text-white rounded-xl font-medium transition-all disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteBusiness}
                                disabled={!canDelete || isDeleting}
                                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Deleting…
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-4 h-4" /> Delete forever
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
