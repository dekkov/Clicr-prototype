"use client";

import {
    ArrowDownToLine, ArrowUpFromLine, RotateCcw, TrendingUp,
    ScanLine, CheckCircle2, XCircle, Users, Gauge, X,
} from "lucide-react";
import type { NightLog } from "@/lib/types";

interface DaySummaryCardProps {
    open: boolean;
    log: NightLog | null;
    capacityMax?: number;
    onDismiss: () => void;
}

export function DaySummaryCard({ open, log, capacityMax, onDismiss }: DaySummaryCardProps) {
    if (!open || !log) return null;

    const netEntries = log.total_in - log.turnarounds;
    const capacityPct = capacityMax ? Math.round((log.peak_occupancy / capacityMax) * 100) : null;

    const categories = [
        {
            label: 'Traffic',
            items: [
                { icon: ArrowDownToLine, label: 'Total In', value: log.total_in, color: 'text-blue-500' },
                { icon: ArrowUpFromLine, label: 'Total Out', value: log.total_out, color: 'text-orange-500' },
                { icon: RotateCcw, label: 'Turnarounds', value: log.turnarounds, color: 'text-amber-500' },
                { icon: TrendingUp, label: 'Net Entries', value: netEntries, color: 'text-emerald-500' },
            ],
        },
        {
            label: 'Scanning',
            items: [
                { icon: ScanLine, label: 'IDs Scanned', value: log.scans_total, color: 'text-indigo-500' },
                { icon: CheckCircle2, label: 'Accepted', value: log.scans_accepted, color: 'text-emerald-500' },
                { icon: XCircle, label: 'Denied', value: log.scans_denied, color: 'text-red-500' },
            ],
        },
        {
            label: 'Capacity',
            items: [
                { icon: Users, label: 'Peak Occupancy', value: log.peak_occupancy, color: 'text-purple-500' },
                ...(capacityPct !== null ? [
                    { icon: Gauge, label: '% of Max', value: `${capacityPct}%`, color: 'text-cyan-500' },
                ] : []),
            ],
        },
    ];

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onDismiss} />
            <div className="relative bg-card border border-border rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl animate-fade-in">
                <button onClick={onDismiss} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-4 h-4" />
                </button>

                <h3 className="text-lg font-bold text-foreground mb-1">Day Summary</h3>
                <p className="text-sm text-muted-foreground mb-5">{log.business_date}</p>

                <div className="space-y-5">
                    {categories.map(cat => (
                        <div key={cat.label}>
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{cat.label}</h4>
                            <div className="grid grid-cols-2 gap-2">
                                {cat.items.map(item => (
                                    <div key={item.label} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/50">
                                        <item.icon className={`w-4 h-4 ${item.color} shrink-0`} />
                                        <div className="min-w-0">
                                            <p className="text-xs text-muted-foreground truncate">{item.label}</p>
                                            <p className="text-sm font-bold text-foreground">{item.value}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <button
                    onClick={onDismiss}
                    className="w-full mt-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-bold transition-colors"
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}
