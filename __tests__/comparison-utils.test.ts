import { computeComparisonStats } from '@/lib/comparison-utils';
import type { CountEvent, IDScanEvent } from '@/lib/types';

describe('computeComparisonStats', () => {
  const makeEvents = (count: number, flowType: 'IN' | 'OUT'): Partial<CountEvent>[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `e${i}`,
      delta: flowType === 'IN' ? 1 : -1,
      flow_type: flowType,
      timestamp: Date.now(),
    }));

  const makeScans = (accepted: number, denied: number): Partial<IDScanEvent>[] => [
    ...Array.from({ length: accepted }, (_, i) => ({ id: `a${i}`, scan_result: 'ACCEPTED' as const })),
    ...Array.from({ length: denied }, (_, i) => ({ id: `d${i}`, scan_result: 'DENIED' as const })),
  ];

  test('computes correct deltas between two days', () => {
    const dayA = {
      events: [...makeEvents(100, 'IN'), ...makeEvents(20, 'OUT')] as CountEvent[],
      scans: makeScans(80, 10) as IDScanEvent[],
    };
    const dayB = {
      events: [...makeEvents(150, 'IN'), ...makeEvents(30, 'OUT')] as CountEvent[],
      scans: makeScans(120, 15) as IDScanEvent[],
    };
    const stats = computeComparisonStats(dayA, dayB);
    expect(stats.totalEntries.dayA).toBe(100);
    expect(stats.totalEntries.dayB).toBe(150);
    expect(stats.totalEntries.delta).toBe('↑50%');
    expect(stats.scansProcessed.dayA).toBe(90);
    expect(stats.scansProcessed.dayB).toBe(135);
  });

  test('handles zero values without crashing', () => {
    const dayA = { events: [] as CountEvent[], scans: [] as IDScanEvent[] };
    const dayB = { events: makeEvents(10, 'IN') as CountEvent[], scans: [] as IDScanEvent[] };
    const stats = computeComparisonStats(dayA, dayB);
    expect(stats.totalEntries.dayA).toBe(0);
    expect(stats.totalEntries.dayB).toBe(10);
    expect(stats.totalEntries.delta).toBe('—');
  });

  test('computes denial rate as percentage points', () => {
    const dayA = { events: [] as CountEvent[], scans: makeScans(90, 10) as IDScanEvent[] };
    const dayB = { events: [] as CountEvent[], scans: makeScans(80, 20) as IDScanEvent[] };
    const stats = computeComparisonStats(dayA, dayB);
    expect(stats.denialRate.dayA).toBe('10.0%');
    expect(stats.denialRate.dayB).toBe('20.0%');
    expect(stats.denialRate.delta).toBe('↑10.0pp');
  });
});
