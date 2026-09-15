import { describe, it, expect } from 'vitest';
import { binarySearch, binarySearchIndex } from '@core/binary-search';
import type { TelemetryFrame } from '@core/types/telemetry';

function makeFrames(timestamps: number[]): TelemetryFrame[] {
  return timestamps.map((t) => ({
    timestamp_ms: t,
    data: { value: t },
  }));
}

describe('binarySearch', () => {
  it('should return null for empty array', () => {
    expect(binarySearch([], 100)).toBeNull();
  });

  it('should find exact match', () => {
    const frames = makeFrames([10, 20, 30, 40, 50]);
    const result = binarySearch(frames, 30);
    expect(result?.timestamp_ms).toBe(30);
  });

  it('should find closest frame when target is between frames', () => {
    const frames = makeFrames([10, 20, 30, 40, 50]);
    expect(binarySearch(frames, 24)?.timestamp_ms).toBe(20);
    expect(binarySearch(frames, 26)?.timestamp_ms).toBe(30);
  });

  it('should return first frame when target is before all frames', () => {
    const frames = makeFrames([10, 20, 30]);
    expect(binarySearch(frames, 0)?.timestamp_ms).toBe(10);
  });

  it('should return last frame when target is after all frames', () => {
    const frames = makeFrames([10, 20, 30]);
    expect(binarySearch(frames, 100)?.timestamp_ms).toBe(30);
  });

  it('should handle single element array', () => {
    const frames = makeFrames([42]);
    expect(binarySearch(frames, 42)?.timestamp_ms).toBe(42);
    expect(binarySearch(frames, 0)?.timestamp_ms).toBe(42);
    expect(binarySearch(frames, 100)?.timestamp_ms).toBe(42);
  });

  it('should handle equidistant targets (picks either)', () => {
    const frames = makeFrames([10, 20]);
    const result = binarySearch(frames, 15);
    expect([10, 20]).toContain(result?.timestamp_ms);
  });
});

describe('binarySearchIndex', () => {
  it('should return 0 for empty array', () => {
    expect(binarySearchIndex([], 100)).toBe(0);
  });

  it('should return correct index for exact match', () => {
    const frames = makeFrames([10, 20, 30, 40, 50]);
    expect(binarySearchIndex(frames, 30)).toBe(2);
  });

  it('should return closest index', () => {
    const frames = makeFrames([10, 20, 30, 40, 50]);
    expect(binarySearchIndex(frames, 24)).toBe(1);
    expect(binarySearchIndex(frames, 26)).toBe(2);
  });
});
