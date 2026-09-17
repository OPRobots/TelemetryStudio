/** Convierte HSL (h: 0..360, s/l: 0..100) a hex `#rrggbb`. */
export function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number): number =>
    lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number): string => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/**
 * Paleta base de **series** (líneas): viva y con buen contraste. Es la paleta
 * original del TimeSeriesChart.
 */
export const SERIES_PALETTE = [
  '#3b82f6',
  '#F2BE22',
  '#22c55e',
  '#ef4444',
  '#a855f7',
  '#06b6d4',
  '#f97316',
  '#14b8a6',
  '#e879f9',
  '#84cc16',
];

/** Matiz base cercano al azul OPR. */
const BASE_HUE = 206;
/** Ángulo áureo: reparte matices muy separados para cualquier prefijo. */
const GOLDEN_ANGLE = 137.508;

/**
 * Colores automáticos para las **series** (líneas). Usa la paleta base original
 * y, si hay más series que colores, añade tonos vivos con matiz por ángulo
 * áureo (estables por índice, sin repetir).
 */
export function seriesPalette(count: number): string[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => {
    if (i < SERIES_PALETTE.length) return SERIES_PALETTE[i]!;
    const hue = (BASE_HUE + (i - SERIES_PALETTE.length) * GOLDEN_ANGLE) % 360;
    return hslToHex(hue, 72, 56);
  });
}

/**
 * Colores automáticos para **estados** (bloques sólidos). Son más **oscuros**
 * que los de serie, porque un bloque de color claro resulta pesado. Mantiene
 * el matiz por ángulo áureo y es **estable por índice** (añadir estados nuevos
 * no recolorea los existentes).
 */
export function statePalette(count: number): string[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => {
    const hue = (BASE_HUE + i * GOLDEN_ANGLE) % 360;
    const saturation = 46 + (i % 2) * 4; // 46 / 50
    const lightness = 40 + (i % 2) * 5; // 40 / 45
    return hslToHex(hue, saturation, lightness);
  });
}

/** Aclara un color hex mezclándolo con blanco (`amount` 0..1). */
export function lighten(hex: string, amount: number): string {
  const mix = (channel: number): string => {
    const value = Math.round(channel + (255 - channel) * amount);
    return value.toString(16).padStart(2, '0');
  };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}
