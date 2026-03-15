import { getTodayWindow } from '@/lib/core/time';

describe('getTodayWindow', () => {
  test('returns start, end, and timezone', () => {
    const window = getTodayWindow('America/New_York');
    expect(window).toHaveProperty('start');
    expect(window).toHaveProperty('end');
    expect(window.timezone).toBe('America/New_York');
  });

  test('start is midnight of today', () => {
    const window = getTodayWindow();
    const start = new Date(window.start);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
  });

  test('end is 23:59:59.999 of today', () => {
    const window = getTodayWindow();
    const end = new Date(window.end);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
  });

  test('start and end are same calendar day', () => {
    const window = getTodayWindow();
    const start = new Date(window.start);
    const end = new Date(window.end);
    expect(start.getFullYear()).toBe(end.getFullYear());
    expect(start.getMonth()).toBe(end.getMonth());
    expect(start.getDate()).toBe(end.getDate());
  });

  test('returns ISO string format', () => {
    const window = getTodayWindow();
    expect(window.start).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(window.end).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('defaults to UTC timezone', () => {
    const window = getTodayWindow();
    expect(window.timezone).toBe('UTC');
  });
});
