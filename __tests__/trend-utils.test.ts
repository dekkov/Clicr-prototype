import { computeTrend } from '@/lib/trend-utils';

describe('computeTrend', () => {
  test('returns up trend with correct percentage', () => {
    expect(computeTrend(120, 100)).toEqual({ trend: 'up', value: '↑20%' });
  });
  test('returns down trend with correct percentage', () => {
    expect(computeTrend(80, 100)).toEqual({ trend: 'down', value: '↓20%' });
  });
  test('returns flat when values are equal', () => {
    expect(computeTrend(100, 100)).toEqual({ trend: 'neutral', value: '—' });
  });
  test('returns null when previous is 0 (avoid division by zero)', () => {
    expect(computeTrend(100, 0)).toBeNull();
  });
  test('returns flat when both are 0', () => {
    expect(computeTrend(0, 0)).toEqual({ trend: 'neutral', value: '—' });
  });
  test('rounds percentage to nearest integer', () => {
    expect(computeTrend(133, 100)).toEqual({ trend: 'up', value: '↑33%' });
  });
  test('returns null when previous is null/undefined', () => {
    expect(computeTrend(100, null as any)).toBeNull();
    expect(computeTrend(100, undefined as any)).toBeNull();
  });
});
