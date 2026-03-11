"use client";

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { BanRecord, User } from '@/lib/types';
import { Shield, ArrowLeft, History, CheckCircle, Search, RefreshCw, XCircle, Unlock } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export default function BansPage() {
    const { bans, users, currentUser, revokeBan, venues } = useApp();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBan, setSelectedBan] = useState<BanRecord | null>(null);
    const [showRevokeModal, setShowRevokeModal] = useState(false);
    const [revokeReason, setRevokeReason] = useState('Rehired / Resolved');

    // Derived Data
    const sortedBans = [...bans].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const filteredBans = sortedBans.filter(ban => {
        const user = users.find(u => u.id === ban.user_id);
        const name = user?.name || 'Unknown User';
        return name.toLowerCase().includes(searchTerm.toLowerCase());
    });

    const getUserName = (userId: string) => {
        return users.find(u => u.id === userId)?.name || 'Unknown User';
    };

    const getVenueNames = (venueIds: string[]) => {
        return venueIds.map(id => venues.find(v => v.id === id)?.name || id).join(', ');
    };

    const handleRevoke = async () => {
        if (!selectedBan || !currentUser) return;
        await revokeBan(selectedBan.id, currentUser.id, revokeReason);
        setShowRevokeModal(false);
        setSelectedBan(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/settings" className="p-2 bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div className="flex-1">
                    <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                        <History className="w-8 h-8 text-primary" />
                        Ban History
                    </h1>
                    <Link href="/settings/ban-policies" className="text-sm text-primary hover:text-primary/80 mt-1 inline-block">
                        Configure ban policies →
                    </Link>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search by user name..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-foreground focus:border-primary outline-none"
                    />
                </div>
            </div>

            {/* Bans Table */}
            <div className="glass-panel rounded-xl overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-card text-muted-foreground text-xs uppercase tracking-wider font-bold">
                        <tr>
                            <th className="p-4">User</th>
                            <th className="p-4">Scope</th>
                            <th className="p-4">Reason</th>
                            <th className="p-4">Start Date</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {filteredBans.map(ban => {
                            const isBusiness = ban.scope_type === 'BUSINESS';
                            const status = ban.status;

                            return (
                                <tr key={ban.id} className="hover:bg-muted/30 transition-colors">
                                    <td className="p-4">
                                        <div className="font-bold text-foreground">{getUserName(ban.user_id)}</div>
                                        <div className="text-xs text-muted-foreground">ID: {ban.user_id}</div>
                                    </td>
                                    <td className="p-4">
                                        {isBusiness ? (
                                            <span className="inline-flex items-center gap-1 text-red-400 font-bold text-xs bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded-full border border-red-200 dark:border-red-900/30">
                                                Business Wide
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-orange-400 font-bold text-xs bg-orange-50 dark:bg-orange-950/20 px-2 py-1 rounded-full border border-orange-200 dark:border-orange-900/30">
                                                {ban.scope_venue_ids.length} Venue(s)
                                            </span>
                                        )}
                                        {!isBusiness && (
                                            <div className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate" title={getVenueNames(ban.scope_venue_ids)}>
                                                {getVenueNames(ban.scope_venue_ids)}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        <div className="text-sm text-foreground">{ban.reason_category}</div>
                                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">{ban.reason_text}</div>
                                    </td>
                                    <td className="p-4 text-sm text-muted-foreground">
                                        {format(new Date(ban.starts_at), 'MMM d, yyyy')}
                                    </td>
                                    <td className="p-4">
                                        <span className={cn("px-2 py-1 rounded-full text-xs font-bold uppercase",
                                            status === 'ACTIVE' ? "bg-red-500/10 text-red-500 border border-red-200 dark:border-red-500/20" :
                                                status === 'REVOKED' ? "bg-emerald-500/10 text-emerald-500 border border-emerald-200 dark:border-emerald-500/20" :
                                                    "bg-muted-foreground/10 text-muted-foreground"
                                        )}>
                                            {status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        {status === 'ACTIVE' && (
                                            <button
                                                onClick={() => {
                                                    setSelectedBan(ban);
                                                    setShowRevokeModal(true);
                                                    setRevokeReason('Rehired / Resolved');
                                                }}
                                                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1 justify-end ml-auto"
                                            >
                                                <Unlock className="w-3 h-3" /> Unban
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredBans.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-muted-foreground italic">
                                    No bans found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Revoke Modal */}
            {showRevokeModal && selectedBan && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold text-foreground mb-4">Restore Access?</h2>
                        <p className="text-muted-foreground mb-6">
                            This will immediately restore access for <strong className="text-foreground">{getUserName(selectedBan.user_id)}</strong>.
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1">Reason for Unban</label>
                                <select
                                    className="w-full bg-background border border-border rounded-lg p-3 text-foreground"
                                    value={revokeReason}
                                    onChange={e => setRevokeReason(e.target.value)}
                                >
                                    <option>Rehired / Resolved</option>
                                    <option>Mistake</option>
                                    <option>Temporary Ban Ended</option>
                                    <option>Other</option>
                                </select>
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => setShowRevokeModal(false)}
                                    className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRevoke}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition-colors flex items-center gap-2"
                                >
                                    <CheckCircle className="w-4 h-4" />
                                    Confirm Unban
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
