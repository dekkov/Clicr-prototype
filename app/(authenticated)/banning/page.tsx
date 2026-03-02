'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useApp } from '@/lib/store';
import Link from 'next/link';
import { Search, Shield } from 'lucide-react';

export default function BanningPage() {
    const { activeBusiness, isLoading: storeLoading } = useApp();
    const [bans, setBans] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'REVOKED'>('ACTIVE');
    const [totalActiveBans, setTotalActiveBans] = useState(0);

    useEffect(() => {
        if (!activeBusiness) return;
        fetchBans();
    }, [activeBusiness, filter]);

    useEffect(() => {
        if (!activeBusiness) return;
        fetchActiveCount();
    }, [activeBusiness?.id]);

    const fetchActiveCount = async () => {
        if (!activeBusiness) return;
        const supabase = createClient();
        const { count } = await supabase
            .from('patron_bans')
            .select('id', { count: 'exact', head: true })
            .eq('business_id', activeBusiness.id)
            .eq('status', 'ACTIVE');
        setTotalActiveBans(count ?? 0);
    };

    const fetchBans = async () => {
        if (!activeBusiness) return;
        setLoading(true);
        const supabase = createClient();

        try {
            let query = supabase
                .from('patron_bans')
                .select('*, banned_persons(first_name, last_name, id_number_last4)')
                .eq('business_id', activeBusiness.id)
                .order('created_at', { ascending: false });

            if (filter === 'ACTIVE') {
                query = query.eq('status', 'ACTIVE');
            } else if (filter === 'REVOKED') {
                query = query.in('status', ['REMOVED', 'EXPIRED']);
            }

            const { data, error } = await query;
            if (error) console.error("Error fetching bans", error.message, error.code, error.details);
            setBans(data ?? []);
        } finally {
            setLoading(false);
        }
    };

    const handleRevoke = async (id: string) => {
        if (!confirm('Are you sure you want to revoke this ban?')) return;

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
            .from('patron_bans')
            .update({
                status: 'REMOVED',
                removed_by_user_id: user?.id,
                removed_reason: 'Manually revoked',
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (!error) {
            fetchBans();
            fetchActiveCount();
        } else alert('Error revoking ban (check permissions)');
    };

    const filteredBans = bans.filter(ban => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        const firstName = ban.banned_persons?.first_name?.toLowerCase() ?? '';
        const lastName = ban.banned_persons?.last_name?.toLowerCase() ?? '';
        const reasonNotes = (ban.reason_notes ?? '').toLowerCase();
        const reasonCategory = (ban.reason_category ?? '').toLowerCase();
        return (
            firstName.includes(q) ||
            lastName.includes(q) ||
            reasonNotes.includes(q) ||
            reasonCategory.includes(q)
        );
    });

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
            {/* Page Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-white">Bans</h1>
                    <p className="text-slate-400 mt-1">
                        {totalActiveBans} active ban{totalActiveBans !== 1 ? 's' : ''} across your venues
                    </p>
                </div>
                <Link
                    href="/banning/new"
                    className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-5 py-3 rounded-xl flex items-center gap-2 border border-slate-700 transition-colors"
                >
                    <Shield className="w-4 h-4" /> Manage Bans
                </Link>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                    type="text"
                    placeholder="Search bans..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                />
            </div>

            {/* Filter Tabs */}
            <div className="flex bg-slate-900 rounded-xl p-1 border border-slate-700 w-fit">
                {(['ALL', 'ACTIVE', 'REVOKED'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filter === f ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Ban Cards */}
            <div className="space-y-3">
                {(storeLoading || loading) ? (
                    <p className="text-center text-slate-500 py-12">Loading bans...</p>
                ) : filteredBans.length === 0 ? (
                    <p className="text-center text-slate-500 py-12">No bans found.</p>
                ) : filteredBans.map(ban => (
                    <div
                        key={ban.id}
                        className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex items-start gap-4"
                    >
                        {/* Shield Icon */}
                        <div className="flex-shrink-0 bg-red-500/10 border border-red-500/20 rounded-xl p-2.5">
                            <Shield className="w-5 h-5 text-red-500" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            {/* Row 1: Name + Scope + Status */}
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-white">
                                    {ban.banned_persons?.first_name} {ban.banned_persons?.last_name}
                                </span>
                                <span className="text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full">
                                    {ban.applies_to_all_locations ? 'All Venues' : 'Venue Specific'}
                                </span>
                                {(ban.status === 'REMOVED' || ban.status === 'EXPIRED') && (
                                    <span className="text-xs font-medium bg-slate-800 text-slate-500 border border-slate-700 px-2 py-0.5 rounded-full">
                                        {ban.status === 'EXPIRED' ? 'Expired' : 'Revoked'}
                                    </span>
                                )}
                            </div>

                            {/* Row 2: Reason */}
                            <p className="text-slate-400 text-sm italic mt-1">
                                {ban.reason_notes || ban.reason_category || '—'}
                            </p>

                            {/* Row 3: Added by + date */}
                            <p className="text-slate-600 text-xs mt-1">
                                Added by Staff · {new Date(ban.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                        </div>

                        {/* Revoke Button */}
                        {ban.status === 'ACTIVE' && (
                            <button
                                onClick={() => handleRevoke(ban.id)}
                                className="flex-shrink-0 text-xs font-bold text-slate-400 hover:text-white border border-slate-700 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                            >
                                Revoke
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
