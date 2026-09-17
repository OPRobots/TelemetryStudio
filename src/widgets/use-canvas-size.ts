import { useEffect, useState } from 'react';

export interface CanvasSize {
  width: number;
  height: number;
}

/**
 * Observa el tamaño CSS del canvas vía ResizeObserver y lo devuelve.
 * Al cambiar el tamaño, el componente repinta el bitmap con las dimensiones
 * nuevas en lugar de dejar que el navegador lo estire.
 */
export function useCanvasSize(ref: React.RefObject<HTMLCanvasElement | null>): CanvasSize {
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = (): void => {
      const rect = el.getBoundingClientRect();
      setSize((prev) =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height }
      );
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
}
