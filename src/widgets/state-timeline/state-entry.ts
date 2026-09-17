export interface StateEntry {
  label: string;
  color: string;
}

/** Valor de estado reconocible: número o etiqueta de texto. */
export type StateValue = number | string;

/**
 * Normaliza un valor de telemetría a un valor de estado.
 * `boolean` se trata como 0/1; cualquier otra cosa se descarta.
 */
export function toStateValue(value: unknown): StateValue | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') return value;
  return undefined;
}

/** Hue determinista (0..359) a partir de un texto. */
export function hashHue(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number): number =>
    lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number): string => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** Entrada por defecto para un estado sin configurar. */
export function defaultStateEntry(value: StateValue): StateEntry {
  if (typeof value === 'number') {
    const hue = (((value * 67) % 360) + 360) % 360;
    return { label: `S${value}`, color: hslToHex(hue, 70, 55) };
  }
  return { label: value, color: hslToHex(hashHue(value), 70, 55) };
}

/**
 * Resuelve etiqueta y color de un estado. El `stateMap` (clave = valor como
 * texto) permite renombrar y recolorear; si no hay entrada, se usa el valor
 * por defecto (etiqueta = el propio string, o `S<n>` para números).
 */
export function resolveStateEntry(
  value: StateValue,
  map: Record<string, StateEntry>
): StateEntry {
  const fallback = defaultStateEntry(value);
  const entry = map[String(value)];
  if (!entry) return fallback;
  return {
    label: entry.label && entry.label.length > 0 ? entry.label : fallback.label,
    color: entry.color && entry.color.length > 0 ? entry.color : fallback.color,
  };
}
