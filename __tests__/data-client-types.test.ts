/**
 * @jest-environment jsdom
 */
import type { DeltaPayload, Device, EventLogEntry } from '@/core/adapters/DataClient';

describe('DataClient types', () => {
    test('DeltaPayload has counterLabelId instead of gender', () => {
        const payload: DeltaPayload = {
            businessId: 'b-1',
            venueId: 'v-1',
            areaId: 'a-1',
            delta: 1,
            source: 'manual',
            counterLabelId: 'lbl-1',
        };
        expect(payload.counterLabelId).toBe('lbl-1');
        // @ts-expect-error gender should not exist
        expect(payload.gender).toBeUndefined();
    });

    test('Device interface has counter_labels array', () => {
        const device: Device = {
            id: 'd-1',
            business_id: 'b-1',
            name: 'Test',
            active: true,
            counter_labels: [{ id: 'lbl-1', device_id: 'd-1', label: 'General', position: 0 }],
        };
        expect(device.counter_labels).toHaveLength(1);
        // @ts-expect-error direction_mode should not exist
        expect(device.direction_mode).toBeUndefined();
    });

    test('EventLogEntry has counterLabelId instead of gender', () => {
        const entry: EventLogEntry = {
            id: 'e-1',
            timestamp: new Date().toISOString(),
            type: 'TAP',
            delta: 1,
            counterLabelId: 'lbl-1',
        };
        expect(entry.counterLabelId).toBe('lbl-1');
    });
});
