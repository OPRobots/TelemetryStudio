import { useCallback, useEffect, useRef } from 'react';
import { useFrameSubscription } from './frame-bus';

/**
 * Redibuja un widget canvas de forma imperativa:
 * - Agenda un `draw()` por frame de animación (coalesce varios eventos).
 * - Se dispara al cambiar las dependencias (props/datos/tamaño) y con cada
 *   frame del bus (vídeo/streaming), sin re-renderizar React.
 *
 * `draw` debe ser estable (useCallback) y leer sus entradas desde refs.
 */
export function useWidgetDraw(draw: () => void, deps: unknown[]): () => void {
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const rafRef = useRef<number | null>(null);

  const schedule = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      drawRef.current();
    });
  }, []);

  useFrameSubscription(schedule);

  useEffect(() => {
    schedule();
    // Las dependencias las aporta el widget; `schedule` es estable.
  }, deps);

  useEffect(
    () => () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    },
    []
  );

  return schedule;
}
