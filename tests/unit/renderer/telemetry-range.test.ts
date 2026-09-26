import { describe, it, expect } from 'vitest';
import {
  clampRangeMs,
  datasetRangeMs,
  framesRangeMs,
  telemetryToVideoRangeMs,
} from '@renderer/lib/telemetry-range';
import type { TelemetryDataset, TelemetryFrame } from '@core/types/telemetry';

function frame(timestamp_ms: number): TelemetryFrame {
  return { timestamp_ms, data: {} };
}

describe('telemetry-range', () => {
  it('datasetRangeMs devuelve null sin frames', () => {
    expect(datasetRangeMs(null)).toBeNull();
    const empty = { frameCount: 0, startTime_ms: 0, endTime_ms: 0 } as TelemetryDataset;
    expect(datasetRangeMs(empty)).toBeNull();
  });

  it('datasetRangeMs usa start/end del dataset', () => {
    const dataset = {
      frameCount: 10,
      startTime_ms: 3000,
      endTime_ms: 9000,
    } as TelemetryDataset;
    expect(datasetRangeMs(dataset)).toEqual({ start_ms: 3000, end_ms: 9000 });
  });

  it('framesRangeMs calcula min/max y null si vacío', () => {
    expect(framesRangeMs([])).toBeNull();
    expect(framesRangeMs([frame(500), frame(100), frame(2500)])).toEqual({
      start_ms: 100,
      end_ms: 2500,
    });
  });

  it('telemetryToVideoRangeMs aplica la inversa del ancla', () => {
    expect(telemetryToVideoRangeMs({ start_ms: 0, end_ms: 2000 }, null, 0)).toEqual({
      start_ms: 0,
      end_ms: 2000,
    });
    expect(
      telemetryToVideoRangeMs(
        { start_ms: 5000, end_ms: 6000 },
        { video_ms: 2000, telemetry_ms: 5000 },
        0
      )
    ).toEqual({ start_ms: 2000, end_ms: 3000 });
    expect(telemetryToVideoRangeMs({ start_ms: 1000, end_ms: 2000 }, null, 200)).toEqual({
      start_ms: 800,
      end_ms: 1800,
    });
  });

  it('clampRangeMs recorta al dominio', () => {
    expect(clampRangeMs({ start_ms: -1000, end_ms: 90000 }, 0, 10000)).toEqual({
      start_ms: 0,
      end_ms: 10000,
    });
    expect(clampRangeMs({ start_ms: 2000, end_ms: 4000 }, 0, 10000)).toEqual({
      start_ms: 2000,
      end_ms: 4000,
    });
  });
});
