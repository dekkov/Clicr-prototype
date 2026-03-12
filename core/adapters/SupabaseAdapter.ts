/**
 * SupabaseAdapter — Production DataClient
 * =========================================
 * STUB FILE for developer handoff.
 *
 * This adapter implements the DataClient interface using Supabase as the backend.
 * Each method maps to either:
 *   1. A Supabase RPC call (for atomic/complex operations like apply_occupancy_delta)
 *   2. A direct table query (for simple CRUD like listVenues)
 *   3. A Supabase Auth call (for signUp/signIn/signOut)
 *
 * IMPLEMENTATION GUIDE:
 * - All RPCs referenced here are defined in /migrations/001_schema.sql and /migrations/003_rpcs.sql
 * - RLS policies ensure tenant isolation — no need for manual business_id filtering in most queries
 * - For realtime, use Supabase channels with postgres_changes
 *
 * The developer should implement each method following the patterns shown.
 * Error handling should use the logError utility from /core/errors.ts.
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
    Business,
    Venue,
    Area,
    Device,
    BanRecord,
    ScanRecord,
    ReportSummary,
    HourlyBucket,
    DemographicBreakdown,
    EventLogEntry,
} from './DataClient';
import type { NightLog } from '@/lib/types';

// import { createClient } from '@supabase/supabase-js';
// const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export class SupabaseAdapter implements DataClient {
    // ── AUTH ─────────────────────────────────────────────────────────────

    async signUp(email: string, password: string, metadata?: Record<string, string>): Promise<{ userId: string } | { error: string }> {
        // TODO: Implement with supabase.auth.signUp({ email, password, options: { data: metadata } })
        // On success, also create a row in business_members linking user to their business
        throw new Error('SupabaseAdapter.signUp: Not yet implemented');
    }

    async signIn(email: string, password: string): Promise<{ userId: string } | { error: string }> {
        // TODO: Implement with supabase.auth.signInWithPassword({ email, password })
        throw new Error('SupabaseAdapter.signIn: Not yet implemented');
    }

    async signOut() {
        // TODO: Implement with supabase.auth.signOut()
        throw new Error('SupabaseAdapter.signOut: Not yet implemented');
    }

    async getSession(): Promise<SessionInfo> {
        // TODO: Implement with supabase.auth.getSession()
        // Then look up the user's role from business_members
        throw new Error('SupabaseAdapter.getSession: Not yet implemented');
    }

    // ── BUSINESS ────────────────────────────────────────────────────────

    async createBusiness(name: string, timezone?: string): Promise<Business> {
        // TODO:
        // 1. Insert into businesses table
        // 2. Insert into business_members (role: 'OWNER', user_id: auth.uid())
        // 3. Return the created business
        throw new Error('SupabaseAdapter.createBusiness: Not yet implemented');
    }

    async getBusinessesForUser(): Promise<Business[]> {
        // TODO: SELECT b.* FROM businesses b
        //   JOIN business_members bm ON bm.business_id = b.id
        //   WHERE bm.user_id = auth.uid()
        throw new Error('SupabaseAdapter.getBusinessesForUser: Not yet implemented');
    }

    async updateBusiness(businessId: string, patch: Partial<Business>): Promise<Business> {
        // TODO: UPDATE businesses SET ... WHERE id = businessId
        // RLS ensures only members can update
        throw new Error('SupabaseAdapter.updateBusiness: Not yet implemented');
    }

    // ── VENUES ──────────────────────────────────────────────────────────

    async createVenue(businessId: string, venue: Omit<Venue, 'id' | 'created_at' | 'updated_at'>): Promise<Venue> {
        // TODO: INSERT INTO venues (...) VALUES (...) RETURNING *
        throw new Error('SupabaseAdapter.createVenue: Not yet implemented');
    }

    async updateVenue(venueId: string, patch: Partial<Venue>): Promise<Venue> {
        // TODO: UPDATE venues SET ... WHERE id = venueId RETURNING *
        throw new Error('SupabaseAdapter.updateVenue: Not yet implemented');
    }

    async listVenues(businessId: string): Promise<Venue[]> {
        // TODO: SELECT * FROM venues WHERE business_id = businessId ORDER BY name
        throw new Error('SupabaseAdapter.listVenues: Not yet implemented');
    }

    // ── AREAS ───────────────────────────────────────────────────────────

    async createArea(venueId: string, area: Omit<Area, 'id' | 'created_at' | 'updated_at'>): Promise<Area> {
        // TODO: INSERT INTO areas (...) VALUES (...) RETURNING *
        // Also create an occupancy_snapshot row for this area (initial occupancy = 0)
        throw new Error('SupabaseAdapter.createArea: Not yet implemented');
    }

    async updateArea(areaId: string, patch: Partial<Area>): Promise<Area> {
        // TODO: UPDATE areas SET ... WHERE id = areaId RETURNING *
        throw new Error('SupabaseAdapter.updateArea: Not yet implemented');
    }

    async listAreas(venueId: string): Promise<Area[]> {
        // TODO: SELECT a.*, os.current_occupancy
        //   FROM areas a LEFT JOIN occupancy_snapshots os ON os.area_id = a.id
        //   WHERE a.venue_id = venueId AND a.deleted_at IS NULL
        throw new Error('SupabaseAdapter.listAreas: Not yet implemented');
    }

    // ── DEVICES ─────────────────────────────────────────────────────────

    async createDevice(areaId: string, device: Omit<Device, 'id'>): Promise<Device> {
        // TODO: INSERT INTO devices (...) VALUES (...) RETURNING *
        throw new Error('SupabaseAdapter.createDevice: Not yet implemented');
    }

    async updateDevice(deviceId: string, patch: Partial<Device>): Promise<Device> {
        // TODO: UPDATE devices SET ... WHERE id = deviceId RETURNING *
        throw new Error('SupabaseAdapter.updateDevice: Not yet implemented');
    }

    async deleteDevice(deviceId: string): Promise<{ success: boolean; error?: string }> {
        // TODO: Use RPC soft_delete_device or UPDATE devices SET deleted_at = now() WHERE id = deviceId
        throw new Error('SupabaseAdapter.deleteDevice: Not yet implemented');
    }

    async listDevices(scope: Scope): Promise<Device[]> {
        // TODO: SELECT * FROM devices WHERE business_id = scope.businessId AND deleted_at IS NULL
        // Optionally filter by venue_id or area_id if provided
        throw new Error('SupabaseAdapter.listDevices: Not yet implemented');
    }

    // ── COUNTING ────────────────────────────────────────────────────────

    async applyOccupancyDelta(payload: DeltaPayload): Promise<DeltaResult> {
        // TODO: Call RPC apply_occupancy_delta with:
        //   p_business_id, p_venue_id, p_area_id, p_delta, p_source, p_device_id
        // The RPC atomically:
        //   1. Locks the occupancy_snapshot row (SELECT FOR UPDATE)
        //   2. Increments current_occupancy
        //   3. Inserts into occupancy_events
        //   4. Returns { new_occupancy, event_id }
        //
        // CRITICAL: UI must use the returned new_occupancy to update display.
        // Do NOT increment locally and ignore the RPC return.
        throw new Error('SupabaseAdapter.applyOccupancyDelta: Not yet implemented');
    }

    async getSnapshots(scope: Scope): Promise<SnapshotRow[]> {
        // TODO: SELECT * FROM occupancy_snapshots WHERE business_id = scope.businessId
        // Filter by venue_id / area_id if provided
        throw new Error('SupabaseAdapter.getSnapshots: Not yet implemented');
    }

    async getTrafficTotals(scope: Scope, window: TimeWindow): Promise<{ totalIn: number; totalOut: number; net: number }> {
        // TODO: Call RPC get_traffic_totals with scope + window params
        // Returns { total_in, total_out, net }
        throw new Error('SupabaseAdapter.getTrafficTotals: Not yet implemented');
    }

    async resetCounts(businessId: string, resetType: 'NIGHT_AUTO' | 'NIGHT_MANUAL' | 'OPERATIONAL' = 'OPERATIONAL'): Promise<ResetResult> {
        // TODO: Call /api/rpc/reset with { business_id: businessId, reset_type: resetType }
        throw new Error('SupabaseAdapter.resetCounts: Not yet implemented');
    }

    async getNightLogs(businessId: string, date: string): Promise<NightLog[]> {
        // TODO: Query night_logs table filtered by business_id and date
        throw new Error('SupabaseAdapter.getNightLogs: Not yet implemented');
    }

    // ── SCANNING ────────────────────────────────────────────────────────

    async logScan(businessId: string, scan: ScanPayload): Promise<ScanRecord> {
        // TODO: INSERT INTO id_scans (...) RETURNING *
        // If scan.autoAddOccupancy && scan.scanResult === 'ACCEPTED', also call applyOccupancyDelta
        throw new Error('SupabaseAdapter.logScan: Not yet implemented');
    }

    async listScans(scope: Scope, window: TimeWindow): Promise<ScanRecord[]> {
        // TODO: SELECT * FROM id_scans WHERE business_id = scope.businessId
        //   AND created_at BETWEEN window.start AND window.end
        throw new Error('SupabaseAdapter.listScans: Not yet implemented');
    }

    // ── BANS ────────────────────────────────────────────────────────────

    async createBan(ban: BanPayload): Promise<BanRecord> {
        // TODO:
        // 1. Upsert into banned_persons (find or create by name+dob)
        // 2. INSERT INTO patron_bans (...)
        // 3. INSERT INTO ban_audit_logs (action: 'CREATED')
        // 4. Return the ban record
        throw new Error('SupabaseAdapter.createBan: Not yet implemented');
    }

    async listBans(scope: Scope): Promise<BanRecord[]> {
        // TODO: SELECT pb.*, bp.first_name, bp.last_name
        //   FROM patron_bans pb JOIN banned_persons bp ON bp.id = pb.banned_person_id
        //   WHERE pb.business_id = scope.businessId AND pb.status = 'ACTIVE'
        throw new Error('SupabaseAdapter.listBans: Not yet implemented');
    }

    async updateBan(banId: string, patch: Partial<BanRecord>): Promise<BanRecord> {
        // TODO: UPDATE patron_bans SET ... WHERE id = banId RETURNING *
        // Also insert audit_log entry
        throw new Error('SupabaseAdapter.updateBan: Not yet implemented');
    }

    async checkBanStatus(businessId: string, personId: string, venueId?: string): Promise<{ isBanned: boolean; ban?: BanRecord }> {
        // TODO: Call RPC check_ban_status with p_business_id, p_patron_id, p_venue_id
        throw new Error('SupabaseAdapter.checkBanStatus: Not yet implemented');
    }

    // ── REPORTING ───────────────────────────────────────────────────────

    async getReportSummary(scope: Scope, window: TimeWindow): Promise<ReportSummary> {
        // TODO: Call RPC get_report_summary with scope params + window
        throw new Error('SupabaseAdapter.getReportSummary: Not yet implemented');
    }

    async getHourlyTraffic(scope: Scope, window: TimeWindow): Promise<HourlyBucket[]> {
        // TODO: Call RPC get_hourly_traffic with scope params + window
        throw new Error('SupabaseAdapter.getHourlyTraffic: Not yet implemented');
    }

    async getDemographics(scope: Scope, window: TimeWindow): Promise<DemographicBreakdown[]> {
        // TODO: Call RPC get_demographics with scope params + window
        throw new Error('SupabaseAdapter.getDemographics: Not yet implemented');
    }

    async getEventLog(scope: Scope, window: TimeWindow): Promise<EventLogEntry[]> {
        // TODO: Call RPC get_event_log — UNION of occupancy_events, id_scans, audit_logs
        throw new Error('SupabaseAdapter.getEventLog: Not yet implemented');
    }

    // ── REALTIME ────────────────────────────────────────────────────────

    subscribeToSnapshots(scope: Scope, callback: (snapshot: SnapshotRow) => void): () => void {
        // TODO: Use supabase.channel('snapshots:' + scope.businessId)
        //   .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'occupancy_snapshots',
        //     filter: `business_id=eq.${scope.businessId}` }, (payload) => { ... })
        //   .subscribe()
        //
        // Return the unsubscribe function: () => supabase.removeChannel(channel)
        console.warn('SupabaseAdapter.subscribeToSnapshots: Not yet implemented');
        return () => { };
    }

    subscribeToEvents(scope: Scope, callback: (event: EventLogEntry) => void): () => void {
        // TODO: Similar pattern for occupancy_events inserts
        console.warn('SupabaseAdapter.subscribeToEvents: Not yet implemented');
        return () => { };
    }
}
