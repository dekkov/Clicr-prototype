import { buildEnforcementEvent } from '@/lib/ban-utils';

describe('buildEnforcementEvent', () => {
  test('creates correct enforcement event payload for BLOCKED result', () => {
    const event = buildEnforcementEvent({
      banId: 'ban_123',
      venueId: 'venue_456',
      deviceId: 'dev_789',
      userId: 'user_abc',
      firstName: 'John',
      lastName: 'Doe',
    });
    expect(event.ban_id).toBe('ban_123');
    expect(event.location_id).toBe('venue_456');
    expect(event.device_id).toBe('dev_789');
    expect(event.scanner_user_id).toBe('user_abc');
    expect(event.result).toBe('BLOCKED');
    expect(event.person_snapshot_name).toBe('John Doe');
    expect(event.override_reason).toBeNull();
    expect(event.notes).toBeNull();
  });

  test('handles null device_id', () => {
    const event = buildEnforcementEvent({
      banId: 'ban_123',
      venueId: 'venue_456',
      deviceId: null,
      userId: 'user_abc',
      firstName: 'Jane',
      lastName: 'Smith',
    });
    expect(event.device_id).toBeNull();
  });
});
