"use client";

import React from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/store';
import { ArrowRight, BarChart3, MapPin } from 'lucide-react';

export default function ReportsLandingPage() {
    const { venues } = useApp();

    return (
        <div className="p-6 max-w-[1600px]">
            <div className="mb-8">
                <h1 className="text-3xl mb-1">Reports</h1>
                <p className="text-muted-foreground text-sm">Analytics and historical data reports.</p>
            </div>

            {venues.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-12 text-center">
                    <div className="w-16 h-16 rounded-xl bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-500/20 flex items-center justify-center mx-auto mb-4">
                        <BarChart3 className="w-8 h-8 text-purple-400" />
                    </div>
                    <h3 className="text-lg mb-2">Reports Coming Soon</h3>
                    <p className="text-muted-foreground text-sm">No venues found. Please create a venue first.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {venues.map(venue => (
                        <Link
                            key={venue.id}
                            href={`/reports/${venue.id}`}
                            className="bg-card border border-border rounded-xl p-6 hover:border-border transition-colors group flex flex-col"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-500/20 flex items-center justify-center">
                                    <BarChart3 className="w-5 h-5 text-purple-400" />
                                </div>
                                <div className="px-2 py-1 bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-400 text-xs font-bold rounded uppercase tracking-wider">
                                    Active
                                </div>
                            </div>

                            <h3 className="text-xl font-bold mb-1 group-hover:text-purple-400 transition-colors">{venue.name}</h3>
                            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-6">
                                <MapPin className="w-3 h-3" />
                                {venue.city}, {venue.state}
                            </div>

                            <div className="mt-auto pt-4 border-t border-border flex items-center justify-between text-sm font-bold text-purple-400 group-hover:translate-x-1 transition-transform">
                                View Reports
                                <ArrowRight className="w-4 h-4" />
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
