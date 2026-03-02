"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import {
    LayoutDashboard,
    MapPin,
    Layers,
    MousePointer2,
    BarChart3,
    Settings,
    LogOut,
    Ban,
    Moon,
    Bell,
    ChevronDown,
    Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/store';
import { Business } from '@/lib/types';

const NAV_ITEMS = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Venues',    href: '/venues',    icon: MapPin },
    { label: 'Areas',     href: '/areas',     icon: Layers },
    { label: 'Clicrs',   href: '/clicr',     icon: MousePointer2 },
    { label: 'Bans',     href: '/banning',   icon: Ban },
    { label: 'Reports',  href: '/reports',   icon: BarChart3 },
    { label: 'Settings', href: '/settings',  icon: Settings },
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

function BusinessSelector() {
    const { businesses, activeBusiness, venues, selectBusiness } = useApp();
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const venueCount = activeBusiness
        ? venues.filter(v => v.business_id === activeBusiness.id).length
        : 0;

    useEffect(() => {
        function handleMouseDown(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, []);

    const canToggle = businesses.length > 1;

    function handleSelect(biz: Business) {
        selectBusiness(biz);
        setOpen(false);
    }

    return (
        <div ref={containerRef} className="relative px-3 py-3 border-b border-border/50">
            <button
                onClick={() => canToggle && setOpen(prev => !prev)}
                className={cn(
                    "w-full flex items-center gap-2.5 rounded-lg p-2 transition-colors text-left",
                    canToggle ? "hover:bg-slate-800/50 cursor-pointer" : "cursor-default"
                )}
            >
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary-foreground">
                        {activeBusiness ? (activeBusiness.name.charAt(0) || '?').toUpperCase() : '?'}
                    </span>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate leading-tight">
                        {activeBusiness ? activeBusiness.name : 'Select Business'}
                    </p>
                    {activeBusiness && (
                        <p className="text-xs text-slate-400 leading-tight">
                            {venueCount} {venueCount === 1 ? 'venue' : 'venues'}
                        </p>
                    )}
                </div>
                {canToggle && (
                    <ChevronDown className={cn(
                        "w-4 h-4 text-slate-400 shrink-0 transition-transform",
                        open && "rotate-180"
                    )} />
                )}
            </button>

            {open && canToggle && (
                <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
                    {businesses.map(biz => {
                        const isSelected = activeBusiness?.id === biz.id;
                        return (
                            <button
                                key={biz.id}
                                onClick={() => handleSelect(biz)}
                                className={cn(
                                    "w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors text-left",
                                    isSelected
                                        ? "bg-primary/10 text-primary"
                                        : "text-slate-300 hover:bg-slate-800/60"
                                )}
                            >
                                <div className={cn(
                                    "w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-xs font-bold",
                                    isSelected ? "bg-primary text-primary-foreground" : "bg-slate-700 text-slate-200"
                                )}>
                                    {(biz.name.charAt(0) || '?').toUpperCase()}
                                </div>
                                <span className="flex-1 text-sm truncate">{biz.name}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { currentUser } = useApp();
    const supabase = useMemo(() => createClient(), []);

    const handleSignOut = useCallback(async () => {
        await supabase.auth.signOut();
        router.refresh();
        router.push('/login');
    }, [supabase, router]);

    const userInitials = getUserInitials(currentUser?.name ?? '', currentUser?.email ?? '');

    return (
        <div className="fixed inset-0 bg-background text-foreground flex flex-col overflow-hidden">

            {/* Full-Width Topbar */}
            <header className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-border/60 bg-card/60 backdrop-blur-sm z-30">
                <div className="flex items-center gap-2.5">
                    <img src="/clicr-logo.png" alt="CLICR" className="h-7 w-auto object-contain" />
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25 leading-tight">
                        v4.0
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors" aria-label="Toggle dark mode">
                        <Moon className="w-4 h-4" />
                    </button>
                    <button className="relative p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors" aria-label="Notifications">
                        <Bell className="w-4 h-4" />
                        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
                    </button>
                    <div className="ml-1 w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                        <span className="text-[11px] font-bold text-primary">{userInitials}</span>
                    </div>
                </div>
            </header>

            {/* Inner Row: Sidebar + Content */}
            <div className="flex flex-1 min-h-0 flex-col md:flex-row overflow-hidden">

                {/* Sidebar (Desktop) */}
                <aside className="w-44 border-r border-border bg-card/50 hidden md:flex flex-col glass-panel z-20 shrink-0">
                    <BusinessSelector />
                    <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
                        {NAV_ITEMS.map((item) => {
                            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 group text-sm",
                                        isActive
                                            ? "bg-primary/10 text-primary font-bold"
                                            : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
                                    )}
                                >
                                    <item.icon className={cn(
                                        "w-4 h-4 shrink-0",
                                        isActive ? "text-primary" : "text-slate-500 group-hover:text-slate-300"
                                    )} />
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>
                    <div className="p-2 border-t border-border/50">
                        <button
                            onClick={handleSignOut}
                            className="flex items-center gap-2.5 px-3 py-2 w-full text-sm text-slate-400 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        >
                            <LogOut className="w-4 h-4 shrink-0" />
                            <span>Sign Out</span>
                        </button>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
                    <div className="flex-1 overflow-y-auto overscroll-none p-4 md:p-8">
                        <div className="fixed top-0 left-0 w-full h-[500px] bg-gradient-to-b from-primary/5 to-transparent pointer-events-none -z-10" />
                        <div className="max-w-7xl mx-auto min-h-full">
                            {children}
                        </div>
                    </div>
                </main>

                {/* Mobile Bottom Nav */}
                <nav className="md:hidden flex-none bg-[#0f1116] border-t border-white/10 pb-[env(safe-area-inset-bottom)] z-50">
                    <div className="flex justify-around items-center p-2">
                        {MOBILE_NAV_ITEMS.map((item) => {
                            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-14",
                                        isActive ? "text-primary" : "text-slate-500 hover:text-slate-300"
                                    )}
                                >
                                    <div className={cn(
                                        "p-1.5 rounded-full transition-all",
                                        isActive ? "bg-primary/20" : "bg-transparent"
                                    )}>
                                        <item.icon className={cn("w-5 h-5", isActive && "fill-current")} />
                                    </div>
                                    <span className="text-[10px] font-bold">{item.label}</span>
                                </Link>
                            );
                        })}
                    </div>
                </nav>
            </div>
        </div>
    );
}
