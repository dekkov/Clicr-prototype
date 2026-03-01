"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/store';
import { Venue } from '@/lib/types';
import {
    MapPin,
    Users,
    Layers,
    MonitorSmartphone,
    Plus,
    ArrowRight,
    Search,
    Building2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { createClient } from '@/utils/supabase/client';

const VenueCard = ({ venue, getVenueStats }: {
    venue: Venue;
    getVenueStats: (venueId: string) => { areaCount: number; currentOccupancy: number; deviceCount: number };
}) => {
    const stats = getVenueStats(venue.id);
    const capacityPct = venue.default_capacity_total
        ? (stats.currentOccupancy / venue.default_capacity_total) * 100
        : 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="group relative bg-slate-900/40 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-6 transition-all hover:bg-slate-900/60 hover:shadow-xl overflow-hidden"
        >
            {/* Decorative gradient blob */}
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors" />

            <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-xl font-bold text-white group-hover:text-primary transition-colors">
                            {venue.name}
                        </h3>
                        <div className="flex items-center gap-1.5 text-sm text-slate-400 mt-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {venue.city ? `${venue.city}, ${venue.state}` : 'Location Unset'}
                        </div>
                    </div>
                    <div className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-bold border",
                        venue.status === 'ACTIVE'
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                    )}>
                        {venue.status}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                        <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5">
                            <Users className="w-3 h-3" /> Occupancy
                        </div>
                        <div className="text-2xl font-bold font-mono">
                            {stats.currentOccupancy.toLocaleString()}
                            <span className="text-xs text-slate-500 font-sans ml-1">
                                / {venue.default_capacity_total?.toLocaleString() ?? '∞'}
                            </span>
                        </div>
                        {venue.default_capacity_total && (
                            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                                <div
                                    className={cn(
                                        "h-full rounded-full",
                                        capacityPct > 90 ? "bg-red-500" : capacityPct > 75 ? "bg-amber-500" : "bg-emerald-500"
                                    )}
                                    style={{ width: `${Math.min(capacityPct, 100)}%` }}
                                />
                            </div>
                        )}
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between p-2 bg-slate-950/30 rounded-lg border border-slate-800/30">
                            <span className="text-xs text-slate-400 flex items-center gap-1.5">
                                <Layers className="w-3 h-3" /> Areas
                            </span>
                            <span className="text-sm font-semibold">{stats.areaCount}</span>
                        </div>
                        <div className="flex items-center justify-between p-2 bg-slate-950/30 rounded-lg border border-slate-800/30">
                            <span className="text-xs text-slate-400 flex items-center gap-1.5">
                                <MonitorSmartphone className="w-3 h-3" /> Devices
                            </span>
                            <span className="text-sm font-semibold">{stats.deviceCount}</span>
                        </div>
                    </div>
                </div>

                <Link
                    href={`/venues/${venue.id}`}
                    className="flex items-center justify-between w-full p-3 bg-slate-800/50 hover:bg-slate-800 border-t border-slate-800 rounded-xl transition-colors group/btn"
                >
                    <span className="text-sm font-medium text-slate-300 group-hover/btn:text-white">Manage Venue</span>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover/btn:text-white transition-transform group-hover/btn:translate-x-1" />
                </Link>
            </div>
        </motion.div>
    );
};

export default function VenuesPage() {
    const { areas, clicrs, devices, businesses } = useApp();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
    const [allVenues, setAllVenues] = useState<Venue[]>([]);
    const [loadingVenues, setLoadingVenues] = useState(true);

    useEffect(() => {
        const load = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (user) {
                headers['x-user-id'] = user.id;
                headers['x-user-email'] = user.email || '';
            }
            // No ?businessId= → server returns all venues across all the user's businesses
            const res = await fetch('/api/sync', { cache: 'no-store', headers });
            if (res.ok) {
                const data = await res.json();
                setAllVenues((data.venues || []).sort((a: Venue, b: Venue) => a.name.localeCompare(b.name)));
            }
            setLoadingVenues(false);
        };
        load();
    }, []);

    // Helper to calc stats — reads from store's areas/clicrs/devices (kept in sync by polling)
    const getVenueStats = (venueId: string) => {
        const venueAreas = areas.filter(a => a.venue_id === venueId);
        const areaIds = venueAreas.map(a => a.id);
        const venueClicrs = clicrs.filter(c => areaIds.includes(c.area_id));
        const currentOccupancy = venueAreas.reduce((sum, a) => sum + (a.current_occupancy || 0), 0);
        const relevantDevices = devices.filter(d =>
            d.venue_id === venueId || (d.area_id && areaIds.includes(d.area_id))
        );
        const activeDevicesCount = relevantDevices.filter(d => d.status === 'ACTIVE').length + venueClicrs.filter(c => c.active).length;
        return { areaCount: venueAreas.length, currentOccupancy, deviceCount: activeDevicesCount };
    };

    const filteredVenues = allVenues.filter(v => {
        const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (v.city && v.city.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesStatus = statusFilter === 'ALL' ||
            (statusFilter === 'ACTIVE' && v.status === 'ACTIVE') ||
            (statusFilter === 'INACTIVE' && v.status !== 'ACTIVE');
        return matchesSearch && matchesStatus;
    });

    // Group by business, preserving alphabetical order of businesses
    const groups = businesses
        .map(biz => ({
            business: biz,
            venues: filteredVenues.filter(v => v.business_id === biz.id),
        }))
        .filter(g => g.venues.length > 0);

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                        Venues
                    </h1>
                    <p className="text-slate-400 mt-1">Manage your locations, zones, and capacity configurations.</p>
                </div>
                <Link
                    href="/venues/new"
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium transition-all shadow-lg hover:shadow-primary/20"
                >
                    <Plus className="w-5 h-5" />
                    Add Venue
                </Link>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search venues by name or city..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    />
                </div>
                <div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-800">
                    {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((filter) => (
                        <button
                            key={filter}
                            onClick={() => setStatusFilter(filter)}
                            className={cn(
                                "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                                statusFilter === filter
                                    ? "bg-slate-800 text-white shadow-sm"
                                    : "text-slate-400 hover:text-slate-300"
                            )}
                        >
                            {filter.charAt(0) + filter.slice(1).toLowerCase()}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            {loadingVenues ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-4">
                            <div className="h-6 bg-slate-800 rounded w-2/3" />
                            <div className="h-4 bg-slate-800 rounded w-1/3" />
                            <div className="grid grid-cols-2 gap-4">
                                <div className="h-20 bg-slate-800 rounded-xl" />
                                <div className="space-y-2">
                                    <div className="h-9 bg-slate-800 rounded-lg" />
                                    <div className="h-9 bg-slate-800 rounded-lg" />
                                </div>
                            </div>
                            <div className="h-10 bg-slate-800 rounded-xl" />
                        </div>
                    ))}
                </div>
            ) : groups.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500">
                    <MapPin className="w-12 h-12 mb-4 opacity-50" />
                    <p>No venues found matching your criteria.</p>
                </div>
            ) : (
                <div className="space-y-10">
                    {groups.map((group, idx) => (
                        <div key={group.business.id}>
                            {/* Business section header */}
                            <div className="flex items-center gap-4 mb-5">
                                <div className="flex items-center gap-2.5">
                                    <Building2 className="w-4 h-4 text-primary" />
                                    <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest">
                                        {group.business.name}
                                    </h2>
                                    <span className="text-xs text-slate-600 font-mono">
                                        {group.venues.length} venue{group.venues.length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                <div className="flex-1 h-px bg-slate-800" />
                            </div>

                            {/* Venue cards grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {group.venues.map(venue => (
                                    <VenueCard key={venue.id} venue={venue} getVenueStats={getVenueStats} />
                                ))}
                            </div>

                            {/* Divider between businesses (not after last) */}
                            {idx < groups.length - 1 && (
                                <div className="mt-10 border-t border-slate-800/60" />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
