export const BAN_OVERRIDE_REASONS = [
  'VIP Exception',
  'Ban Expired',
  'Manager Discretion',
  'Identity Mismatch',
  'Other',
] as const;

export type BanOverrideReason = (typeof BAN_OVERRIDE_REASONS)[number];

type EnforcementInput = {
  banId: string;
  venueId: string;
  deviceId: string | null;
  userId: string;
  firstName: string | null;
  lastName: string | null;
};

export function buildEnforcementEvent(input: EnforcementInput) {
  return {
    ban_id: input.banId,
    location_id: input.venueId,
    device_id: input.deviceId,
    scanner_user_id: input.userId,
    result: 'BLOCKED' as const,
    person_snapshot_name: [input.firstName, input.lastName].filter(Boolean).join(' ') || 'Unknown',
    override_reason: null,
    notes: null,
  };
}
