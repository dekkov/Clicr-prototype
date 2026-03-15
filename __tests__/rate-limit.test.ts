import { rateLimit } from '@/lib/rate-limit';

describe('rateLimit', () => {
  // Each test uses a unique key to avoid cross-test state
  const uniqueKey = () => `test-${Date.now()}-${Math.random()}`;

  test('allows first request', () => {
    expect(rateLimit(uniqueKey(), 5, 60000)).toBe(true);
  });

  test('allows requests up to the limit', () => {
    const key = uniqueKey();
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5, 60000)).toBe(true);
    }
  });

  test('blocks requests over the limit', () => {
    const key = uniqueKey();
    for (let i = 0; i < 5; i++) {
      rateLimit(key, 5, 60000);
    }
    expect(rateLimit(key, 5, 60000)).toBe(false);
  });

  test('different keys have independent limits', () => {
    const key1 = uniqueKey();
    const key2 = uniqueKey();

    // Exhaust key1
    for (let i = 0; i < 3; i++) {
      rateLimit(key1, 3, 60000);
    }
    expect(rateLimit(key1, 3, 60000)).toBe(false);

    // key2 should still work
    expect(rateLimit(key2, 3, 60000)).toBe(true);
  });

  test('resets after window expires', () => {
    const key = uniqueKey();
    // Use a very short window
    for (let i = 0; i < 3; i++) {
      rateLimit(key, 3, 1); // 1ms window
    }
    // After window expires, should reset
    // Small delay to ensure window has passed
    const start = Date.now();
    while (Date.now() - start < 5) { /* busy wait 5ms */ }
    expect(rateLimit(key, 3, 1)).toBe(true);
  });

  test('limit of 1 blocks second request', () => {
    const key = uniqueKey();
    expect(rateLimit(key, 1, 60000)).toBe(true);
    expect(rateLimit(key, 1, 60000)).toBe(false);
  });
});
