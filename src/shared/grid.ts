/**
 * Rejilla compartida (dashboard principal y editor de exportación):
 * 12 columnas, filas de 40 px. Módulo puro para poder testearse y reutilizarse.
 */
export const GRID_COLUMNS = 12;
export const GRID_WIDTH_PRESETS = [12, 9, 8, 6, 4, 3] as const;
export const GRID_MIN_WIDTH = 3;
export const GRID_ROW_UNIT = 40;

const GRID_MIN_ROWS = 2;
const GRID_MAX_ROWS = 16;

/** Limita un ancho al rango permitido (redondeando a columnas). */
export function clampGridWidth(columns: number): number {
  return Math.min(GRID_COLUMNS, Math.max(GRID_MIN_WIDTH, Math.round(columns)));
}

/** Limita un alto (filas) al rango global. */
export function clampGridHeight(rows: number): number {
  return Math.min(GRID_MAX_ROWS, Math.max(GRID_MIN_ROWS, Math.round(rows)));
}

/** Devuelve el preset de ancho (12/9/8/6/4/3) más cercano a `columns`. */
export function snapGridWidth(columns: number): number {
  const clamped = Math.min(GRID_COLUMNS, Math.max(GRID_MIN_WIDTH, columns));
  let best: number = GRID_WIDTH_PRESETS[0];
  let bestDiff = Infinity;
  for (const preset of GRID_WIDTH_PRESETS) {
    const diff = Math.abs(preset - clamped);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = preset;
    }
  }
  return best;
}

/**
 * Empaqueta una lista ordenada de ítems en filas de 12 columnas (grid clásico).
 * Cada ítem ocupa `clampGridWidth(width)` columnas; cuando uno no cabe en la fila
 * actual, se abre una fila nueva.
 */
export function packGridRows<T extends { width: number }>(items: T[]): T[][] {
  const rows: T[][] = [];
  let current: T[] = [];
  let used = 0;

  for (const item of items) {
    const cols = clampGridWidth(item.width);
    if (current.length > 0 && used + cols > GRID_COLUMNS) {
      rows.push(current);
      current = [];
      used = 0;
    }
    current.push(item);
    used += cols;
  }

  if (current.length > 0) rows.push(current);
  return rows;
}
