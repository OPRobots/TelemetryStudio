import { useRef } from 'react';

interface RangeSliderProps {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  /** Rango fijo resaltado (p. ej. los datos de telemetría). */
  band?: [number, number] | null;
  bandLabel?: string;
  idStart?: string;
  idEnd?: string;
}

/**
 * Slider de dos asas (inicio/fin) sobre una pista común, con una banda fija
 * opcional. Se apoya en dos `<input type="range">` nativos (accesibles por
 * teclado y compatibles con los tests e2e); las asas no pueden cruzarse.
 */
export function RangeSlider({
  min,
  max,
  step,
  value,
  onChange,
  band,
  bandLabel,
  idStart,
  idEnd,
}: RangeSliderProps): React.ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [start, end] = value;
  const safeStep = step > 0 ? step : 0.001;
  const span = Math.max(max - min, safeStep);
  const pct = (v: number): number => Math.max(0, Math.min(100, ((v - min) / span) * 100));

  const setStart = (v: number): void => {
    const next = Math.min(Math.max(v, min), Math.max(min, end - safeStep));
    onChange([next, end]);
  };
  const setEnd = (v: number): void => {
    const next = Math.max(Math.min(v, max), Math.min(max, start + safeStep));
    onChange([start, next]);
  };

  const moveNearest = (clientX: number): void => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const v = min + ratio * span;
    if (Math.abs(v - start) <= Math.abs(v - end)) setStart(v);
    else setEnd(v);
  };

  return (
    <div
      ref={wrapRef}
      className="range-slider"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        moveNearest(e.clientX);
      }}
    >
      <div className="range-slider__track" />
      {band && band[1] > band[0] && (
        <div
          className="range-slider__band"
          style={{ left: `${pct(band[0])}%`, width: `${pct(band[1]) - pct(band[0])}%` }}
          title={bandLabel}
        />
      )}
      <div
        className="range-slider__fill"
        style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }}
      />
      <input
        id={idStart}
        className="range-slider__input"
        type="range"
        min={min}
        max={max}
        step={safeStep}
        value={start}
        aria-label="Inicio del rango"
        onChange={(e) => setStart(Number(e.target.value))}
      />
      <input
        id={idEnd}
        className="range-slider__input"
        type="range"
        min={min}
        max={max}
        step={safeStep}
        value={end}
        aria-label="Fin del rango"
        onChange={(e) => setEnd(Number(e.target.value))}
      />
    </div>
  );
}
