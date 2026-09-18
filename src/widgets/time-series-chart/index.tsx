import { useCallback, useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { frameRangeBounds } from '@core/binary-search';
import type { WidgetProps, WidgetDefinition } from '../interfaces';
import { seriesPalette } from '../color-palette';
import { useFrameBus } from '../frame-bus';
import { useWidgetDraw } from '../use-widget-draw';
import { buildSampledData, type SampledData } from './sample-data';

interface TimeSeriesConfig {
  colors?: string[];
  yLabel?: string;
  yMin?: number;
  yMax?: number;
  maxPoints?: number;
  /** El cursor sigue la posición actual (vídeo/último frame). */
  autoFollow?: boolean;
  /**
   * Suavizado de las líneas: `> 0` usa una spline cúbica monótona (preserva los
   * picos, sin sobrepasar); `0` deja segmentos rectos.
   */
  smoothing?: number;
}

const DEFAULT_CONFIG: Required<TimeSeriesConfig> = {
  colors: [],
  yLabel: '',
  yMin: 0,
  yMax: 0,
  maxPoints: 2000,
  autoFollow: true,
  smoothing: 1,
};

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
  getFrames,
  hoverTimestamp_ms,
  onCursorHover,
  zoomRange,
  onZoomRangeChange,
}: WidgetProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);
  const bus = useFrameBus();

  const hoveringRef = useRef(false);
  const userZoomPendingRef = useRef(false);
  const lastIdxRef = useRef<number | null>(null);
  const xValuesRef = useRef<number[]>([]);
  const onHoverRef = useRef(onCursorHover);
  onHoverRef.current = onCursorHover;
  const onZoomRef = useRef(onZoomRangeChange);
  onZoomRef.current = onZoomRangeChange;

  const fieldsKey = dataFields.join('|');
  const configKey = JSON.stringify(config ?? {});
  const fields = dataFields.length > 0 ? dataFields : [];

  const latest = useRef({ getFrames, fields, fieldsKey, config, hoverTimestamp_ms, zoomRange });
  latest.current = { getFrames, fields, fieldsKey, config, hoverTimestamp_ms, zoomRange };

  const sampledRef = useRef<{ sig: string; data: SampledData | null }>({ sig: '', data: null });
  const scaleSigRef = useRef<string>('');

  const draw = useCallback(() => {
    const u = uplotRef.current;
    if (!u) return;

    const { getFrames, fields, fieldsKey, config, hoverTimestamp_ms, zoomRange } = latest.current;
    const frames = getFrames();
    const cfgLocal = { ...DEFAULT_CONFIG, ...(config as TimeSeriesConfig) };

    // Firma del muestreo: con zoom, la ventana visible (+vecinos) y su último
    // timestamp; sin zoom, el dataset completo por longitud.
    const bounds = zoomRange
      ? frameRangeBounds(frames, zoomRange.startMs, zoomRange.endMs)
      : null;
    const sampleSig = bounds
      ? `${fieldsKey}|${cfgLocal.maxPoints}|${bounds.start}:${bounds.end}:${
          frames[bounds.end]?.timestamp_ms ?? 0
        }`
      : `${fieldsKey}|${cfgLocal.maxPoints}|full:${frames.length}`;
    if (sampledRef.current.sig !== sampleSig) {
      sampledRef.current = {
        sig: sampleSig,
        data: buildSampledData(frames, fields, cfgLocal.maxPoints, zoomRange),
      };
    }

    const sampled = sampledRef.current.data;
    if (!sampled) {
      xValuesRef.current = [];
      u.setData([new Float64Array(0)]);
      return;
    }

    // Datos: solo se vuelcan cuando cambia el dataset (firma).
    const dataChanged = xValuesRef.current !== sampled.x;
    if (dataChanged) {
      xValuesRef.current = sampled.x;
      u.setData([sampled.x, ...sampled.series] as uPlot.AlignedData);
    }

    // Escalas: solo al cambiar datos, zoom o rango Y (no pisa el arrastre de zoom).
    const xRange = zoomRange ? `${zoomRange.startMs}:${zoomRange.endMs}` : 'full';
    const scaleSig = `${sampleSig}|${cfgLocal.yMin}:${cfgLocal.yMax}|${xRange}`;
    if (scaleSigRef.current !== scaleSig) {
      scaleSigRef.current = scaleSig;
      if (cfgLocal.yMin !== cfgLocal.yMax) {
        u.setScale('y', { min: cfgLocal.yMin, max: cfgLocal.yMax });
      }
      if (zoomRange) {
        u.setScale('x', { min: zoomRange.startMs / 1000, max: zoomRange.endMs / 1000 });
      } else if (sampled.x.length > 1) {
        u.setScale('x', { min: sampled.x[0], max: sampled.x[sampled.x.length - 1] });
      } else {
        const only = sampled.x[0] ?? 0;
        u.setScale('x', { min: only - 1, max: only + 1 });
      }
    }

    // Cursor a la posición actual (no pisar el hover del usuario).
    if (cfgLocal.autoFollow && !hoveringRef.current) {
      const x = xValuesRef.current;
      if (x.length > 0) {
        const snapshot = bus?.getSnapshot();
        const currentMs =
          hoverTimestamp_ms ?? snapshot?.context?.viewTimestamp_ms ?? snapshot?.frame?.timestamp_ms;
        if (currentMs != null) {
          const idx = nearestIndex(x, currentMs / 1000);
          if (idx >= 0) {
            u.setCursor({ left: u.valToPos(x[idx]!, 'x'), top: 0 }, false);
          }
        }
      }
    }
  }, [bus]);

  const schedule = useWidgetDraw(draw, [
    getFrames,
    fieldsKey,
    configKey,
    hoverTimestamp_ms,
    zoomRange,
  ]);

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
            // Marca que el usuario está arrastrando para hacer zoom.
            setSelect: [
              (u) => {
                if (u.select.width > 0) userZoomPendingRef.current = true;
              },
            ],
            // uPlot aplica la escala del arrastre DESPUÉS de nuestro mouseup
            // (su handler está en `document`), así que publicamos desde aquí,
            // cuando la escala ya es la definitiva.
            setScale: [
              (u, key) => {
                if (key !== 'x' || !userZoomPendingRef.current) return;
                userZoomPendingRef.current = false;
                const min = u.scales.x?.min;
                const max = u.scales.x?.max;
                if (min == null || max == null || !Number.isFinite(min) || !Number.isFinite(max)) {
                  return;
                }
                onZoomRef.current?.({ startMs: min * 1000, endMs: max * 1000 });
              },
            ],
          },
        },
      ],
    };

    // Al recrear, forzar volcado de datos y escalas.
    sampledRef.current = { sig: '', data: null };
    scaleSigRef.current = '';

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
      onZoomRef.current?.(null);
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

  // Redimensionar con el contenedor.
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && uplotRef.current) {
        uplotRef.current.setSize({ width: Math.max(rect.width, 50), height: Math.max(rect.height, 50) });
        schedule();
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [schedule]);

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
