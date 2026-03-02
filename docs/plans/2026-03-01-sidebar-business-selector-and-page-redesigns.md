# Sidebar Business Selector + Page Redesigns Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **For Claude:** Each UI task should invoke the frontend-design skill before writing component code.

**Goal:** Move the business picker from the dashboard into a persistent sidebar dropdown, and redesign Dashboard, Venues, Areas, Clicrs, and Bans pages to match the reference images in `image-reference/`.

**Architecture:** The store (`lib/store.tsx`) already has `activeBusiness`, `selectBusiness`, and `clearBusiness`. All pages will read `activeBusiness` from the store instead of maintaining local business state. The sidebar (`AppLayout.tsx`) gains a business selector dropdown that calls `selectBusiness`. The layout gains a full-width topbar (logo + user icons) above the sidebar+content area.

**Tech Stack:** Next.js 14 App Router, React, Tailwind CSS, Lucide icons, Framer Motion (already installed), `useApp()` from `lib/store.tsx`

---

## Reference Image Summary

| Image | Key Design Notes |
|---|---|
| `dashboard.png` | Full-width topbar (logo left, moon/bell/avatar right). Sidebar: business selector + nav. Main: "Live Insights", 4 KPI cards, Age Distribution bar chart, Live Event Log. |
| `venues.png` | Venue cards: location pin icon, name, address. 4 stats (Occupancy, %Full green, +Total In green, -Total Out red). Capacity progress bar. "N areas · M devices". "Last reset: time". Refresh + arrow icons. Add Venue button. |
| `areas.png` | Areas grouped by venue. Cards: refresh/reset icons top-right, area name, large occupancy, "of X · Y% full", progress bar, ↑entries ↓exits, "N device" badge. |
| `clicrs.png` | Clicrs grouped by venue→area. Cards: device icon, name, mode badges (Online · Bidirectional · Scan), "X / Y in area". Board View button in header. |
| `bans.png` | Card layout (not table). Red ban shield icon, person name, scope badge ("All Venues" / venue name), reason text, "Added by X · date". "Manage Bans" button. Search bar. |
| `reports.png` | Actually the **Settings** page. Shows it as a nav item. |

---

## Sidebar Nav Changes

**Current nav items:** Dashboard, Venues, Areas, Clicr, Guests, Banning, Reports, Support
**Target nav items:** Dashboard, Venues, Areas, Clicrs, Bans, Reports, Settings

Changes:
- Rename "Clicr" → "Clicrs" (same href `/clicr`)
- Rename "Banning" → "Bans" (same href `/banning`)
- Remove "Guests" (`/guests`)
- Remove "Support" (`/support`)
- Add "Settings" (`/settings`) as nav item (was only accessible via gear icon before)

---

## Task 1: Restructure AppLayout — Topbar + Business Selector in Sidebar

**Files:**
- Modify: `components/layout/AppLayout.tsx`

**Context:** The images show a full-width topbar (CLICR logo + v4.0 badge on left, dark-mode/bell/user-avatar icons on right) that spans the entire screen width, above the sidebar+content area. Below that, the sidebar shows: business selector, nav items (with Settings at bottom), Sign Out.

**Step 1: Read and understand the current AppLayout**

Run: `cat components/layout/AppLayout.tsx` — already done above. Current structure: `fixed inset-0 → flex-row → aside (sidebar) + main (content) + nav (mobile bottom)`. Logo is in sidebar header with a gear icon.

**Step 2: Invoke the frontend-design skill**

Before writing code, invoke `frontend-design:frontend-design` skill with prompt: "Redesign the AppLayout sidebar for a nightclub/venue management SaaS. Dark theme. Full-width topbar with CLICR logo + version badge on left, dark mode toggle + bell + user avatar (initials) on right. Sidebar has: business selector dropdown (business name + '2 venues' subtitle + chevron-down, clicking opens dropdown list of businesses), then nav items (Dashboard, Venues, Areas, Clicrs, Bans, Reports, Settings), then Sign Out at bottom."

**Step 3: Write the new AppLayout**

Replace `components/layout/AppLayout.tsx` with the following structure:

```tsx
"use client";

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import {
    LayoutDashboard, MapPin, Layers, MousePointer2,
    BarChart3, Settings, LogOut, Ban, ChevronDown, Check, Moon, Bell
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/store';

const NAV_ITEMS = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Venues',    href: '/venues',    icon: MapPin },
    { label: 'Areas',     href: '/areas',     icon: Layers },
    { label: 'Clicrs',   href: '/clicr',     icon: MousePointer2 },
    { label: 'Bans',     href: '/banning',   icon: Ban },
    { label: 'Reports',  href: '/reports',   icon: BarChart3 },
    { label: 'Settings', href: '/settings',  icon: Settings },
];

function BusinessSelector() {
    const { businesses, activeBusiness, selectBusiness, venues } = useApp();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Count venues for the active business
    const venueCount = activeBusiness
        ? venues.filter(v => v.business_id === activeBusiness.id).length
        : 0;

    const canSwitch = businesses.length > 1;

    return (
        <div ref={ref} className="relative px-4 py-4 border-b border-border/50">
            <button
                onClick={() => canSwitch && setOpen(o => !o)}
                className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl transition-all",
                    canSwitch ? "hover:bg-slate-800/60 cursor-pointer" : "cursor-default",
                    open && "bg-slate-800/60"
                )}
            >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {activeBusiness ? activeBusiness.name.charAt(0).toUpperCase() : '?'}
                </div>
                {/* Text */}
                <div className="flex-1 text-left min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                        {activeBusiness ? activeBusiness.name : 'Select Business'}
                    </div>
                    <div className="text-xs text-slate-400">
                        {activeBusiness ? `${venueCount} venue${venueCount !== 1 ? 's' : ''}` : `${businesses.length} businesses`}
                    </div>
                </div>
                {canSwitch && (
                    <ChevronDown className={cn("w-4 h-4 text-slate-400 shrink-0 transition-transform", open && "rotate-180")} />
                )}
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute left-4 right-4 top-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                    {businesses.map(biz => (
                        <button
                            key={biz.id}
                            onClick={() => { selectBusiness(biz); setOpen(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 transition-colors text-left"
                        >
                            <div className="w-7 h-7 rounded-lg bg-primary/80 flex items-center justify-center text-white font-bold text-xs shrink-0">
                                {biz.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm text-slate-200 flex-1 truncate">{biz.name}</span>
                            {activeBusiness?.id === biz.id && (
                                <Check className="w-4 h-4 text-primary shrink-0" />
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { currentUser } = useApp();
    const supabase = createClient();

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.refresh();
        router.push('/login');
    };

    // User initials for avatar
    const initials = currentUser?.name
        ? currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
        : currentUser?.email?.slice(0, 2).toUpperCase() ?? '??';

    return (
        <div className="fixed inset-0 w-full bg-background text-foreground flex flex-col overflow-hidden">

            {/* Full-width Topbar */}
            <header className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/50 glass-panel z-30 shrink-0">
                <div className="flex items-center gap-2">
                    <img src="/clicr-logo.png" alt="CLICR" className="h-7 object-contain" />
                    <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full">v4.0</span>
                </div>
                <div className="flex items-center gap-2">
                    <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors">
                        <Moon className="w-4 h-4" />
                    </button>
                    <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors relative">
                        <Bell className="w-4 h-4" />
                        {/* Notification dot */}
                        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full" />
                    </button>
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-bold border border-slate-600">
                        {initials}
                    </div>
                </div>
            </header>

            {/* Below topbar: sidebar + content */}
            <div className="flex flex-1 min-h-0 flex-col md:flex-row overflow-hidden">

                {/* Sidebar (Desktop) */}
                <aside className="w-44 border-r border-border bg-card/50 hidden md:flex flex-col glass-panel z-20 shrink-0">
                    <BusinessSelector />

                    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                        {NAV_ITEMS.map((item) => {
                            const isActive = pathname.startsWith(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group",
                                        isActive
                                            ? "bg-primary/10 text-primary font-bold"
                                            : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
                                    )}
                                >
                                    <item.icon className={cn("w-4 h-4 shrink-0", isActive ? "text-primary" : "text-slate-500 group-hover:text-slate-300")} />
                                    <span className="text-sm">{item.label}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="p-3 border-t border-border/50">
                        <button
                            onClick={handleSignOut}
                            className="flex items-center gap-3 px-3 py-2 w-full text-slate-400 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            <span className="text-sm">Sign out</span>
                        </button>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
                    <div className="flex-1 overflow-y-auto overscroll-none p-4 md:p-8">
                        <div className="fixed top-0 left-0 w-full h-[500px] bg-gradient-to-b from-primary/5 to-transparent pointer-events-none -z-10" />
                        <div className="max-w-7xl mx-auto min-h-full">
                            {children}
                        </div>
                    </div>
                </main>

                {/* Mobile Bottom Navigation */}
                <nav className="md:hidden flex-none bg-[#0f1116] border-t border-white/10 pb-[env(safe-area-inset-bottom)] z-50">
                    <div className="flex justify-around items-center p-2">
                        {NAV_ITEMS.filter(i => !['Areas', 'Settings'].includes(i.label)).map((item) => {
                            const isActive = pathname.startsWith(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-14",
                                        isActive ? "text-primary" : "text-slate-500 hover:text-slate-300"
                                    )}
                                >
                                    <div className={cn("p-1.5 rounded-full transition-all", isActive ? "bg-primary/20" : "bg-transparent")}>
                                        <item.icon className="w-5 h-5" />
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
```

**Step 4: Verify the build compiles**

Run: `cd /home/king/clicr-v4 && npx tsc --noEmit 2>&1 | head -40`
Expected: No errors relating to AppLayout.

**Step 5: Commit**

```bash
git add components/layout/AppLayout.tsx
git commit -m "feat: add topbar, move business selector into sidebar, update nav items"
```

---

## Task 2: Dashboard — Remove Local Business State + Redesign to "Live Insights"

**Files:**
- Modify: `app/(authenticated)/dashboard/page.tsx`
- Modify: `app/(authenticated)/dashboard/_components/GettingStartedChecklist.tsx` (minor: pass activeBusiness context if needed)

**Context:** The current dashboard maintains its own `dashBiz` local state and shows a business picker for multi-business users. We're replacing this with `activeBusiness` from the store (set by the sidebar). The dashboard's visual design changes completely to match `dashboard.png`:
- "Live Insights" h1, "Real-time data from all connected devices." subtitle
- Top-right: Tonight date pill, Reset Data button, Export button
- 4 KPI cards: Live Occupancy (w/ peak), Total Entries (w/ exits count), Scans Processed (w/ denied%), Banned Hits
- Age Distribution bar chart (from `scanEvents` data)
- Live Event Log (from combined `events` + `scanEvents`, most recent first)

**Step 1: Invoke frontend-design skill**

Invoke `frontend-design:frontend-design` with: "Redesign the dashboard for a nightclub/venue management app. Dark theme (slate-900/slate-800). Show: 'Live Insights' heading with subtitle. Top-right row with a 'Tonight' dropdown pill (dark slate, calendar icon), 'Reset Data' button (slate), 'Export' button (indigo/primary). Below: 4 KPI stat cards in a row - each has: small label in caps, icon top-right (body silhouette / up-arrow / scan / ban-icon), large bold number, smaller detail text below (e.g. 'Peak: 120' or 'Exits: -114' or '5% Denied' or 'Flagged instantly'). Below that: two columns - left has Age Distribution bar chart (horizontal bars, blue, age bands: 18-20, 21-25, 26-30, 31-40, 40+, count on right), right has Live Event Log (scrollable list of ENTRY/ID ACCEPTED/EXIT/ID DENIED events with area, person, time)."

**Step 2: Write the new dashboard**

Replace `app/(authenticated)/dashboard/page.tsx` with:

```tsx
"use client";

import React, { useMemo } from 'react';
import { useApp } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
    Users, TrendingUp, ScanLine, ShieldBan,
    Calendar, RefreshCw, Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GettingStartedChecklist } from './_components/GettingStartedChecklist';

// KPI Card
const KpiCard = ({ label, value, detail, icon: Icon, iconColor, detailColor }: {
    label: string; value: string | number; detail: string;
    icon: React.ComponentType<any>; iconColor: string; detailColor?: string;
}) => (
    <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex-1">
        <div className="flex items-start justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{label}</span>
            <div className={cn("p-2 rounded-xl", iconColor)}>
                <Icon className="w-4 h-4" />
            </div>
        </div>
        <div className="text-4xl font-bold font-mono text-white mb-1">{value}</div>
        <div className={cn("text-sm font-medium", detailColor ?? "text-slate-400")}>{detail}</div>
    </div>
);

// Age band bar
const AgeBand = ({ band, count, max }: { band: string; count: number; max: number }) => (
    <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 w-12 shrink-0">{band}</span>
        <div className="flex-1 h-5 bg-slate-800/60 rounded overflow-hidden">
            <div
                className="h-full bg-primary/80 rounded transition-all duration-700"
                style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }}
            />
        </div>
        <span className="text-sm font-bold text-slate-300 w-6 text-right shrink-0">{count}</span>
    </div>
);

// Event log row
const EventRow = ({ type, detail, area, time }: { type: string; detail?: string; area: string; time: string }) => {
    const badge: Record<string, { label: string; cls: string }> = {
        'ENTRY':       { label: 'ENTRY',       cls: 'bg-slate-700 text-slate-300' },
        'EXIT':        { label: 'EXIT',         cls: 'bg-amber-500/20 text-amber-400' },
        'ID_ACCEPTED': { label: 'ID ACCEPTED',  cls: 'bg-emerald-500/20 text-emerald-400' },
        'ID_DENIED':   { label: 'ID DENIED',    cls: 'bg-red-500/20 text-red-400' },
    };
    const b = badge[type] ?? badge['ENTRY'];
    return (
        <div className="flex items-start gap-3 py-3 border-b border-slate-800/60 last:border-0">
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5", b.cls)}>{b.label}</span>
            <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-300 truncate">{area}</div>
                {detail && <div className="text-xs text-slate-500 truncate">{detail}</div>}
            </div>
            <span className="text-xs text-slate-600 shrink-0">{time}</span>
        </div>
    );
};

export default function DashboardPage() {
    const { activeBusiness, businesses, areas, events, scanEvents, bans, isLoading, resetCounts } = useApp();
    const router = useRouter();

    // Auto-redirect new users with no businesses to onboarding
    useEffect(() => {
        if (!isLoading && businesses.length === 0) {
            router.push('/onboarding/setup');
        }
    }, [isLoading, businesses.length]);

    // === Metrics (computed from store state, already scoped to activeBusiness) ===

    const liveOccupancy = useMemo(
        () => areas.reduce((sum, a) => sum + (a.current_occupancy ?? 0), 0),
        [areas]
    );

    const peakOccupancy = useMemo(
        () => Math.max(...areas.map(a => (a as any).peak_occupancy ?? 0), liveOccupancy),
        [areas, liveOccupancy]
    );

    // Today's count events
    const todayStart = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }, []);
    const todayEvents = useMemo(() => events.filter(e => e.timestamp >= todayStart), [events, todayStart]);
    const totalEntries = useMemo(() => todayEvents.filter(e => e.delta > 0).reduce((s, e) => s + e.delta, 0), [todayEvents]);
    const totalExits   = useMemo(() => Math.abs(todayEvents.filter(e => e.delta < 0).reduce((s, e) => s + e.delta, 0)), [todayEvents]);

    // Today's scans
    const todayScans = useMemo(() => scanEvents.filter(e => e.timestamp >= todayStart), [scanEvents, todayStart]);
    const deniedCount = useMemo(() => todayScans.filter(s => s.scan_result === 'DENIED').length, [todayScans]);
    const deniedPct   = todayScans.length > 0 ? Math.round((deniedCount / todayScans.length) * 100) : 0;

    // Active bans
    const activeBansCount = useMemo(() => (bans ?? []).filter(b => b.status === 'ACTIVE').length, [bans]);

    // Age distribution from scan events
    const ageBands = useMemo(() => {
        const bands: Record<string, number> = { '18-20': 0, '21-25': 0, '26-30': 0, '31-40': 0, '40+': 0 };
        todayScans.filter(s => s.scan_result === 'ACCEPTED').forEach(s => {
            const age = (s as any).age ?? 0;
            if (age >= 18 && age <= 20) bands['18-20']++;
            else if (age <= 25)          bands['21-25']++;
            else if (age <= 30)          bands['26-30']++;
            else if (age <= 40)          bands['31-40']++;
            else if (age > 40)           bands['40+']++;
        });
        return Object.entries(bands);
    }, [todayScans]);
    const maxAgeBand = Math.max(...ageBands.map(([, c]) => c), 1);

    // Live event log (most recent 20, combined)
    const liveLog = useMemo(() => {
        const evts = todayEvents.slice(0, 10).map(e => ({
            id: e.id,
            type: e.delta > 0 ? 'ENTRY' : 'EXIT',
            area: e.area_id, // Replace with area name below
            detail: undefined as string | undefined,
            timestamp: e.timestamp,
        }));
        const scans = todayScans.slice(0, 10).map(s => ({
            id: s.id,
            type: s.scan_result === 'ACCEPTED' ? 'ID_ACCEPTED' : 'ID_DENIED',
            area: (s as any).area_id ?? '',
            detail: (s as any).name_display ?? undefined,
            timestamp: s.timestamp,
        }));
        return [...evts, ...scans]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 20);
    }, [todayEvents, todayScans]);

    const areaMap = useMemo(() => Object.fromEntries(areas.map(a => [a.id, a.name])), [areas]);

    const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    // === No business selected ===
    if (!isLoading && !activeBusiness && businesses.length > 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Users className="w-8 h-8 text-primary" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Select a Business</h2>
                    <p className="text-slate-400 mt-1">Use the dropdown in the sidebar to choose a business.</p>
                </div>
            </div>
        );
    }

    // === Loading skeleton ===
    if (isLoading) {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="h-10 w-64 bg-slate-800 rounded-xl" />
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                    {[1,2,3,4].map(i => <div key={i} className="h-28 bg-slate-800 rounded-2xl" />)}
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="h-64 bg-slate-800 rounded-2xl" />
                    <div className="h-64 bg-slate-800 rounded-2xl" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-[fade-in_0.5s_ease-out]">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Live Insights</h1>
                    <p className="text-slate-400 mt-1">Real-time data from all connected devices.</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Date filter pill */}
                    <button className="flex items-center gap-2 px-4 py-2 bg-slate-800/60 border border-slate-700 rounded-xl text-sm text-slate-300 hover:bg-slate-800 transition-colors">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        Tonight
                        <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {/* Reset Data */}
                    <button
                        onClick={async () => {
                            if (window.confirm('⚠️ Reset ALL occupancy counts for this business?')) {
                                await resetCounts(activeBusiness?.id);
                            }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800/60 border border-slate-700 rounded-xl text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Reset Data
                    </button>
                    {/* Export */}
                    <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                </div>
            </div>

            {/* Getting Started Checklist */}
            <GettingStartedChecklist />

            {/* KPI Cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard
                    label="Live Occupancy"
                    value={liveOccupancy}
                    detail={`Peak: ${peakOccupancy}`}
                    icon={Users}
                    iconColor="bg-primary/10 text-primary"
                />
                <KpiCard
                    label="Total Entries"
                    value={totalEntries}
                    detail={`Exits: -${totalExits}`}
                    icon={TrendingUp}
                    iconColor="bg-emerald-500/10 text-emerald-400"
                    detailColor="text-amber-400"
                />
                <KpiCard
                    label="Scans Processed"
                    value={todayScans.length}
                    detail={`${deniedPct}% Denied`}
                    icon={ScanLine}
                    iconColor="bg-blue-500/10 text-blue-400"
                />
                <KpiCard
                    label="Banned Hits"
                    value={activeBansCount}
                    detail="Flagged instantly"
                    icon={ShieldBan}
                    iconColor="bg-red-500/10 text-red-400"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {/* Age Distribution */}
                <div className="glass-panel border border-slate-800 rounded-2xl p-6">
                    <div className="mb-4">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <span className="w-2 h-2 bg-primary rounded-full" />
                            Age Distribution
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">ID scans accepted · Tonight</p>
                    </div>
                    <div className="space-y-3">
                        {ageBands.map(([band, count]) => (
                            <AgeBand key={band} band={band} count={count} max={maxAgeBand} />
                        ))}
                        {ageBands.every(([, c]) => c === 0) && (
                            <p className="text-sm text-slate-600 italic text-center py-4">No scan data for tonight yet.</p>
                        )}
                    </div>
                </div>

                {/* Live Event Log */}
                <div className="glass-panel border border-slate-800 rounded-2xl p-6">
                    <div className="mb-4">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                            Live Event Log
                        </h3>
                    </div>
                    <div className="overflow-y-auto max-h-56">
                        {liveLog.length === 0 ? (
                            <p className="text-sm text-slate-600 italic text-center py-4">No events yet tonight.</p>
                        ) : liveLog.map(evt => (
                            <EventRow
                                key={evt.id}
                                type={evt.type}
                                area={areaMap[evt.area] ?? evt.area ?? 'Unknown Area'}
                                detail={evt.detail}
                                time={formatTime(evt.timestamp)}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
```

**Step 3: Verify build**

Run: `cd /home/king/clicr-v4 && npx tsc --noEmit 2>&1 | head -40`
Expected: No new type errors.

**Step 4: Commit**

```bash
git add app/(authenticated)/dashboard/page.tsx
git commit -m "feat: redesign dashboard as Live Insights, use activeBusiness from store"
```

---

## Task 3: Venues Page — Filter to Active Business + Redesign Cards

**Files:**
- Modify: `app/(authenticated)/venues/page.tsx`

**Context:** Currently fetches ALL venues across all businesses and groups them. After this change: filter to `activeBusiness` only, remove business grouping, redesign cards to match `venues.png` (pin icon, name, address, 4 stats with colors, progress bar, "N areas · M devices · Last reset: time", refresh + arrow icons).

**Step 1: Invoke frontend-design skill**

Invoke with: "Venue management page for a nightclub/venue app. Dark theme. Each venue card: location-pin icon on left of header, venue name (bold, large), address below. Right side: chevron-right arrow button + refresh icon. Below header: 4 stat blocks in a row — 'OCCUPANCY' (plain number, e.g. 137), '% FULL' (18%, green), 'TOTAL IN' (+355, green), 'TOTAL OUT' (-218, red). Below stats: horizontal progress bar (green fill). Footer: '4 areas · 5 devices' + 'Last reset: 09:59 PM' right-aligned. Card has subtle hover border. 'Add Venue' button top-right of page."

**Step 2: Write the updated venues page**

Key changes to `app/(authenticated)/venues/page.tsx`:

```tsx
// 1. Add activeBusiness from store
const { areas, clicrs, devices, businesses, activeBusiness } = useApp();

// 2. Filter the fetch by activeBusiness
useEffect(() => {
    const load = async () => {
        if (!activeBusiness) { setLoadingVenues(false); return; }
        // ... same fetch pattern but add ?businessId=activeBusiness.id
        const res = await fetch(`/api/sync?businessId=${activeBusiness.id}`, { cache: 'no-store', headers });
        // ...
    };
    load();
}, [activeBusiness?.id]);

// 3. Remove multi-business grouping — just show filteredVenues flat
// 4. Update VenueCard to match new design (see below)
```

Updated VenueCard design (following venues.png exactly):

```tsx
const VenueCard = ({ venue, getVenueStats, onNavigate }: {...}) => {
    const stats = getVenueStats(venue.id);
    const pct = venue.default_capacity_total
        ? Math.round((stats.currentOccupancy / venue.default_capacity_total) * 100)
        : 0;

    return (
        <div className="bg-slate-900/40 border border-slate-800 hover:border-slate-700 rounded-2xl p-6 transition-all">
            {/* Card header */}
            <div className="flex items-start justify-between mb-5">
                <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-primary/10 border border-primary/20 rounded-xl mt-0.5">
                        <MapPin className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">{venue.name}</h3>
                        <p className="text-sm text-slate-400 mt-0.5">
                            {venue.city ? `${venue.city}, ${venue.state}` : 'Location Unset'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <Link href={`/venues/${venue.id}`} className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                        <ChevronRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            {/* 4 Stats */}
            <div className="grid grid-cols-4 gap-3 mb-4">
                <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Occupancy</div>
                    <div className="text-2xl font-bold font-mono text-white">{stats.currentOccupancy}</div>
                    {venue.default_capacity_total && (
                        <div className="text-xs text-slate-500">of {venue.default_capacity_total}</div>
                    )}
                </div>
                <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">% Full</div>
                    <div className="text-2xl font-bold font-mono text-emerald-400">{pct}%</div>
                </div>
                <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total In</div>
                    <div className="text-2xl font-bold font-mono text-emerald-400">+{stats.totalIn ?? 0}</div>
                </div>
                <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Out</div>
                    <div className="text-2xl font-bold font-mono text-red-400">-{stats.totalOut ?? 0}</div>
                </div>
            </div>

            {/* Progress bar */}
            {venue.default_capacity_total && (
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-4">
                    <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{stats.areaCount} areas · {stats.deviceCount} devices</span>
                <span>Last reset: {stats.lastReset ?? '—'}</span>
            </div>
        </div>
    );
};
```

Note: `totalIn`, `totalOut`, `lastReset` will need fetching. Add these to `getVenueStats` — pull `totalIn`/`totalOut` from the METRICS API the same way the old dashboard did, and `lastReset` can be read from the venue's `last_reset_at` field if available.

**Step 3: Add "no business selected" state**

```tsx
if (!activeBusiness) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-3">
            <MapPin className="w-10 h-10 text-slate-600" />
            <p className="text-slate-400">Select a business from the sidebar to view venues.</p>
        </div>
    );
}
```

**Step 4: Verify, then commit**

Run: `npx tsc --noEmit 2>&1 | head -40`

```bash
git add app/(authenticated)/venues/page.tsx
git commit -m "feat: filter venues by active business, redesign venue cards"
```

---

## Task 4: Areas Page — Group by Venue + Redesign Cards

**Files:**
- Modify: `app/(authenticated)/areas/page.tsx`

**Context:** Currently shows a flat grid of all areas with a venue dropdown filter. Redesign to: group areas by venue with venue section headers, new card design matching `areas.png` (occupancy number, capacity bar, entry/exit arrows with counts, device count badge, refresh/reset icons).

**Step 1: Invoke frontend-design skill**

Invoke with: "Areas page for a nightclub/venue management app. Dark theme. Areas grouped by venue with bold venue name as section header. Each area card: small refresh-icon + reset-icon top-right. Large area name. Very large occupancy number (e.g. '38'). 'of 750 · 5% full' below. Horizontal progress bar (indigo/blue). Green up-arrow with entry count on left, red down-arrow with exit count on right. '2 devices' badge bottom-right in small text."

**Step 2: Update the areas page**

Changes to `app/(authenticated)/areas/page.tsx`:

```tsx
// 1. Import clicrs and venues from store (already has them)
// 2. Remove venue dropdown filter, add search only
// 3. Group areas by venue for display
// 4. For each area, compute entry/exit counts from areaTraffic store state

const { areas, clicrs, venues, areaTraffic, resetCounts } = useApp();

// Group by venue
const venueGroups = venues
    .map(venue => ({
        venue,
        areas: filteredAreas.filter(a => a.venue_id === venue.id)
    }))
    .filter(g => g.areas.length > 0);
```

Area card design:

```tsx
const AreaCard = ({ area, venue }: { area: Area; venue: Venue }) => {
    const areaClicrs = clicrs.filter(c => c.area_id === area.id);
    const capacity = area.default_capacity ?? area.capacity_limit ?? 0;
    const occ = area.current_occupancy ?? 0;
    const pct = capacity > 0 ? Math.round((occ / capacity) * 100) : 0;
    const scopeKey = `area:${area.business_id}:${area.venue_id}:${area.id}`;
    const traffic = areaTraffic[scopeKey] ?? { total_in: 0, total_out: 0 };

    return (
        <div className="glass-panel border border-slate-800 rounded-2xl p-5 relative">
            {/* Top actions */}
            <div className="absolute top-4 right-4 flex items-center gap-1.5">
                <button className="p-1.5 text-slate-600 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">
                    <RefreshCw className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Area name */}
            <h3 className="text-base font-bold text-white mb-2 pr-16">{area.name}</h3>

            {/* Occupancy */}
            <div className="mb-1">
                <div className="text-5xl font-bold font-mono text-white">{occ}</div>
                {capacity > 0 && (
                    <div className="text-sm text-slate-400 mt-0.5">of {capacity} · {pct}% full</div>
                )}
            </div>

            {/* Progress bar */}
            {capacity > 0 && (
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden my-3">
                    <div
                        className={cn("h-full rounded-full transition-all",
                            pct > 90 ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-primary")}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                </div>
            )}

            {/* Entry / Exit row */}
            <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1 text-emerald-400 text-sm font-bold">
                        <ArrowUp className="w-3.5 h-3.5" /> {traffic.total_in}
                    </span>
                    <span className="flex items-center gap-1 text-red-400 text-sm font-bold">
                        <ArrowDown className="w-3.5 h-3.5" /> {traffic.total_out}
                    </span>
                </div>
                <span className="text-xs text-slate-500">{areaClicrs.length} device{areaClicrs.length !== 1 ? 's' : ''}</span>
            </div>
        </div>
    );
};
```

Section header:

```tsx
<div className="flex items-center gap-3 mb-4">
    <h2 className="text-base font-bold text-white">{group.venue.name}</h2>
    <div className="flex-1 h-px bg-slate-800" />
</div>
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {group.areas.map(area => <AreaCard key={area.id} area={area} venue={group.venue} />)}
</div>
```

**Step 3: Verify, then commit**

```bash
git add app/(authenticated)/areas/page.tsx
git commit -m "feat: group areas by venue, redesign area cards with entry/exit stats"
```

---

## Task 5: Clicrs Page — Redesign Cards + Board View Button

**Files:**
- Modify: `app/(authenticated)/clicr/page.tsx`

**Context:** Match `clicrs.png`. Cards show: device icon, device name, mode badges (Online · Bidirectional · Scan), occupancy "X / Y in area". Add "Board View" button to page header. Keep venue→area grouping.

**Step 1: Invoke frontend-design skill**

Invoke with: "Clicrs device list page for a nightclub counter app. Dark theme. 'Board View' toggle button top-right. Devices grouped by venue (bold venue name section header), then by area (smaller area sub-header). Each device card: colored device icon (circle with icon), device name (bold), row of badges: green 'Online' dot, slate 'Bidirectional'/'In Only'/'Out Only', optionally slate 'Scan'. Below: large number 'X / Y in area' in mono font. Arrow icon to navigate to device detail page."

**Step 2: Rewrite `ClicrCard`** in `app/(authenticated)/clicr/page.tsx`:

```tsx
function ClicrCard({ clicr, area }: { clicr: Clicr; area: Area }) {
    const flowMode = clicr.flow_mode ?? 'BIDIRECTIONAL';
    const occ = area.current_occupancy ?? 0;
    const cap = area.default_capacity ?? area.capacity_limit ?? 0;

    return (
        <Link
            href={`/clicr/${clicr.id}`}
            className="glass-panel border border-slate-800 hover:border-slate-700 rounded-2xl p-5 transition-all group flex flex-col gap-4"
        >
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <MousePointer2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <div className="font-bold text-white text-sm leading-tight">{clicr.name}</div>
                        <div className="text-xs text-slate-500">{clicr.location ?? area.name}</div>
                    </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white transition-colors mt-1" />
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Online
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {flowMode === 'IN_ONLY' ? 'In Only' : flowMode === 'OUT_ONLY' ? 'Out Only' : 'Bidirectional'}
                </span>
                {(clicr as any).scan_enabled && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">Scan</span>
                )}
            </div>

            {/* Occupancy */}
            <div className="font-mono text-2xl font-bold text-white">
                {occ}
                {cap > 0 && <span className="text-slate-500 text-base font-normal"> / {cap} in area</span>}
                {cap === 0 && <span className="text-slate-500 text-base font-normal"> in area</span>}
            </div>
        </Link>
    );
}
```

Add Board View button to page header:

```tsx
<div className="flex items-center gap-3">
    <button className="flex items-center gap-2 px-4 py-2 bg-slate-800/60 border border-slate-700 rounded-xl text-sm text-slate-300 hover:bg-slate-800 transition-colors">
        <LayoutGrid className="w-4 h-4" />
        Board View
    </button>
</div>
```

**Step 3: Verify, then commit**

```bash
git add app/(authenticated)/clicr/page.tsx
git commit -m "feat: redesign clicr device cards with badges and occupancy stats"
```

---

## Task 6: Bans Page — Card Layout (Replace Table)

**Files:**
- Modify: `app/(authenticated)/banning/page.tsx`

**Context:** Replace the HTML table with a card-per-ban layout matching `bans.png`. Each card has: red ban shield icon (left), person name (bold), scope badge ("All Venues" or venue name), reason text (muted), "Added by [user] · [date]" (small). Top-right: "Manage Bans" button. Update page title to "Bans".

**Step 1: Invoke frontend-design skill**

Invoke with: "Bans page for a nightclub app. Dark theme. 'Bans' title, 'N active bans across your venues' subtitle. 'Manage Bans' button top-right with gear/list icon. Search bar below. Then cards: each card has a red ban/shield icon on left, person full name (bold white), badge showing scope ('All Venues' in slate or specific venue name in slate), italic reason text, small gray 'Added by [name] · [date]' below. Card has subtle border, hover state."

**Step 2: Replace table with card layout in `app/(authenticated)/banning/page.tsx`**

Change the `<table>` block to:

```tsx
{/* Page header */}
<div className="flex items-center justify-between">
    <div>
        <h1 className="text-3xl font-bold text-white">Bans</h1>
        <p className="text-slate-400 mt-1">{bans.filter(b => b.status === 'ACTIVE').length} active bans across your venues</p>
    </div>
    <Link
        href="/banning/new"
        className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition-colors"
    >
        <Shield className="w-4 h-4" />
        Manage Bans
    </Link>
</div>

{/* Search */}
<div className="relative max-w-lg">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
    <input ... className="w-full pl-10 pr-4 py-3 bg-slate-900/50 border border-slate-800 rounded-2xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-slate-600" placeholder="Search bans..." />
</div>

{/* Filter tabs */}
<div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-800 self-start">
    {(['ALL', 'ACTIVE', 'REVOKED'] as const).map(f => (
        <button key={f} onClick={() => setFilter(f)}
            className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                filter === f ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-300")}>
            {f.charAt(0) + f.slice(1).toLowerCase()}
        </button>
    ))}
</div>

{/* Ban cards */}
<div className="space-y-3">
    {filteredBans.map(ban => {
        const person = ban.banned_persons;
        const personName = person ? `${person.first_name} ${person.last_name}` : 'Unknown Person';
        return (
            <div key={ban.id} className="glass-panel border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex items-start gap-4 transition-all">
                {/* Ban icon */}
                <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl shrink-0">
                    <ShieldOff className="w-5 h-5 text-red-400" />
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold text-white">{personName}</span>
                        <span className="text-xs px-2 py-0.5 bg-slate-800 text-slate-300 rounded-full border border-slate-700">
                            {ban.applies_to_all_locations ? 'All Venues' : 'Venue Specific'}
                        </span>
                        {ban.status !== 'ACTIVE' && (
                            <span className="text-xs px-2 py-0.5 bg-slate-800 text-slate-500 rounded-full border border-slate-700">
                                {ban.status === 'EXPIRED' ? 'Expired' : 'Revoked'}
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-slate-400 italic mb-2 truncate">{ban.reason_notes || ban.reason_category}</p>
                    <p className="text-xs text-slate-600">
                        Added by {ban.created_by_name ?? 'Staff'} · {new Date(ban.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                </div>
                {/* Revoke action */}
                {ban.status === 'ACTIVE' && (
                    <button onClick={() => handleRevoke(ban.id)}
                        className="shrink-0 text-xs font-bold text-slate-400 hover:text-white border border-slate-700 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors">
                        Revoke
                    </button>
                )}
            </div>
        );
    })}
    {filteredBans.length === 0 && !loading && (
        <div className="text-center py-12 text-slate-500">No bans found.</div>
    )}
</div>
```

Note: `ban.created_by_name` may not exist in the current schema — fallback to 'Staff'. Adjust if the bans table has a join for the creator user.

**Step 3: Verify, then commit**

```bash
git add app/(authenticated)/banning/page.tsx
git commit -m "feat: redesign bans page with card layout, match image reference"
```

---

## Task 7: Smoke Test All Pages

**Step 1: Start dev server**

Run: `cd /home/king/clicr-v4 && npm run dev` (or `npx next dev`)

**Step 2: Test the following scenarios**

1. **Single-business user**: Sidebar shows the business name + venue count, no dropdown arrow. Dashboard shows Live Insights. All pages show data for that business.

2. **Multi-business user**: Sidebar shows "Select Business" initially. Dashboard shows "Select a Business from the sidebar". After selecting from dropdown, all pages update.

3. **Dashboard**: KPI cards populate. Age Distribution shows bars if there are scan events. Live Event Log shows entries/exits.

4. **Venues**: Shows venues for selected business only. Cards show 4 stats + progress bar + footer.

5. **Areas**: Grouped by venue. Cards show occupancy + capacity bar + entry/exit arrows.

6. **Clicrs**: Grouped by venue→area. Cards show badges + occupancy. Board View button present.

7. **Bans**: Card layout. Search works. Scope badges show. Revoke button works.

8. **Nav items**: Confirm Guests/Support are gone. Clicrs and Bans labels correct. Settings navigates correctly.

**Step 3: Fix any issues found, commit fixes**

---

## Execution Notes

- **Each task should start by invoking `frontend-design:frontend-design`** to get design-quality UI code that avoids generic AI aesthetics and matches the dark-themed nightclub management look.
- **Do not skip the TypeScript check step** — `npx tsc --noEmit` — after each task to catch import/prop errors early.
- **The store already scopes data by `activeBusiness`**: `venues`, `areas`, `clicrs` in `useApp()` are already filtered when `activeBusiness` is set. Trust the store; don't re-filter by business in components unless doing a local fetch.
- **For the topbar icons (dark mode, bell)**: wire dark mode to a localStorage toggle or leave as UI stubs — the user didn't specify a dark mode context provider.
- **For `totalIn` / `totalOut` in venue cards**: call `METRICS.getTotals()` per venue inside a `useEffect` similar to the old `VenueCard` in dashboard. OR use the `areaTraffic` map from the store (aggregated per area, sum across venue's areas).
