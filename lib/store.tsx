"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { Business, Venue, Area, Clicr, CountEvent, User, IDScanEvent, BanRecord, BannedPerson, PatronBan, BanEnforcementEvent, BanAuditLog, Device, CapacityOverride, VenueAuditLog, TurnaroundEvent } from './types';
import { createClient } from '@/utils/supabase/client';

const INITIAL_USER: User = {
    id: '',
    name: '',
    email: '',
    role: 'OWNER',
    assigned_venue_ids: [],
    assigned_area_ids: [],
    assigned_clicr_ids: [],
};

export type AppState = {
    business: Business | null;
    venues: Venue[];
    areas: Area[];
    clicrs: Clicr[];
    devices: Device[];
    capacityOverrides: CapacityOverride[];
    venueAuditLogs: VenueAuditLog[];
    events: CountEvent[];
    scanEvents: IDScanEvent[];
    currentUser: User;
    users: User[];
    bans: BanRecord[];

    // Patron Banning System
    patrons: BannedPerson[];
    patronBans: PatronBan[];
    banAuditLogs: BanAuditLog[];
    banEnforcementEvents: BanEnforcementEvent[];

    turnarounds: TurnaroundEvent[];
    areaTraffic: Record<string, { total_in: number; total_out: number; net_delta: number; event_count: number }>;
    trafficSessionStart: number; // timestamp — traffic queries use this as start_ts so reset clears totals

    businesses: Business[];
    activeBusiness: Business | null;

    isLoading: boolean;
};

type AppContextType = AppState & {
    recordEvent: (event: Omit<CountEvent, 'id' | 'timestamp' | 'user_id' | 'business_id'>) => void;
    recordScan: (scan: Omit<IDScanEvent, 'id' | 'timestamp'>) => void;
    resetCounts: (venueId?: string) => void;
    addUser: (user: User) => Promise<void>;
    updateUser: (user: User) => Promise<void>;
    removeUser: (userId: string) => Promise<void>;

    // Venue Management
    updateBusiness: (updates: Partial<Business>) => Promise<void>;
    addVenue: (venue: Venue) => Promise<void>;
    updateVenue: (venue: Venue) => Promise<void>;
    addArea: (area: Area) => Promise<void>;
    updateArea: (area: Area) => Promise<boolean>;

    // Devices
    addClicr: (clicr: Clicr) => Promise<{ success: boolean; error?: string }>;
    updateClicr: (clicr: Clicr) => Promise<void>;
    deleteClicr: (clicrId: string) => Promise<{ success: boolean; error?: string }>;
    addDevice: (device: Device) => Promise<void>;
    updateDevice: (device: Device) => Promise<void>;

    // Overrides & Logs
    addCapacityOverride: (override: CapacityOverride) => Promise<void>;
    addVenueAuditLog: (log: VenueAuditLog) => Promise<void>;

    // Bans
    addBan: (ban: BanRecord) => Promise<void>;
    revokeBan: (banId: string, revokedByUserId: string, reason?: string) => Promise<void>;
    createPatronBan: (person: BannedPerson, ban: PatronBan, log: BanAuditLog) => Promise<void>;
    updatePatronBan: (ban: PatronBan, log: BanAuditLog) => Promise<void>;
    recordBanEnforcement: (event: BanEnforcementEvent) => Promise<void>;

    // Traffic & Turnarounds
    recordTurnaround: (venueId: string, areaId: string, deviceId: string, count: number) => Promise<void>;
    refreshTrafficStats: (venueId: string, areaId: string) => Promise<void>;

    // Device Rename
    renameDevice?: (deviceId: string, name: string) => Promise<void>;
    debug?: boolean;

    // Multi-business
    businesses: Business[];
    activeBusiness: Business | null;
    selectBusiness: (business: Business) => void;
    clearBusiness: () => void;
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
    const [state, setState] = useState<AppState>({
        business: null,
        venues: [],
        areas: [],
        clicrs: [],
        devices: [],
        capacityOverrides: [],
        venueAuditLogs: [],
        events: [],
        scanEvents: [],
        currentUser: INITIAL_USER,
        users: [],
        bans: [],

        patrons: [],
        patronBans: [],
        banAuditLogs: [],
        banEnforcementEvents: [],

        turnarounds: [],
        areaTraffic: {},
        trafficSessionStart: (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })(),

        businesses: [],
        activeBusiness: null,

        isLoading: true,
    });

    const isResettingRef = useRef(false);
    const activeBusinessIdRef = useRef<string | null>(null);
    const userClearedRef = useRef(false);

    const refreshState = async () => {
        if (isResettingRef.current) {
            console.log("Skipping poll due to pending reset");
            return;
        }

        try {
            // Get current Supabase Session
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            if (user) {
                headers['x-user-id'] = user.id;
                headers['x-user-email'] = user.email || '';
            }

            const bizParam = activeBusinessIdRef.current
                ? `?businessId=${activeBusinessIdRef.current}`
                : '';
            const res = await fetch(`/api/sync${bizParam}`, {
                cache: 'no-store',
                headers
            });

            if (res.ok) {
                const data = await res.json();

                // Avoid overwriting optimistic state if a write started while we were fetching
                if (isWritingRef.current) {
                    console.log("Skipping sync update due to active write (Pre-setState)");
                    return;
                }

                // Discard stale responses from a previous business context.
                // Cases: (a) wrong business returned, (b) no business returned when one is active
                // (an unscoped poll that fired before selectBusiness completed).
                if (activeBusinessIdRef.current && data.business?.id !== activeBusinessIdRef.current) {
                    console.log('[sync] Discarding stale response, expected', activeBusinessIdRef.current, 'got', data.business?.id);
                    return;
                }

                // Sync ref before setState so next poll includes ?businessId=
                if (!activeBusinessIdRef.current && !userClearedRef.current && data.businesses?.length === 1) {
                    activeBusinessIdRef.current = data.businesses[0].id;
                }

                const sortedBusinesses = (data.businesses || []).slice().sort((a: Business, b: Business) =>
                    a.name.localeCompare(b.name)
                );
                const sortedVenues = (data.venues || []).slice().sort((a: Venue, b: Venue) =>
                    a.name.localeCompare(b.name)
                );

                setState(prev => {
                    const shouldAutoSelect = !prev.activeBusiness && !userClearedRef.current && data.businesses?.length === 1;
                    const autoSelected = shouldAutoSelect ? data.businesses[0] : null;
                    return {
                        ...prev,
                        ...data,
                        venues: sortedVenues,
                        areas: data.areas || [],
                        clicrs: data.clicrs || [],
                        events: data.events || [],
                        scanEvents: data.scanEvents || [],
                        businesses: sortedBusinesses.length > 0 ? sortedBusinesses : prev.businesses,
                        activeBusiness: prev.activeBusiness ?? autoSelected,
                        business: prev.activeBusiness ?? autoSelected,
                        isLoading: false
                    };
                });
            }
        } catch (error) {
            console.error("Failed to sync state", error);
            setState(prev => ({ ...prev, isLoading: false }));
        }
    };

    const selectBusiness = (business: Business) => {
        userClearedRef.current = false;
        activeBusinessIdRef.current = business.id;
        setState(prev => ({
            ...prev,
            activeBusiness: business,
            business,
            venues: [],
            areas: [],
            clicrs: [],
            events: [],
            scanEvents: [],
            isLoading: true,
        }));
        refreshState();
    };

    const clearBusiness = () => {
        userClearedRef.current = true;
        activeBusinessIdRef.current = null;
        setState(prev => ({ ...prev, activeBusiness: null, business: null, isLoading: true }));
    };

    // Initial load, polling, AND Realtime Subscription
    useEffect(() => {
        refreshState();
        const interval = setInterval(refreshState, 2000); // Keep polling as backup/sync mechanism
        return () => clearInterval(interval);
    }, []);

    // REALTIME SUBSCRIPTION (Separated to depend on business context)
    useEffect(() => {
        const supabase = createClient();
        let channel: any = null;

        if (state.business?.id) {
            console.log("Subscribing to Realtime for Business:", state.business.id);
            channel = supabase.channel(`occupancy_${state.business.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*', // Listen to INSERT/UPDATE
                        schema: 'public',
                        table: 'occupancy_snapshots',
                        filter: `business_id=eq.${state.business.id}` // TENANT ISOLATION
                    },
                    (payload) => {
                        // Skip realtime updates while writes are in flight — applying an
                        // intermediate snapshot (e.g. after click 1 of 4) would overwrite
                        // the optimistic state showing the final count, causing visible flicker.
                        if (isWritingRef.current) return;

                        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
                            const newSnap = payload.new as any;
                            setState(prev => ({
                                ...prev,
                                areas: prev.areas.map(a => {
                                    if (a.id === newSnap.area_id) {
                                        return { ...a, current_occupancy: newSnap.current_occupancy };
                                    }
                                    return a;
                                })
                            }));
                        }
                    }
                )
                .subscribe();
        }

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [state.business?.id]); // Re-run when business context loads

    const authFetch = async (body: any) => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (user) {
            headers['x-user-id'] = user.id;
            headers['x-user-email'] = user.email || '';
        }
        return fetch('/api/sync', { method: 'POST', headers, body: JSON.stringify(body) });
    };

    // Counter lock: incremented per in-flight write, decremented when each settles.
    // Using a counter (not boolean) so concurrent clicks each hold their own lock slot —
    // the lock stays active until the LAST write clears, preventing realtime/poll from
    // overwriting optimistic state with intermediate counts.
    const isWritingRef = useRef(0);

    const recordEvent = async (data: Omit<CountEvent, 'id' | 'timestamp' | 'user_id' | 'business_id'>) => {
        if (!state.business) return;

        isWritingRef.current += 1; // Acquire lock slot

        const newEvent: CountEvent = {
            ...data,
            id: Math.random().toString(36).substring(7),
            timestamp: Date.now(),
            user_id: state.currentUser.id,
            business_id: state.business.id,
        };

        // Optimistic update
        setState(prev => {
            const updatedClicrs = prev.clicrs.map(c => {
                if (c.id === data.clicr_id) {
                    return { ...c, current_count: c.current_count + data.delta };
                }
                return c;
            });
            return {
                ...prev,
                clicrs: updatedClicrs,
                // OPTIMISTICALLY UPDATE AREA OCCUPANCY
                areas: prev.areas.map(a => {
                    if (a.id === data.area_id) {
                        // Fallback to summing if current_occupancy is missing in cache (migration edge case)
                        const current = a.current_occupancy ?? prev.clicrs.filter(c => c.area_id === a.id).reduce((sum, c) => sum + c.current_count, 0);
                        return {
                            ...a,
                            current_occupancy: Math.max(0, current + data.delta)
                        };
                    }
                    return a;
                }),
                events: [newEvent, ...prev.events] // Prepend locally
            };
        });

        // Send to API
        try {
            // Use authFetch to ensure user context is passed (fixes filtering/identity issues)
            const res = await authFetch({ action: 'RECORD_EVENT', payload: newEvent });

            // Intentionally not applying API response to state — the optimistic update
            // already reflects the change, and the 2-second polling interval will reconcile
            // server truth. Applying the response here overwrites Supabase-hydrated
            // venues/areas with stale local db.json data, causing venue name flicker,
            // venueId becoming undefined (breaks guest-out), and fast-click races.
            if (!res.ok) {
                console.error("Failed to record event (server error)", res.status);
            }
        } catch (error) {
            console.error("Failed to record event", error);
            // Revert?
        } finally {
            // Delay releasing this slot to allow Supabase realtime to settle,
            // then refresh traffic totals so TOTAL IN/OUT reflect the new event.
            setTimeout(() => {
                isWritingRef.current = Math.max(0, isWritingRef.current - 1);
                refreshTrafficStats(data.venue_id, data.area_id);
            }, 500);
        }
    };

    const recordScan = async (data: Omit<IDScanEvent, 'id' | 'timestamp'>) => {
        isWritingRef.current += 1; // Acquire lock slot

        const newScan: IDScanEvent = {
            ...data,
            id: Math.random().toString(36).substring(7),
            timestamp: Date.now(),
        };

        // Optimistic
        setState(prev => ({
            ...prev,
            scanEvents: [newScan, ...prev.scanEvents]
        }));

        try {
            const res = await authFetch({ action: 'RECORD_SCAN', payload: newScan }); // Use authFetch
            // Intentionally not applying API response to state — RECORD_SCAN is hydrated
            // and its response includes areas.current_occupancy from Supabase, which would
            // overwrite the optimistic occupancy from concurrent Guest IN clicks (same root
            // cause as RECORD_EVENT). Polling reconciles server truth.
            if (!res.ok) {
                console.error("Failed to record scan (server error)", res.status);
            }
        } catch (error) {
            console.error("Failed to record scan", error);
        } finally {
            setTimeout(() => {
                isWritingRef.current = Math.max(0, isWritingRef.current - 1);
            }, 500);
        }
    };

    const resetCounts = async (venueId?: string) => {
        // LOCK polling to prevent race conditions
        isResettingRef.current = true;

        // Optimistic update — zero all counters and start a fresh traffic session
        const optimisticState = {
            ...state,
            clicrs: state.clicrs.map(c => ({ ...c, current_count: 0 })),
            areas: state.areas.map(a => ({ ...a, current_occupancy: 0 })),
            events: [],
            scanEvents: [],
            turnarounds: [],
            areaTraffic: {},
            trafficSessionStart: Date.now(),
        };
        setState(optimisticState);

        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'RESET_COUNTS', venue_id: venueId }),
                cache: 'no-store'
            });

            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
            }
        } catch (error) {
            console.error("Failed to reset counts", error);
        } finally {
            // UNLOCK polling
            isResettingRef.current = false;
            // Force immediate fresh poll
            refreshState();
        }
    };

    const addUser = async (user: User) => {
        // Optimistic
        setState(prev => ({
            ...prev,
            users: [...prev.users, user]
        }));

        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'ADD_USER', payload: user })
            });
            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
            }
        } catch (error) {
            console.error("Failed to add user", error);
        }
    };

    const updateUser = async (user: User) => {
        setState(prev => ({
            ...prev,
            users: prev.users.map(u => u.id === user.id ? user : u)
        }));

        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'UPDATE_USER', payload: user })
            });
            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
            }
        } catch (error) { console.error("Failed to update user", error); }
    };

    const removeUser = async (userId: string) => {
        setState(prev => ({
            ...prev,
            users: prev.users.filter(u => u.id !== userId)
        }));

        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'REMOVE_USER', payload: { id: userId } })
            });
            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
            }
        } catch (error) { console.error("Failed to remove user", error); }
    };

    // --- VENUE MANAGEMENT ---

    const addVenue = async (venue: Venue) => {
        setState(prev => ({ ...prev, venues: [...prev.venues, venue] }));
        try {
            const res = await authFetch({ action: 'ADD_VENUE', payload: venue });
            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
            }
        } catch (error) { console.error("Failed to add venue", error); }
    };

    const updateVenue = async (venue: Venue) => {
        setState(prev => ({ ...prev, venues: prev.venues.map(v => v.id === venue.id ? venue : v) }));
        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'UPDATE_VENUE', payload: venue })
            });
            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
            }
        } catch (error) { console.error("Failed to update venue", error); }
    };

    const addArea = async (area: Area) => {
        setState(prev => ({ ...prev, areas: [...prev.areas, area] }));
        try {
            const res = await authFetch({ action: 'ADD_AREA', payload: area });
            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
            }
        } catch (error) { console.error("Failed to add area", error); }
    };

    const updateArea = async (area: Area) => {
        // Optimistic
        const originalArea = state.areas.find(a => a.id === area.id);
        setState(prev => ({ ...prev, areas: prev.areas.map(a => a.id === area.id ? area : a) }));

        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'UPDATE_AREA', payload: area })
            });
            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
                return true;
            } else {
                // Revert
                console.error("Update Area Failed API");
                if (originalArea) setState(prev => ({ ...prev, areas: prev.areas.map(a => a.id === area.id ? originalArea : a) }));
                return false;
            }
        } catch (error) {
            console.error("Failed to update area", error);
            if (originalArea) setState(prev => ({ ...prev, areas: prev.areas.map(a => a.id === area.id ? originalArea : a) }));
            return false;
        }
    };

    // --- DEVICES ---

    const deleteClicr = async (clicrId: string): Promise<{ success: boolean, error?: string }> => {
        // Optimistic - remove from list
        const originalClicr = state.clicrs.find(c => c.id === clicrId);
        setState(prev => ({
            ...prev,
            clicrs: prev.clicrs.filter(c => c.id !== clicrId)
        }));

        try {
            const res = await authFetch({ action: 'DELETE_CLICR', payload: { id: clicrId } });
            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
                return { success: true };
            } else {
                const errData = await res.json().catch(() => ({}));
                console.error("Delete Clicr Failed API", errData);
                // Revert
                if (originalClicr) setState(prev => ({ ...prev, clicrs: [...prev.clicrs, originalClicr] }));
                return { success: false, error: errData.error || res.statusText };
            }
        } catch (e: any) {
            console.error("Delete Clicr Network Error", e);
            if (originalClicr) setState(prev => ({ ...prev, clicrs: [...prev.clicrs, originalClicr] }));
            return { success: false, error: e.message };
        }
    };

    const addClicr = async (clicr: Clicr): Promise<{ success: boolean, error?: string }> => {
        // Optimistic Update
        const tempId = clicr.id;
        setState(prev => ({ ...prev, clicrs: [...prev.clicrs, clicr] }));

        try {
            const res = await authFetch({ action: 'ADD_CLICR', payload: clicr });
            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
                return { success: true };
            } else {
                const errData = await res.json().catch(() => ({}));
                console.error("Failed to add clicr API error", errData);
                // Revert
                setState(prev => ({ ...prev, clicrs: prev.clicrs.filter(c => c.id !== tempId) }));
                return { success: false, error: errData.error || res.statusText };
            }
        } catch (error: any) {
            console.error("Failed to add clicr network error", error);
            // Revert
            setState(prev => ({ ...prev, clicrs: prev.clicrs.filter(c => c.id !== tempId) }));
            return { success: false, error: error.message };
        }
    };

    const updateClicr = async (clicr: Clicr) => {
        // Optimistic update — applies name/config change immediately
        setState(prev => ({ ...prev, clicrs: prev.clicrs.map(c => c.id === clicr.id ? clicr : c) }));
        try {
            const res = await authFetch({ action: 'UPDATE_CLICR', payload: clicr });
            if (!res.ok) {
                console.error("UPDATE_CLICR failed (server error)", res.status);
                // Intentionally NOT reverting — optimistic state is user's intent.
                // The 2-second polling interval will reconcile if needed.
            }
            // Intentionally NOT spreading updatedDB — the optimistic update is correct
            // and the 2-second polling interval will confirm server truth.
        } catch (error) { console.error("Failed to update clicr", error); }
    };

    const addDevice = async (device: Device) => {
        setState(prev => ({ ...prev, devices: [...prev.devices, device] }));
        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'ADD_DEVICE', payload: device })
            });
            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
            }
        } catch (error) { console.error("Failed to add device", error); }
    };

    const updateDevice = async (device: Device) => {
        setState(prev => ({ ...prev, devices: prev.devices.map(d => d.id === device.id ? device : d) }));
        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'UPDATE_DEVICE', payload: device })
            });
            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
            }
        } catch (error) { console.error("Failed to update device", error); }
    };

    // --- OVERRIDES & LOGS ---

    const addCapacityOverride = async (override: CapacityOverride) => {
        setState(prev => ({ ...prev, capacityOverrides: [...prev.capacityOverrides, override] }));
        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'ADD_CAPACITY_OVERRIDE', payload: override })
            });
            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
            }
        } catch (error) { console.error("Failed to add override", error); }
    };

    const addVenueAuditLog = async (log: VenueAuditLog) => {
        setState(prev => ({ ...prev, venueAuditLogs: [...prev.venueAuditLogs, log] }));
        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'ADD_VENUE_AUDIT_LOG', payload: log })
            });
            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
            }
        } catch (error) { console.error("Failed to add audit log", error); }
    };

    // --- BANS ---

    const addBan = async (ban: BanRecord) => {
        setState(prev => ({
            ...prev,
            bans: [...(prev.bans || []), ban]
        }));
        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'CREATE_BAN', payload: ban })
            });
            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
            }
        } catch (error) { console.error("Failed to add ban", error); }
    };

    const revokeBan = async (banId: string, revokedByUserId: string, reason?: string) => {
        setState(prev => ({
            ...prev,
            bans: (prev.bans || []).map(b => b.id === banId ? { ...b, status: 'REVOKED', revoked_by_user_id: revokedByUserId, revoked_at: Date.now(), revoked_reason: reason } : b)
        }));
        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'REVOKE_BAN', payload: { banId, revokedByUserId, reason } })
            });
            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
            }
        } catch (error) { console.error("Failed to revoke ban", error); }
    };

    const createPatronBan = async (person: BannedPerson, ban: PatronBan, log: BanAuditLog) => {
        // Optimistic UI update
        setState(prev => ({
            ...prev,
            patrons: [...prev.patrons.filter(p => p.id !== person.id), person], // Update or push
            patronBans: [...prev.patronBans, ban],
            banAuditLogs: [...prev.banAuditLogs, log]
        }));

        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'CREATE_PATRON_BAN', payload: { person, ban, log } })
            });

            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
            }
        } catch (error) {
            console.error("Failed to create patron ban", error);
        }
    };

    const updatePatronBan = async (ban: PatronBan, log: BanAuditLog) => {
        // Optimistic UI update
        setState(prev => ({
            ...prev,
            patronBans: prev.patronBans.map(b => b.id === ban.id ? ban : b),
            banAuditLogs: [...prev.banAuditLogs, log]
        }));

        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'UPDATE_PATRON_BAN', payload: { ban, log } })
            });

            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
            }
        } catch (error) {
            console.error("Failed to update patron ban", error);
        }
    };

    const recordBanEnforcement = async (event: BanEnforcementEvent) => {
        // Optimistic UI update
        setState(prev => ({
            ...prev,
            banEnforcementEvents: [event, ...prev.banEnforcementEvents]
        }));

        try {
            await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'RECORD_BAN_ENFORCEMENT', payload: event })
            });
            // We don't strictly need to await the full DB sync here, optimizing for speed
        } catch (error) {
            console.error("Failed to record ban enforcement", error);
        }
    };

    const refreshTrafficStats = async (venueId: string, areaId: string) => {
        if (!state.business?.id) return;
        const scopeKey = `area:${state.business.id}:${venueId}:${areaId}`;
        try {
            const res = await fetch('/api/rpc/traffic', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    business_id: state.business.id,
                    venue_id: venueId,
                    area_id: areaId,
                    start_ts: new Date(state.trafficSessionStart).toISOString()
                })
            });
            if (res.ok) {
                const data = await res.json();
                setState(prev => ({
                    ...prev,
                    areaTraffic: {
                        ...prev.areaTraffic,
                        [scopeKey]: {
                            total_in: data.total_in,
                            total_out: data.total_out,
                            net_delta: data.net_delta,
                            event_count: data.event_count
                        }
                    }
                }));
            }
        } catch (error) {
            console.error("Failed to refresh traffic stats", error);
        }
    };

    const recordTurnaround = async (venueId: string, areaId: string, deviceId: string, count: number) => {
        if (!state.business) return;

        const newTurnaround: TurnaroundEvent = {
            id: Math.random().toString(36).substring(7),
            timestamp: Date.now(),
            business_id: state.business.id,
            venue_id: venueId,
            area_id: areaId,
            device_id: deviceId,
            count,
            created_by: state.currentUser.id
        };

        // Optimistic update
        setState(prev => ({ ...prev, turnarounds: [newTurnaround, ...prev.turnarounds] }));

        try {
            const res = await authFetch({ action: 'RECORD_TURNAROUND', payload: newTurnaround });
            if (!res.ok) console.error("Failed to record turnaround (server error)", res.status);
        } catch (error) {
            console.error("Failed to record turnaround", error);
        }
    };

    const updateBusiness = async (updates: Partial<Business>) => {
        // Optimistic
        if (state.business) {
            setState(prev => ({
                ...prev,
                business: { ...prev.business!, ...updates }
            }));
        }

        try {
            const res = await authFetch({ action: 'UPDATE_BUSINESS', payload: updates });
            if (res.ok) {
                const updatedDB = await res.json();
                setState(prev => ({ ...prev, ...updatedDB }));
            }
        } catch (error) { console.error("Failed to update business", error); }
    };

    return (
        <AppContext.Provider value={{ ...state, recordEvent, recordScan, resetCounts, addUser, updateUser, removeUser, updateBusiness, addClicr, updateClicr, deleteClicr, addVenue, updateVenue, addArea, updateArea, addDevice, updateDevice, addCapacityOverride, addVenueAuditLog, addBan, revokeBan, createPatronBan, updatePatronBan, recordBanEnforcement, recordTurnaround, refreshTrafficStats, businesses: state.businesses, activeBusiness: state.activeBusiness, selectBusiness, clearBusiness } as AppContextType}>
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
};
