import { shouldResetNow } from '@/lib/useAutoReset';

describe('shouldResetNow', () => {
    const tz = 'America/New_York';
    const resetTime = '05:00';

    it('returns true when last reset was before current business day start', () => {
        const lastResetAt = '2026-03-10T09:00:00.000Z'; // Mar 10 5 AM ET
        const now = new Date('2026-03-11T15:00:00Z');     // Mar 11 11 AM ET
        expect(shouldResetNow(now, lastResetAt, resetTime, tz)).toBe(true);
    });

    it('returns false when last reset was after current business day start', () => {
        const lastResetAt = '2026-03-11T10:00:00.000Z'; // Mar 11 6 AM ET
        const now = new Date('2026-03-11T15:00:00Z');
        expect(shouldResetNow(now, lastResetAt, resetTime, tz)).toBe(false);
    });

    it('returns false when now is before reset time', () => {
        const lastResetAt = '2026-03-10T09:00:00.000Z';
        const now = new Date('2026-03-11T08:00:00Z'); // 4 AM ET
        expect(shouldResetNow(now, lastResetAt, resetTime, tz)).toBe(false);
    });

    it('returns true when never reset (undefined)', () => {
        const now = new Date('2026-03-11T15:00:00Z');
        expect(shouldResetNow(now, undefined, resetTime, tz)).toBe(true);
    });

    it('is pure date logic — reset_rule guard is in the hook, not here', () => {
        const lastResetAt = '2026-03-10T09:00:00.000Z';
        const now = new Date('2026-03-11T15:00:00Z');
        expect(shouldResetNow(now, lastResetAt, resetTime, tz)).toBe(true);
    });
});
