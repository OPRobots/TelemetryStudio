import type { TelemetryFrame } from '@core/types/telemetry';
import { hslToHex } from '../color-palette';

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

/** Color por defecto (poco saturado) para un valor sin color asignado. */
function derivedColor(value: StateValue): string {
  const hue =
    typeof value === 'number' ? (((value * 67) % 360) + 360) % 360 : hashHue(value);
  return hslToHex(hue, 54, 50);
}

/**
 * Entrada por defecto para un estado sin configurar. Si se pasa `color`
 * (p. ej. de la paleta automática) se usa ese; si no, se deriva del valor.
 */
export function defaultStateEntry(value: StateValue, color?: string): StateEntry {
  return {
    label: typeof value === 'number' ? `S${value}` : value,
    color: color ?? derivedColor(value),
  };
}

/**
 * Resuelve etiqueta y color de un estado. El `stateMap` (clave = valor como
 * texto) permite renombrar y recolorear; si no hay entrada, se usa el valor
 * por defecto (`fallbackColor` de la paleta, o derivado del valor).
 */
export function resolveStateEntry(
  value: StateValue,
  map: Record<string, StateEntry>,
  fallbackColor?: string
): StateEntry {
  const fallback = defaultStateEntry(value, fallbackColor);
  const entry = map[String(value)];
  if (!entry) return fallback;
  return {
    label: entry.label && entry.label.length > 0 ? entry.label : fallback.label,
    color: entry.color && entry.color.length > 0 ? entry.color : fallback.color,
  };
}

/** Ordena claves de estado: números ascendentes primero, luego textos. */
export function sortStateKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    const aNum = a.trim() !== '' && Number.isFinite(na);
    const bNum = b.trim() !== '' && Number.isFinite(nb);
    if (aNum && bNum) return na - nb;
    if (aNum) return -1;
    if (bNum) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Claves de estado de un gráfico en **orden de aparición**: valores distintos
 * presentes en el dataset (hasta 64) más las claves ya configuradas. Este orden
 * define qué color de paleta recibe cada estado; al ser de aparición (no
 * ordenado), añadir estados nuevos **no recolorea** los existentes.
 * Para mostrar la lista, usar `sortStateKeys`.
 */
export function collectStateKeys(
  frames: TelemetryFrame[],
  field: string | undefined,
  stateMap: Record<string, StateEntry>
): string[] {
  const seen = new Set<string>();
  if (field) {
    for (const frame of frames) {
      const value = toStateValue(frame.data[field]);
      if (value == null) continue;
      seen.add(String(value));
      if (seen.size >= 64) break;
    }
  }
  for (const key of Object.keys(stateMap)) seen.add(key);
  return Array.from(seen);
}
