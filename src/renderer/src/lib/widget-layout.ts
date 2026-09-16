import { MIN_WIDTH, MIN_ROWS, MAX_ROWS, ROW_UNIT, WIDGET_COLUMNS, WIDTH_PRESETS } from '@core/types/layout';

/** Limita un ancho al rango permitido (redondeando a columnas). */
export function clampWidth(columns: number): number {
  return Math.min(WIDGET_COLUMNS, Math.max(MIN_WIDTH, Math.round(columns)));
}

/** Devuelve el preset de ancho (12/9/8/6/4/3) más cercano a `columns`. */
export function snapWidthToPreset(columns: number): number {
  const clamped = Math.min(WIDGET_COLUMNS, Math.max(MIN_WIDTH, columns));
  let best: number = WIDTH_PRESETS[0];
  let bestDiff = Infinity;
  for (const preset of WIDTH_PRESETS) {
    const diff = Math.abs(preset - clamped);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = preset;
    }
  }
  return best;
}

/** Limita un alto (filas) al rango global. */
export function clampHeight(rows: number): number {
  return Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.round(rows)));
}

/** Ancho (px) de una columna de la rejilla. */
export function columnWidth(containerWidth: number, gap: number): number {
  return (containerWidth - (WIDGET_COLUMNS - 1) * gap) / WIDGET_COLUMNS;
}

/**
 * Convierte un ancho en píxeles a un número de columnas (float).
 * El ancho de `n` columnas es `n*colW + (n-1)*gap`.
 */
export function columnsFromPixels(px: number, containerWidth: number, gap: number): number {
  const colWidth = columnWidth(containerWidth, gap);
  if (colWidth <= 0) return MIN_WIDTH;
  return (px + gap) / (colWidth + gap);
}

/** Convierte un alto en píxeles a un número de filas (float). */
export function rowsFromPixels(px: number, gap: number): number {
  return (px + gap) / (ROW_UNIT + gap);
}

/**
 * Empaqueta una lista ordenada de widgets en filas de 12 columnas (como un grid
 * clásico). Cada widget ocupa `clampWidth(width)` columnas; cuando uno no cabe en
 * la fila actual, se abre una fila nueva.
 */
export function packWidgetRows<T extends { width: number }>(items: T[]): T[][] {
  const rows: T[][] = [];
  let current: T[] = [];
  let used = 0;

  for (const item of items) {
    const cols = clampWidth(item.width);
    if (current.length > 0 && used + cols > WIDGET_COLUMNS) {
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
