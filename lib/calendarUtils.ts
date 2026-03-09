// lib/calendarUtils.ts
import { format, startOfDay, endOfDay, eachHourOfInterval, addHours } from 'date-fns';
import type { CountEvent, IDScanEvent } from '@/lib/types';

/** YYYY-MM-DD string → total entries (flow_type IN, excluding RESET) for a venue */
export function computeDailyEntries(
  events: CountEvent[],
  venueId: string,
  year: number,
  month: number // 0-indexed (Jan=0)
): Record<string, number> {
  const result: Record<string, number> = {};

  const monthStart = new Date(year, month, 1).getTime();
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();

  events.forEach(e => {
    if (
      e.venue_id !== venueId ||
      e.flow_type !== 'IN' ||
      e.event_type === 'RESET' ||
      e.timestamp < monthStart ||
      e.timestamp > monthEnd
    ) return;

    const dateKey = format(new Date(e.timestamp), 'yyyy-MM-dd');
    result[dateKey] = (result[dateKey] ?? 0) + e.delta;
  });

  return result;
}

/** Compute month-level summary stats */
export function computeMonthStats(
  events: CountEvent[],
  venueId: string,
  year: number,
  month: number // 0-indexed
): { monthTotal: number; daysOpen: number; ytdTotal: number } {
  const monthEntries = computeDailyEntries(events, venueId, year, month);
  const daysWithData = Object.values(monthEntries).filter(v => v > 0);

  // YTD: Jan 1 to end of selected month
  const ytdStart = new Date(year, 0, 1).getTime();
  const ytdEnd = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
  const ytdTotal = events
    .filter(e =>
      e.venue_id === venueId &&
      e.flow_type === 'IN' &&
      e.event_type !== 'RESET' &&
      e.timestamp >= ytdStart &&
      e.timestamp <= ytdEnd
    )
    .reduce((sum, e) => sum + e.delta, 0);

  return {
    monthTotal: daysWithData.reduce((s, v) => s + v, 0),
    daysOpen: daysWithData.length,
    ytdTotal,
  };
}

/** 12-month trend for mini bar chart: Jan–Dec of given year */
export function computeMonthlyTrend(
  events: CountEvent[],
  venueId: string,
  year: number
): { monthLabel: string; total: number }[] {
  return Array.from({ length: 12 }, (_, m) => {
    const monthStart = new Date(year, m, 1).getTime();
    const monthEnd = new Date(year, m + 1, 0, 23, 59, 59, 999).getTime();
    const total = events
      .filter(e =>
        e.venue_id === venueId &&
        e.flow_type === 'IN' &&
        e.event_type !== 'RESET' &&
        e.timestamp >= monthStart &&
        e.timestamp <= monthEnd
      )
      .reduce((sum, e) => sum + e.delta, 0);
    return { monthLabel: format(new Date(year, m, 1), 'MMM'), total };
  });
}

/**
 * Build a 6-row × 7-col calendar grid.
 * Null cells are padding (before month start / after month end).
 */
export function buildCalendarGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun
  const grid: (Date | null)[][] = [];
  let current = 1 - startDow; // may be negative (padding)

  for (let row = 0; row < 6; row++) {
    const week: (Date | null)[] = [];
    for (let col = 0; col < 7; col++) {
      if (current < 1 || current > lastDay.getDate()) {
        week.push(null);
      } else {
        week.push(new Date(year, month, current));
      }
      current++;
    }
    grid.push(week);
  }
  return grid;
}

/** Hourly occupancy points for the day detail area chart */
export function computeHourlyOccupancy(
  events: CountEvent[],
  venueId: string,
  dateStr: string // YYYY-MM-DD
): { hourLabel: string; occupancy: number; entries: number; exits: number }[] {
  const dayStart = startOfDay(new Date(dateStr));
  const dayEnd = endOfDay(new Date(dateStr));
  const hours = eachHourOfInterval({ start: dayStart, end: dayEnd });

  let runningOcc = 0;
  return hours.map(hour => {
    const next = addHours(hour, 1);
    const hourEvents = events.filter(
      e =>
        e.venue_id === venueId &&
        e.event_type !== 'RESET' &&
        e.timestamp >= hour.getTime() &&
        e.timestamp < next.getTime()
    );
    const entries = hourEvents
      .filter(e => e.flow_type === 'IN')
      .reduce((s, e) => s + e.delta, 0);
    const exits = hourEvents
      .filter(e => e.flow_type === 'OUT')
      .reduce((s, e) => s + Math.abs(e.delta), 0);
    runningOcc += entries - exits;
    return { hourLabel: format(hour, 'ha'), occupancy: Math.max(0, runningOcc), entries, exits };
  });
}

/** Gender ratio from scans + tap events for a single day */
export function computeDayGenderRatio(
  events: CountEvent[],
  scans: IDScanEvent[],
  venueId: string,
  dateStr: string
): { male: number; female: number; total: number; malePercent: number; femalePercent: number } {
  const dayStart = new Date(dateStr).setHours(0, 0, 0, 0);
  const dayEnd = new Date(dateStr).setHours(23, 59, 59, 999);

  const dayScans = scans.filter(
    s => s.venue_id === venueId && s.timestamp >= dayStart && s.timestamp <= dayEnd
  );
  const male = dayScans.filter(s => s.sex === 'M').length;
  const female = dayScans.filter(s => s.sex === 'F').length;
  const total = male + female || 1;

  return {
    male,
    female,
    total: male + female,
    malePercent: Math.round((male / total) * 100),
    femalePercent: Math.round((female / total) * 100),
  };
}
