/**
 * Modo "directo" (replay): ventana temporal que termina en el timestamp
 * visualizado, como si los datos llegaran en vivo desde el robot.
 */
export const DEFAULT_LIVE_WINDOW_MS = 10_000;

/** Rango visible `[now - window, now]` para el modo directo. */
export function liveRange(
  nowMs: number,
  windowMs: number = DEFAULT_LIVE_WINDOW_MS
): { startMs: number; endMs: number } {
  const window = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : DEFAULT_LIVE_WINDOW_MS;
  return { startMs: nowMs - window, endMs: nowMs };
}
