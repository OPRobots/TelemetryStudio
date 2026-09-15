import { useRef } from 'react';

/** Limita un valor al rango [min, max]. */
export function clampPanel(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface SplitterProps {
  orientation: 'vertical' | 'horizontal';
  value: number;
  min: number;
  max: number;
  /** 'px' para anchos/altos absolutos, 'ratio' para fracciones (0–1). */
  unit?: 'px' | 'ratio';
  step?: number;
  onChange: (value: number) => void;
  onReset: () => void;
  label: string;
}

/**
 * Divisor arrastrable entre paneles.
 * - Arrastrar ajusta el valor (con `pointer capture`).
 * - Flechas del teclado ajustan; Home/End van a los extremos.
 * - Doble clic restaura el valor por defecto.
 */
export function Splitter({
  orientation,
  value,
  min,
  max,
  unit = 'px',
  step,
  onChange,
  onReset,
  label,
}: SplitterProps): React.ReactElement {
  const ref = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ startPos: number; startValue: number; containerSize: number } | null>(null);

  const measureContainer = (): number => {
    const parent = ref.current?.parentElement;
    if (!parent) return 1;
    const rect = parent.getBoundingClientRect();
    return orientation === 'vertical' ? rect.width : rect.height;
  };

  const compute = (deltaPx: number, startValue: number, containerSize: number): number => {
    if (unit === 'ratio') {
      return clampPanel(startValue + deltaPx / Math.max(containerSize, 1), min, max);
    }
    return clampPanel(startValue + deltaPx, min, max);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      startPos: orientation === 'vertical' ? e.clientX : e.clientY,
      startValue: value,
      containerSize: measureContainer(),
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>): void => {
    if (!drag.current) return;
    const pos = orientation === 'vertical' ? e.clientX : e.clientY;
    onChange(compute(pos - drag.current.startPos, drag.current.startValue, drag.current.containerSize));
  };

  const stopDrag = (e: React.PointerEvent<HTMLButtonElement>): void => {
    if (!drag.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    const increment = step ?? (unit === 'ratio' ? 0.02 : 8);
    const decrementKey = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp';
    const incrementKey = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown';

    if (e.key === decrementKey) {
      e.preventDefault();
      onChange(clampPanel(value - increment, min, max));
    } else if (e.key === incrementKey) {
      e.preventDefault();
      onChange(clampPanel(value + increment, min, max));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(max);
    }
  };

  return (
    <button
      ref={ref}
      type="button"
      className={`splitter splitter--${orientation}`}
      role="separator"
      aria-label={label}
      title={`${label} (arrastra o usa las flechas; doble clic para restablecer)`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  );
}
