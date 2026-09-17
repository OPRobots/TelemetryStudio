import { useEffect, useRef } from 'react';
import type { WidgetProps, WidgetDefinition } from '../interfaces';
import { valueAt } from '../frame-lookup';
import { useCanvasSize } from '../use-canvas-size';
import { resolveStateEntry, toStateValue } from './state-entry';
import type { StateEntry, StateValue } from './state-entry';

interface StateTimelineConfig {
  stateMap: Record<string, StateEntry>;
  barHeight: number;
  showLabels: boolean;
}

const DEFAULT_STATE_MAP: Record<string, StateEntry> = {
  '0': { label: 'IDLE', color: '#64748b' },
  '1': { label: 'RUNNING', color: '#22c55e' },
  '2': { label: 'TURNING', color: '#eab308' },
  '3': { label: 'SEARCHING', color: '#06b6d4' },
  '4': { label: 'LOST', color: '#ef4444' },
  '5': { label: 'FINISHED', color: '#a855f7' },
};

const DEFAULT_CONFIG: StateTimelineConfig = {
  stateMap: DEFAULT_STATE_MAP,
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
 * (hover sobre la gráfica / posición del vídeo / último frame).
 */
export function StateTimeline({ config, dataFields, frame, frames, viewTimestamp_ms }: WidgetProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvasRef);

  const cfg = { ...DEFAULT_CONFIG, ...(config as Partial<StateTimelineConfig>) } as StateTimelineConfig;
  const stateMap = cfg.stateMap && Object.keys(cfg.stateMap).length > 0 ? cfg.stateMap : DEFAULT_STATE_MAP;
  const field = dataFields[0];
  const configKey = JSON.stringify({ showLabels: cfg.showLabels, stateMap });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = size.width;
    const height = size.height;
    if (width <= 0 || height <= 0) return;

    canvas.width = Math.max(width * dpr, 1);
    canvas.height = Math.max(height * dpr, 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, width, height);

    const sampled = valueAt(frames, field, viewTimestamp_ms);
    const state = toStateValue(sampled ?? (field ? frame?.data[field] : undefined));

    if (state == null) {
      ctx.fillStyle = '#475569';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Sin datos de estado', width / 2, height / 2);
      return;
    }

    const info = resolveStateEntry(state, stateMap);

    const labelReserve = cfg.showLabels ? LABEL_RESERVE : 0;
    const usableH = Math.max(height - PAD * 2 - labelReserve, 1);
    const timelineHeight = clamp(14, Math.min(cfg.barHeight, usableH * 0.4), 40);
    const timelineY = height - PAD - labelReserve - timelineHeight;
    const labelArea = Math.max(timelineY - PAD, 1);

    // Estado actual (escala con el alto disponible).
    const stateFont = clamp(14, labelArea * 0.55, 26);
    ctx.fillStyle = info.color;
    ctx.font = `bold ${stateFont}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = info.color;
    ctx.shadowBlur = 14;
    ctx.fillText(info.label, width / 2, PAD + labelArea / 2);
    ctx.shadowBlur = 0;

    const allFrames = frames;
    if (allFrames.length <= 1) return;

    const offsetX = 8;
    const timelineWidth = Math.max(width - offsetX * 2, 1);
    const startMs = allFrames[0]!.timestamp_ms;
    const endMs = allFrames[allFrames.length - 1]!.timestamp_ms;
    const span = Math.max(endMs - startMs, 1);

    // Segmentos de estado a lo largo de todo el dataset.
    let segStartMs = startMs;
    let segValue = toStateValue(allFrames[0]!.data[field!]);
    const drawSegment = (fromMs: number, toMs: number, value: StateValue | undefined): void => {
      if (value == null) return;
      const x1 = offsetX + ((fromMs - startMs) / span) * timelineWidth;
      const x2 = offsetX + ((toMs - startMs) / span) * timelineWidth;
      ctx.fillStyle = resolveStateEntry(value, stateMap).color;
      ctx.fillRect(x1, timelineY, Math.max(x2 - x1, 1), timelineHeight);
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

    // Cursor de posición actual (hover / vídeo / último frame).
    const currentMs = viewTimestamp_ms ?? frame?.timestamp_ms ?? startMs;
    const cursorX = offsetX + ((currentMs - startMs) / span) * timelineWidth;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cursorX, timelineY - 4);
    ctx.lineTo(cursorX, timelineY + timelineHeight + 4);
    ctx.stroke();

    // Etiquetas de transiciones.
    if (cfg.showLabels) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      let lastLabel = '';
      let lastX = -Infinity;
      for (let i = 0; i < allFrames.length; i++) {
        const value = toStateValue(allFrames[i]!.data[field!]);
        if (value == null) continue;
        const label = resolveStateEntry(value, stateMap).label;
        if (label !== lastLabel) {
          const x = offsetX + ((allFrames[i]!.timestamp_ms - startMs) / span) * timelineWidth;
          if (x - lastX > 40) {
            ctx.fillText(label, x, timelineY + timelineHeight + 4);
            lastX = x;
          }
          lastLabel = label;
        }
      }
    }
  }, [
    frames,
    frames.length,
    frame,
    field,
    viewTimestamp_ms,
    size.width,
    size.height,
    configKey,
    stateMap,
    cfg.barHeight,
    cfg.showLabels,
  ]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
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
