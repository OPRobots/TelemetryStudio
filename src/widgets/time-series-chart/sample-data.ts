import { frameRangeBounds } from '@core/binary-search';
import { downsampleLTTB } from '@core/lttb';
import type { TelemetryFrame } from '@core/types/telemetry';

export interface SampledData {
  /** Timestamps en segundos (eje X), ordenados. */
  x: number[];
  /** Series alineadas por índice con `x`. */
  series: number[][];
}

/** Rango temporal visible (ms). `null`/ausente = dataset completo. */
export interface SampleRange {
  startMs: number;
  endMs: number;
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
}

/**
 * Construye las series muestreadas.
 *
 * - Sin `range`: LTTB sobre **todo** el dataset (vista completa).
 * - Con `range`: muestrea solo la **ventana visible** (+`PAD` frames de margen a
 *   cada lado para que el trazo llegue a los bordes). Si la ventana tiene menos
 *   de `maxPoints` frames, se devuelven **todos** (fidelidad total); si tiene
 *   más, LTTB dentro de la ventana.
 *
 * Se elige un único conjunto de índices (LTTB sobre el primer campo numérico)
 * para que la X y todas las Y queden alineadas por índice. LTTB no promedia:
 * selecciona puntos reales del dataset.
 */
const PAD = 1;

export function buildSampledData(
  frames: TelemetryFrame[],
  fields: string[],
  maxPoints: number,
  range?: SampleRange | null
): SampledData | null {
  if (frames.length === 0 || fields.length === 0) return null;

  let lo = 0;
  let hi = frames.length - 1;
  if (range) {
    const bounds = frameRangeBounds(frames, range.startMs, range.endMs, PAD);
    // Sin frames en la ventana → se cae al dataset completo (lo/hi por defecto).
    if (bounds) {
      lo = bounds.start;
      hi = bounds.end;
    }
  }

  const count = hi - lo + 1;
  let indices: number[];
  if (count <= maxPoints) {
    indices = Array.from({ length: count }, (_, i) => lo + i);
  } else {
    const base =
      fields.find((f) => {
        for (let i = lo; i <= hi; i++) {
          if (typeof frames[i]!.data[f] === 'number') return true;
        }
        return false;
      }) ?? fields[0]!;
    const points = [];
    for (let i = lo; i <= hi; i++) {
      const v = frames[i]!.data[base];
      points.push({ x: i - lo, y: typeof v === 'number' && Number.isFinite(v) ? v : 0 });
    }
    indices = downsampleLTTB(points, maxPoints).map((p) => lo + p.x);
  }

  const x = indices.map((i) => frames[i]!.timestamp_ms / 1000);
  const series = fields.map((field) => indices.map((i) => toNumber(frames[i]!.data[field])));
  return { x, series };
}
