"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, notFound } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import {
    LayoutDashboard,
    MapPin,
    Layers,
    Sparkles,
    BarChart3,
    Settings,
    LogOut,
    Ban,
    Moon,
    Bell,
    ChevronDown,
    Check,
    Plus,
    Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/store';
import { Business, Role } from '@/lib/types';
import { getScopeSelectorType, getVisibleNavItems, canAccessRoute, hasMinRole } from '@/lib/permissions';
import type { NavItemDef } from '@/lib/permissions';

const NAV_ITEMS: NavItemDef[] = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Venues',    href: '/venues',    icon: MapPin },
    { label: 'Areas',     href: '/areas',     icon: Layers },
    { label: 'Clicrs',    href: '/clicr',     icon: Sparkles },
    { label: 'Bans',      href: '/banning',   icon: Ban },
    { label: 'Reports',   href: '/reports',   icon: BarChart3 },
    { label: 'Settings',  href: '/settings',  icon: Settings },
];

const MOBILE_NAV_LABELS = ['Dashboard', 'Venues', 'Clicrs', 'Bans', 'Reports'];
const MOBILE_NAV_ITEMS = NAV_ITEMS.filter(i => MOBILE_NAV_LABELS.includes(i.label));

function getUserInitials(name: string, email: string): string {
    if (name && name.trim()) {
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return parts[0][0].toUpperCase();
    }
    if (email && email.trim()) {
        return email[0].toUpperCase();
    }
    return '??';
}

function VenueSelector() {
    const { venues, activeVenueId, selectVenue } = useApp();
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent | TouchEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, []);

    const selectedVenue = venues.find(v => v.id === activeVenueId);

    function handleSelect(venueId: string) {
        selectVenue(venueId);
        setOpen(false);
    }

    if (venues.length === 0) return null;
    if (venues.length === 1) {
        return (
            <div className="w-full flex items-center gap-3 rounded-lg bg-purple-900/30 p-3">
                <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-white">
                        {(venues[0].name.charAt(0) || '?').toUpperCase()}
                    </span>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{venues[0].name}</div>
                    <div className="text-xs text-gray-400">Venue</div>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="relative">
            <button
                onClick={() => setOpen(prev => !prev)}
                className="w-full flex items-center gap-3 rounded-lg bg-purple-900/30 p-3 hover:bg-purple-900/40 transition-colors text-left cursor-pointer"
            >
                <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-white">
                        {selectedVenue ? (selectedVenue.name.charAt(0) || '?').toUpperCase() : '?'}
                    </span>
                </div>
                <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm text-white truncate">{selectedVenue ? selectedVenue.name : 'Select Venue'}</div>
                    <div className="text-xs text-gray-400">{venues.length} venues</div>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
            </button>
            {open && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-gray-900 border border-gray-800 rounded-lg shadow-xl overflow-hidden">
                    {venues.map(venue => {
                        const isSelected = venue.id === activeVenueId;
                        return (
                            <button
                                key={venue.id}
                                onClick={() => handleSelect(venue.id)}
                                className={cn(
                                    "w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors text-left",
                                    isSelected ? "bg-purple-900/40 text-white" : "text-gray-300 hover:bg-gray-800/60"
                                )}
                            >
                                <div className={cn(
                                    "w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-xs font-bold",
                                    isSelected ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-200"
                                )}>
                                    {(venue.name.charAt(0) || '?').toUpperCase()}
                                </div>
                                <span className="flex-1 text-sm truncate">{venue.name}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function BusinessSelector() {
    const { businesses, activeBusiness, venues, selectBusiness, currentUser } = useApp();
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const venueCount = activeBusiness
        ? venues.filter(v => v.business_id === activeBusiness.id).length
        : 0;

    useEffect(() => {
        function handleClickOutside(e: MouseEvent | TouchEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, []);

    const canToggle = true; // always allow opening to show "Add Business" option

    function handleSelect(biz: Business) {
        if (biz.id !== activeBusiness?.id) {
            selectBusiness(biz);
        }
        setOpen(false);
    }

    return (
        <div ref={containerRef} className="relative">
            <button
                onClick={() => canToggle && setOpen(prev => !prev)}
                className={cn(
                    "w-full flex items-center gap-3 rounded-lg bg-purple-900/30 p-3 transition-colors text-left",
                    canToggle ? "hover:bg-purple-900/40 cursor-pointer" : "cursor-default"
                )}
            >
                <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-white">
                        {activeBusiness ? (activeBusiness.name.charAt(0) || '?').toUpperCase() : '?'}
                    </span>
                </div>
                <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm text-white truncate">
                        {activeBusiness ? activeBusiness.name : 'Select Business'}
                    </div>
                    {activeBusiness && (
                        <div className="text-xs text-gray-400">
                            {venueCount} {venueCount === 1 ? 'venue' : 'venues'}
                        </div>
                    )}
                </div>
                {canToggle && (
                    <ChevronDown className={cn(
                        "w-4 h-4 text-gray-400 shrink-0 transition-transform",
                        open && "rotate-180"
                    )} />
                )}
            </button>

            {open && canToggle && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-gray-900 border border-gray-800 rounded-lg shadow-xl overflow-hidden">
                    {businesses.map(biz => {
                        const isSelected = activeBusiness?.id === biz.id;
                        return (
                            <button
                                key={biz.id}
                                onClick={() => handleSelect(biz)}
                                className={cn(
                                    "w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors text-left",
                                    isSelected
                                        ? "bg-purple-900/40 text-white"
                                        : "text-gray-300 hover:bg-gray-800/60"
                                )}
                            >
                                <div className={cn(
                                    "w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-xs font-bold",
                                    isSelected ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-200"
                                )}>
                                    {(biz.name.charAt(0) || '?').toUpperCase()}
                                </div>
                                <span className="flex-1 text-sm truncate">{biz.name}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                            </button>
                        );
                    })}
                    {hasMinRole(currentUser?.role as Role | undefined, 'ADMIN') && (
                        <>
                            <div className="border-t border-gray-700" />
                            <Link
                                href="/businesses/new"
                                onClick={() => setOpen(false)}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors text-left text-gray-400 hover:bg-gray-800/60 hover:text-white"
                            >
                                <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-gray-800 border border-dashed border-gray-600">
                                    <Plus className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-sm">Add New Business</span>
                            </Link>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function ScopeSelector() {
    const { currentUser, venues, businesses } = useApp();
    const role = currentUser?.role as Role | undefined;
    const assignedVenueIds = (currentUser as { assigned_venue_ids?: string[] })?.assigned_venue_ids ?? [];
    const assignedVenueCount = assignedVenueIds.length;
    const businessCount = businesses?.length ?? 0;
    const scopeType = getScopeSelectorType(role, assignedVenueCount, businessCount);

    if (scopeType === 'venue') {
        return <VenueSelector />;
    }
    if (scopeType === 'business') {
        return <BusinessSelector />;
    }
    return null;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { currentUser, isLoading } = useApp();
    const supabase = useMemo(() => createClient(), []);

    const handleSignOut = useCallback(async () => {
        await supabase.auth.signOut();
        try { localStorage.removeItem('clicr_last_biz_id'); } catch { }
        router.refresh();
        router.push('/login');
    }, [supabase, router]);

    const userInitials = getUserInitials(currentUser?.name ?? '', currentUser?.email ?? '');
    const userRole = currentUser?.role as Role | undefined;
    const visibleNavItems = getVisibleNavItems(userRole, NAV_ITEMS);
    const visibleMobileItems = visibleNavItems.filter(i => MOBILE_NAV_LABELS.includes(i.label));

    // STAFF hitting /dashboard or /: redirect to /areas (must run in effect, not during render)
    const staffRedirect = !isLoading && userRole === 'STAFF' && (pathname === '/dashboard' || pathname === '/');
    useEffect(() => {
        if (staffRedirect) router.replace('/areas');
    }, [staffRedirect, router]);

    if (staffRedirect) {
        return (
            <div className="flex flex-col h-screen bg-black text-white items-center justify-center">
                <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            </div>
        );
    }

    if (!isLoading && userRole && !canAccessRoute(userRole, pathname)) {
        notFound();
    }

    if (isLoading) {
        return (
            <div className="flex flex-col h-screen bg-black text-white items-center justify-center">
                <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <span className="font-semibold">clicr</span>
                    <span className="text-xs text-blue-400 ml-1">v4.0</span>
                </div>
                <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row h-screen bg-black text-white overflow-hidden">
            {/* Desktop: sidebar + main. Mobile: main only */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Sidebar - Design: w-64, border-gray-800 */}
                <aside className="w-64 border-r border-gray-800 flex flex-col shrink-0 hidden md:flex">
                {/* Logo */}
                <div className="h-16 border-b border-gray-800 flex items-center px-4 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-semibold">clicr</span>
                        <span className="text-xs text-blue-400 ml-1">v4.0</span>
                    </div>
                </div>

                {/* Group Selector (Business/Venue) */}
                <div className="px-4 py-4 border-b border-gray-800 shrink-0">
                    <ScopeSelector />
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                    {visibleNavItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                                    isActive ? "bg-purple-900/40 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                                )}
                            >
                                <Icon className="w-5 h-5 shrink-0" />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Settings + Sign out */}
                <div className="px-3 py-4 border-t border-gray-800 space-y-1 shrink-0">
                    <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors"
                    >
                        <LogOut className="w-5 h-5 shrink-0" />
                        <span>Sign out</span>
                    </button>
                </div>
                </aside>

                {/* Main: Top bar + Content */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Top Bar - Design: h-16 */}
                <header className="h-16 border-b border-gray-800 flex items-center px-4 md:px-6 gap-3 shrink-0">
                    {/* Mobile: Business selector (hidden on desktop — desktop uses sidebar) */}
                    <div className="md:hidden flex-1 min-w-0">
                        <ScopeSelector />
                    </div>
                    <div className="hidden md:block flex-1" />
                    <button className="w-10 h-10 rounded-lg hover:bg-gray-800 flex items-center justify-center transition-colors" aria-label="Theme">
                        <Moon className="w-5 h-5 text-gray-400" />
                    </button>
                    <button className="w-10 h-10 rounded-lg hover:bg-gray-800 flex items-center justify-center transition-colors relative" aria-label="Notifications">
                        <Bell className="w-5 h-5 text-gray-400" />
                        <span className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full" />
                    </button>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-sm font-semibold shrink-0">
                        {userInitials}
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-auto">
                    <div className="p-6 max-w-[1600px] mx-auto">
                        {children}
                    </div>
                </main>
                </div>
            </div>

            {/* Mobile Bottom Nav */}
            <nav className="md:hidden flex-none bg-gray-900 border-t border-gray-800 pb-[env(safe-area-inset-bottom)] z-50">
                <div className="flex justify-around items-center p-2">
                    {visibleMobileItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-14",
                                    isActive ? "text-purple-400" : "text-gray-500 hover:text-gray-300"
                                )}
                            >
                                <div className={cn(
                                    "p-1.5 rounded-full transition-all",
                                    isActive ? "bg-purple-900/40" : "bg-transparent"
                                )}>
                                    <item.icon className="w-5 h-5" />
                                </div>
                                <span className="text-[10px] font-bold">{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}
