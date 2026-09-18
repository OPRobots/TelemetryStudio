/**
 * Formatea el valor de un campo para las leyendas/readouts de los widgets.
 *
 * Precisión **adaptativa** según la magnitud (más decimales cuanto más pequeño),
 * recortando ceros finales; magnitudes extremas usan notación exponencial.
 */
export function formatLegendValue(value: unknown): string {
  if (value == null) return '--';

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '--';
    const a = Math.abs(value);
    if (a === 0) return '0';
    if (a >= 1e6 || a < 1e-6) return value.toExponential(2);
    const decimals =
      a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a >= 0.1 ? 3 : a >= 0.01 ? 4 : a >= 0.001 ? 5 : 6;
    return trimTrailingZeros(value.toFixed(decimals));
  }

  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  return String(value);
}

/** Quita ceros finales (y el punto) de un decimal ya formateado. */
function trimTrailingZeros(text: string): string {
  if (!text.includes('.')) return text;
  return text.replace(/\.?0+$/, '');
}
