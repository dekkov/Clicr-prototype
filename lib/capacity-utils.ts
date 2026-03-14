import type { CapacityEnforcementMode } from '@/lib/types';

type CapacityCheckResult = {
  allowed: boolean;
  warning?: boolean;
  reason?: string;
  overrideAvailable?: boolean;
};

export function checkAreaCapacity(
  currentOccupancy: number,
  capacityMax: number,
  mode: CapacityEnforcementMode | undefined | null,
  delta: number = 1
): CapacityCheckResult {
  if (delta < 0) return { allowed: true };
  if (!capacityMax || capacityMax <= 0) return { allowed: true };
  const atOrOverCapacity = currentOccupancy >= capacityMax;
  const effectiveMode = mode || 'WARN_ONLY';
  if (!atOrOverCapacity) return { allowed: true };
  switch (effectiveMode) {
    case 'HARD_STOP':
      return { allowed: false, reason: 'AREA_AT_CAPACITY' };
    case 'MANAGER_OVERRIDE':
      return { allowed: false, reason: 'AREA_AT_CAPACITY', overrideAvailable: true };
    case 'WARN_ONLY':
    default:
      return { allowed: true, warning: true };
  }
}
