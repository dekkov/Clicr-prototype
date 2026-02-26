'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useApp } from '@/lib/store';
import Link from 'next/link';
import { Plus, Search, Filter, AlertTriangle, CheckCircle, XCircle, MoreVertical } from 'lucide-react';

export default function BanningPage() {
    const { business, isLoading: storeLoading } = useApp();
    const [bans, setBans] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'REVOKED'>('ACTIVE');

    useEffect(() => {
        if (!business) return;
        fetchBans();
    }, [business, filter]);

    const fetchBans = async () => {
        if (!business) return;
        setLoading(true);
        const supabase = createClient();

        try {
            let query = supabase
                .from('patron_bans')
                .select('*, banned_persons(first_name, last_name, id_number_last4)')
                .eq('business_id', business.id)
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

        if (!error) fetchBans();
        else alert('Error revoking ban (check permissions)');
    };

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-white">Ban Management</h1>
                    <p className="text-slate-400 mt-1">Manage prohibited patrons and 86 lists</p>
                </div>
                <Link
                    href="/banning/new"
                    className="bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 shadow-lg shadow-red-900/20"
                >
                    <Plus className="w-5 h-5" /> Manual Ban
                </Link>
            </div>

            {/* Filters */}
            <div className="flex gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search by note, reason..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
                <div className="flex bg-slate-900 rounded-xl p-1 border border-slate-700">
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
            </div>

            {/* Table */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-900 border-b border-slate-800">
                        <tr>
                            <th className="p-4 text-xs font-bold text-slate-500 uppercase">Reason</th>
                            <th className="p-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                            <th className="p-4 text-xs font-bold text-slate-500 uppercase">Scope</th>
                            <th className="p-4 text-xs font-bold text-slate-500 uppercase">Details</th>
                            <th className="p-4 text-xs font-bold text-slate-500 uppercase">Date</th>
                            <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {(storeLoading || loading) ? (
                            <tr><td colSpan={6} className="p-8 text-center text-slate-500">Loading bans...</td></tr>
                        ) : bans.length === 0 ? (
                            <tr><td colSpan={6} className="p-8 text-center text-slate-500">No bans found matching filter.</td></tr>
                        ) : bans.map(ban => (
                            <tr key={ban.id} className="hover:bg-slate-800/50 transition-colors">
                                <td className="p-4">
                                    <span className="font-bold text-white bg-slate-800 px-2 py-1 rounded text-sm border border-slate-700">
                                        {ban.reason_category}
                                    </span>
                                </td>
                                <td className="p-4">
                                    {ban.status === 'ACTIVE' ? (
                                        <span className="inline-flex items-center gap-1 text-red-400 text-xs font-bold px-2 py-1 bg-red-400/10 rounded-full">
                                            Active
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-slate-500 text-xs font-bold px-2 py-1 bg-slate-700 rounded-full">
                                            {ban.status === 'EXPIRED' ? 'Expired' : 'Revoked'}
                                        </span>
                                    )}
                                </td>
                                <td className="p-4 text-sm text-slate-300">
                                    {ban.applies_to_all_locations ? 'All Venues' : 'Single Venue'}
                                </td>
                                <td className="p-4">
                                    <div className="text-sm text-white truncate max-w-xs">{ban.reason_notes || '-'}</div>
                                    <div className="text-xs text-slate-500 font-mono mt-1 opacity-50">
                                        {ban.banned_persons ? `${ban.banned_persons.first_name} ${ban.banned_persons.last_name}` : '-'}
                                    </div>
                                </td>
                                <td className="p-4 text-sm text-slate-400">
                                    {new Date(ban.created_at).toLocaleDateString()}
                                </td>
                                <td className="p-4 text-right">
                                    {ban.status === 'ACTIVE' && (
                                        <button
                                            onClick={() => handleRevoke(ban.id)}
                                            className="text-xs font-bold text-slate-400 hover:text-white border border-slate-700 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                            Revoke
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
