import {
    getBusinessDayStart, getBusinessDayEnd, getBusinessDate,
    getNextResetTime, getAutoDateLabel,
} from '@/lib/business-day';

describe('business-day', () => {
    const tz = 'America/New_York';
    const resetTime = '05:00';

    describe('getBusinessDayStart', () => {
        it('returns 5 AM today if current time is after 5 AM', () => {
            const now = new Date('2026-03-11T19:00:00Z'); // 2 PM ET (UTC-5 in winter, but Mar 11 is after spring forward so UTC-4)
            const start = getBusinessDayStart(now, resetTime, tz);
            // After spring forward (Mar 8 2026), ET = UTC-4, so 5 AM ET = 9 AM UTC
            expect(start.toISOString()).toBe('2026-03-11T09:00:00.000Z');
        });

        it('returns 5 AM yesterday if current time is before 5 AM', () => {
            const now = new Date('2026-03-11T08:00:00Z'); // 4 AM ET (UTC-4)
            const start = getBusinessDayStart(now, resetTime, tz);
            expect(start.toISOString()).toBe('2026-03-10T09:00:00.000Z');
        });

        it('handles custom reset time', () => {
            const now = new Date('2026-03-11T19:00:00Z');
            const start = getBusinessDayStart(now, '06:00', tz);
            expect(start.toISOString()).toBe('2026-03-11T10:00:00.000Z');
        });
    });

    describe('getBusinessDayEnd', () => {
        it('returns next day reset time minus 1ms', () => {
            const now = new Date('2026-03-11T19:00:00Z');
            const end = getBusinessDayEnd(now, resetTime, tz);
            expect(end.toISOString()).toBe('2026-03-12T08:59:59.999Z');
        });
    });

    describe('getBusinessDate', () => {
        it('returns date label for the business day', () => {
            const afterReset = new Date('2026-03-11T19:00:00Z');
            expect(getBusinessDate(afterReset, resetTime, tz)).toBe('2026-03-11');

            const beforeReset = new Date('2026-03-11T08:00:00Z');
            expect(getBusinessDate(beforeReset, resetTime, tz)).toBe('2026-03-10');
        });
    });

    describe('getNextResetTime', () => {
        it('returns today reset time if before it', () => {
            const now = new Date('2026-03-11T08:00:00Z');
            const next = getNextResetTime(now, resetTime, tz);
            expect(next.toISOString()).toBe('2026-03-11T09:00:00.000Z');
        });

        it('returns tomorrow reset time if after it', () => {
            const now = new Date('2026-03-11T19:00:00Z');
            const next = getNextResetTime(now, resetTime, tz);
            expect(next.toISOString()).toBe('2026-03-12T09:00:00.000Z');
        });
    });

    describe('getAutoDateLabel', () => {
        it('before reset time → previous day', () => {
            const now = new Date('2026-03-11T08:00:00Z'); // 4 AM ET, before 5 AM
            expect(getAutoDateLabel(now, resetTime, tz)).toBe('2026-03-10');
        });

        it('after reset time → current day', () => {
            const now = new Date('2026-03-11T19:00:00Z'); // 3 PM ET, after 5 AM
            expect(getAutoDateLabel(now, resetTime, tz)).toBe('2026-03-11');
        });

        it('at exactly reset time → current day', () => {
            const now = new Date('2026-03-11T09:00:00.000Z'); // exactly 5 AM ET
            expect(getAutoDateLabel(now, resetTime, tz)).toBe('2026-03-11');
        });
    });
});
