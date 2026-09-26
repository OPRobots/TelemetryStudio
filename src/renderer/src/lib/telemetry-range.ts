import type { TelemetryDataset, TelemetryFrame } from '@core/types/telemetry';

export interface TimeRangeMs {
  start_ms: number;
  end_ms: number;
}

export interface SyncAnchorPoint {
  video_ms: number;
  telemetry_ms: number;
}

/** Rango temporal del dataset si tiene frames, o `null`. */
export function datasetRangeMs(dataset: TelemetryDataset | null): TimeRangeMs | null {
  if (dataset && dataset.frameCount > 0) {
    return { start_ms: dataset.startTime_ms, end_ms: dataset.endTime_ms };
  }
  return null;
}

/** Rango temporal (min/max timestamp) de una lista de frames, o `null`. */
export function framesRangeMs(frames: TelemetryFrame[]): TimeRangeMs | null {
  if (frames.length === 0) return null;
  let start = Infinity;
  let end = -Infinity;
  for (const frame of frames) {
    if (frame.timestamp_ms < start) start = frame.timestamp_ms;
    if (frame.timestamp_ms > end) end = frame.timestamp_ms;
  }
  return Number.isFinite(start) ? { start_ms: start, end_ms: end } : null;
}

/**
 * Traduce un rango de **telemetría** a tiempo de **vídeo** usando la inversa de
 * `VideoSynchronizer.mapTime`. Sin ancla, asume telemetría≈vídeo (menos drift).
 */
export function telemetryToVideoRangeMs(
  range: TimeRangeMs,
  anchor: SyncAnchorPoint | null,
  driftOffset_ms: number
): TimeRangeMs {
  const toVideo = (telemetry_ms: number): number =>
    anchor
      ? telemetry_ms - driftOffset_ms + anchor.video_ms - anchor.telemetry_ms
      : telemetry_ms - driftOffset_ms;
  return { start_ms: toVideo(range.start_ms), end_ms: toVideo(range.end_ms) };
}

/** Recorta un rango a `[min_ms, max_ms]`. */
export function clampRangeMs(range: TimeRangeMs, min_ms: number, max_ms: number): TimeRangeMs {
  const lo = Math.min(min_ms, max_ms);
  const hi = Math.max(min_ms, max_ms);
  return {
    start_ms: Math.max(lo, Math.min(range.start_ms, hi)),
    end_ms: Math.max(lo, Math.min(range.end_ms, hi)),
  };
}
