import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { downsampleLTTB } from '@core/lttb';
import type { TelemetryFrame } from '@core/types/telemetry';
import type { WidgetProps, WidgetDefinition } from '../interfaces';
import { seriesPalette } from '../color-palette';

interface TimeSeriesConfig {
  colors?: string[];
  yLabel?: string;
  yMin?: number;
  yMax?: number;
  /** @deprecated La ventana siempre cubre todo el dataset. */
  windowSeconds?: number;
  maxPoints?: number;
  /** El cursor sigue la posición actual (vídeo/último frame). */
  autoFollow?: boolean;
  /**
   * Suavizado de las líneas: `> 0` usa una spline cúbica monótona (preserva los
   * picos, sin sobrepaso); `0` deja segmentos rectos.
   */
  smoothing?: number;
}

const DEFAULT_CONFIG: Required<TimeSeriesConfig> = {
  colors: [],
  yLabel: '',
  yMin: 0,
  yMax: 0,
  windowSeconds: 10,
  maxPoints: 2000,
  autoFollow: true,
  smoothing: 1,
};

interface SampledData {
  /** Timestamps en segundos (eje X), ordenados. */
  x: number[];
  /** Series alineadas por índice con `x`. */
  series: number[][];
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
}

/**
 * Construye las series muestreadas de TODO el dataset. Se elige un único
 * conjunto de índices (LTTB sobre el primer campo numérico) para que la X y
 * todas las Y queden alineadas por índice.
 */
function buildSampledData(
  frames: TelemetryFrame[],
  fields: string[],
  maxPoints: number
): SampledData | null {
  if (frames.length === 0 || fields.length === 0) return null;

  let indices: number[];
  if (frames.length <= maxPoints) {
    indices = Array.from({ length: frames.length }, (_, i) => i);
  } else {
    const base =
      fields.find((f) => frames.some((fr) => typeof fr.data[f] === 'number')) ?? fields[0]!;
    const points = frames.map((f, i) => {
      const v = f.data[base];
      return { x: i, y: typeof v === 'number' && Number.isFinite(v) ? v : 0 };
    });
    indices = downsampleLTTB(points, maxPoints).map((p) => p.x);
  }

  const x = indices.map((i) => frames[i]!.timestamp_ms / 1000);
  const series = fields.map((field) => indices.map((i) => toNumber(frames[i]!.data[field])));
  return { x, series };
}

/** Índice del valor de `sorted` más cercano a `target`. */
function nearestIndex(sorted: number[], target: number): number {
  if (sorted.length === 0) return -1;
  let low = 0;
  let high = sorted.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid]! < target) low = mid + 1;
    else high = mid;
  }
  if (low > 0 && Math.abs(sorted[low - 1]! - target) <= Math.abs(sorted[low]! - target)) {
    return low - 1;
  }
  return low;
}

/**
 * Gráfica temporal multi-serie (uPlot).
 * Muestra todo el dataset (t=0..final) con zoom por arrastre; doble clic
 * restablece la vista completa. El hover publica el timestamp bajo el cursor
 * para sincronizar el resto de widgets.
 */
export function TimeSeriesChart({
  config,
  dataFields,
  frame,
  context,
  frames,
  viewTimestamp_ms,
  onCursorHover,
}: WidgetProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);

  const hoveringRef = useRef(false);
  const userZoomRef = useRef(false);
  const lastIdxRef = useRef<number | null>(null);
  const xValuesRef = useRef<number[]>([]);
  const framesRef = useRef<TelemetryFrame[] | null>(null);
  const onHoverRef = useRef(onCursorHover);
  onHoverRef.current = onCursorHover;

  const fieldsKey = dataFields.join('|');
  const configKey = JSON.stringify(config ?? {});
  const cfg = { ...DEFAULT_CONFIG, ...(config as TimeSeriesConfig) };
  const fields = dataFields.length > 0 ? dataFields : [];
  const maxPoints = cfg.maxPoints;

  const sampled = useMemo(
    () => buildSampledData(frames, fields, maxPoints),
    // `frames.length` fuerza el recálculo al crecer el dataset en streaming.
    [frames, frames.length, fieldsKey, maxPoints]
  );

  // Crear / recrear uPlot cuando cambian los campos o la configuración.
  useEffect(() => {
    if (!containerRef.current) return;

    const cfgLocal = { ...DEFAULT_CONFIG, ...(JSON.parse(configKey) as TimeSeriesConfig) };
    const fieldList = fieldsKey.length > 0 ? fieldsKey.split('|') : [];

    // Sin colores configurados, paleta de series (viva) según el nº de series.
    const palette =
      cfgLocal.colors.length > 0 ? cfgLocal.colors : seriesPalette(fieldList.length);

    // Spline cúbica monótona: suaviza sin sobrepasar (preserva los picos).
    const smoothPath = cfgLocal.smoothing > 0 ? uPlot.paths.spline?.() : null;

    const series: uPlot.Series[] = [
      { label: 't', value: (_u, v) => (v == null ? '--' : `${(v as number).toFixed(2)}s`) },
      ...fieldList.map((field, i) => ({
        label: field,
        stroke: palette[i % palette.length],
        width: 1.6,
        // Anti-aliasing real: evita el snap a píxel entero del trazo.
        pxAlign: false,
        ...(smoothPath ? { paths: smoothPath } : {}),
        points: { show: false },
      })),
    ];

    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth || 400,
      height: containerRef.current.clientHeight || 200,
      series,
      axes: [
        {
          stroke: '#6b7688',
          font: '11px Inter, sans-serif',
          grid: { stroke: '#1b2230', width: 1 },
          ticks: { stroke: '#2a3342', width: 1 },
        },
        {
          label: cfgLocal.yLabel,
          labelFont: '11px Inter, sans-serif',
          labelSize: 16,
          stroke: '#6b7688',
          font: '11px Inter, sans-serif',
          grid: { stroke: '#1b2230', width: 1 },
          ticks: { stroke: '#2a3342', width: 1 },
          ...(cfgLocal.yMin !== cfgLocal.yMax ? { scale: 'y' } : {}),
        },
      ],
      cursor: {
        x: true,
        y: false,
        drag: { x: true, y: false, setScale: true },
        points: { size: 6 },
      },
      legend: { show: fieldList.length > 1 },
      scales: {
        // auto:false conserva el zoom del usuario entre actualizaciones;
        // el rango completo se fija explícitamente en el efecto de datos.
        x: { time: false, auto: false },
        y: { auto: cfgLocal.yMin === cfgLocal.yMax },
      },
      plugins: [
        {
          hooks: {
            setSelect: [
              (u) => {
                if (u.select.width > 0) userZoomRef.current = true;
              },
            ],
          },
        },
      ],
    };

    const u = new uPlot(opts, [new Float64Array(0)], containerRef.current);
    uplotRef.current = u;

    const over = u.over;
    // El hover real se detecta con eventos de ratón sobre el overlay: el hook
    // `setCursor` de uPlot también se dispara de forma interna (setData/setScale)
    // y marcaría un falso "hover" que bloquea el cursor de reproducción.
    const handleMove = (): void => {
      const idx = u.cursor.idx;
      if (idx == null) return;
      if (idx === lastIdxRef.current) return;
      lastIdxRef.current = idx;
      hoveringRef.current = true;
      const x = xValuesRef.current[idx];
      if (x != null) onHoverRef.current?.(x * 1000);
    };
    const handleLeave = (): void => {
      if (!hoveringRef.current) return;
      hoveringRef.current = false;
      lastIdxRef.current = null;
      onHoverRef.current?.(null);
    };
    const handleDblClick = (): void => {
      userZoomRef.current = false;
      const x = xValuesRef.current;
      if (x.length > 1) u.setScale('x', { min: x[0], max: x[x.length - 1] });
    };
    over.addEventListener('mousemove', handleMove);
    over.addEventListener('mouseleave', handleLeave);
    over.addEventListener('dblclick', handleDblClick);

    return () => {
      over.removeEventListener('mousemove', handleMove);
      over.removeEventListener('mouseleave', handleLeave);
      over.removeEventListener('dblclick', handleDblClick);
      u.destroy();
      uplotRef.current = null;
    };
  }, [fieldsKey, configKey]);

  // Volcar datos al gráfico (solo cuando cambia el dataset muestreado).
  useEffect(() => {
    const u = uplotRef.current;
    if (!u) return;

    // Un dataset nuevo (referencia distinta) resetea el zoom.
    if (framesRef.current !== frames) {
      framesRef.current = frames;
      userZoomRef.current = false;
    }

    if (!sampled) {
      xValuesRef.current = [];
      u.setData([new Float64Array(0)]);
      return;
    }

    xValuesRef.current = sampled.x;
    u.setData([sampled.x, ...sampled.series] as uPlot.AlignedData);

    // Escala Y fija si el usuario la definió.
    if (cfg.yMin !== cfg.yMax) {
      u.setScale('y', { min: cfg.yMin, max: cfg.yMax });
    }

    // Rango X completo (t=0..final) salvo que el usuario haya hecho zoom.
    if (!userZoomRef.current) {
      if (sampled.x.length > 1) {
        u.setScale('x', { min: sampled.x[0], max: sampled.x[sampled.x.length - 1] });
      } else {
        const only = sampled.x[0] ?? 0;
        u.setScale('x', { min: only - 1, max: only + 1 });
      }
    }
  }, [sampled, frames, cfg.yMin, cfg.yMax]);

  // Mover el cursor a la posición actual (no pisar el hover del usuario).
  useEffect(() => {
    const u = uplotRef.current;
    if (!u || !cfg.autoFollow || hoveringRef.current) return;
    const x = xValuesRef.current;
    if (x.length === 0) return;
    const currentMs = viewTimestamp_ms ?? context?.viewTimestamp_ms ?? frame?.timestamp_ms;
    if (currentMs == null) return;
    const idx = nearestIndex(x, currentMs / 1000);
    if (idx >= 0) {
      u.setCursor({ left: u.valToPos(x[idx]!, 'x'), top: 0 }, false);
    }
  }, [sampled, viewTimestamp_ms, frame, context, cfg.autoFollow]);

  // Redimensionar con el contenedor.
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
      yLabel: '',
      autoFollow: true,
      maxPoints: 2000,
      smoothing: 1,
    },
    priority: 10,
  },
  component: TimeSeriesChart,
};
