import { useCallback, useRef, useState } from 'react';
import type { WidgetProps, WidgetDefinition } from '../interfaces';
import { valueAt } from '../frame-lookup';
import { useCanvasSize } from '../use-canvas-size';
import { lighten, statePalette } from '../color-palette';
import { makeRange } from '../zoom-range';
import { resolveViewTimestamp, useFrameBus } from '../frame-bus';
import { useWidgetDraw } from '../use-widget-draw';
import { DEFAULT_LIVE_WINDOW_MS, liveRange } from '../live-view';
import { collectStateKeys, resolveStateEntry, toStateValue } from './state-entry';
import type { StateEntry, StateValue } from './state-entry';

interface StateTimelineConfig {
  stateMap: Record<string, StateEntry>;
  barHeight: number;
  showLabels: boolean;
}

const DEFAULT_CONFIG: StateTimelineConfig = {
  stateMap: {},
  barHeight: 26,
  showLabels: true,
};

const PAD = 12;
const LABEL_RESERVE = 16;

function clamp(lo: number, value: number, hi: number): number {
  return Math.max(lo, Math.min(value, hi));
}

/**
 * Línea de tiempo de estados con indicador del estado actual.
 * El texto, el cursor y la barra reflejan el timestamp visualizado
 * (hover sobre cualquier widget / posición del vídeo / último frame).
 * Al pasar el ratón por encima también publica el timestamp bajo el cursor,
 * igual que la gráfica temporal.
 */
export function StateTimeline({
  config,
  dataFields,
  getFrames,
  hoverTimestamp_ms,
  onCursorHover,
  zoomRange,
  onZoomRangeChange,
  live,
  liveWindowMs,
}: WidgetProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvasRef);
  const bus = useFrameBus();
  // Rango visible (zoom o dataset completo) para traducir la x a timestamp.
  const hitRef = useRef<{ startMs: number; endMs: number; offsetX: number; timelineWidth: number } | null>(
    null
  );
  // Selección en curso (arrastrar para hacer zoom).
  const dragRef = useRef<{ pointerId: number; startX: number } | null>(null);
  const [selection, setSelection] = useState<{ x0: number; x1: number } | null>(null);
  const onZoomRef = useRef(onZoomRangeChange);
  onZoomRef.current = onZoomRangeChange;

  const localX = (clientX: number): number => {
    const canvas = canvasRef.current;
    return canvas ? clientX - canvas.getBoundingClientRect().left : 0;
  };

  const publishHover = (clientX: number): void => {
    const canvas = canvasRef.current;
    const hit = hitRef.current;
    if (!canvas || !hit || !onCursorHover) return;
    const ratio = (clientX - canvas.getBoundingClientRect().left - hit.offsetX) / hit.timelineWidth;
    const clamped = Math.min(Math.max(ratio, 0), 1);
    onCursorHover(hit.startMs + clamped * (hit.endMs - hit.startMs));
  };

  const cfg = { ...DEFAULT_CONFIG, ...(config as Partial<StateTimelineConfig>) } as StateTimelineConfig;
  const field = dataFields[0];
  const stateMap = cfg.stateMap ?? {};
  const stateMapKey = Object.keys(stateMap).sort().join('|');

  const colorsCacheRef = useRef<{ sig: string; colors: Record<string, string> }>({
    sig: '',
    colors: {},
  });
  // Capa estática (fondo + segmentos + etiquetas), cacheada en un canvas aparte.
  const baseRef = useRef<{ canvas: HTMLCanvasElement | null; sig: string }>({ canvas: null, sig: '' });
  const latest = useRef({
    getFrames,
    field,
    hoverTimestamp_ms,
    zoomRange,
    live,
    liveWindowMs,
    cfg,
    selection,
    size,
  });
  latest.current = {
    getFrames,
    field,
    hoverTimestamp_ms,
    zoomRange,
    live,
    liveWindowMs,
    cfg,
    selection,
    size,
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { getFrames, field, hoverTimestamp_ms, zoomRange, live, liveWindowMs, cfg, selection, size } =
      latest.current;
    const frames = getFrames();
    const stateMap = cfg.stateMap ?? {};
    const stateMapKey = Object.keys(stateMap).sort().join('|');
    const snapshot = bus?.getSnapshot() ?? { frame: null, context: null };
    const viewTimestamp = resolveViewTimestamp(frames, hoverTimestamp_ms, snapshot);

    // Color de paleta por estado (cacheado por dataset/config).
    const colorsSig = `${frames.length}|${field ?? ''}|${stateMapKey}`;
    if (colorsCacheRef.current.sig !== colorsSig) {
      const keys = collectStateKeys(frames, field, stateMap);
      const palette = statePalette(keys.length);
      const byKey: Record<string, string> = {};
      keys.forEach((key, i) => {
        byKey[key] = palette[i] ?? palette[0] ?? '#5b8dd9';
      });
      colorsCacheRef.current = { sig: colorsSig, colors: byKey };
    }
    const stateColors = colorsCacheRef.current.colors;

    const dpr = window.devicePixelRatio || 1;
    const width = size.width;
    const height = size.height;
    if (width <= 0 || height <= 0) return;

    // Se rehace en cada repintado; si no hay timeline dibujada, el hover no mapea.
    hitRef.current = null;

    canvas.width = Math.max(width * dpr, 1);
    canvas.height = Math.max(height * dpr, 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sampled = valueAt(frames, field, viewTimestamp);
    const state = toStateValue(sampled ?? (field ? snapshot.frame?.data[field] : undefined));

    if (state == null) {
      ctx.fillStyle = '#0a0e17';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#475569';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Sin datos de estado', width / 2, height / 2);
      return;
    }

    const labelReserve = cfg.showLabels ? LABEL_RESERVE : 0;
    const usableH = Math.max(height - PAD * 2 - labelReserve, 1);
    const timelineHeight = clamp(14, Math.min(cfg.barHeight, usableH * 0.4), 40);
    const timelineY = height - PAD - labelReserve - timelineHeight;
    const labelArea = Math.max(timelineY - PAD, 1);

    const allFrames = frames;
    const offsetX = 8;
    const timelineWidth = Math.max(width - offsetX * 2, 1);
    const startMs = allFrames.length > 0 ? allFrames[0]!.timestamp_ms : 0;
    const endMs = allFrames.length > 0 ? allFrames[allFrames.length - 1]!.timestamp_ms : 0;
    // Modo directo: la barra avanza hasta el timestamp visualizado.
    const liveView =
      live && viewTimestamp != null
        ? liveRange(viewTimestamp, liveWindowMs ?? DEFAULT_LIVE_WINDOW_MS)
        : null;
    const viewRange = liveView ?? zoomRange;
    const viewStartMs = viewRange ? Math.max(viewRange.startMs, startMs) : startMs;
    const viewEndMs = viewRange ? Math.min(viewRange.endMs, endMs) : endMs;
    const span = Math.max(viewEndMs - viewStartMs, 1);

    // --- Capa estática (fondo + segmentos + etiquetas) ---
    let base = baseRef.current.canvas;
    if (!base) {
      base = document.createElement('canvas');
      baseRef.current.canvas = base;
    }
    const baseSig = `${frames.length}|${field ?? ''}|${stateMapKey}|${
      zoomRange ? `${viewStartMs}:${viewEndMs}` : 'full'
    }|${Math.round(width)}x${Math.round(height)}|${cfg.barHeight}|${cfg.showLabels}`;
    if (baseRef.current.sig !== baseSig) {
      base.width = Math.max(width * dpr, 1);
      base.height = Math.max(height * dpr, 1);
      const bctx = base.getContext('2d');
      if (bctx) {
        bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        bctx.fillStyle = '#0a0e17';
        bctx.fillRect(0, 0, width, height);

        if (allFrames.length > 1) {
          let segStartMs = startMs;
          let segValue = toStateValue(allFrames[0]!.data[field!]);
          const drawSegment = (fromMs: number, toMs: number, value: StateValue | undefined): void => {
            if (value == null) return;
            const a = Math.max(fromMs, viewStartMs);
            const b = Math.min(toMs, viewEndMs);
            if (b <= a) return;
            const x1 = offsetX + ((a - viewStartMs) / span) * timelineWidth;
            const x2 = offsetX + ((b - viewStartMs) / span) * timelineWidth;
            bctx.fillStyle = resolveStateEntry(value, stateMap, stateColors[String(value)]).color;
            bctx.fillRect(x1, timelineY, Math.max(x2 - x1, 1), timelineHeight);
          };
          for (let i = 1; i < allFrames.length; i++) {
            const value = toStateValue(allFrames[i]!.data[field!]);
            if (value !== segValue) {
              drawSegment(segStartMs, allFrames[i]!.timestamp_ms, segValue);
              segStartMs = allFrames[i]!.timestamp_ms;
              segValue = value;
            }
          }
          drawSegment(segStartMs, endMs, segValue);

          if (cfg.showLabels) {
            bctx.fillStyle = '#94a3b8';
            bctx.font = '10px "JetBrains Mono", monospace';
            bctx.textAlign = 'center';
            bctx.textBaseline = 'top';
            let lastLabel = '';
            let lastX = -Infinity;
            for (let i = 0; i < allFrames.length; i++) {
              const value = toStateValue(allFrames[i]!.data[field!]);
              if (value == null) continue;
              const label = resolveStateEntry(value, stateMap, stateColors[String(value)]).label;
              if (label !== lastLabel) {
                const t = allFrames[i]!.timestamp_ms;
                if (t >= viewStartMs && t <= viewEndMs) {
                  const x = offsetX + ((t - viewStartMs) / span) * timelineWidth;
                  if (x - lastX > 40) {
                    bctx.fillText(label, x, timelineY + timelineHeight + 4);
                    lastX = x;
                  }
                }
                lastLabel = label;
              }
            }
          }
        }
      }
      baseRef.current.sig = baseSig;
    }
    ctx.drawImage(base, 0, 0, width, height);

    // --- Dinámico: estado actual, cursor y selección ---

    // Estado actual (escala con el alto disponible). El texto se aclara para
    // que siga siendo legible sobre el fondo oscuro aunque el color sea oscuro.
    const info = resolveStateEntry(state, stateMap, stateColors[String(state)]);
    const stateFont = clamp(14, labelArea * 0.55, 26);
    ctx.fillStyle = lighten(info.color, 0.45);
    ctx.font = `bold ${stateFont}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = info.color;
    ctx.shadowBlur = 14;
    ctx.fillText(info.label, width / 2, PAD + labelArea / 2);
    ctx.shadowBlur = 0;

    if (allFrames.length <= 1) return;

    hitRef.current = { startMs: viewStartMs, endMs: viewEndMs, offsetX, timelineWidth };

    // Cursor de posición actual (solo si cae dentro del span visible).
    const currentMs = viewTimestamp ?? snapshot.frame?.timestamp_ms ?? startMs;
    if (currentMs >= viewStartMs && currentMs <= viewEndMs) {
      const cursorX = offsetX + ((currentMs - viewStartMs) / span) * timelineWidth;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cursorX, timelineY - 4);
      ctx.lineTo(cursorX, timelineY + timelineHeight + 4);
      ctx.stroke();
    }

    // Rectángulo de selección de zoom (mismo estilo que el de uPlot:
    // relleno azul translúcido + borde azul, cubriendo toda la altura).
    if (selection) {
      const sx1 = Math.min(selection.x0, selection.x1);
      const sx2 = Math.max(selection.x0, selection.x1);
      const rectW = Math.max(sx2 - sx1, 1);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.18)';
      ctx.fillRect(sx1, 0, rectW, height);
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx1 + 0.5, 0.5, rectW - 1, height - 1);
    }
  }, [bus]);

  useWidgetDraw(draw, [
    getFrames,
    field,
    hoverTimestamp_ms,
    zoomRange,
    live,
    liveWindowMs,
    selection,
    size.width,
    size.height,
    stateMapKey,
    cfg.barHeight,
    cfg.showLabels,
  ]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const x = localX(e.clientX);
    dragRef.current = { pointerId: e.pointerId, startX: x };
    setSelection({ x0: x, x1: x });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer no activo (p. ej. eventos sintéticos en tests).
    }
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (dragRef.current) {
      setSelection({ x0: dragRef.current.startX, x1: localX(e.clientX) });
      return;
    }
    publishHover(e.clientX);
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setSelection(null);
    const x = localX(e.clientX);
    const hit = hitRef.current;
    if (!hit || Math.abs(x - drag.startX) < 6) return;
    const msAt = (px: number): number => {
      const ratio = (px - hit.offsetX) / hit.timelineWidth;
      return hit.startMs + Math.min(Math.max(ratio, 0), 1) * (hit.endMs - hit.startMs);
    };
    onZoomRef.current?.(makeRange(msAt(drag.startX), msAt(x)));
  };
  const handlePointerLeave = (): void => {
    if (!dragRef.current) onCursorHover?.(null);
  };
  const handleDoubleClick = (): void => {
    onZoomRef.current?.(null);
  };

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full"
      style={{ cursor: 'crosshair' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onDoubleClick={handleDoubleClick}
    />
  );
}

export const stateTimelineDefinition: WidgetDefinition = {
  metadata: {
    name: 'StateTimeline',
    displayName: 'Línea de estados',
    description: 'Máquina de estados del robot a lo largo del tiempo',
    icon: 'activity',
    category: 'temporal',
    acceptedFieldTypes: ['number', 'boolean', 'string'],
    minSize: { width: 6, height: 2 },
    defaultSize: { width: 16, height: 3 },
    defaultConfig: { ...DEFAULT_CONFIG },
    priority: 40,
  },
  component: StateTimeline,
};
