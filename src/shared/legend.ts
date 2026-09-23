/**
 * Utilidades puras de maquetación de leyendas (exportación).
 */

/**
 * Longitud de reserva de un valor formateado para el "strpad".
 *
 * Es la longitud real del texto: el valor formateado ya incluye el signo `-` de
 * los negativos (`-27.42` → 6), así que el hueco del signo ya está contado (una
 * sola vez).
 */
export function reservedLength(text: string): number {
  return text.length;
}

/**
 * Envuelve una lista de ítems con ancho conocido en filas que quepan en
 * `maxWidth` (con `gap` entre ítems). Si un ítem no cabe en la fila actual, se
 * abre una nueva. Un ítem más ancho que la fila ocupa su propia fila.
 */
export function wrapByWidth<T extends { width: number }>(
  items: T[],
  maxWidth: number,
  gap: number
): T[][] {
  const rows: T[][] = [];
  let row: T[] = [];
  let used = 0;

  for (const item of items) {
    const add = (row.length > 0 ? gap : 0) + item.width;
    if (row.length > 0 && used + add > maxWidth) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push(item);
    used += (row.length > 1 ? gap : 0) + item.width;
  }

  if (row.length > 0) rows.push(row);
  return rows;
}
