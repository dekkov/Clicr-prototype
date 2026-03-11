'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, ChevronRight, X } from 'lucide-react';
import { useApp } from '@/lib/store';
import Link from 'next/link';

const DISMISSED_KEY = 'clicr_checklist_dismissed';

export function GettingStartedChecklist() {
    const { activeBusiness, venues, areas, clicrs, users, teamMemberCount } = useApp();
    const [dismissed, setDismissed] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true');
    }, []);

    const settings = activeBusiness?.settings;

    const items = [
        {
            id: 'business',
            label: 'Set up your business',
            description: 'Name your organization',
            completed: activeBusiness !== null,
            href: null,
        },
        {
            id: 'venue',
            label: 'Add your first venue',
            description: 'Create a location to track occupancy',
            completed: venues.length > 0,
            href: '/venues/new',
        },
        {
            id: 'areas',
            label: 'Define areas in your venue',
            description: 'Create zones like Main Floor, VIP, etc.',
            completed: areas.length > 0,
            href: '/areas',
        },
        {
            id: 'devices',
            label: 'Connect a Clicr device',
            description: 'Register a counter to start tracking',
            completed: clicrs.length > 0,
            href: '/areas',
        },
        {
            id: 'invite',
            label: 'Invite your team',
            description: 'Add staff to help manage your venue',
            completed: users.length > 1 || (teamMemberCount ?? 0) > 1,
            href: '/settings/team',
        },
        {
            id: 'scan',
            label: 'Configure scanning',
            description: 'Set up ID scanning for your devices',
            completed: !!settings?.scan_method,
            href: '/settings/scanning',
        },
        {
            id: 'ban',
            label: 'Set ban policies',
            description: 'Configure who can ban and default scope',
            completed: !!settings?.ban_permissions,
            href: '/settings/ban-policies',
        },
    ];

    const completedCount = items.filter(i => i.completed).length;
    const allDone = completedCount === items.length;

    // Don't render until mounted (avoids localStorage hydration mismatch)
    if (!mounted || dismissed || allDone) return null;

    const handleDismiss = () => {
        localStorage.setItem(DISMISSED_KEY, 'true');
        setDismissed(true);
    };

    return (
        <div className="glass-panel border border-primary/20 rounded-2xl p-6 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start justify-between mb-5">
                <div>
                    <h3 className="text-lg font-bold text-foreground">Ready for First Night</h3>
                    <p className="text-muted-foreground text-sm mt-0.5">
                        {completedCount} of {items.length} steps complete
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Progress bar */}
                    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{ width: `${(completedCount / items.length) * 100}%` }}
                        />
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="text-muted-foreground/60 hover:text-foreground/80 transition-colors p-1"
                        title="Dismiss"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="space-y-3">
                {items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                        {item.completed ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                        ) : (
                            <Circle className="w-5 h-5 text-muted-foreground/60 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                            <div className={`text-sm font-medium ${item.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                                {item.label}
                            </div>
                            {!item.completed && (
                                <div className="text-xs text-muted-foreground/60">{item.description}</div>
                            )}
                        </div>
                        {!item.completed && item.href && (
                            <Link
                                href={item.href}
                                className="shrink-0 text-primary hover:text-indigo-400 transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </Link>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
