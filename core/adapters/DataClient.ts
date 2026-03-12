/**
 * CLICR V4 DataClient Interface
 * ==============================
 * This is the single contract that both LocalAdapter and SupabaseAdapter must implement.
 * UI components MUST call DataClient methods only — never raw localStorage, fetch, or Supabase directly.
 *
 * Design Principles:
 * 1. Every method returns a Promise (even if the local adapter resolves synchronously).
 * 2. Scope parameters use a consistent { businessId, venueId?, areaId? } pattern.
 * 3. Write operations return the mutated entity or a result object.
 * 4. Read operations never throw on empty results — they return empty arrays or null.
 * 5. Auth methods are stubbed in LocalAdapter; fully implemented in SupabaseAdapter.
 */

import type { NightLog } from '@/lib/types';

// ─── SHARED TYPES ──────────────────────────────────────────────────────
// Re-export from models for convenience. Adapter implementations should import from here.

export type Scope = {
    businessId: string;
    venueId?: string;
    areaId?: string;
};

export type TimeWindow = {
    start: string; // ISO timestamp
    end: string;   // ISO timestamp
    timezone?: string;
};

export type DeltaPayload = {
    businessId: string;
    venueId: string;
    areaId: string | null;
    deviceId?: string;
    delta: number; // +N or -N
    source: 'manual' | 'scan' | 'bulk' | 'reset' | 'auto_scan';
    gender?: 'M' | 'F';
    idempotencyKey?: string;
};

export type DeltaResult = {
    newOccupancy: number;
    eventId: string;
};

export type ResetResult = {
    areasReset: number;
    resetAt: string; // ISO timestamp
    success: boolean;
    error?: string;
};

export type ScanPayload = {
    venueId: string;
    areaId?: string;
    deviceId?: string;
    scanResult: 'ACCEPTED' | 'DENIED' | 'PENDING';
    age: number;
    ageBand: string;
    sex: string;
    zipCode: string;
    firstName?: string;
    lastName?: string;
    dob?: string;
    idNumber?: string;
    issuingState?: string;
    idType?: string;
    autoAddOccupancy?: boolean;
};

export type BanPayload = {
    businessId: string;
    personId: string;
    firstName: string;
    lastName: string;
    dob?: string;
    idNumberLast4?: string;
    issuingState?: string;
    banType: 'TEMPORARY' | 'PERMANENT';
    startDatetime: string;
    endDatetime?: string | null;
    reasonCategory: string;
    reasonNotes?: string;
    appliesToAllLocations: boolean;
    locationIds: string[];
    createdByUserId: string;
};

export type ReportSummary = {
    totalEntriesGross: number;
    totalExitsGross: number;
    turnaroundsCount: number;
    netEntriesAdjusted: number;
    entriesManual: number;
    entriesScan: number;
    scansTotal: number;
    scansAccepted: number;
    scansDenied: number;
    effectiveStartTs: string;
};

export type HourlyBucket = {
    hour: string; // "2026-02-22T14:00:00Z"
    entriesIn: number;
    entriesOut: number;
    netDelta: number;
};

export type DemographicBreakdown = {
    ageBand: string;
    sex: string;
    count: number;
    percentage: number;
};

export type EventLogEntry = {
    id: string;
    timestamp: string;
    type: 'TAP' | 'SCAN' | 'BULK' | 'RESET' | 'BAN' | 'TURNAROUND';
    delta?: number;
    flowType?: 'IN' | 'OUT';
    gender?: string;
    source?: string;
    userId?: string;
    deviceId?: string;
    details?: Record<string, unknown>;
};

export type SessionInfo = {
    userId: string;
    email: string;
    role: string;
    businessId?: string;
} | null;

export type SnapshotRow = {
    businessId: string;
    venueId: string;
    areaId: string;
    currentOccupancy: number;
    lastResetAt?: string;
    updatedAt: string;
};

// ─── ENTITY TYPES (imported from models in real code) ──────────────────
// These are simplified references. The actual types live in /core/models/index.ts

export interface Business {
    id: string;
    name: string;
    timezone: string;
    last_reset_at?: string;
    settings: {
        refresh_interval_sec: number;
        capacity_thresholds: [number, number, number];
        reset_rule: 'MANUAL' | 'SCHEDULED';
        reset_time?: string;
        reset_timezone?: string;
    };
}

export interface Venue {
    id: string;
    business_id: string;
    name: string;
    city?: string;
    state?: string;
    timezone: string;
    status: 'ACTIVE' | 'INACTIVE';
    default_capacity_total?: number | null;
    capacity_enforcement_mode: 'WARN_ONLY' | 'HARD_STOP' | 'MANAGER_OVERRIDE';
    last_reset_at?: string;
    current_occupancy?: number;
    created_at: string;
    updated_at: string;
}

export interface Area {
    id: string;
    venue_id: string;
    business_id?: string;
    name: string;
    area_type: string;
    capacity_max?: number;
    last_reset_at?: string;
    counting_mode: string;
    is_active: boolean;
    current_occupancy?: number;
    created_at: string;
    updated_at: string;
}

export interface Device {
    id: string;
    business_id: string;
    venue_id?: string | null;
    area_id?: string | null;
    name: string;
    direction_mode?: 'in_only' | 'out_only' | 'bidirectional';
    active: boolean;
    button_config?: { label_a: string; label_b: string };
}

export interface BanRecord {
    id: string;
    personId: string;
    businessId: string;
    status: 'ACTIVE' | 'EXPIRED' | 'REMOVED';
    banType: 'TEMPORARY' | 'PERMANENT';
    reasonCategory: string;
    reasonNotes?: string;
    startDatetime: string;
    endDatetime?: string | null;
    createdByUserId: string;
    createdAt: string;
}

export interface ScanRecord {
    id: string;
    timestamp: string;
    venueId: string;
    areaId?: string;
    scanResult: 'ACCEPTED' | 'DENIED' | 'PENDING';
    age: number;
    ageBand: string;
    sex: string;
    zipCode: string;
    firstName?: string;
    lastName?: string;
}

// ─── THE DATA CLIENT INTERFACE ─────────────────────────────────────────

export interface DataClient {
    // ── AUTH ─────────────────────────────────────────────────────────────
    /** Register a new user account. LocalAdapter stubs this. */
    signUp(email: string, password: string, metadata?: Record<string, string>): Promise<{ userId: string } | { error: string }>;

    /** Authenticate an existing user. LocalAdapter stubs this. */
    signIn(email: string, password: string): Promise<{ userId: string } | { error: string }>;

    /** Sign out the current session. */
    signOut(): Promise<void>;

    /** Get current session/user info. Returns null if not authenticated. */
    getSession(): Promise<SessionInfo>;

    // ── BUSINESS ────────────────────────────────────────────────────────
    createBusiness(name: string, timezone?: string): Promise<Business>;
    getBusinessesForUser(): Promise<Business[]>;
    updateBusiness(businessId: string, patch: Partial<Business>): Promise<Business>;

    // ── VENUES ──────────────────────────────────────────────────────────
    createVenue(businessId: string, venue: Omit<Venue, 'id' | 'created_at' | 'updated_at'>): Promise<Venue>;
    updateVenue(venueId: string, patch: Partial<Venue>): Promise<Venue>;
    listVenues(businessId: string): Promise<Venue[]>;

    // ── AREAS ───────────────────────────────────────────────────────────
    createArea(venueId: string, area: Omit<Area, 'id' | 'created_at' | 'updated_at'>): Promise<Area>;
    updateArea(areaId: string, patch: Partial<Area>): Promise<Area>;
    listAreas(venueId: string): Promise<Area[]>;

    // ── DEVICES (CLICRS) ────────────────────────────────────────────────
    createDevice(areaId: string, device: Omit<Device, 'id'>): Promise<Device>;
    updateDevice(deviceId: string, patch: Partial<Device>): Promise<Device>;
    deleteDevice(deviceId: string): Promise<{ success: boolean; error?: string }>;
    listDevices(scope: Scope): Promise<Device[]>;

    // ── COUNTING (SOURCE OF TRUTH) ──────────────────────────────────────
    /**
     * Apply an occupancy delta atomically.
     * Returns the new occupancy after the write, plus the event ID.
     * UI MUST use the returned newOccupancy — do NOT increment locally and ignore the return.
     */
    applyOccupancyDelta(payload: DeltaPayload): Promise<DeltaResult>;

    /** Get current snapshots for all areas in scope. */
    getSnapshots(scope: Scope): Promise<SnapshotRow[]>;

    /** Get aggregated traffic totals (since reset or within window). */
    getTrafficTotals(scope: Scope, window: TimeWindow): Promise<{ totalIn: number; totalOut: number; net: number }>;

    /** Reset all counts for the entire business. Cascades to all venues, areas, and devices. */
    resetCounts(businessId: string, resetType: 'NIGHT_AUTO' | 'NIGHT_MANUAL' | 'OPERATIONAL'): Promise<ResetResult>;

    /** Get night log entries for a business on a given business date (YYYY-MM-DD). */
    getNightLogs(businessId: string, date: string): Promise<NightLog[]>;

    // ── ID SCANNING ─────────────────────────────────────────────────────
    logScan(businessId: string, scan: ScanPayload): Promise<ScanRecord>;
    listScans(scope: Scope, window: TimeWindow): Promise<ScanRecord[]>;

    // ── BANS ────────────────────────────────────────────────────────────
    createBan(ban: BanPayload): Promise<BanRecord>;
    listBans(scope: Scope): Promise<BanRecord[]>;
    updateBan(banId: string, patch: Partial<BanRecord>): Promise<BanRecord>;
    checkBanStatus(businessId: string, personId: string, venueId?: string): Promise<{ isBanned: boolean; ban?: BanRecord }>;

    // ── REPORTING ───────────────────────────────────────────────────────
    getReportSummary(scope: Scope, window: TimeWindow): Promise<ReportSummary>;
    getHourlyTraffic(scope: Scope, window: TimeWindow): Promise<HourlyBucket[]>;
    getDemographics(scope: Scope, window: TimeWindow): Promise<DemographicBreakdown[]>;
    getEventLog(scope: Scope, window: TimeWindow): Promise<EventLogEntry[]>;

    // ── REALTIME (optional, SupabaseAdapter only) ───────────────────────
    /**
     * Subscribe to realtime occupancy changes for a scope.
     * Returns an unsubscribe function.
     * LocalAdapter can return a no-op.
     */
    subscribeToSnapshots?(scope: Scope, callback: (snapshot: SnapshotRow) => void): () => void;

    /**
     * Subscribe to new events (inserts only).
     */
    subscribeToEvents?(scope: Scope, callback: (event: EventLogEntry) => void): () => void;
}

// ─── MODE CONFIGURATION ────────────────────────────────────────────────

export type AppMode = 'demo' | 'production';

/**
 * Get the active DataClient based on environment configuration.
 * Set NEXT_PUBLIC_APP_MODE=demo for LocalAdapter (default for prototype).
 * Set NEXT_PUBLIC_APP_MODE=production for SupabaseAdapter.
 */
export function getDataClient(): DataClient {
    const mode = (process.env.NEXT_PUBLIC_APP_MODE || 'demo') as AppMode;

    if (mode === 'production') {
        // Lazy import to avoid bundling Supabase in demo mode
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SupabaseAdapter } = require('./SupabaseAdapter');
        return new SupabaseAdapter();
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { LocalAdapter } = require('./LocalAdapter');
    return new LocalAdapter();
}
