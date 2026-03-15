import {
  computeDailyEntries,
  computeMonthStats,
  computeMonthlyTrend,
  buildCalendarGrid,
  computeHourlyOccupancy,
  computeDayGenderRatio,
} from '@/lib/calendarUtils';
import type { CountEvent, IDScanEvent } from '@/lib/types';

const VENUE_ID = 'venue-1';

const makeEvent = (overrides: Partial<CountEvent>): CountEvent => ({
  id: `e-${Math.random()}`,
  business_id: 'biz-1',
  venue_id: VENUE_ID,
  area_id: 'area-1',
  device_id: 'dev-1',
  user_id: 'user-1',
  delta: 1,
  flow_type: 'IN',
  event_type: 'TAP',
  gender: null,
  source: 'manual',
  idempotency_key: null,
  timestamp: Date.now(),
  created_at: new Date().toISOString(),
  ...overrides,
} as CountEvent);

describe('computeDailyEntries', () => {
  test('counts IN events per day for a given month', () => {
    const events = [
      makeEvent({ timestamp: new Date(2026, 0, 5, 10).getTime(), delta: 3 }),
      makeEvent({ timestamp: new Date(2026, 0, 5, 14).getTime(), delta: 2 }),
      makeEvent({ timestamp: new Date(2026, 0, 10, 20).getTime(), delta: 1 }),
    ];

    const result = computeDailyEntries(events, VENUE_ID, 2026, 0);
    expect(result['2026-01-05']).toBe(5);
    expect(result['2026-01-10']).toBe(1);
  });

  test('excludes OUT events', () => {
    const events = [
      makeEvent({ timestamp: new Date(2026, 0, 5).getTime(), flow_type: 'OUT', delta: -1 }),
    ];
    const result = computeDailyEntries(events, VENUE_ID, 2026, 0);
    expect(Object.keys(result)).toHaveLength(0);
  });

  test('excludes RESET events', () => {
    const events = [
      makeEvent({ timestamp: new Date(2026, 0, 5).getTime(), event_type: 'RESET' }),
    ];
    const result = computeDailyEntries(events, VENUE_ID, 2026, 0);
    expect(Object.keys(result)).toHaveLength(0);
  });

  test('excludes events from other venues', () => {
    const events = [
      makeEvent({ timestamp: new Date(2026, 0, 5).getTime(), venue_id: 'other' }),
    ];
    const result = computeDailyEntries(events, VENUE_ID, 2026, 0);
    expect(Object.keys(result)).toHaveLength(0);
  });

  test('excludes events outside the month', () => {
    const events = [
      makeEvent({ timestamp: new Date(2026, 1, 5).getTime() }), // Feb
    ];
    const result = computeDailyEntries(events, VENUE_ID, 2026, 0); // Jan
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('computeMonthStats', () => {
  test('computes monthTotal, daysOpen, and ytdTotal', () => {
    const events = [
      makeEvent({ timestamp: new Date(2026, 0, 5).getTime(), delta: 10 }),
      makeEvent({ timestamp: new Date(2026, 0, 10).getTime(), delta: 20 }),
      makeEvent({ timestamp: new Date(2026, 0, 15).getTime(), delta: 5 }),
    ];

    const stats = computeMonthStats(events, VENUE_ID, 2026, 0);
    expect(stats.monthTotal).toBe(35);
    expect(stats.daysOpen).toBe(3);
    expect(stats.ytdTotal).toBe(35);
  });

  test('ytdTotal includes previous months', () => {
    const events = [
      makeEvent({ timestamp: new Date(2026, 0, 5).getTime(), delta: 10 }),  // Jan
      makeEvent({ timestamp: new Date(2026, 1, 5).getTime(), delta: 20 }),  // Feb
    ];

    const stats = computeMonthStats(events, VENUE_ID, 2026, 1); // Feb
    expect(stats.monthTotal).toBe(20);
    expect(stats.ytdTotal).toBe(30); // Jan + Feb
  });
});

describe('computeMonthlyTrend', () => {
  test('returns 12 months with correct labels', () => {
    const result = computeMonthlyTrend([], VENUE_ID, 2026);
    expect(result).toHaveLength(12);
    expect(result[0].monthLabel).toBe('Jan');
    expect(result[11].monthLabel).toBe('Dec');
  });

  test('sums entries per month', () => {
    const events = [
      makeEvent({ timestamp: new Date(2026, 0, 5).getTime(), delta: 10 }),
      makeEvent({ timestamp: new Date(2026, 0, 15).getTime(), delta: 5 }),
      makeEvent({ timestamp: new Date(2026, 5, 1).getTime(), delta: 20 }),
    ];

    const result = computeMonthlyTrend(events, VENUE_ID, 2026);
    expect(result[0].total).toBe(15); // Jan
    expect(result[5].total).toBe(20); // Jun
    expect(result[1].total).toBe(0);  // Feb
  });
});

describe('buildCalendarGrid', () => {
  test('returns 6 rows x 7 columns', () => {
    const grid = buildCalendarGrid(2026, 0); // January 2026
    expect(grid).toHaveLength(6);
    grid.forEach(row => expect(row).toHaveLength(7));
  });

  test('has null padding for days outside the month', () => {
    const grid = buildCalendarGrid(2026, 0); // Jan 2026 starts on Thursday (dow=4)
    // First row: Sun-Wed should be null, Thu-Sat should be dates
    expect(grid[0][0]).toBeNull(); // Sun
    expect(grid[0][3]).toBeNull(); // Wed
    expect(grid[0][4]).not.toBeNull(); // Thu = Jan 1
  });

  test('first actual day is day 1', () => {
    const grid = buildCalendarGrid(2026, 0);
    const firstDate = grid.flat().find(d => d !== null);
    expect(firstDate?.getDate()).toBe(1);
  });

  test('last actual day matches month end', () => {
    const grid = buildCalendarGrid(2026, 0);
    const dates = grid.flat().filter(d => d !== null);
    const lastDate = dates[dates.length - 1];
    expect(lastDate?.getDate()).toBe(31); // January has 31 days
  });

  test('February 2024 (leap year) has 29 days', () => {
    const grid = buildCalendarGrid(2024, 1);
    const dates = grid.flat().filter(d => d !== null);
    expect(dates).toHaveLength(29);
  });
});

describe('computeHourlyOccupancy', () => {
  test('returns 24 hourly buckets', () => {
    const result = computeHourlyOccupancy([], VENUE_ID, '2026-01-05');
    expect(result).toHaveLength(24);
    expect(result[0].hourLabel).toBe('12AM');
    expect(result[12].hourLabel).toBe('12PM');
  });

  test('accumulates running occupancy', () => {
    const date = '2026-01-05';
    const events = [
      makeEvent({
        timestamp: new Date(`${date}T10:30:00`).getTime(),
        delta: 5,
        flow_type: 'IN',
      }),
      makeEvent({
        timestamp: new Date(`${date}T10:45:00`).getTime(),
        delta: 3,
        flow_type: 'IN',
      }),
      makeEvent({
        timestamp: new Date(`${date}T11:15:00`).getTime(),
        delta: -2,
        flow_type: 'OUT',
      }),
    ];

    const result = computeHourlyOccupancy(events, VENUE_ID, date);
    // 10AM bucket: +5 + +3 = 8 entries
    expect(result[10].entries).toBe(8);
    expect(result[10].occupancy).toBe(8);
    // 11AM bucket: -2 exit → running occ = 8 - 2 = 6
    expect(result[11].exits).toBe(2);
    expect(result[11].occupancy).toBe(6);
  });

  test('occupancy floors at 0', () => {
    const date = '2026-01-05';
    const events = [
      makeEvent({
        timestamp: new Date(`${date}T10:30:00`).getTime(),
        delta: -5,
        flow_type: 'OUT',
      }),
    ];
    const result = computeHourlyOccupancy(events, VENUE_ID, date);
    expect(result[10].occupancy).toBe(0);
  });
});

describe('computeDayGenderRatio', () => {
  const makeScan = (sex: string, venueId = VENUE_ID): Partial<IDScanEvent> => ({
    id: `s-${Math.random()}`,
    venue_id: venueId,
    sex,
    timestamp: new Date('2026-01-05T15:00:00').getTime(),
  });

  test('computes correct gender ratios', () => {
    const scans = [
      makeScan('M'), makeScan('M'), makeScan('M'),
      makeScan('F'), makeScan('F'),
    ] as IDScanEvent[];

    const result = computeDayGenderRatio([], scans, VENUE_ID, '2026-01-05');
    expect(result.male).toBe(3);
    expect(result.female).toBe(2);
    expect(result.total).toBe(5);
    expect(result.malePercent).toBe(60);
    expect(result.femalePercent).toBe(40);
  });

  test('handles no scans (avoids division by zero)', () => {
    const result = computeDayGenderRatio([], [], VENUE_ID, '2026-01-05');
    expect(result.total).toBe(0);
    expect(result.malePercent).toBe(0);
    expect(result.femalePercent).toBe(0);
  });

  test('excludes scans from other venues', () => {
    const scans = [
      makeScan('M', 'other-venue'),
    ] as IDScanEvent[];
    const result = computeDayGenderRatio([], scans, VENUE_ID, '2026-01-05');
    expect(result.total).toBe(0);
  });
});
