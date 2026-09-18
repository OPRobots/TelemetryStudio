import type { TelemetryFrame } from './types/telemetry';

/**
 * Búsqueda binaria O(log N) para encontrar el frame más cercano
 * a un timestamp dado en un array ordenado.
 */
export function binarySearch(
  frames: TelemetryFrame[],
  target_ms: number
): TelemetryFrame | null {
  if (frames.length === 0) return null;

  let low = 0;
  let high = frames.length - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const midTime = frames[mid].timestamp_ms;

    if (midTime < target_ms) {
      low = mid + 1;
    } else if (midTime > target_ms) {
      high = mid - 1;
    } else {
      return frames[mid];
    }
  }

  if (low >= frames.length) return frames[frames.length - 1];
  if (high < 0) return frames[0];

  const diffLow = Math.abs(frames[low].timestamp_ms - target_ms);
  const diffHigh = Math.abs(frames[high].timestamp_ms - target_ms);

  return diffLow <= diffHigh ? frames[low] : frames[high];
}

/**
 * Búsqueda binaria que devuelve el índice del frame más cercano.
 */
export function binarySearchIndex(
  frames: TelemetryFrame[],
  target_ms: number
): number {
  if (frames.length === 0) return 0;

  let low = 0;
  let high = frames.length - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (frames[mid].timestamp_ms < target_ms) {
      low = mid + 1;
    } else if (frames[mid].timestamp_ms > target_ms) {
      high = mid - 1;
    } else {
      return mid;
    }
  }

  if (low >= frames.length) return frames.length - 1;
  if (high < 0) return 0;

  const diffLow = Math.abs(frames[low].timestamp_ms - target_ms);
  const diffHigh = Math.abs(frames[high].timestamp_ms - target_ms);

  return diffLow <= diffHigh ? low : high;
}

/**
 * Devuelve los frames cuyo timestamp está en [start_ms, end_ms].
 * Asume `frames` ordenado por timestamp.
 */
export function findFramesInRange(
  frames: TelemetryFrame[],
  start_ms: number,
  end_ms: number
): TelemetryFrame[] {
  if (frames.length === 0 || end_ms < start_ms) return [];
  const startIdx = lowerBound(frames, start_ms);
  const endIdx = upperBound(frames, end_ms);
  return frames.slice(startIdx, endIdx);
}

/**
 * Índices [start, end] (inclusive) de los frames dentro de `[start_ms, end_ms]`,
 * ampliados `pad` frames por cada lado y recortados a los límites del array.
 * Devuelve `null` si el rango no contiene ningún frame (para hacer fallback).
 * Asume `frames` ordenado por timestamp.
 */
export function frameRangeBounds(
  frames: TelemetryFrame[],
  start_ms: number,
  end_ms: number,
  pad = 1
): { start: number; end: number } | null {
  if (frames.length === 0 || end_ms < start_ms) return null;
  const lo = lowerBound(frames, start_ms);
  const hi = upperBound(frames, end_ms); // exclusivo
  if (hi <= lo) return null; // ningún frame dentro del rango
  return {
    start: Math.max(0, lo - pad),
    end: Math.min(frames.length - 1, hi - 1 + pad),
  };
}

function lowerBound(frames: TelemetryFrame[], target_ms: number): number {
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (frames[mid].timestamp_ms < target_ms) low = mid + 1;
    else high = mid;
  }
  return low;
}

function upperBound(frames: TelemetryFrame[], target_ms: number): number {
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (frames[mid].timestamp_ms <= target_ms) low = mid + 1;
    else high = mid;
  }
  return low;
}
