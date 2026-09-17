import { describe, it, expect } from 'vitest';
import { makeRange, isInRange, clampRange, isFullRange } from '@widgets/zoom-range';

describe('zoom-range', () => {
  it('normalizes a range from two timestamps', () => {
    expect(makeRange(900, 100)).toEqual({ startMs: 100, endMs: 900 });
    expect(makeRange(100, 900)).toEqual({ startMs: 100, endMs: 900 });
    expect(makeRange(5, 5)).toEqual({ startMs: 5, endMs: 5 });
  });

  it('checks whether a timestamp is inside the range', () => {
    const range = { startMs: 100, endMs: 200 };
    expect(isInRange(100, range)).toBe(true);
    expect(isInRange(150, range)).toBe(true);
    expect(isInRange(200, range)).toBe(true);
    expect(isInRange(99, range)).toBe(false);
    expect(isInRange(201, range)).toBe(false);
    expect(isInRange(999, null)).toBe(true);
  });

  it('clamps the range to the dataset bounds', () => {
    expect(clampRange({ startMs: -50, endMs: 5000 }, 0, 1000)).toEqual({
      startMs: 0,
      endMs: 1000,
    });
    expect(clampRange({ startMs: 200, endMs: 400 }, 0, 1000)).toEqual({
      startMs: 200,
      endMs: 400,
    });
  });

  it('detects a full (non-effective) range', () => {
    expect(isFullRange({ startMs: 0, endMs: 1000 }, 0, 1000)).toBe(true);
    expect(isFullRange({ startMs: 10, endMs: 990 }, 0, 1000)).toBe(false);
    expect(isFullRange({ startMs: -1, endMs: 1001 }, 0, 1000)).toBe(true);
  });
});
