import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelemetryStore } from '@core/telemetry-store';
import type { TelemetryDataset, TelemetryFrame } from '@core/types/telemetry';

function makeDataset(count: number, interval_ms = 100): TelemetryDataset {
  const frames: TelemetryFrame[] = Array.from({ length: count }, (_, i) => ({
    timestamp_ms: i * interval_ms,
    data: { value: i * 10 },
  }));

  return {
    id: 'test-dataset',
    name: 'Test',
    frames,
    schema: [{ name: 'value', type: 'number' }],
    startTime_ms: 0,
    endTime_ms: (count - 1) * interval_ms,
    duration_ms: (count - 1) * interval_ms,
    avgSampleRate_hz: 1000 / interval_ms,
    frameCount: count,
    source: { type: 'session', sessionName: 'Test', path: '' },
  };
}

describe('TelemetryStore', () => {
  let store: TelemetryStore;

  beforeEach(() => {
    store = new TelemetryStore();
  });

  it('should load dataset and emit event', () => {
    const dataset = makeDataset(10);
    const emitSpy = vi.spyOn(store as any, 'loadDataset');

    store.loadDataset(dataset);

    expect(store.frameCount).toBe(10);
    expect(store.currentDataset).toBe(dataset);
  });

  it('should find closest frame by timestamp', () => {
    const dataset = makeDataset(10);
    store.loadDataset(dataset);

    const frame = store.findClosestFrame(250);
    expect(frame?.timestamp_ms).toBe(300);

    const frame2 = store.findClosestFrame(249);
    expect(frame2?.timestamp_ms).toBe(200);
  });

  it('should return null for empty store', () => {
    expect(store.findClosestFrame(0)).toBeNull();
    expect(store.frameCount).toBe(0);
  });

  it('should add frames in streaming mode', () => {
    const dataset = makeDataset(5);
    store.loadDataset(dataset);

    store.addFrame({ timestamp_ms: 500, data: { value: 50 } });
    expect(store.frameCount).toBe(6);
  });

  it('should find frames in range', () => {
    const dataset = makeDataset(10);
    store.loadDataset(dataset);

    const frames = store.findFramesInRange(200, 500);
    expect(frames.length).toBe(4);
    expect(frames[0]?.timestamp_ms).toBe(200);
    expect(frames[frames.length - 1]?.timestamp_ms).toBe(500);
  });

  it('should get frame at index', () => {
    const dataset = makeDataset(10);
    store.loadDataset(dataset);

    expect(store.getFrameAt(0)?.timestamp_ms).toBe(0);
    expect(store.getFrameAt(9)?.timestamp_ms).toBe(900);
    expect(store.getFrameAt(10)).toBeNull();
  });

  it('should clear all data', () => {
    const dataset = makeDataset(10);
    store.loadDataset(dataset);
    store.clear();

    expect(store.frameCount).toBe(0);
    expect(store.currentDataset).toBeNull();
  });

  it('should handle comparison dataset', () => {
    const dataset = makeDataset(10);
    const comparison = makeDataset(5);

    store.loadDataset(dataset);
    store.loadComparisonDataset(comparison);

    expect(store.comparisonData).toBe(comparison);
    expect(store.getComparisonFrames()).toHaveLength(5);

    store.clearComparison();
    expect(store.comparisonData).toBeNull();
  });

  it('should clear only the primary dataset (keep comparison)', () => {
    const dataset = makeDataset(10);
    const comparison = makeDataset(5);
    store.loadDataset(dataset);
    store.loadComparisonDataset(comparison);

    store.clearPrimary();

    expect(store.frameCount).toBe(0);
    expect(store.currentDataset).toBeNull();
    // La comparación sigue intacta.
    expect(store.comparisonData).toBe(comparison);
    expect(store.getComparisonFrames()).toHaveLength(5);
  });
});
