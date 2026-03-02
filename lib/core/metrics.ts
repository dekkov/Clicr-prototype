
import { getSupabase } from './supabase';
import { getTodayWindow } from './time';
import { logError } from './errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TrafficTotals {
    total_in: number;
    total_out: number;
    net_delta: number;
    event_count: number;
    manual_in?: number;
    scan_in?: number;
    turnarounds?: number;
    net_adjusted?: number;
}

export const METRICS = {
    getTotals: async (
        businessId: string,
        scope: { venueId?: string; areaId?: string },
        window = getTodayWindow()
    ): Promise<TrafficTotals> => {
        // Skip RPC if business_id is a mock/fixture ID (not a valid UUID)
        if (!UUID_RE.test(businessId)) {
            return { total_in: 0, total_out: 0, net_delta: 0, event_count: 0 };
        }
        const sb = getSupabase();

        const params = {
            p_business_id: businessId,
            p_venue_id: scope.venueId || null,
            p_area_id: scope.areaId || null,
            p_start_ts: window.start,
            p_end_ts: window.end
        };

        // Use new P0 Reporting RPC
        const { data, error } = await sb.rpc('get_report_summary', params);

        if (error) {
            logError('metrics:getTotals', error.message, params, undefined, businessId);
            throw error;
        }

        if (data && data.length > 0) {
            const r = data[0];
            return {
                total_in: Number(r.total_entries_gross),
                total_out: Number(r.total_exits_gross),
                net_delta: Number(r.total_entries_gross) - Number(r.total_exits_gross),
                event_count: 0,
                manual_in: Number(r.entries_manual),
                scan_in: Number(r.entries_scan),
                turnarounds: Number(r.turnarounds_count),
                net_adjusted: Number(r.net_entries_adjusted)
            };
        }

        return { total_in: 0, total_out: 0, net_delta: 0, event_count: 0 };
    },

    getCurrentOccupancy: async (businessId: string, areaId: string): Promise<number> => {
        if (!UUID_RE.test(businessId)) return 0;
        const sb = getSupabase();
        const { data, error } = await sb
            .from('areas')
            .select('current_occupancy')
            .eq('business_id', businessId)
            .eq('id', areaId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return 0; // No rows
            logError('metrics:occupancy', error.message, { areaId }, undefined, businessId);
            return 0;
        }
        return data?.current_occupancy || 0;
    },

    // Returns current occupancy for each area in a venue
    getAreaSummaries: async (venueId: string) => {
        const sb = getSupabase();
        const { data, error } = await sb
            .from('areas')
            .select('id, current_occupancy, updated_at, name, capacity_max')
            .eq('venue_id', venueId);
        if (error) {
            logError('metrics:getAreaSummaries', error.message, { venueId });
            throw error;
        }
        return data || [];
    },

    // Returns current occupancy per venue for a business
    getVenueSummaries: async (businessId: string) => {
        if (!UUID_RE.test(businessId)) return [];
        const sb = getSupabase();
        const { data, error } = await sb
            .from('areas')
            .select('venue_id, current_occupancy, venues(name, capacity_max)')
            .eq('business_id', businessId);
        if (error) {
            logError('metrics:getVenueSummaries', error.message, { businessId }, undefined, businessId);
            throw error;
        }
        return data || [];
    },

    // Returns hourly traffic buckets (entries_in, entries_out, net_delta per hour)
    getDailyTrafficSummary: async (businessId: string, venueId: string, startDate: string, endDate: string) => {
        if (!UUID_RE.test(businessId)) return [];
        const sb = getSupabase();
        const { data, error } = await sb.rpc('get_hourly_traffic', {
            p_business_id: businessId,
            p_venue_id: venueId,
            p_area_id: null,
            p_start_ts: startDate,
            p_end_ts: endDate
        });
        if (error) {
            logError('metrics:getDailyTrafficSummary', error.message, { businessId, venueId, startDate, endDate }, undefined, businessId);
            throw error;
        }
        return data || [];
    },

    checkBanStatus: async (businessId: string, patronId: string, venueId?: string) => {
        if (!UUID_RE.test(businessId)) return { is_banned: false };
        const sb = getSupabase();
        const { data, error } = await sb.rpc('check_ban_status', {
            p_business_id: businessId,
            p_patron_id: patronId,
            p_venue_id: venueId || null
        });
        if (error) {
            logError('metrics:checkBanStatus', error.message, { businessId, patronId, venueId }, undefined, businessId);
            return { is_banned: false };
        }
        return data;
    }
};
