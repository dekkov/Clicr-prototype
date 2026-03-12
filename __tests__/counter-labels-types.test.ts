/**
 * @jest-environment jsdom
 */
import type { CounterLabel, Clicr, Device, CountEvent } from '@/lib/types';

describe('CounterLabel types', () => {
    test('CounterLabel has required fields', () => {
        const label: CounterLabel = {
            id: 'lbl-1',
            device_id: 'dev-1',
            label: 'General',
            position: 0,
        };
        expect(label.id).toBe('lbl-1');
        expect(label.label).toBe('General');
        expect(label.position).toBe(0);
    });

    test('CounterLabel supports optional color and deleted_at', () => {
        const label: CounterLabel = {
            id: 'lbl-2',
            device_id: 'dev-1',
            label: 'Cash',
            position: 0,
            color: 'blue',
            deleted_at: null,
            created_at: '2026-03-12T00:00:00Z',
        };
        expect(label.color).toBe('blue');
        expect(label.deleted_at).toBeNull();
    });

    test('Clicr has counter_labels array and no flow_mode', () => {
        const clicr: Clicr = {
            id: 'c-1',
            area_id: 'a-1',
            name: 'Door 1',
            current_count: 0,
            active: true,
            counter_labels: [{ id: 'lbl-1', device_id: 'c-1', label: 'General', position: 0 }],
        };
        expect(clicr.counter_labels).toHaveLength(1);
        // @ts-expect-error flow_mode should not exist
        expect(clicr.flow_mode).toBeUndefined();
    });

    test('Device has counter_labels and is_venue_counter, no direction_mode', () => {
        const device: Device = {
            id: 'd-1',
            business_id: 'b-1',
            device_type: 'COUNTER',
            name: 'Venue Counter',
            serial_number: '',
            status: 'ACTIVE',
            created_at: '',
            updated_at: '',
            counter_labels: [{ id: 'lbl-1', device_id: 'd-1', label: 'General', position: 0 }],
            is_venue_counter: true,
        };
        expect(device.counter_labels).toHaveLength(1);
        expect(device.is_venue_counter).toBe(true);
        // @ts-expect-error direction_mode should not exist
        expect(device.direction_mode).toBeUndefined();
    });

    test('CountEvent has counter_label_id and keeps gender for historical reads', () => {
        const event: CountEvent = {
            id: 'e-1',
            venue_id: 'v-1',
            area_id: 'a-1',
            clicr_id: 'c-1',
            user_id: 'u-1',
            business_id: 'b-1',
            timestamp: Date.now(),
            delta: 1,
            flow_type: 'IN',
            event_type: 'TAP',
            counter_label_id: 'lbl-1',
        };
        expect(event.counter_label_id).toBe('lbl-1');

        // Historical event with gender, no counter_label_id
        const oldEvent: CountEvent = {
            id: 'e-0',
            venue_id: 'v-1',
            area_id: 'a-1',
            clicr_id: 'c-1',
            user_id: 'u-1',
            business_id: 'b-1',
            timestamp: Date.now(),
            delta: 1,
            flow_type: 'IN',
            event_type: 'TAP',
            gender: 'M',
        };
        expect(oldEvent.gender).toBe('M');
    });
});
