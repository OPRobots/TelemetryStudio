import { useRef, useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { videoSynchronizer } from '@core/video-synchronizer';
import { formatTime } from '../../lib/time-format';

export function TimelineSlider(): React.ReactElement {
  const currentTime = useAppStore((s) => s.currentTime);
  const duration = useAppStore((s) => s.duration);
  const anchor = useAppStore((s) => s.syncAnchor);

  const draggingRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragValue, setDragValue] = useState(0);
  const [hover, setHover] = useState<{ time: number; x: number } | null>(null);

  // El slider va en tiempo de vídeo absoluto; el tooltip muestra tiempo relativo
  // al anchor (t=0 alineado), así que empieza en 0.
  const anchorSec = anchor ? anchor.video_ms / 1000 : 0;
  const min = anchorSec;
  const max = duration > 0 ? duration : 1;
  // Mientras se arrastra, manda el valor del usuario; si no, la posición real
  const value = draggingRef.current ? dragValue : Math.min(Math.max(currentTime, min), max);

  const updateHover = (clientX: number): void => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    setHover({ time: min + ratio * (max - min), x: ratio * rect.width });
  };

  const hoverFromTime = (t: number): void => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = (t - min) / (max - min || 1);
    setHover({ time: t, x: Math.min(Math.max(ratio, 0), 1) * rect.width });
  };

  return (
    <div
      ref={wrapRef}
      className="timeline-slider-wrap"
      onPointerMove={(e) => updateHover(e.clientX)}
      onPointerLeave={() => {
        if (!draggingRef.current) setHover(null);
      }}
    >
      {hover && (
        <div className="timeline-tooltip" style={{ left: hover.x }}>
          {formatTime(hover.time - anchorSec)}
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={0.001}
        value={value}
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateHover(e.clientX);
        }}
        onChange={(e) => {
          const t = Number(e.target.value);
          draggingRef.current = true;
          setDragValue(t);
          hoverFromTime(t);
          videoSynchronizer.seekTo(t);
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          videoSynchronizer.seekTo(Number(e.currentTarget.value));
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        className="timeline-slider"
      />
    </div>
  );
}
