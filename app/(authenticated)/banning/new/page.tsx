'use client';

import React, { useState } from 'react';
import { banPatron } from '@/app/(authenticated)/scanner/actions';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/store';
import { ArrowLeft, Save, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function NewBanPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { activeBusiness } = useApp();
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Pre-fill from query params (from guest directory ban button)
    const prefillFname = searchParams.get('fname') || '';
    const prefillLname = searchParams.get('lname') || '';
    const prefillDobRaw = searchParams.get('dob') || ''; // YYYYMMDD
    const prefillState = searchParams.get('state') || '';
    const prefillLast4 = searchParams.get('id_last4') || '';
    const prefillTokenHash = searchParams.get('token_hash') || '';

    // Convert YYYYMMDD to YYYY-MM-DD for date input
    const prefillDob = prefillDobRaw.length === 8
        ? `${prefillDobRaw.slice(0, 4)}-${prefillDobRaw.slice(4, 6)}-${prefillDobRaw.slice(6, 8)}`
        : '';

    // Identity Fields
    const [idNumber, setIdNumber] = useState('');
    const [state, setState] = useState(prefillState);
    const [dob, setDob] = useState(prefillDob); // YYYY-MM-DD from input type=date

    // Ban Details
    const [reason, setReason] = useState('AGGRESSIVE');
    const [scope, setScope] = useState('BUSINESS');
    const [notes, setNotes] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setErrorMsg(null);

        const dobFormatted = dob.replace(/-/g, ''); // YYYYMMDD

        const manualData = prefillTokenHash
            ? { state, idNumber: idNumber || null, dob: dobFormatted, identityTokenHash: prefillTokenHash, firstName: prefillFname, lastName: prefillLname, idNumberLast4: prefillLast4 || null }
            : { state, idNumber, dob: dobFormatted };

        let res;
        try {
            res = await banPatron(null, manualData, {
                reason,
                scope,
                notes,
                duration: 'PERMANENT',
                businessId: activeBusiness?.id,
            });
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

    return (
        <div className="p-8 max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Link href="/banning" className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm font-bold">
                <ArrowLeft className="w-4 h-4" /> Back to List
            </Link>

            <div>
                <h1 className="text-3xl font-bold text-foreground">
                    {prefillFname ? 'Ban Patron' : 'Manual Ban Entry'}
                </h1>
                <p className="text-muted-foreground mt-1">
                    {prefillFname
                        ? `Banning ${prefillFname} ${prefillLname} — confirm details and submit.`
                        : 'Add a ban by manually entering ID details. This calculates the hash without scanning.'}
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">

                {/* section: Identity */}
                <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
                    <h2 className="text-lg font-bold text-foreground border-b border-border pb-2 mb-4">Patron Details</h2>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-muted-foreground">State / Region</label>
                            <input
                                required
                                type="text"
                                maxLength={2}
                                placeholder="CA"
                                value={state} onChange={e => setState(e.target.value.toUpperCase())}
                                className="w-full bg-background border border-border rounded-lg p-3 text-foreground font-mono"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-muted-foreground">Date of Birth</label>
                            <input
                                required
                                type="date"
                                value={dob} onChange={e => setDob(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg p-3 text-foreground font-mono"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-muted-foreground">
                            ID / DL Number {prefillTokenHash && <span className="normal-case font-normal text-muted-foreground/60">(optional — identity already known)</span>}
                        </label>
                        <input
                            required={!prefillTokenHash}
                            type="text"
                            placeholder="D1234567"
                            value={idNumber} onChange={e => setIdNumber(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg p-3 text-foreground font-mono"
                        />
                    </div>
                </section>

                {/* section: Ban Rules */}
                <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
                    <h2 className="text-lg font-bold text-foreground border-b border-border pb-2 mb-4">Ban Rules</h2>

                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-muted-foreground">Reason</label>
                        <select
                            value={reason} onChange={e => setReason(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg p-3 text-foreground"
                        >
                            <option value="AGGRESSIVE">Aggressive Behavior</option>
                            <option value="THEFT">Theft / Stealing</option>
                            <option value="HARASSMENT">Harassment</option>
                            <option value="VIP_VIOLATION">VIP Violation</option>
                            <option value="OTHER">Other</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-muted-foreground">Notes (Internal)</label>
                        <textarea
                            value={notes} onChange={e => setNotes(e.target.value)}
                            placeholder="Describe what happened..."
                            className="w-full bg-background border border-border rounded-lg p-3 text-foreground h-24"
                        />
                    </div>

                    <div className="bg-red-500/10 border border-red-200 dark:border-red-500/20 p-4 rounded-xl flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                        <p className="text-sm text-red-200">
                            This will immediately block this ID from entering <strong>All Venues</strong> in your business.
                            The patron will be flagged as "BANNED" on future scans.
                        </p>
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
                        disabled={submitting}
                        type="submit"
                        className="px-8 py-3 bg-red-600 rounded-xl font-bold text-foreground hover:bg-red-500 shadow-lg shadow-red-900/20 disabled:opacity-50 flex items-center gap-2"
                    >
                        {submitting ? 'Saving...' : 'Confirm Ban'} <Save className="w-4 h-4" />
                    </button>
                </div>

            </form>
        </div>
    );
}
