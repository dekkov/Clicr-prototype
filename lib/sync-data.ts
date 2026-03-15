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

