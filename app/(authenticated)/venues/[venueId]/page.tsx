"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/lib/store';
import {
    ArrowLeft,
    LayoutDashboard,
    Layers,
    ShieldAlert,
    MonitorSmartphone,
    Settings,
    FileText,
    Users,
    RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import VenueOverview from './_components/VenueOverview';
import VenueAreas from './_components/VenueAreas';
import VenueCapacity from './_components/VenueCapacity';
import VenueDevices from './_components/VenueDevices';
import VenueSettings from './_components/VenueSettings';
import VenueLogs from './_components/VenueLogs';
import VenueTeam from './_components/VenueTeam';

type Tab = 'OVERVIEW' | 'AREAS' | 'CAPACITY' | 'DEVICES' | 'TEAM' | 'SETTINGS' | 'LOGS';

const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'OVERVIEW', label: 'Overview', icon: LayoutDashboard },
    { id: 'AREAS', label: 'Areas', icon: Layers },
    { id: 'CAPACITY', label: 'Capacity Rules', icon: ShieldAlert },
    { id: 'DEVICES', label: 'Devices', icon: MonitorSmartphone },
    { id: 'TEAM', label: 'Team', icon: Users },
    { id: 'SETTINGS', label: 'Settings', icon: Settings },
    { id: 'LOGS', label: 'Logs', icon: FileText },
];

export default function VenueDetailPage() {
    const params = useParams();
    const venueId = params?.venueId as string;
    const router = useRouter();
    const { venues, isLoading } = useApp();
    const [activeTab, setActiveTab] = useState<Tab>('OVERVIEW');

    const venue = venues.find(v => v.id === venueId);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-muted-foreground gap-4">
                <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                <p>Loading venue details...</p>
            </div>
        );
    }

    if (!venue) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-muted-foreground gap-4">
                <ShieldAlert className="w-12 h-12 text-slate-700" />
                <div className="text-center">
                    <h2 className="text-xl font-bold text-foreground mb-2">Venue Not Found</h2>
                    <p className="max-w-md mx-auto mb-4">
                        We couldn't find a venue with ID <code className="bg-muted px-1 py-0.5 rounded text-xs">{venueId}</code>.
                        It may have been deleted or you don't have permission to view it.
                    </p>
                    <div className="flex items-center justify-center gap-4">
                        <button onClick={() => window.location.reload()} className="text-primary hover:underline">
                            Retry
                        </button>
                        <span className="text-slate-700">•</span>
                        <button onClick={() => router.push('/venues')} className="text-primary hover:underline">
                            Return to Venues
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => router.push('/dashboard')}
                    className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{venue.name}</h1>
                    <p className="text-sm text-muted-foreground">
                        {venue.city ? `${venue.city}, ${venue.state}` : 'No Location Set'} • {venue.status}
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-border flex gap-1 overflow-x-auto">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap rounded-t-lg",
                                isActive
                                    ? "border-primary bg-muted !text-foreground shadow-lg"
                                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-card"
                            )}
                        >
                            <Icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-current")} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Content Area */}
            <div className="min-h-[400px]">
                {activeTab === 'OVERVIEW' && <VenueOverview venueId={venueId} setActiveTab={setActiveTab} />}
                {activeTab === 'AREAS' && <VenueAreas venueId={venueId} />}
                {activeTab === 'CAPACITY' && <VenueCapacity venueId={venueId} />}
                {activeTab === 'DEVICES' && <VenueDevices venueId={venueId} />}
                {activeTab === 'SETTINGS' && <VenueSettings venueId={venueId} />}
                {activeTab === 'LOGS' && <VenueLogs venueId={venueId} />}
                {activeTab === 'TEAM' && <VenueTeam venueId={venueId} />}
            </div>
        </div>
    );
}
