/**
 * Modo "directo" (replay): ventana temporal que avanza con el vídeo, como si
 * los datos llegaran en vivo desde el robot.
 */
export const DEFAULT_LIVE_WINDOW_MS = 10_000;

/**
 * Ventana visible del modo directo.
 *
 * Devuelve una "página" de ancho `windowMs`:
 * - Hasta que el tiempo `nowMs` supera la ventana, la página está anclada al
 *   inicio (`anchorMs`), así la traza **crece desde la izquierda**.
 * - Después, la página **se desplaza de forma continua** para mantener `nowMs`
 *   en el borde derecho.
 *
 * El consumidor debe limitar **los datos** a `nowMs` (nunca mostrar el futuro);
 * esta ventana es para la **escala** (el eje).
 */
export function liveRange(
  nowMs: number,
  windowMs: number = DEFAULT_LIVE_WINDOW_MS,
  anchorMs?: number
): { startMs: number; endMs: number } {
  const window = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : DEFAULT_LIVE_WINDOW_MS;
  const anchor = anchorMs != null && Number.isFinite(anchorMs) ? anchorMs : nowMs - window;
  const end = Math.max(nowMs, anchor + window);
  return { startMs: end - window, endMs: end };
}
