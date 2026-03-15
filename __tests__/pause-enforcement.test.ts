import { shouldBlockForPause } from '@/lib/pause-utils';

describe('shouldBlockForPause', () => {
  test('returns true when is_paused is true', () => {
    expect(shouldBlockForPause({ is_paused: true })).toBe(true);
  });
  test('returns false when is_paused is false', () => {
    expect(shouldBlockForPause({ is_paused: false })).toBe(false);
  });
  test('returns false when is_paused is undefined (default)', () => {
    expect(shouldBlockForPause({})).toBe(false);
  });
  test('returns false when settings is null', () => {
    expect(shouldBlockForPause(null)).toBe(false);
  });
});
