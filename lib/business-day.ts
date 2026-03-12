import { toZonedTime, fromZonedTime } from 'date-fns-tz';

function parseTime(time: string): { hours: number; minutes: number } {
    const [h, m] = time.split(':').map(Number);
    return { hours: h, minutes: m };
}

/** Start of the business day containing `date`. */
export function getBusinessDayStart(date: Date, resetTime: string, timezone: string): Date {
    const { hours, minutes } = parseTime(resetTime);
    const zoned = toZonedTime(date, timezone);
    const todayReset = new Date(zoned);
    todayReset.setHours(hours, minutes, 0, 0);
    if (zoned < todayReset) todayReset.setDate(todayReset.getDate() - 1);
    return fromZonedTime(todayReset, timezone);
}

/** End of the business day containing `date` (next reset minus 1ms). */
export function getBusinessDayEnd(date: Date, resetTime: string, timezone: string): Date {
    const start = getBusinessDayStart(date, resetTime, timezone);
    const { hours, minutes } = parseTime(resetTime);
    const zoned = toZonedTime(start, timezone);
    const nextReset = new Date(zoned);
    nextReset.setDate(nextReset.getDate() + 1);
    nextReset.setHours(hours, minutes, 0, 0);
    return new Date(fromZonedTime(nextReset, timezone).getTime() - 1);
}

/** YYYY-MM-DD label for the business day containing `date`. */
export function getBusinessDate(date: Date, resetTime: string, timezone: string): string {
    const start = getBusinessDayStart(date, resetTime, timezone);
    const zoned = toZonedTime(start, timezone);
    const y = zoned.getFullYear();
    const m = String(zoned.getMonth() + 1).padStart(2, '0');
    const d = String(zoned.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Next upcoming reset time after `date`. */
export function getNextResetTime(date: Date, resetTime: string, timezone: string): Date {
    const { hours, minutes } = parseTime(resetTime);
    const zoned = toZonedTime(date, timezone);
    const todayReset = new Date(zoned);
    todayReset.setHours(hours, minutes, 0, 0);
    if (zoned >= todayReset) todayReset.setDate(todayReset.getDate() + 1);
    return fromZonedTime(todayReset, timezone);
}

/**
 * Auto date label: if now is before resetTime → previous day, else current day.
 * Used to auto-assign the business_date for night logs.
 */
export function getAutoDateLabel(now: Date, resetTime: string, timezone: string): string {
    const { hours, minutes } = parseTime(resetTime);
    const zoned = toZonedTime(now, timezone);
    const todayReset = new Date(zoned);
    todayReset.setHours(hours, minutes, 0, 0);

    if (zoned < todayReset) {
        // Before reset time → previous day
        const prev = new Date(zoned);
        prev.setDate(prev.getDate() - 1);
        const y = prev.getFullYear();
        const m = String(prev.getMonth() + 1).padStart(2, '0');
        const d = String(prev.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    // At or after reset time → current day
    const y = zoned.getFullYear();
    const m = String(zoned.getMonth() + 1).padStart(2, '0');
    const d = String(zoned.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
