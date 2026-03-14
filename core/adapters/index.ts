/**
 * Core Adapters — Barrel Export
 * ==============================
 * Import everything from 'core/adapters' in your components:
 *
 *   import { getDataClient, type DataClient } from '@/core/adapters';
 */

export type {
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
    AppMode,
    Business,
    Venue,
    Area,
    Device,
    BanRecord,
    ScanRecord,
} from './DataClient';

export { getDataClient } from './DataClient';
export { LocalAdapter } from './LocalAdapter';
