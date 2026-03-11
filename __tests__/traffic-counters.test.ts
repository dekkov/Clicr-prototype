/**
 * @jest-environment jsdom
 */
import { LocalAdapter } from '@/core/adapters/LocalAdapter';
import type { Venue, Area } from '@/core/adapters/DataClient';

describe('Traffic counter totals', () => {
    let adapter: LocalAdapter;
    let bizId: string;
    let venueId: string;
    let areaId: string;

    beforeEach(async () => {
        localStorage.clear();
        adapter = new LocalAdapter();
        const biz = await adapter.createBusiness('Test Biz', 'UTC');
        bizId = biz.id;
        const venue = await adapter.createVenue(bizId, {
            business_id: bizId,
            name: 'Venue 1',
            timezone: 'UTC',
            status: 'ACTIVE',
            capacity_enforcement_mode: 'WARN_ONLY',
        } as Omit<Venue, 'id' | 'created_at' | 'updated_at'>);
        venueId = venue.id;
        const area = await adapter.createArea(venueId, {
            venue_id: venueId,
            business_id: bizId,
            name: 'Main',
            area_type: 'MAIN',
            counting_mode: 'MANUAL',
            is_active: true,
        } as Omit<Area, 'id' | 'created_at' | 'updated_at'>);
        areaId = area.id;
    });

    test('IN taps increment totalIn', async () => {
        await adapter.applyOccupancyDelta({ businessId: bizId, venueId, areaId, delta: 1, source: 'manual' });
        await adapter.applyOccupancyDelta({ businessId: bizId, venueId, areaId, delta: 1, source: 'manual' });
        await adapter.applyOccupancyDelta({ businessId: bizId, venueId, areaId, delta: 1, source: 'manual' });
        const totals = await adapter.getTrafficTotals(
            { businessId: bizId, venueId, areaId },
            { start: new Date(Date.now() - 86400000).toISOString(), end: new Date().toISOString() }
        );
        expect(totals.totalIn).toBe(3);
    });

    test('OUT taps increment totalOut', async () => {
        await adapter.applyOccupancyDelta({ businessId: bizId, venueId, areaId, delta: 5, source: 'manual' });
        await adapter.applyOccupancyDelta({ businessId: bizId, venueId, areaId, delta: -1, source: 'manual' });
        await adapter.applyOccupancyDelta({ businessId: bizId, venueId, areaId, delta: -1, source: 'manual' });
        const totals = await adapter.getTrafficTotals(
            { businessId: bizId, venueId, areaId },
            { start: new Date(Date.now() - 86400000).toISOString(), end: new Date().toISOString() }
        );
        expect(totals.totalOut).toBe(2);
    });

    test('mixed taps produce correct independent IN and OUT counts', async () => {
        await adapter.applyOccupancyDelta({ businessId: bizId, venueId, areaId, delta: 1, source: 'manual' });
        await adapter.applyOccupancyDelta({ businessId: bizId, venueId, areaId, delta: 1, source: 'manual' });
        await adapter.applyOccupancyDelta({ businessId: bizId, venueId, areaId, delta: -1, source: 'manual' });
        const totals = await adapter.getTrafficTotals(
            { businessId: bizId, venueId, areaId },
            { start: new Date(Date.now() - 86400000).toISOString(), end: new Date().toISOString() }
        );
        expect(totals.totalIn).toBe(2);
        expect(totals.totalOut).toBe(1);
        expect(totals.net).toBe(1);
    });

    test('after reset, new events tracked fresh', async () => {
        await adapter.applyOccupancyDelta({ businessId: bizId, venueId, areaId, delta: 5, source: 'manual' });
        await adapter.resetCounts(bizId);
        await adapter.applyOccupancyDelta({ businessId: bizId, venueId, areaId, delta: 2, source: 'manual' });
        const snaps = await adapter.getSnapshots({ businessId: bizId });
        const areaSnap = snaps.find(s => s.areaId === areaId);
        expect(areaSnap?.currentOccupancy).toBe(2);
    });
});
