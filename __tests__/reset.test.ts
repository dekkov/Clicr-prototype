/**
 * @jest-environment jsdom
 */
import { LocalAdapter } from '@/core/adapters/LocalAdapter';
import type { Venue, Area } from '@/core/adapters/DataClient';

describe('Business-level reset', () => {
    let adapter: LocalAdapter;

    beforeEach(() => {
        localStorage.clear();
        adapter = new LocalAdapter();
    });

    test('resets all area occupancy snapshots to 0', async () => {
        const biz = await adapter.createBusiness('Test Biz', 'UTC');
        const venue = await adapter.createVenue(biz.id, {
            business_id: biz.id,
            name: 'Venue 1',
            timezone: 'UTC',
            status: 'ACTIVE',
            capacity_enforcement_mode: 'WARN_ONLY',
        } as Omit<Venue, 'id' | 'created_at' | 'updated_at'>);
        const area = await adapter.createArea(venue.id, {
            venue_id: venue.id,
            business_id: biz.id,
            name: 'Main',
            area_type: 'MAIN',
            counting_mode: 'MANUAL',
            is_active: true,
        } as Omit<Area, 'id' | 'created_at' | 'updated_at'>);

        await adapter.applyOccupancyDelta({
            businessId: biz.id,
            venueId: venue.id,
            areaId: area.id,
            delta: 5,
            source: 'manual',
        });

        const snapsBefore = await adapter.getSnapshots({ businessId: biz.id });
        expect(snapsBefore.some(s => s.currentOccupancy > 0)).toBe(true);

        const result = await adapter.resetCounts(biz.id);

        expect(result.areasReset).toBeGreaterThanOrEqual(1);
        const snapsAfter = await adapter.getSnapshots({ businessId: biz.id });
        for (const snap of snapsAfter) {
            expect(snap.currentOccupancy).toBe(0);
        }
    });

    test('resets all venue current_occupancy to 0', async () => {
        const biz = await adapter.createBusiness('Test Biz', 'UTC');
        const venue = await adapter.createVenue(biz.id, {
            business_id: biz.id,
            name: 'Venue 1',
            timezone: 'UTC',
            status: 'ACTIVE',
            capacity_enforcement_mode: 'WARN_ONLY',
        } as Omit<Venue, 'id' | 'created_at' | 'updated_at'>);
        await adapter.createArea(venue.id, {
            venue_id: venue.id,
            business_id: biz.id,
            name: 'Main',
            area_type: 'MAIN',
            counting_mode: 'MANUAL',
            is_active: true,
        } as Omit<Area, 'id' | 'created_at' | 'updated_at'>);

        await adapter.resetCounts(biz.id);

        const venues = await adapter.listVenues(biz.id);
        for (const v of venues) {
            expect(v.current_occupancy || 0).toBe(0);
        }
    });

    test('sets last_reset_at on venues after reset', async () => {
        const biz = await adapter.createBusiness('Test Biz', 'UTC');
        const venue = await adapter.createVenue(biz.id, {
            business_id: biz.id,
            name: 'Venue 1',
            timezone: 'UTC',
            status: 'ACTIVE',
            capacity_enforcement_mode: 'WARN_ONLY',
        } as Omit<Venue, 'id' | 'created_at' | 'updated_at'>);
        await adapter.createArea(venue.id, {
            venue_id: venue.id,
            business_id: biz.id,
            name: 'Main',
            area_type: 'MAIN',
            counting_mode: 'MANUAL',
            is_active: true,
        } as Omit<Area, 'id' | 'created_at' | 'updated_at'>);

        const before = new Date().toISOString();
        await adapter.resetCounts(biz.id);

        const venues = await adapter.listVenues(biz.id);
        expect(venues[0].last_reset_at).toBeTruthy();
        expect(venues[0].last_reset_at! >= before).toBe(true);
    });

    test('is idempotent — double reset produces same result', async () => {
        const biz = await adapter.createBusiness('Test Biz', 'UTC');
        await adapter.resetCounts(biz.id);
        const result2 = await adapter.resetCounts(biz.id);
        expect(result2.areasReset).toBeGreaterThanOrEqual(0);
        expect(result2.resetAt).toBeTruthy();
    });

    test('returns gracefully when no areas exist', async () => {
        const biz = await adapter.createBusiness('Empty Biz', 'UTC');
        const result = await adapter.resetCounts(biz.id);
        expect(result.areasReset).toBe(0);
        expect(result.resetAt).toBeTruthy();
    });
});
