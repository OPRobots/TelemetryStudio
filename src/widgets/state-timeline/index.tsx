import { useEffect, useRef } from 'react';
import type { WidgetProps, WidgetDefinition } from '../interfaces';

interface StateEntry {
  label: string;
  color: string;
}

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

function colorForValue(value: number, map: Record<string, StateEntry>): StateEntry {
  if (map[String(value)]) return map[String(value)];
  const hue = (value * 67) % 360;
  return { label: `S${value}`, color: `hsl(${hue}, 70%, 55%)` };
}

/**
 * Línea de tiempo de estados con indicador del estado actual.
 */
export function StateTimeline({ config, dataFields, frame, context, frames }: WidgetProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cfg = { ...DEFAULT_CONFIG, ...(config as Partial<StateTimelineConfig>) } as StateTimelineConfig;
  const stateMap = cfg.stateMap && Object.keys(cfg.stateMap).length > 0 ? cfg.stateMap : DEFAULT_STATE_MAP;
  const field = dataFields[0];
  const configKey = JSON.stringify({ barHeight: cfg.barHeight, showLabels: cfg.showLabels, stateMap });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(rect.width * dpr, 1);
    canvas.height = Math.max(rect.height * dpr, 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, width, height);

    const state = field ? (frame?.data[field] as number | undefined) : undefined;

    if (state == null) {
      ctx.fillStyle = '#475569';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Sin datos de estado', width / 2, height / 2);
      return;
    }

    const info = colorForValue(state, stateMap);

    // Estado actual (grande)
    ctx.fillStyle = info.color;
    ctx.font = `bold ${Math.min(18, height * 0.32)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = info.color;
    ctx.shadowBlur = 14;
    ctx.fillText(info.label, width / 2, height * 0.26);
    ctx.shadowBlur = 0;

    // Timeline inferior
    const allFrames = frames;
    if (allFrames.length <= 1) return;

    const timelineY = height * 0.58;
    const timelineHeight = Math.min(cfg.barHeight, height * 0.3);
    const offsetX = 8;
    const timelineWidth = width - offsetX * 2;
    const startMs = allFrames[0].timestamp_ms;
    const endMs = allFrames[allFrames.length - 1].timestamp_ms;
    const span = Math.max(endMs - startMs, 1);

    // Dibujar segmentos de estado
    let segStartMs = startMs;
    let segValue = allFrames[0].data[field!] as number | undefined;
    const drawSegment = (fromMs: number, toMs: number, value: number | undefined): void => {
      if (value == null) return;
      const x1 = offsetX + ((fromMs - startMs) / span) * timelineWidth;
      const x2 = offsetX + ((toMs - startMs) / span) * timelineWidth;
      ctx.fillStyle = colorForValue(value, stateMap).color;
      ctx.fillRect(x1, timelineY, Math.max(x2 - x1, 1), timelineHeight);
    };

    for (let i = 1; i < allFrames.length; i++) {
      const value = allFrames[i].data[field!] as number | undefined;
      if (value !== segValue) {
        drawSegment(segStartMs, allFrames[i].timestamp_ms, segValue);
        segStartMs = allFrames[i].timestamp_ms;
        segValue = value;
      }
    }
    drawSegment(segStartMs, endMs, segValue);

    // Cursor de posición actual
    const currentMs = context?.viewTimestamp_ms ?? frame?.timestamp_ms ?? startMs;
    const cursorX = offsetX + ((currentMs - startMs) / span) * timelineWidth;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cursorX, timelineY - 4);
    ctx.lineTo(cursorX, timelineY + timelineHeight + 4);
    ctx.stroke();

    // Etiquetas de transiciones
    if (cfg.showLabels) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      let lastLabel = '';
      let lastX = -Infinity;
      for (let i = 0; i < allFrames.length; i++) {
        const value = allFrames[i].data[field!] as number | undefined;
        if (value == null) continue;
        const label = colorForValue(value, stateMap).label;
        if (label !== lastLabel) {
          const x = offsetX + ((allFrames[i].timestamp_ms - startMs) / span) * timelineWidth;
          if (x - lastX > 40) {
            ctx.fillText(label, x, timelineY + timelineHeight + 4);
            lastX = x;
          }
          lastLabel = label;
        }
      }
    }
  }, [frame, context, frames, field, configKey, stateMap, cfg.barHeight, cfg.showLabels]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}

export const stateTimelineDefinition: WidgetDefinition = {
  metadata: {
    name: 'StateTimeline',
    displayName: 'Línea de estados',
    description: 'Máquina de estados del robot a lo largo del tiempo',
    icon: 'activity',
    category: 'temporal',
    acceptedFieldTypes: ['number', 'boolean'],
    minSize: { width: 6, height: 2 },
    defaultSize: { width: 16, height: 3 },
    defaultConfig: { ...DEFAULT_CONFIG },
    priority: 40,
  },
  component: StateTimeline,
};
