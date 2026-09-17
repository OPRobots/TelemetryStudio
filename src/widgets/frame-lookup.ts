import { binarySearch, binarySearchIndex } from '@core/binary-search';
import type { TelemetryFrame, TelemetryValue } from '@core/types/telemetry';

/**
 * Frame más cercano a `timestamp_ms` dentro del dataset dado.
 * Devuelve `null` si no hay timestamp o el dataset está vacío.
 */
export function frameAt(
  frames: TelemetryFrame[],
  timestamp_ms: number | null | undefined
): TelemetryFrame | null {
  if (timestamp_ms == null || frames.length === 0) return null;
  return binarySearch(frames, timestamp_ms);
}

/**
 * Índice del frame más cercano a `timestamp_ms`.
 * Devuelve `-1` si no hay timestamp o el dataset está vacío.
 */
export function frameIndexAt(
  frames: TelemetryFrame[],
  timestamp_ms: number | null | undefined
): number {
  if (timestamp_ms == null || frames.length === 0) return -1;
  return binarySearchIndex(frames, timestamp_ms);
}

/**
 * Valor de `field` en el frame más cercano a `timestamp_ms`.
 */
export function valueAt(
  frames: TelemetryFrame[],
  field: string | undefined,
  timestamp_ms: number | null | undefined
): TelemetryValue | null {
  if (!field) return null;
  const frame = frameAt(frames, timestamp_ms);
  return frame ? (frame.data[field] ?? null) : null;
}
