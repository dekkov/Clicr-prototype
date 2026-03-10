// tests/unit/calendarUtils.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDailyEntries,
  computeMonthStats,
  computeMonthlyTrend,
  buildCalendarGrid,
  computeHourlyOccupancy,
  computeDayGenderRatio,
} from '../../lib/calendarUtils';

// Helper to make a CountEvent
function makeEvent(overrides: Partial<{
  venue_id: string; flow_type: 'IN' | 'OUT'; event_type: 'TAP' | 'SCAN' | 'BULK' | 'RESET';
  delta: number; timestamp: number; gender: string;
}> = {}) {
  return {
    id: 'e1', venue_id: 'v1', area_id: null, clicr_id: 'c1', user_id: 'u1', business_id: 'b1',
    flow_type: 'IN' as const, event_type: 'TAP' as const, delta: 1,
    timestamp: new Date('2026-03-09T20:00:00').getTime(),
    ...overrides,
  };
}

function makeScan(overrides: Partial<{
  venue_id: string; sex: string; timestamp: number; scan_result: string;
}> = {}) {
  return {
    id: 's1', venue_id: 'v1', timestamp: new Date('2026-03-09T20:00:00').getTime(),
    scan_result: 'ACCEPTED' as const, age: 25, age_band: '21-25', sex: 'M',
    zip_code: '10001',
    ...overrides,
  };
}

describe('computeDailyEntries', () => {
  test('counts IN events for the given month', () => {
    const events = [
      makeEvent({ timestamp: new Date('2026-03-09T20:00:00').getTime(), delta: 3 }),
      makeEvent({ timestamp: new Date('2026-03-09T22:00:00').getTime(), delta: 2 }),
    ];
    const result = computeDailyEntries(events as any, 'v1', 2026, 2); // month=2 = March
    assert.equal(result['2026-03-09'], 5);
  });

  test('excludes RESET events', () => {
    const events = [
      makeEvent({ delta: 5 }),
      makeEvent({ event_type: 'RESET', delta: 10 }),
    ];
    const result = computeDailyEntries(events as any, 'v1', 2026, 2);
    assert.equal(result['2026-03-09'], 5);
  });

  test('excludes OUT events', () => {
    const events = [
      makeEvent({ delta: 4 }),
      makeEvent({ flow_type: 'OUT', delta: 2 }),
    ];
    const result = computeDailyEntries(events as any, 'v1', 2026, 2);
    assert.equal(result['2026-03-09'], 4);
  });

  test('excludes different venue', () => {
    const events = [makeEvent({ venue_id: 'other' })];
    const result = computeDailyEntries(events as any, 'v1', 2026, 2);
    assert.deepEqual(result, {});
  });

  test('excludes events outside the month', () => {
    const events = [makeEvent({ timestamp: new Date('2026-04-01T12:00:00').getTime() })];
    const result = computeDailyEntries(events as any, 'v1', 2026, 2);
    assert.deepEqual(result, {});
  });
});

describe('buildCalendarGrid', () => {
  test('returns 6 rows of 7 columns', () => {
    const grid = buildCalendarGrid(2026, 2); // March 2026
    assert.equal(grid.length, 6);
    grid.forEach(row => assert.equal(row.length, 7));
  });

  test('first cell of March 2026 is a Sunday (March 1)', () => {
    // March 1 2026 is a Sunday, so grid[0][0] should be March 1
    const grid = buildCalendarGrid(2026, 2);
    assert.ok(grid[0][0] instanceof Date);
    assert.equal((grid[0][0] as Date).getDate(), 1);
  });

  test('null cells appear for padding', () => {
    // February 2026 starts on a Sunday so no leading padding
    const grid = buildCalendarGrid(2026, 1);
    assert.equal(grid[0][0] instanceof Date, true);
    // But trailing days should be null
    const allCells = grid.flat();
    const nullCount = allCells.filter(c => c === null).length;
    assert.equal(nullCount, 14); // 42 cells - 28 days in Feb 2026 = 14 trailing nulls
  });
});

describe('computeMonthlyTrend', () => {
  test('returns exactly 12 entries', () => {
    const result = computeMonthlyTrend([], 'v1', 2026);
    assert.equal(result.length, 12);
  });

  test('all totals zero for empty events', () => {
    const result = computeMonthlyTrend([], 'v1', 2026);
    result.forEach(r => assert.equal(r.total, 0));
  });

  test('correctly sums events into the right month', () => {
    const events = [
      makeEvent({ timestamp: new Date('2026-06-15T12:00:00').getTime(), delta: 7 }),
    ];
    const result = computeMonthlyTrend(events as any, 'v1', 2026);
    assert.equal(result[5].total, 7); // index 5 = June
    assert.equal(result[0].total, 0); // January = 0
  });
});

describe('computeDayGenderRatio', () => {
  test('returns zeros when no scans', () => {
    const result = computeDayGenderRatio([], [], 'v1', '2026-03-09');
    assert.equal(result.total, 0);
    assert.equal(result.malePercent, 0);
    assert.equal(result.femalePercent, 0);
  });

  test('computes correct ratio for 3M 1F', () => {
    const scans = [
      makeScan({ sex: 'M' }),
      makeScan({ sex: 'M' }),
      makeScan({ sex: 'M' }),
      makeScan({ sex: 'F' }),
    ];
    const result = computeDayGenderRatio([] as any, scans as any, 'v1', '2026-03-09');
    assert.equal(result.male, 3);
    assert.equal(result.female, 1);
    assert.equal(result.total, 4);
    assert.equal(result.malePercent, 75);
    assert.equal(result.femalePercent, 25);
  });
});

describe('computeHourlyOccupancy', () => {
  test('returns 24 hourly buckets for a day', () => {
    const result = computeHourlyOccupancy([], 'v1', '2026-03-09');
    assert.equal(result.length, 24);
  });

  test('occupancy is cumulative and floored at 0', () => {
    const events = [
      makeEvent({ timestamp: new Date('2026-03-09T20:00:00').getTime(), flow_type: 'IN', delta: 5 }),
      makeEvent({ timestamp: new Date('2026-03-09T21:00:00').getTime(), flow_type: 'OUT', delta: 3 }),
    ];
    const result = computeHourlyOccupancy(events as any, 'v1', '2026-03-09');
    // 8PM bucket: +5 → occupancy = 5
    const hour20 = result.find(r => r.hourLabel === '8PM');
    assert.ok(hour20, '8PM bucket missing');
    assert.equal(hour20!.occupancy, 5);
    // 9PM bucket: -3 → occupancy = 2
    const hour21 = result.find(r => r.hourLabel === '9PM');
    assert.ok(hour21, '9PM bucket missing');
    assert.equal(hour21!.occupancy, 2);
  });
});
