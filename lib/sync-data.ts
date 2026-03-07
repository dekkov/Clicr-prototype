/**
 * Sync data types and helpers — Supabase-only, no file I/O.
 * Replaces lib/db for the sync API.
 */

import type {
    Business,
    Venue,
    Area,
    Clicr,
    CountEvent,
    User,
    IDScanEvent,
    BanRecord,
    BannedPerson,
    PatronBan,
    BanEnforcementEvent,
    BanAuditLog,
    Device,
    CapacityOverride,
    VenueAuditLog,
    SupportTicket,
    TurnaroundEvent,
} from './types';

const INITIAL_USER: User = {
    id: '',
    name: '',
    email: '',
    role: 'OWNER',
    assigned_venue_ids: [],
    assigned_area_ids: [],
    assigned_clicr_ids: [],
};

export type DBData = {
    business: Business | null;
    venues: Venue[];
    areas: Area[];
    clicrs: Clicr[];
    devices: Device[];
    capacityOverrides: CapacityOverride[];
    venueAuditLogs: VenueAuditLog[];
    events: CountEvent[];
    scanEvents: IDScanEvent[];
    turnarounds: TurnaroundEvent[];
    currentUser: User;
    users: User[];
    bans: BanRecord[];
    patrons: BannedPerson[];
    patronBans: PatronBan[];
    banAuditLogs: BanAuditLog[];
    banEnforcementEvents: BanEnforcementEvent[];
    tickets: SupportTicket[];
};

export function createInitialDBData(): DBData {
    return {
        business: null,
        venues: [],
        areas: [],
        clicrs: [],
        devices: [],
        capacityOverrides: [],
        venueAuditLogs: [],
        events: [],
        scanEvents: [],
        turnarounds: [],
        currentUser: { ...INITIAL_USER },
        users: [],
        bans: [],
        patrons: [],
        patronBans: [],
        banAuditLogs: [],
        banEnforcementEvents: [],
        tickets: [],
    };
}

/** Check if a staff user is banned (fetches from Supabase). Returns false if no staff_bans table exists. */
export async function isUserBanned(supabaseAdmin: any, userId: string, venueId?: string): Promise<boolean> {
    try {
        const { data } = await supabaseAdmin
            .from('staff_bans')
            .select('scope_type, scope_venue_ids')
            .eq('user_id', userId)
            .eq('status', 'ACTIVE');
        if (!data || data.length === 0) return false;
        const bans = data as { scope_type?: string; scope_venue_ids?: string[] }[];
        if (bans.some(b => b.scope_type === 'BUSINESS')) return true;
        if (venueId && bans.some(b => b.scope_type === 'VENUE' && (b.scope_venue_ids || []).includes(venueId))) return true;
        return false;
    } catch {
        return false;
    }
}
