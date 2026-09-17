/** Rango temporal seleccionado (zoom) compartido entre timelines. */
export interface ZoomRange {
  startMs: number;
  endMs: number;
}

/** Construye un rango normalizado (start ≤ end) a partir de dos timestamps. */
export function makeRange(aMs: number, bMs: number): ZoomRange {
  return aMs <= bMs ? { startMs: aMs, endMs: bMs } : { startMs: bMs, endMs: aMs };
}

/** Indica si un timestamp cae dentro del rango (o si no hay rango). */
export function isInRange(ms: number, range: ZoomRange | null): boolean {
  return range == null || (ms >= range.startMs && ms <= range.endMs);
}

/** Recorta el rango a los límites del dataset. */
export function clampRange(range: ZoomRange, dataStart: number, dataEnd: number): ZoomRange {
  const startMs = Math.min(Math.max(range.startMs, dataStart), dataEnd);
  const endMs = Math.min(Math.max(range.endMs, dataStart), dataEnd);
  return makeRange(startMs, endMs);
}

/** ¿El rango es prácticamente todo el dataset (sin zoom efectivo)? */
export function isFullRange(
  range: ZoomRange,
  dataStart: number,
  dataEnd: number,
  toleranceMs = 1
): boolean {
  return range.startMs <= dataStart + toleranceMs && range.endMs >= dataEnd - toleranceMs;
}
