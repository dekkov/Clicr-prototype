'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldOff, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { revokeBan, getBanById } from '../../actions';

export default function RevokeBanPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = React.use(params);
    const router = useRouter();
    const [ban, setBan] = useState<any>(null);
    const [reason, setReason] = useState('Manually revoked');
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        getBanById(id).then(setBan);
    }, [id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setErrorMsg(null);

        let res;
        try {
            res = await revokeBan(id, reason);
        } catch (err: any) {
            setErrorMsg(err.message);
            setSubmitting(false);
            return;
        }

        if (res.success) {
            router.push('/banning');
        } else {
            setErrorMsg(res.error ?? 'Something went wrong.');
            setSubmitting(false);
        }
    };

    const personName = ban
        ? `${ban.banned_persons?.first_name ?? ''} ${ban.banned_persons?.last_name ?? ''}`.trim()
        : '...';

    return (
        <div className="p-8 max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Link href="/banning" className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm font-bold">
                <ArrowLeft className="w-4 h-4" /> Back to List
            </Link>

            <div>
                <h1 className="text-3xl font-bold text-foreground">Revoke Ban</h1>
                <p className="text-muted-foreground mt-1">
                    {ban ? `Revoking ban for ${personName} — this will allow them entry on future scans.` : 'Loading...'}
                </p>
            </div>

            {ban?.status !== 'ACTIVE' && ban && (
                <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-400 font-medium">This ban is already {ban.status.toLowerCase()} and cannot be revoked.</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
                <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
                    <h2 className="text-lg font-bold text-foreground border-b border-border pb-2 mb-4">Ban Details</h2>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-xs font-bold uppercase text-muted-foreground">Patron</span>
                            <p className="text-foreground font-medium mt-1">{personName || '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs font-bold uppercase text-muted-foreground">Type</span>
                            <p className="text-foreground font-medium mt-1">{ban?.ban_type ?? '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs font-bold uppercase text-muted-foreground">Reason</span>
                            <p className="text-foreground font-medium mt-1">{ban?.reason_category ?? '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs font-bold uppercase text-muted-foreground">Scope</span>
                            <p className="text-foreground font-medium mt-1">{ban?.applies_to_all_locations ? 'All Venues' : 'Venue Specific'}</p>
                        </div>
                    </div>
                    {ban?.reason_notes && (
                        <div>
                            <span className="text-xs font-bold uppercase text-muted-foreground">Notes</span>
                            <p className="text-foreground/80 text-sm mt-1 italic">{ban.reason_notes}</p>
                        </div>
                    )}
                </section>

                <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
                    <h2 className="text-lg font-bold text-foreground border-b border-border pb-2 mb-4">Revoke Reason</h2>
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-muted-foreground">Reason for Revoking</label>
                        <input
                            required
                            type="text"
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg p-3 text-foreground"
                        />
                    </div>
                </section>

                {errorMsg && (
                    <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-400 font-medium">{errorMsg}</p>
                    </div>
                )}

                <div className="flex justify-end gap-4">
                    <Link href="/banning" className="px-6 py-3 rounded-xl font-bold text-muted-foreground hover:text-foreground transition-colors">
                        Cancel
                    </Link>
                    <button
                        disabled={submitting || ban?.status !== 'ACTIVE'}
                        type="submit"
                        className="px-8 py-3 bg-amber-600 rounded-xl font-bold text-foreground hover:bg-amber-500 shadow-lg shadow-amber-900/20 disabled:opacity-50 flex items-center gap-2"
                    >
                        {submitting ? 'Revoking...' : 'Confirm Revoke'} <ShieldOff className="w-4 h-4" />
                    </button>
                </div>
            </form>
        </div>
    );
}
