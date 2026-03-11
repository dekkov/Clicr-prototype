import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
    title: string;
    value: string | number;
    subtext?: string;
    icon?: LucideIcon;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;
    className?: string;
}

export function KpiCard({ title, value, subtext, icon: Icon, trend, trendValue, className }: KpiCardProps) {
    return (
        <div className={cn("glass-card p-6 rounded-xl flex flex-col justify-between h-full relative overflow-hidden group hover:bg-muted/40 transition-all duration-300", className)}>
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                {Icon && <Icon className="w-16 h-16" />}
            </div>

            <div className="flex items-start justify-between z-10">
                <div>
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title}</h3>
                    <div className="mt-2 text-3xl font-bold text-foreground tracking-tight">{value}</div>
                </div>
                {Icon && <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
                    <Icon className="w-6 h-6 text-primary" />
                </div>}
            </div>

            {(subtext || trendValue) && (
                <div className="mt-4 flex items-center text-xs z-10">
                    {trendValue && (
                        <span className={cn("font-medium mr-2 px-1.5 py-0.5 rounded",
                            trend === 'up' ? "bg-emerald-500/10 text-emerald-400" :
                                trend === 'down' ? "bg-rose-500/10 text-rose-400" : "bg-muted-foreground/10 text-muted-foreground"
                        )}>
                            {trendValue}
                        </span>
                    )}
                    <span className="text-muted-foreground">{subtext}</span>
                </div>
            )}
        </div>
    );
}
