import { validateOverrideInput } from '@/lib/ban-utils';

describe('validateOverrideInput', () => {
  test('accepts valid override input', () => {
    const result = validateOverrideInput({
      enforcementEventId: 'enf_123',
      areaId: 'area_456',
      reason: 'VIP Exception',
      notes: 'Owner approved',
    });
    expect(result.valid).toBe(true);
  });
  test('rejects missing enforcementEventId', () => {
    const result = validateOverrideInput({
      enforcementEventId: '',
      areaId: 'area_456',
      reason: 'VIP Exception',
      notes: '',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('enforcementEventId');
  });
  test('rejects invalid reason', () => {
    const result = validateOverrideInput({
      enforcementEventId: 'enf_123',
      areaId: 'area_456',
      reason: 'Not A Real Reason',
      notes: '',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('reason');
  });
  test('rejects missing areaId', () => {
    const result = validateOverrideInput({
      enforcementEventId: 'enf_123',
      areaId: '',
      reason: 'Manager Discretion',
      notes: '',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('areaId');
  });
});
