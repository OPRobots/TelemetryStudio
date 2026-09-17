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
