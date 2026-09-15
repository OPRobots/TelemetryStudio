import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { findFramesInRange } from '@core/binary-search';
import { downsampleLTTB, framesToLTTBPoints } from '@core/lttb';
import type { WidgetProps } from '../interfaces';
import type { WidgetDefinition } from '../interfaces';

export const DEFAULT_SERIES_COLORS = [
  '#3b82f6',
  '#F2BE22',
  '#22c55e',
  '#ef4444',
  '#a855f7',
  '#06b6d4',
  '#f97316',
  '#14b8a6',
  '#e879f9',
  '#84cc16',
];

interface TimeSeriesConfig {
  colors?: string[];
  yLabel?: string;
  yMin?: number;
  yMax?: number;
  windowSeconds?: number;
  maxPoints?: number;
  autoFollow?: boolean;
  smoothing?: number;
}

const DEFAULT_CONFIG: Required<TimeSeriesConfig> = {
  colors: DEFAULT_SERIES_COLORS,
  yLabel: '',
  yMin: 0,
  yMax: 0,
  windowSeconds: 10,
  maxPoints: 800,
  autoFollow: true,
  smoothing: 0,
};

/**
 * Gráfica temporal multi-serie (uPlot).
 * Permite graficar varios campos de telemetría en una sola gráfica.
 */
export function TimeSeriesChart({ config, dataFields, frame, context, frames }: WidgetProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);
  const fieldsKey = dataFields.join('|');
  const configKey = JSON.stringify(config ?? {});

  // Crear / recrear uPlot cuando cambian los campos
  useEffect(() => {
    if (!containerRef.current) return;

    const cfg = { ...DEFAULT_CONFIG, ...(config as TimeSeriesConfig) };
    const fields = dataFields.length > 0 ? dataFields : [];

    const series: uPlot.Series[] = [
      { label: 't', value: (_u, v) => (v == null ? '--' : `${(v as number).toFixed(2)}s`) },
      ...fields.map((field, i) => ({
        label: field,
        stroke: cfg.colors[i % cfg.colors.length],
        width: 1.6,
        points: { show: false },
      })),
    ];

    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth || 400,
      height: containerRef.current.clientHeight || 200,
      series,
      axes: [
        {
          stroke: '#64748b',
          grid: { stroke: '#1e293b' },
          ticks: { stroke: '#1e293b' },
        },
        {
          label: cfg.yLabel,
          stroke: '#64748b',
          grid: { stroke: '#1e293b' },
          ticks: { stroke: '#1e293b' },
          ...(cfg.yMin !== cfg.yMax ? { scale: 'y' } : {}),
        },
      ],
      cursor: {
        drag: { x: true, y: false, setScale: true },
        points: { size: 6 },
      },
      legend: { show: fields.length > 1 },
      scales: {
        x: { time: false },
        y: { auto: true },
      },
      plugins: [cursorSyncPlugin()],
    };

    uplotRef.current = new uPlot(opts, [new Float64Array(0)], containerRef.current);

    return () => {
      uplotRef.current?.destroy();
      uplotRef.current = null;
    };
  }, [fieldsKey, configKey]);

  // Actualizar datos en cada frame sincronizado
  useEffect(() => {
    const u = uplotRef.current;
    if (!u) return;

    const cfg = { ...DEFAULT_CONFIG, ...(config as TimeSeriesConfig) };
    const fields = dataFields.length > 0 ? dataFields : [];
    const allFrames = frames;
    if (allFrames.length === 0 || fields.length === 0) {
      u.setData([new Float64Array(0)]);
      return;
    }

    const currentMs = context?.viewTimestamp_ms ?? frame?.timestamp_ms ?? allFrames[0].timestamp_ms;

    let windowFrames = allFrames;
    if (cfg.autoFollow) {
      const half = (cfg.windowSeconds * 1000) / 2;
      windowFrames = findFramesInRange(allFrames, currentMs - half, currentMs + half);
      if (windowFrames.length < 2) {
        // Fallback: ventana mínima alrededor del inicio
        windowFrames = allFrames.slice(0, Math.min(allFrames.length, 60));
      }
    }

    const xValues = downsampleLTTB(
      windowFrames.map((f, i) => ({ x: i, y: f.timestamp_ms / 1000 })),
      cfg.maxPoints
    ).map((p) => p.y);

    const seriesData: uPlot.AlignedData = [xValues as unknown as number[]];
    for (const field of fields) {
      const points = framesToLTTBPoints(windowFrames, field);
      const sampled = downsampleLTTB(points, cfg.maxPoints);
      // Alinear longitudes: si el campo tiene huecos, rellenar con null
      const ys = alignToLength(sampled.map((p) => p.y), xValues.length);
      (seriesData as number[][]).push(ys);
    }

    u.setData(seriesData);

    // Ajustar escala Y si el usuario fijó min/max
    if (cfg.yMin !== cfg.yMax) {
      u.setScale('y', { min: cfg.yMin, max: cfg.yMax });
    }

    // Mover el cursor a la posición actual
    if (cfg.autoFollow && xValues.length > 0) {
      let idx = 0;
      for (let i = 0; i < xValues.length; i++) {
        if (xValues[i] <= currentMs / 1000) idx = i;
        else break;
      }
      u.setCursor({ left: u.valToPos(xValues[idx]!, 'x'), top: 0 }, false);
    }
  }, [frame, context, fieldsKey, configKey, dataFields, config, frames]);

  // Redimensionar con el contenedor
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && uplotRef.current) {
        uplotRef.current.setSize({ width: Math.max(rect.width, 50), height: Math.max(rect.height, 50) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ backgroundColor: '#0a0e17', overflow: 'hidden' }}
    />
  );
}

function alignToLength(values: number[], targetLength: number): number[] {
  if (values.length === targetLength) return values;
  const out = new Array<number>(targetLength).fill(NaN);
  for (let i = 0; i < values.length && i < targetLength; i++) {
    out[i] = values[i]!;
  }
  return out;
}

/**
 * Plugin que emite el índice del cursor para sincronizar con otros widgets.
 */
function cursorSyncPlugin(): uPlot.Plugin {
  return {
    hooks: {
      setCursor: [
        (u) => {
          const idx = u.cursor.idx;
          if (idx != null) {
            // Hook de extensión futura (sincronización de cursores entre widgets)
          }
        },
      ],
    },
  };
}

export const timeSeriesChartDefinition: WidgetDefinition = {
  metadata: {
    name: 'TimeSeriesChart',
    displayName: 'Gráfica temporal',
    description: 'Series de datos continuos con múltiples valores por gráfica',
    icon: 'chart-line',
    category: 'chart',
    acceptedFieldTypes: ['number'],
    minSize: { width: 6, height: 4 },
    defaultSize: { width: 12, height: 6 },
    defaultConfig: {
      colors: DEFAULT_SERIES_COLORS,
      yLabel: '',
      autoFollow: true,
      windowSeconds: 10,
      maxPoints: 800,
    },
    priority: 10,
  },
  component: TimeSeriesChart,
};
