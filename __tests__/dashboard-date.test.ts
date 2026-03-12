import { getBusinessDayStart, getBusinessDayEnd } from '@/lib/business-day';

describe('dashboard date filtering', () => {
    const resetTime = '05:00';
    const tz = 'America/New_York';

    it('filters events within business day boundaries', () => {
        const now = new Date('2026-03-11T20:00:00Z');
        const start = getBusinessDayStart(now, resetTime, tz);
        const end = getBusinessDayEnd(now, resetTime, tz);

        const events = [
            { timestamp: new Date('2026-03-11T04:00:00Z').getTime() }, // before start
            { timestamp: new Date('2026-03-11T10:30:00Z').getTime() }, // inside
            { timestamp: new Date('2026-03-11T22:00:00Z').getTime() }, // inside
            { timestamp: new Date('2026-03-12T10:30:00Z').getTime() }, // after end
        ];

        const filtered = events.filter(e =>
            e.timestamp >= start.getTime() && e.timestamp <= end.getTime()
        );
        expect(filtered).toHaveLength(2);
    });
});
