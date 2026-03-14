'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Search, ShieldAlert, FileText, Download, Ban, ShieldOff } from 'lucide-react';
import { useApp } from '@/lib/store';
import { filterGuests } from '@/lib/guest-utils';
import { ComplianceEngine } from '@/lib/compliance';
import { createClient } from '@/utils/supabase/client';

export default function GuestDirectoryPage() {
    const { scanEvents, activeBusiness } = useApp();
    const [searchTerm, setSearchTerm] = useState('');
    const [stateFilter, setStateFilter] = useState('ALL');
    const [bannedHashes, setBannedHashes] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!activeBusiness) return;
        const supabase = createClient();
        supabase
            .from('banned_persons')
            .select('identity_token_hash, patron_bans!inner(status)')
            .eq('business_id', activeBusiness.id)
            .eq('patron_bans.status', 'ACTIVE')
            .then(({ data }) => {
                if (data) {
                    setBannedHashes(new Set(data.map((r: any) => r.identity_token_hash).filter(Boolean)));
                }
            });
    }, [activeBusiness?.id]);

    const filteredScans = filterGuests(scanEvents, searchTerm, stateFilter);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Guest Directory</h1>
                    <p className="text-muted-foreground mt-1">
                        View scanned ID data. Visibility is strictly controlled by state compliance rules.
                    </p>
                </div>
                <Button variant="outline" className="border-border bg-card text-foreground hover:bg-muted">
                    <Download className="mr-2 h-4 w-4" />
                    Export Log
                </Button>
            </div>

            <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name or last 4..."
                                className="pl-9 bg-background border-border"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select
                            value={stateFilter}
                            onChange={(e) => setStateFilter(e.target.value)}
                            className="w-[180px] flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 border-border"
                        >
                            <option value="ALL">All States</option>
                            <option value="TX">Texas (TX)</option>
                            <option value="CA">California (CA)</option>
                            <option value="NY">New York (NY)</option>
                            <option value="FL">Florida (FL)</option>
                        </select>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border border-border overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-background text-muted-foreground font-medium">
                                <tr>
                                    <th className="p-4">Name</th>
                                    <th className="p-4">Age</th>
                                    <th className="p-4">Last 4 + State</th>
                                    <th className="p-4">Result</th>
                                    <th className="p-4">Compliance Status</th>
                                    <th className="p-4">Time</th>
                                    <th className="p-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border bg-card/50">
                                {filteredScans.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
                                            No guests found matching your filters.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredScans.map((scan) => {
                                        const state = scan.issuing_state || 'Unknown';
                                        const rule = ComplianceEngine.getRule(state);
                                        const isRestricted = !rule.storePII;
                                        const complianceReason = ComplianceEngine.getRestrictionReason(state);

                                        // Construct ban URL
                                        const params = new URLSearchParams({
                                            mode: 'create',
                                            fname: scan.first_name || '',
                                            lname: scan.last_name || '',
                                            dob: scan.dob || '',
                                            id_last4: scan.id_number_last4 || '',
                                            state: scan.issuing_state || '',
                                        });
                                        if (scan.identity_token_hash) params.set('token_hash', scan.identity_token_hash);
                                        const banLink = `/banning?${params.toString()}`;

                                        return (
                                            <tr key={scan.id} className="hover:bg-muted/50 transition-colors">
                                                <td className="p-4 font-medium text-foreground">
                                                    {isRestricted ? (
                                                        <span className="italic text-muted-foreground/60">Redacted</span>
                                                    ) : (
                                                        `${scan.last_name}, ${scan.first_name}`
                                                    )}
                                                </td>
                                                <td className="p-4 text-foreground/80">
                                                    {scan.age}
                                                </td>
                                                <td className="p-4 text-foreground/80 font-mono">
                                                    {scan.id_number_last4
                                                        ? `••••${scan.id_number_last4} — ${state}`
                                                        : state || '—'}
                                                </td>
                                                <td className="p-4">
                                                    <Badge className={
                                                        scan.scan_result === 'DENIED'
                                                            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                                            : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                                                    }>
                                                        {scan.scan_result}
                                                    </Badge>
                                                </td>
                                                <td className="p-4">
                                                    {isRestricted ? (
                                                        <div className="flex items-center text-amber-500 text-xs gap-1.5">
                                                            <ShieldAlert className="h-3.5 w-3.5" />
                                                            {complianceReason}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center text-emerald-600 text-xs gap-1.5">
                                                            <FileText className="h-3.5 w-3.5" />
                                                            Full Record
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-4 text-foreground/80">
                                                    {new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    <div className="text-xs text-muted-foreground">
                                                        {new Date(scan.timestamp).toLocaleDateString()}
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    {!isRestricted && (
                                                        scan.identity_token_hash && bannedHashes.has(scan.identity_token_hash) ? (
                                                            <Link href="/banning">
                                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10" title="Revoke Ban">
                                                                    <ShieldOff className="h-4 w-4" />
                                                                    <span className="sr-only">Revoke Ban</span>
                                                                </Button>
                                                            </Link>
                                                        ) : (
                                                            <Link href={banLink}>
                                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10" title="Ban Patron">
                                                                    <Ban className="h-4 w-4" />
                                                                    <span className="sr-only">Ban Patron</span>
                                                                </Button>
                                                            </Link>
                                                        )
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
