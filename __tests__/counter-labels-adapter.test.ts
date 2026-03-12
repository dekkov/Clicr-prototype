/**
 * @jest-environment jsdom
 */
import { LocalAdapter } from '@/core/adapters/LocalAdapter';
import type { Venue, Area } from '@/core/adapters/DataClient';

describe('Counter labels in LocalAdapter', () => {
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

    test('createDevice auto-creates a General counter label', async () => {
        const device = await adapter.createDevice(areaId, {
            business_id: bizId,
            name: 'Door 1',
            active: true,
            counter_labels: [],
        });
        expect(device.counter_labels).toHaveLength(1);
        expect(device.counter_labels[0].label).toBe('General');
        expect(device.counter_labels[0].position).toBe(0);
        expect(device.counter_labels[0].device_id).toBe(device.id);
    });

    test('createDevice preserves provided counter labels', async () => {
        const device = await adapter.createDevice(areaId, {
            business_id: bizId,
            name: 'Ticket Booth',
            active: true,
            counter_labels: [
                { id: 'lbl-a', device_id: '', label: 'Cash', position: 0 },
                { id: 'lbl-b', device_id: '', label: 'Card', position: 1 },
            ],
        });
        expect(device.counter_labels).toHaveLength(2);
        expect(device.counter_labels[0].label).toBe('Cash');
        expect(device.counter_labels[1].label).toBe('Card');
        // device_id should be filled in
        expect(device.counter_labels[0].device_id).toBe(device.id);
    });

    test('applyOccupancyDelta records counterLabelId on event', async () => {
        const device = await adapter.createDevice(areaId, {
            business_id: bizId,
            name: 'Door 1',
            active: true,
            counter_labels: [],
        });
        const labelId = device.counter_labels[0].id;

        await adapter.applyOccupancyDelta({
            businessId: bizId,
            venueId,
            areaId,
            deviceId: device.id,
            delta: 1,
            source: 'manual',
            counterLabelId: labelId,
        });

        const window = {
            start: new Date(Date.now() - 86400000).toISOString(),
            end: new Date(Date.now() + 86400000).toISOString(),
        };
        const log = await adapter.getEventLog({ businessId: bizId, venueId, areaId }, window);
        expect(log).toHaveLength(1);
        expect(log[0].counterLabelId).toBe(labelId);
    });

    test('listDevices returns devices with their counter labels', async () => {
        await adapter.createDevice(areaId, {
            business_id: bizId,
            name: 'Door 1',
            active: true,
            counter_labels: [
                { id: 'lbl-x', device_id: '', label: 'VIP', position: 0, color: 'purple' },
            ],
        });
        const devices = await adapter.listDevices({ businessId: bizId });
        expect(devices).toHaveLength(1);
        expect(devices[0].counter_labels).toHaveLength(1);
        expect(devices[0].counter_labels[0].label).toBe('VIP');
    });

    test('updateDevice can add, rename, and soft-delete labels', async () => {
        const device = await adapter.createDevice(areaId, {
            business_id: bizId,
            name: 'Door 1',
            active: true,
            counter_labels: [],
        });

        // Add a second label
        const updated = await adapter.updateDevice(device.id, {
            counter_labels: [
                device.counter_labels[0],
                { id: 'lbl-new', device_id: device.id, label: 'VIP', position: 1 },
            ],
        });
        expect(updated.counter_labels).toHaveLength(2);

        // Rename first label
        const renamed = await adapter.updateDevice(device.id, {
            counter_labels: [
                { ...updated.counter_labels[0], label: 'Standard' },
                updated.counter_labels[1],
            ],
        });
        expect(renamed.counter_labels[0].label).toBe('Standard');

        // Soft-delete second label
        const softDeleted = await adapter.updateDevice(device.id, {
            counter_labels: [
                renamed.counter_labels[0],
                { ...renamed.counter_labels[1], deleted_at: new Date().toISOString() },
            ],
        });
        const activeLabels = softDeleted.counter_labels.filter(l => !l.deleted_at);
        expect(activeLabels).toHaveLength(1);
    });
});
