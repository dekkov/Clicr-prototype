/**
 * LocalAdapter — Demo/Prototype DataClient
 * ==========================================
 * This adapter wraps the existing in-memory + localStorage + JSON file data layer.
 * It powers the prototype's demo mode without requiring Supabase.
 *
 * IMPLEMENTATION NOTES:
 * - Auth methods are no-ops (always returns a mock session)
 * - Data is persisted to localStorage in the browser or data/db.json on the server
 * - This adapter is the reference implementation — SupabaseAdapter should match behavior
 *
 * LIMITATIONS:
 * - No real auth (single hardcoded user)
 * - No multi-tenancy (single business)
 * - No real-time updates (polls via AppProvider)
 * - No row locking (rapid taps may race on the same JS thread)
 */

import type {
    DataClient,
    Scope,
    TimeWindow,
    DeltaPayload,
    DeltaResult,
    ResetResult,
    ScanPayload,
    BanPayload,
    SessionInfo,
    SnapshotRow,
    ReportSummary,
    HourlyBucket,
    DemographicBreakdown,
    EventLogEntry,
    Business,
    Venue,
    Area,
    Device,
    BanRecord,
    ScanRecord,
} from './DataClient';
import type { NightLog } from '@/lib/types';
import { getAutoDateLabel } from '@/lib/business-day';

// ─── Internal State ────────────────────────────────────────────────────

type LocalState = {
    business: Business;
    venues: Venue[];
    areas: Area[];
    devices: Device[];
    events: Array<{
        id: string;
        businessId: string;
        venueId: string;
        areaId: string;
        deviceId?: string;
        delta: number;
        flowType: 'IN' | 'OUT';
        eventType: string;
        source: string;
        counterLabelId?: string;
        createdAt: string;
    }>;
    scans: ScanRecord[];
    bans: BanRecord[];
    snapshots: Map<string, number>; // areaId → occupancy
    lastResetAt: Map<string, string>; // areaId → ISO timestamp
};

const DEFAULT_BUSINESS: Business = {
    id: 'biz_demo',
    name: 'Demo Business',
    timezone: 'America/New_York',
    settings: {
        refresh_interval_sec: 5,
        capacity_thresholds: [80, 90, 100],
        reset_rule: 'MANUAL',
    },
};

const STORAGE_KEY = 'clicr_local_adapter_state';

function generateId(): string {
    return Math.random().toString(36).substring(2, 10);
}

function nowISO(): string {
    return new Date().toISOString();
}

export class LocalAdapter implements DataClient {
    private state: LocalState;

    constructor() {
        this.state = this.loadState();
    }

    private loadState(): LocalState {
        if (typeof window !== 'undefined') {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    parsed.snapshots = new Map(Object.entries(parsed.snapshots || {}));
                    parsed.lastResetAt = new Map(Object.entries(parsed.lastResetAt || {}));
                    return parsed;
                }
            } catch { /* ignore */ }
        }
        return {
            business: DEFAULT_BUSINESS,
            venues: [],
            areas: [],
            devices: [],
            events: [],
            scans: [],
            bans: [],
            snapshots: new Map(),
            lastResetAt: new Map(),
        };
    }

    private saveState(): void {
        if (typeof window !== 'undefined') {
            try {
                const serializable = {
                    ...this.state,
                    snapshots: Object.fromEntries(this.state.snapshots),
                    lastResetAt: Object.fromEntries(this.state.lastResetAt),
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
            } catch { /* ignore */ }
        }
    }

    // ── AUTH (stubbed) ──────────────────────────────────────────────────

    async signUp(_email: string, _password: string) {
        return { userId: 'usr_demo' };
    }

    async signIn(_email: string, _password: string) {
        return { userId: 'usr_demo' };
    }

    async signOut(): Promise<void> {
        // no-op
    }

    async getSession(): Promise<SessionInfo> {
        return {
            userId: 'usr_demo',
            email: 'demo@clicr.app',
            role: 'OWNER',
            businessId: this.state.business.id,
        };
    }

    // ── BUSINESS ────────────────────────────────────────────────────────

    async createBusiness(name: string, timezone?: string): Promise<Business> {
        this.state.business = {
            ...DEFAULT_BUSINESS,
            id: `biz_${generateId()}`,
            name,
            timezone: timezone || 'America/New_York',
        };
        this.saveState();
        return this.state.business;
    }

    async getBusinessesForUser(): Promise<Business[]> {
        return [this.state.business];
    }

    async updateBusiness(_businessId: string, patch: Partial<Business>): Promise<Business> {
        this.state.business = { ...this.state.business, ...patch };
        this.saveState();
        return this.state.business;
    }

    // ── VENUES ──────────────────────────────────────────────────────────

    async createVenue(businessId: string, venue: Omit<Venue, 'id' | 'created_at' | 'updated_at'>): Promise<Venue> {
        const newVenue: Venue = {
            ...venue,
            id: `ven_${generateId()}`,
            business_id: businessId,
            created_at: nowISO(),
            updated_at: nowISO(),
        };
        this.state.venues.push(newVenue);
        this.saveState();
        return newVenue;
    }

    async updateVenue(venueId: string, patch: Partial<Venue>): Promise<Venue> {
        const idx = this.state.venues.findIndex(v => v.id === venueId);
        if (idx === -1) throw new Error('Venue not found');
        this.state.venues[idx] = { ...this.state.venues[idx], ...patch, updated_at: nowISO() };
        this.saveState();
        return this.state.venues[idx];
    }

    async listVenues(businessId: string): Promise<Venue[]> {
        return this.state.venues.filter(v => v.business_id === businessId);
    }

    // ── AREAS ───────────────────────────────────────────────────────────

    async createArea(venueId: string, area: Omit<Area, 'id' | 'created_at' | 'updated_at'>): Promise<Area> {
        const newArea: Area = {
            ...area,
            id: `area_${generateId()}`,
            venue_id: venueId,
            created_at: nowISO(),
            updated_at: nowISO(),
        };
        this.state.areas.push(newArea);
        this.state.snapshots.set(newArea.id, 0);
        this.saveState();
        return newArea;
    }

    async updateArea(areaId: string, patch: Partial<Area>): Promise<Area> {
        const idx = this.state.areas.findIndex(a => a.id === areaId);
        if (idx === -1) throw new Error('Area not found');
        this.state.areas[idx] = { ...this.state.areas[idx], ...patch, updated_at: nowISO() };
        this.saveState();
        return this.state.areas[idx];
    }

    async listAreas(venueId: string): Promise<Area[]> {
        return this.state.areas
            .filter(a => a.venue_id === venueId)
            .map(a => ({
                ...a,
                current_occupancy: this.state.snapshots.get(a.id) || 0,
            }));
    }

    // ── DEVICES ─────────────────────────────────────────────────────────

    async createDevice(areaId: string, device: Omit<Device, 'id'>): Promise<Device> {
        const id = `dev_${generateId()}`;
        let labels = device.counter_labels ?? [];
        if (labels.length === 0) {
            labels = [{ id: `lbl_${generateId()}`, device_id: id, label: 'General', position: 0 }];
        } else {
            labels = labels.map(l => ({ ...l, device_id: id }));
        }
        const newDevice: Device = { ...device, id, area_id: areaId, counter_labels: labels };
        this.state.devices.push(newDevice);
        this.saveState();
        return newDevice;
    }

    async updateDevice(deviceId: string, patch: Partial<Device>): Promise<Device> {
        const idx = this.state.devices.findIndex(d => d.id === deviceId);
        if (idx === -1) throw new Error('Device not found');
        const existing = this.state.devices[idx];
        this.state.devices[idx] = { ...existing, ...patch };
        if (patch.counter_labels) {
            this.state.devices[idx].counter_labels = patch.counter_labels;
        }
        this.saveState();
        return this.state.devices[idx];
    }

    async deleteDevice(deviceId: string) {
        this.state.devices = this.state.devices.filter(d => d.id !== deviceId);
        this.saveState();
        return { success: true };
    }

    async listDevices(scope: Scope): Promise<Device[]> {
        let devices = this.state.devices;
        if (scope.areaId) {
            devices = devices.filter(d => d.area_id === scope.areaId);
        } else if (scope.venueId) {
            const areaIds = new Set(this.state.areas.filter(a => a.venue_id === scope.venueId).map(a => a.id));
            devices = devices.filter(d => d.area_id && areaIds.has(d.area_id));
        }
        return devices.filter(d => d.active !== false);
    }

    // ── COUNTING ────────────────────────────────────────────────────────

    async applyOccupancyDelta(payload: DeltaPayload): Promise<DeltaResult> {
        let newOcc: number;

        if (!payload.areaId && payload.venueId) {
            // Venue counter clicr — update venue-level occupancy
            const venue = this.state.venues.find(v => v.id === payload.venueId);
            if (venue) {
                venue.current_occupancy = Math.max(0, (venue.current_occupancy ?? 0) + payload.delta);
            }
            newOcc = venue?.current_occupancy ?? 0;
        } else {
            // Area-level tap (existing behavior)
            const areaId = payload.areaId!;
            const current = this.state.snapshots.get(areaId) || 0;
            newOcc = Math.max(0, current + payload.delta);
            this.state.snapshots.set(areaId, newOcc);
        }

        const eventId = `evt_${generateId()}`;
        this.state.events.push({
            id: eventId,
            businessId: payload.businessId,
            venueId: payload.venueId,
            areaId: payload.areaId ?? '',
            deviceId: payload.deviceId,
            delta: payload.delta,
            flowType: payload.delta > 0 ? 'IN' : 'OUT',
            eventType: 'TAP',
            source: payload.source,
            counterLabelId: payload.counterLabelId,
            createdAt: nowISO(),
        });

        this.saveState();
        return { newOccupancy: newOcc, eventId };
    }

    async getSnapshots(scope: Scope): Promise<SnapshotRow[]> {
        let areas = this.state.areas;
        if (scope.venueId) areas = areas.filter(a => a.venue_id === scope.venueId);
        if (scope.areaId) areas = areas.filter(a => a.id === scope.areaId);

        return areas.map(a => ({
            businessId: scope.businessId,
            venueId: a.venue_id,
            areaId: a.id,
            currentOccupancy: this.state.snapshots.get(a.id) || 0,
            lastResetAt: this.state.lastResetAt.get(a.id),
            updatedAt: nowISO(),
        }));
    }

    async getTrafficTotals(scope: Scope, window: TimeWindow) {
        const events = this.filterEvents(scope, window);
        const totalIn = events.filter(e => e.flowType === 'IN').reduce((sum, e) => sum + Math.abs(e.delta), 0);
        const totalOut = events.filter(e => e.flowType === 'OUT').reduce((sum, e) => sum + Math.abs(e.delta), 0);
        return { totalIn, totalOut, net: totalIn - totalOut };
    }

    async resetCounts(businessId: string, resetType: 'NIGHT_AUTO' | 'NIGHT_MANUAL' | 'OPERATIONAL' = 'OPERATIONAL'): Promise<ResetResult> {
        const resetAt = nowISO();
        let count = 0;

        // For night resets: snapshot current state into NightLog before zeroing
        if (resetType !== 'OPERATIONAL') {
            const logKey = `clicr_night_logs_${businessId}`;
            const existing: NightLog[] = typeof window !== 'undefined'
                ? JSON.parse(localStorage.getItem(logKey) || '[]')
                : [];

            const resetTime = this.state.business?.settings?.reset_time || '05:00';
            const resetTz = this.state.business?.settings?.reset_timezone || this.state.business?.timezone || 'UTC';
            const businessDate = getAutoDateLabel(new Date(), resetTime, resetTz);

            const newLogs: NightLog[] = this.state.venues
                .filter(v => v.business_id === businessId)
                .map(v => {
                    const venueEvents = this.state.events.filter(e => e.venueId === v.id);
                    const venueScans = this.state.scans.filter(s => s.venueId === v.id);

                    const total_in = venueEvents.filter(e => e.flowType === 'IN').reduce((sum, e) => sum + Math.abs(e.delta), 0);
                    const total_out = venueEvents.filter(e => e.flowType === 'OUT').reduce((sum, e) => sum + Math.abs(e.delta), 0);
                    const scans_total = venueScans.length;
                    const scans_accepted = venueScans.filter(s => s.scanResult === 'ACCEPTED').length;
                    const scans_denied = venueScans.filter(s => s.scanResult === 'DENIED').length;

                    // Peak occupancy: running sum of deltas ordered by createdAt
                    const sorted = [...venueEvents].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
                    let running = 0, peak = 0;
                    for (const e of sorted) {
                        running += e.delta;
                        if (running > peak) peak = running;
                    }

                    // period_start: last reset time, or earliest event, or business created_at fallback
                    const periodStart = this.state.business?.last_reset_at
                        || (venueEvents.length > 0
                            ? venueEvents.reduce((min, e) => e.createdAt < min ? e.createdAt : min, venueEvents[0].createdAt)
                            : resetAt);

                    return {
                        id: crypto.randomUUID(),
                        business_id: businessId,
                        venue_id: v.id,
                        area_id: null,
                        business_date: businessDate,
                        period_start: periodStart,
                        reset_at: resetAt,
                        total_in,
                        total_out,
                        turnarounds: 0,
                        scans_total,
                        scans_accepted,
                        scans_denied,
                        peak_occupancy: peak,
                        reset_type: resetType as 'NIGHT_AUTO' | 'NIGHT_MANUAL',
                        created_at: resetAt,
                    };
                });

            if (typeof window !== 'undefined') {
                localStorage.setItem(logKey, JSON.stringify([...existing, ...newLogs]));
            }
        }

        // Zero all area occupancy snapshots
        for (const area of this.state.areas) {
            this.state.snapshots.set(area.id, 0);
            this.state.lastResetAt.set(area.id, resetAt);
            count++;
        }

        // Zero all venue occupancies
        for (const venue of this.state.venues) {
            venue.current_occupancy = 0;
            venue.last_reset_at = resetAt;
        }

        // Update business last_reset_at
        this.state.business = { ...this.state.business, last_reset_at: resetAt };

        this.saveState();
        return { areasReset: count, resetAt, success: true };
    }

    async getNightLogs(businessId: string, date: string): Promise<NightLog[]> {
        if (typeof window === 'undefined') return [];
        const key = `clicr_night_logs_${businessId}`;
        const stored = localStorage.getItem(key);
        if (!stored) return [];
        const all: NightLog[] = JSON.parse(stored);
        return all.filter(l => l.business_date === date);
    }

    // ── SCANNING ────────────────────────────────────────────────────────

    async logScan(businessId: string, scan: ScanPayload): Promise<ScanRecord> {
        const record: ScanRecord = {
            id: `scan_${generateId()}`,
            timestamp: nowISO(),
            venueId: scan.venueId,
            areaId: scan.areaId,
            scanResult: scan.scanResult,
            age: scan.age,
            ageBand: scan.ageBand,
            sex: scan.sex,
            zipCode: scan.zipCode,
            firstName: scan.firstName,
            lastName: scan.lastName,
        };
        this.state.scans.push(record);
        this.saveState();
        return record;
    }

    async listScans(scope: Scope, window: TimeWindow): Promise<ScanRecord[]> {
        return this.state.scans.filter(s => {
            if (scope.venueId && s.venueId !== scope.venueId) return false;
            if (window.start && s.timestamp < window.start) return false;
            if (window.end && s.timestamp > window.end) return false;
            return true;
        });
    }

    // ── BANS ────────────────────────────────────────────────────────────

    async createBan(ban: BanPayload): Promise<BanRecord> {
        const record: BanRecord = {
            id: `ban_${generateId()}`,
            personId: ban.personId,
            businessId: ban.businessId,
            status: 'ACTIVE',
            banType: ban.banType,
            reasonCategory: ban.reasonCategory,
            reasonNotes: ban.reasonNotes,
            startDatetime: ban.startDatetime,
            endDatetime: ban.endDatetime || null,
            createdByUserId: ban.createdByUserId,
            createdAt: nowISO(),
        };
        this.state.bans.push(record);
        this.saveState();
        return record;
    }

    async listBans(scope: Scope): Promise<BanRecord[]> {
        return this.state.bans.filter(b => b.businessId === scope.businessId && b.status === 'ACTIVE');
    }

    async updateBan(banId: string, patch: Partial<BanRecord>): Promise<BanRecord> {
        const idx = this.state.bans.findIndex(b => b.id === banId);
        if (idx === -1) throw new Error('Ban not found');
        this.state.bans[idx] = { ...this.state.bans[idx], ...patch };
        this.saveState();
        return this.state.bans[idx];
    }

    async checkBanStatus(businessId: string, personId: string, _venueId?: string) {
        const ban = this.state.bans.find(b =>
            b.businessId === businessId && b.personId === personId && b.status === 'ACTIVE'
        );
        return ban ? { isBanned: true, ban } : { isBanned: false };
    }

    // ── REPORTING ───────────────────────────────────────────────────────

    async getReportSummary(scope: Scope, window: TimeWindow): Promise<ReportSummary> {
        const events = this.filterEvents(scope, window);
        const scans = await this.listScans(scope, window);

        const totalIn = events.filter(e => e.flowType === 'IN').reduce((sum, e) => sum + Math.abs(e.delta), 0);
        const totalOut = events.filter(e => e.flowType === 'OUT').reduce((sum, e) => sum + Math.abs(e.delta), 0);
        const manualIn = events.filter(e => e.flowType === 'IN' && e.source === 'manual').reduce((sum, e) => sum + Math.abs(e.delta), 0);
        const scanIn = events.filter(e => e.flowType === 'IN' && ['scan', 'auto_scan'].includes(e.source)).reduce((sum, e) => sum + Math.abs(e.delta), 0);

        return {
            totalEntriesGross: totalIn,
            totalExitsGross: totalOut,
            turnaroundsCount: 0,
            netEntriesAdjusted: totalIn,
            entriesManual: manualIn,
            entriesScan: scanIn,
            scansTotal: scans.length,
            scansAccepted: scans.filter(s => s.scanResult === 'ACCEPTED').length,
            scansDenied: scans.filter(s => s.scanResult === 'DENIED').length,
            effectiveStartTs: window.start,
        };
    }

    async getHourlyTraffic(scope: Scope, window: TimeWindow): Promise<HourlyBucket[]> {
        const events = this.filterEvents(scope, window);
        const buckets = new Map<string, HourlyBucket>();

        for (const event of events) {
            const hour = new Date(event.createdAt);
            hour.setMinutes(0, 0, 0);
            const key = hour.toISOString();

            if (!buckets.has(key)) {
                buckets.set(key, { hour: key, entriesIn: 0, entriesOut: 0, netDelta: 0 });
            }
            const bucket = buckets.get(key)!;
            if (event.flowType === 'IN') {
                bucket.entriesIn += Math.abs(event.delta);
            } else {
                bucket.entriesOut += Math.abs(event.delta);
            }
            bucket.netDelta += event.delta;
        }

        return Array.from(buckets.values()).sort((a, b) => a.hour.localeCompare(b.hour));
    }

    async getDemographics(scope: Scope, window: TimeWindow): Promise<DemographicBreakdown[]> {
        const scans = (await this.listScans(scope, window)).filter(s => s.scanResult === 'ACCEPTED');
        if (scans.length === 0) return [];

        const groups = new Map<string, number>();
        for (const scan of scans) {
            const key = `${scan.ageBand}|${scan.sex}`;
            groups.set(key, (groups.get(key) || 0) + 1);
        }

        return Array.from(groups.entries()).map(([key, count]) => {
            const [ageBand, sex] = key.split('|');
            return {
                ageBand,
                sex,
                count,
                percentage: Math.round((count / scans.length) * 1000) / 10,
            };
        });
    }

    async getEventLog(scope: Scope, window: TimeWindow): Promise<EventLogEntry[]> {
        const events = this.filterEvents(scope, window);
        return events.map(e => ({
            id: e.id,
            timestamp: e.createdAt,
            type: e.eventType as EventLogEntry['type'],
            delta: e.delta,
            flowType: e.flowType as 'IN' | 'OUT',
            counterLabelId: e.counterLabelId,
            source: e.source,
            deviceId: e.deviceId,
        })).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }

    // ── HELPERS ──────────────────────────────────────────────────────────

    private filterEvents(scope: Scope, window: TimeWindow) {
        return this.state.events.filter(e => {
            if (e.businessId !== scope.businessId) return false;
            if (scope.venueId && e.venueId !== scope.venueId) return false;
            if (scope.areaId && e.areaId !== scope.areaId) return false;
            if (window.start && e.createdAt < window.start) return false;
            if (window.end && e.createdAt > window.end) return false;
            if (e.eventType === 'RESET') return false;
            return true;
        });
    }
}
