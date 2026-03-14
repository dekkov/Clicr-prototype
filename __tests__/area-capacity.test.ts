import { checkAreaCapacity } from '@/lib/capacity-utils';

describe('checkAreaCapacity', () => {
  test('WARN_ONLY allows entry at capacity', () => {
    const result = checkAreaCapacity(100, 100, 'WARN_ONLY');
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(true);
  });
  test('HARD_STOP blocks entry at capacity', () => {
    const result = checkAreaCapacity(100, 100, 'HARD_STOP');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('AREA_AT_CAPACITY');
  });
  test('HARD_STOP allows entry below capacity', () => {
    const result = checkAreaCapacity(99, 100, 'HARD_STOP');
    expect(result.allowed).toBe(true);
  });
  test('MANAGER_OVERRIDE blocks but flags override needed', () => {
    const result = checkAreaCapacity(100, 100, 'MANAGER_OVERRIDE');
    expect(result.allowed).toBe(false);
    expect(result.overrideAvailable).toBe(true);
  });
  test('allows -1 regardless of mode (decrements always allowed)', () => {
    const result = checkAreaCapacity(100, 100, 'HARD_STOP', -1);
    expect(result.allowed).toBe(true);
  });
  test('allows when capacity is 0 (uncapped)', () => {
    const result = checkAreaCapacity(500, 0, 'HARD_STOP');
    expect(result.allowed).toBe(true);
  });
  test('defaults to WARN_ONLY when mode is undefined', () => {
    const result = checkAreaCapacity(100, 100, undefined);
    expect(result.allowed).toBe(true);
    expect(result.warning).toBe(true);
  });
});
