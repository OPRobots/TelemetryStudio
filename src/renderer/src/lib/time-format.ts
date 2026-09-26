/**
 * Formatea segundos como `mm:ss.mmm` (con signo si es negativo).
 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '00:00.000';
  const sign = seconds < 0 ? '-' : '';
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = Math.floor(abs % 60);
  const ms = Math.floor((abs % 1) * 1000);
  return `${sign}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms
    .toString()
    .padStart(3, '0')}`;
}

/**
 * Formatea un tiempo restante en ms de forma corta: `12 s`, `1 min 05 s`.
 * Devuelve cadena vacía si no hay estimación válida.
 */
export function formatEta(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '';
  const total_s = Math.round(ms / 1000);
  if (total_s < 60) return `${total_s} s`;
  const m = Math.floor(total_s / 60);
  const s = total_s % 60;
  return s === 0 ? `${m} min` : `${m} min ${s.toString().padStart(2, '0')} s`;
}
