"use client";

import React, { useState, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { Building2, Save, Users, ShieldAlert, Shield, ChevronRight } from 'lucide-react';
import { Role } from '@/lib/types';
import Link from 'next/link';
import { canManageSettings } from '@/lib/permissions';

export default function SettingsPage() {
    const { business, currentUser, venues, updateBusiness, refreshState } = useApp();
    const [businessName, setBusinessName] = useState(business?.name ?? '');

    useEffect(() => {
        if (business?.name) setBusinessName(business.name);
    }, [business?.name]);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

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
                    href="/settings/bans"
                    className="flex items-center gap-4 p-5 bg-gray-900/50 border border-gray-800 rounded-xl hover:bg-gray-800/50 hover:border-gray-700 transition-all group sm:col-span-2"
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
        </div>
    );
}
