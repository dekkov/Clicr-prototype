"use client";

import React, { useMemo } from 'react';
import { useApp } from '@/lib/store';
import { FileText, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function VenueLogs({ venueId }: { venueId: string }) {
    const { venueAuditLogs, turnarounds, users } = useApp();

    const userMap = useMemo(() => {
        const m: Record<string, string> = {};
        (users || []).forEach(u => { m[u.id] = u.name || u.email; });
        return m;
    }, [users]);

    // Merge audit logs + turnarounds into a single timeline
    const allEntries = useMemo(() => {
        const auditEntries = venueAuditLogs
            .filter(l => l.venue_id === venueId)
            .map(l => ({
                id: l.id,
                type: 'AUDIT' as const,
                action: l.action.replace(/_/g, ' '),
                userId: l.performed_by_user_id,
                timestamp: new Date(l.timestamp).getTime(),
                details: l.details_json,
            }));

        const turnaroundEntries = (turnarounds || [])
            .filter(t => t.venue_id === venueId)
            .map(t => ({
                id: t.id,
                type: 'TURNAROUND' as const,
                action: 'TURNAROUND',
                userId: t.created_by,
                timestamp: t.timestamp,
                details: { count: t.count, reason: t.reason },
            }));

        return [...auditEntries, ...turnaroundEntries]
            .sort((a, b) => b.timestamp - a.timestamp);
    }, [venueAuditLogs, turnarounds, venueId]);

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold">Audit Logs</h2>
            <div className="space-y-4">
                {allEntries.length === 0 && (
                    <div className="p-8 text-center bg-muted/30 rounded-2xl border border-border border-dashed">
                        <FileText className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
                        <p className="text-muted-foreground text-sm">No audit logs recorded yet.</p>
                    </div>
                )}
                {allEntries.map(entry => (
                    <div key={entry.id} className="p-4 bg-card border border-border rounded-xl">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                                {entry.type === 'TURNAROUND' && (
                                    <RotateCcw className="w-4 h-4 text-purple-400 shrink-0" />
                                )}
                                <span className={cn(
                                    "text-sm font-bold px-2 py-0.5 rounded",
                                    entry.type === 'TURNAROUND'
                                        ? "bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300"
                                        : "bg-muted text-foreground"
                                )}>
                                    {entry.action}
                                </span>
                                <span className="text-muted-foreground text-sm">
                                    by {userMap[entry.userId] || 'Unknown'}
                                </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                                {new Date(entry.timestamp).toLocaleString()}
                            </span>
                        </div>
                        {entry.details && (
                            <pre className="mt-2 text-[10px] text-muted-foreground bg-background/30 p-2 rounded overflow-x-auto">
                                {JSON.stringify(entry.details, null, 2)}
                            </pre>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
