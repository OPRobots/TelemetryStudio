import { describe, it, expect } from 'vitest';
import { frameAt, frameIndexAt, valueAt } from '@widgets/frame-lookup';
import type { TelemetryFrame } from '@core/types/telemetry';

function makeFrames(): TelemetryFrame[] {
  return [
    { timestamp_ms: 0, data: { speed: 0, state: 0 } },
    { timestamp_ms: 100, data: { speed: 10, state: 0 } },
    { timestamp_ms: 200, data: { speed: 20, state: 1 } },
    { timestamp_ms: 300, data: { speed: null, state: 1 } },
    { timestamp_ms: 400, data: { speed: 40, state: 2 } },
  ];
}

describe('frame-lookup', () => {
  it('returns null without timestamp or dataset', () => {
    expect(frameAt(makeFrames(), null)).toBeNull();
    expect(frameAt([], 100)).toBeNull();
    expect(frameIndexAt([], 100)).toBe(-1);
  });

  it('finds the exact frame', () => {
    expect(frameAt(makeFrames(), 200)?.timestamp_ms).toBe(200);
    expect(frameIndexAt(makeFrames(), 200)).toBe(2);
  });

  it('finds the closest frame between samples', () => {
    expect(frameAt(makeFrames(), 180)?.timestamp_ms).toBe(200);
    expect(frameAt(makeFrames(), 120)?.timestamp_ms).toBe(100);
  });

  it('clamps to the range bounds', () => {
    expect(frameAt(makeFrames(), -50)?.timestamp_ms).toBe(0);
    expect(frameAt(makeFrames(), 9999)?.timestamp_ms).toBe(400);
    expect(frameIndexAt(makeFrames(), 9999)).toBe(4);
  });

  it('reads a field value at the viewed timestamp', () => {
    expect(valueAt(makeFrames(), 'speed', 100)).toBe(10);
    expect(valueAt(makeFrames(), 'state', 250)).toBe(1);
  });

  it('returns null for missing field or value', () => {
    expect(valueAt(makeFrames(), undefined, 100)).toBeNull();
    expect(valueAt(makeFrames(), 'missing', 100)).toBeNull();
    expect(valueAt(makeFrames(), 'speed', 300)).toBeNull();
  });
});
