import { describe, it, expect } from 'vitest';
import { downsampleLTTB, framesToLTTBPoints } from '@core/lttb';
import type { LTTBPoint } from '@core/lttb';

function makePoints(n: number): LTTBPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    x: i * 10,
    y: Math.sin(i * 0.5) * 100,
  }));
}

describe('downsampleLTTB', () => {
  it('should return same array if data length <= 2', () => {
    const data = makePoints(2);
    const result = downsampleLTTB(data, 1);
    expect(result).toHaveLength(2);
  });

  it('should return same array if target >= data length', () => {
    const data = makePoints(10);
    const result = downsampleLTTB(data, 15);
    expect(result).toHaveLength(10);
  });

  it('should return first and last if target <= 2', () => {
    const data = makePoints(100);
    const result = downsampleLTTB(data, 2);
    expect(result).toHaveLength(2);
    expect(result[0]?.x).toBe(0);
    expect(result[1]?.x).toBe(990);
  });

  it('should always preserve first and last points', () => {
    const data = makePoints(200);
    const result = downsampleLTTB(data, 50);
    expect(result[0]?.x).toBe(data[0]?.x);
    expect(result[result.length - 1]?.x).toBe(data[data.length - 1]?.x);
  });

  it('should reduce to target number of points', () => {
    const data = makePoints(1000);
    const result = downsampleLTTB(data, 100);
    expect(result.length).toBe(100);
  });
});

describe('framesToLTTBPoints', () => {
  it('should convert frames to LTTB points', () => {
    const frames = [
      { timestamp_ms: 0, data: { temp: 20 } },
      { timestamp_ms: 100, data: { temp: 25 } },
      { timestamp_ms: 200, data: { temp: 30 } },
    ];
    const points = framesToLTTBPoints(frames, 'temp');
    expect(points).toEqual([
      { x: 0, y: 20 },
      { x: 100, y: 25 },
      { x: 200, y: 30 },
    ]);
  });

  it('should filter out frames with null values', () => {
    const frames = [
      { timestamp_ms: 0, data: { temp: 20 } },
      { timestamp_ms: 100, data: { temp: null } },
      { timestamp_ms: 200, data: { temp: 30 } },
    ];
    const points = framesToLTTBPoints(frames, 'temp');
    expect(points).toHaveLength(2);
  });

  it('should return empty array if no frames have the field', () => {
    const frames = [
      { timestamp_ms: 0, data: { speed: 10 } },
      { timestamp_ms: 100, data: { speed: 20 } },
    ];
    const points = framesToLTTBPoints(frames, 'temp');
    expect(points).toHaveLength(0);
  });
});
