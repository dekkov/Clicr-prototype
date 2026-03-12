import type { Business, NightLog } from '@/lib/types';
import type { ResetResult } from '@/core/adapters/DataClient';

describe('Plan 2 types', () => {
    it('Business.settings includes reset_time and reset_timezone', () => {
        const biz: Business = {
            id: '1', name: 'Test', timezone: 'America/New_York',
            settings: {
                refresh_interval_sec: 30,
                capacity_thresholds: [80, 90, 100],
                reset_rule: 'SCHEDULED',
                reset_time: '05:00',
                reset_timezone: 'America/New_York',
            },
        };
        expect(biz.settings.reset_time).toBe('05:00');
        expect(biz.settings.reset_timezone).toBe('America/New_York');
    });

    it('ResetResult includes success and error fields', () => {
        const result: ResetResult = {
            areasReset: 3, resetAt: new Date().toISOString(),
            success: true,
        };
        expect(result.success).toBe(true);

        const failed: ResetResult = {
            areasReset: 0, resetAt: '', success: false, error: 'Forbidden',
        };
        expect(failed.error).toBe('Forbidden');
    });

    it('NightLog type has all required fields', () => {
        const log: NightLog = {
            id: '1', business_id: 'b1', venue_id: 'v1', area_id: null,
            business_date: '2026-03-10',
            period_start: new Date().toISOString(),
            reset_at: new Date().toISOString(),
            total_in: 100, total_out: 80, turnarounds: 5,
            scans_total: 50, scans_accepted: 45, scans_denied: 5,
            peak_occupancy: 42,
            reset_type: 'NIGHT_AUTO',
            created_at: new Date().toISOString(),
        };
        expect(log.reset_type).toBe('NIGHT_AUTO');
        expect(log.period_start).toBeDefined();
    });
});
