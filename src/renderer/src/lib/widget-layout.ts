import { MIN_WIDTH, ROW_UNIT, WIDGET_COLUMNS } from '@core/types/layout';

// Los helpers de límites/snap/empaquetado viven en `@shared/grid`
// (`clampGridWidth`, `clampGridHeight`, `snapGridWidth`, `packGridRows`). Este
// módulo solo aporta la conversión entre píxeles y celdas de la rejilla.

/** Ancho (px) de una columna de la rejilla. */
function columnWidth(containerWidth: number, gap: number): number {
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
