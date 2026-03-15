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

type OverrideInput = {
  enforcementEventId: string;
  areaId: string;
  reason: string;
  notes: string;
};

export function validateOverrideInput(input: OverrideInput): { valid: boolean; error?: string } {
  if (!input.enforcementEventId) return { valid: false, error: 'Missing enforcementEventId' };
  if (!input.areaId) return { valid: false, error: 'Missing areaId' };
  if (!BAN_OVERRIDE_REASONS.includes(input.reason as BanOverrideReason)) {
    return { valid: false, error: `Invalid reason: ${input.reason}` };
  }
  return { valid: true };
}

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
