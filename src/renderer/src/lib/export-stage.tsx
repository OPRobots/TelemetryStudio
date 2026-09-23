import { createRoot, type Root } from 'react-dom/client';
import { FrameBus, FrameBusContext } from '@widgets/frame-bus';
import { setWidgetDrawImmediate } from '@widgets/use-widget-draw';
import { widgetRegistry } from '@widgets/widget-registry';
import { valueAt } from '@widgets/frame-lookup';
import { formatLegendValue } from '@widgets/format-value';
import { seriesPalette } from '@widgets/color-palette';
import { reservedLength, wrapByWidth } from '@shared/legend';
import {
  fitRect,
  type CompositionWidget,
  type ExportLayout,
  type Rect,
} from '@shared/export-composition';
import type { TelemetryFrame } from '@core/types/telemetry';
import type { VideoFrameContext } from '@core/types/video';

/** Fondo de las celdas de gráficas cuando el panel es translúcido. */
const PANEL_COLOR = 'rgba(10, 14, 23, 0.72)';
const LABEL_BAR_HEIGHT = 36;
const REFERENCE_HEIGHT = 1080;
const LEGEND_FONT_BASE = 17;

/** Fuente del "chrome" (leyendas/readout), proporcional a la resolución. */
function chromeFont(outputHeight: number): number {
  return Math.max(12, Math.round(LEGEND_FONT_BASE * (outputHeight / 1080)));
}

// --- Medición y análisis previo de valores -------------------------------

let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const canvas = document.createElement('canvas');
    measureCtx = canvas.getContext('2d');
  }
  return measureCtx!;
}

interface ValueSpec {
  key: string;
  get: (frame: TelemetryFrame) => string;
}

interface MaxValueString {
  text: string;
  /** Longitud de reserva: los negativos cuentan +1 (espacio para el signo). */
  length: number;
}

const maxStringCache = new Map<string, Map<string, MaxValueString>>();

/**
 * Cadena formateada **más ancha** de cada campo en todo el dataset (se mide una
 * sola vez y se cachea). Reservar ese ancho evita que las etiquetas se muevan.
 * Los valores negativos cuentan una posición extra para el signo.
 */
function getMaxStrings(
  frames: TelemetryFrame[],
  specs: ValueSpec[],
  signature: string
): Map<string, MaxValueString> {
  const cached = maxStringCache.get(signature);
  if (cached) return cached;

  const longest = new Map<string, MaxValueString>();
  for (const spec of specs) longest.set(spec.key, { text: '', length: 0 });
  for (const frame of frames) {
    for (const spec of specs) {
      const text = spec.get(frame);
      const length = reservedLength(text);
      if (length > (longest.get(spec.key)?.length ?? 0)) longest.set(spec.key, { text, length });
    }
  }
  maxStringCache.set(signature, longest);
  return longest;
}

function datasetSignature(frames: TelemetryFrame[], suffix: string): string {
  const first = frames[0]?.timestamp_ms ?? 0;
  const last = frames[frames.length - 1]?.timestamp_ms ?? 0;
  return `${frames.length}|${first}|${last}|${suffix}`;
}

// --- Layout de la leyenda de la gráfica -----------------------------------

interface LegendItem {
  field: string;
  label: string;
  labelW: number;
  valueW: number;
  width: number;
  color: string;
}

interface LegendLayout {
  rows: LegendItem[][];
  height: number;
  lineHeight: number;
  padY: number;
  gap: number;
  swatchW: number;
  swatchH: number;
}

/**
 * Calcula la leyenda (columnas de ancho fijo y filas con wrap) para el ancho
 * disponible. Se usa tanto para reservar el alto de la franja como para pintarla.
 */
function chartLegendLayout(
  widget: CompositionWidget,
  valueStrings: Map<string, MaxValueString>,
  availableWidth: number,
  font: number
): LegendLayout {
  const fields = widget.dataFields ?? [];
  const ctx = getMeasureCtx();
  ctx.font = `${font}px Inter, system-ui, sans-serif`;
  const cfgColors = widget.config['colors'];
  const colors = Array.isArray(cfgColors) ? (cfgColors as string[]) : seriesPalette(fields.length);
  const gap = font * 0.5;
  const swatchW = font * 1.1;
  const items: LegendItem[] = fields.map((field, i) => {
    const labelW = ctx.measureText(field).width;
    const max = valueStrings.get(field);
    // Reserva la columna del valor (el valor formateado ya incluye el signo).
    const valueW = ctx.measureText(max?.text ?? '').width;
    const width = swatchW + gap * 0.6 + labelW + gap * 0.6 + valueW;
    return { field, label: field, labelW, valueW, width, color: colors[i] ?? '#3b82f6' };
  });

  const rows = wrapByWidth(items, availableWidth, gap);

  const lineHeight = font * 1.35;
  const padY = font * 0.3;
  return {
    rows,
    height: Math.max(rows.length, 1) * lineHeight + padY * 2,
    lineHeight,
    padY,
    gap,
    swatchW,
    swatchH: Math.max(2, Math.round(font * 0.16)),
  };
}

// --- Estilos del host de exportación --------------------------------------

let stylesInjected = false;
function ensureStageStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const style = document.createElement('style');
  // El chrome HTML del widget se sustituye por el que pinta el compositor.
  style.textContent =
    '.export-stage-host .chart-legend, .export-stage-host .minimap-readout { display: none !important; }';
  document.head.appendChild(style);
}

// --- Vista de widgets ------------------------------------------------------

interface StageViewProps {
  layout: ExportLayout;
  widgets: CompositionWidget[];
  getFrames: () => TelemetryFrame[];
  bus: FrameBus;
  scale: number;
  live?: boolean;
  liveWindowMs?: number;
  onCellRef: (widgetId: string, el: HTMLDivElement | null) => void;
}

/**
 * Monta los widgets del board a tamaño de celda (× `scale`) en un contenedor
 * oculto. A las gráficas se les reserva arriba la franja de la leyenda.
 */
function StageView({
  layout,
  widgets,
  getFrames,
  bus,
  scale,
  live,
  liveWindowMs,
  onCellRef,
}: StageViewProps): React.ReactElement {
  const byId = new Map(widgets.map((w) => [w.id, w]));
  const font = chromeFont(layout.height);

  return (
    <FrameBusContext.Provider value={bus}>
      <div
        style={{
          position: 'relative',
          width: layout.width * scale,
          height: layout.height * scale,
          background: layout.background,
        }}
      >
        {layout.items.map((item) => {
          if (item.kind !== 'widget' || !item.widgetId) return null;
          const widget = byId.get(item.widgetId);
          const definition = widget ? widgetRegistry.get(widget.type) : undefined;
          if (!widget || !definition) return null;
          const WidgetComponent = definition.component;
          const cell = item.rect;

          let paddingTop = 0;
          if (widget.type === 'TimeSeriesChart') {
            const valueStrings = getMaxStrings(
              getFrames(),
              (widget.dataFields ?? []).map((field) => ({
                key: field,
                get: (frame) => formatLegendValue(frame.data[field]),
              })),
              datasetSignature(getFrames(), `legend:${(widget.dataFields ?? []).join(',')}`)
            );
            paddingTop = chartLegendLayout(widget, valueStrings, Math.max(cell.w - 16, 40), font)
              .height;
          }

          return (
            <div
              key={item.id}
              ref={(el) => onCellRef(item.widgetId!, el)}
              style={{
                position: 'absolute',
                left: cell.x * scale,
                top: cell.y * scale,
                width: cell.w * scale,
                height: cell.h * scale,
                paddingTop: paddingTop * scale,
                boxSizing: 'border-box',
                overflow: 'hidden',
              }}
            >
              <WidgetComponent
                widgetId={widget.id}
                config={widget.config}
                dataFields={widget.dataFields}
                getFrames={getFrames}
                hoverTimestamp_ms={null}
                live={live}
                liveWindowMs={liveWindowMs}
                lineScale={layout.lineScale}
              />
            </div>
          );
        })}
      </div>
    </FrameBusContext.Provider>
  );
}

export interface ExportStageOptions {
  layout: ExportLayout;
  widgets: CompositionWidget[];
  getFrames: () => TelemetryFrame[];
  videoSize?: { width: number; height: number } | null;
  /** Modo directo (replay): ventana deslizante que termina en el timestamp. */
  live?: boolean;
  liveWindowMs?: number;
}

export interface ExportStage {
  readonly width: number;
  readonly height: number;
  renderFrame(
    video: HTMLVideoElement | null,
    timeMs: number,
    overlay?: { label?: string }
  ): Promise<void>;
  getImageData(): Uint8ClampedArray;
  getCanvas(): HTMLCanvasElement;
  dispose(): void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCells(
  cellRefs: Map<string, HTMLDivElement>,
  expected: number,
  timeoutMs = 1500
): Promise<void> {
  if (expected <= 0) return;
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const ready =
      cellRefs.size >= expected &&
      Array.from(cellRefs.values()).every((el) =>
        Array.from(el.querySelectorAll('canvas')).some((c) => c.getBoundingClientRect().width > 0)
      );
    if (ready) break;
    await delay(16);
  }
  await delay(48);
}

/**
 * Crea el compositor offscreen de la exportación a partir del board. Monta los
 * widgets una vez y, por cada frame, los conduce con el timestamp y dibuja el
 * resultado (vídeo con `contain`/`cover` + celdas de gráficas + leyendas) en un
 * canvas del tamaño final.
 */
export async function createExportStage(options: ExportStageOptions): Promise<ExportStage> {
  const { layout, widgets, getFrames } = options;
  const scale = Math.max(1, Math.round(layout.supersample || 1));
  ensureStageStyles();

  const container = document.createElement('div');
  container.className = 'export-stage-host';
  container.setAttribute('aria-hidden', 'true');
  container.style.cssText = [
    'position:fixed',
    'left:-100000px',
    'top:0',
    `width:${layout.width * scale}px`,
    `height:${layout.height * scale}px`,
    'pointer-events:none',
    'overflow:hidden',
    'z-index:-1',
  ].join(';');
  document.body.appendChild(container);

  const bus = new FrameBus();
  const cellRefs = new Map<string, HTMLDivElement>();
  const root: Root = createRoot(container);
  root.render(
    <StageView
      layout={layout}
      widgets={widgets}
      getFrames={getFrames}
      bus={bus}
      scale={scale}
      live={options.live}
      liveWindowMs={options.liveWindowMs}
      onCellRef={(id, el) => {
        if (el) cellRefs.set(id, el);
        else cellRefs.delete(id);
      }}
    />
  );

  try {
    await document.fonts?.ready;
  } catch {
    // Sin `document.fonts` seguimos igualmente.
  }
  const widgetById = new Map(widgets.map((w) => [w.id, w]));
  const expectedCells = layout.items.filter((item) => {
    if (item.kind !== 'widget' || !item.widgetId) return false;
    const widget = widgetById.get(item.widgetId);
    return !!widget && !!widgetRegistry.get(widget.type);
  }).length;
  await waitForCells(cellRefs, expectedCells);

  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No se pudo crear el canvas de exportación');

  const font = chromeFont(layout.height);

  const drawVideoInto = (rect: Rect, video: HTMLVideoElement | null): void => {
    if (!video || video.videoWidth <= 0) return;
    const fitted = fitRect(
      { width: video.videoWidth, height: video.videoHeight },
      rect,
      layout.videoFit
    );
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.drawImage(video, fitted.x, fitted.y, fitted.w, fitted.h);
    ctx.restore();
  };

  const drawChartLegend = (widget: CompositionWidget, rect: Rect, timeMs: number): void => {
    const fields = widget.dataFields ?? [];
    if (fields.length === 0) return;
    const frames = getFrames();
    const valueStrings = getMaxStrings(
      frames,
      fields.map((field) => ({ key: field, get: (frame) => formatLegendValue(frame.data[field]) })),
      datasetSignature(frames, `legend:${fields.join(',')}`)
    );
    const legend = chartLegendLayout(widget, valueStrings, Math.max(rect.w - 16, 40), font);

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `${font}px Inter, system-ui, sans-serif`;
    legend.rows.forEach((row, r) => {
      const rowWidth = row.reduce((sum, it, i) => sum + it.width + (i > 0 ? legend.gap : 0), 0);
      let x = rect.x + (rect.w - rowWidth) / 2;
      const y = rect.y + legend.padY + legend.lineHeight * (r + 0.5);
      for (const it of row) {
        ctx.fillStyle = it.color;
        ctx.fillRect(x, y - legend.swatchH / 2, legend.swatchW, legend.swatchH);
        x += legend.swatchW + legend.gap * 0.6;
        ctx.fillStyle = '#a2adc0';
        ctx.fillText(it.label, x, y);
        x += it.labelW + legend.gap * 0.6;
        ctx.fillStyle = '#e6eaf2';
        ctx.fillText(formatLegendValue(valueAt(frames, it.field, timeMs)), x, y);
        x += it.valueW + legend.gap;
      }
    });
    ctx.restore();
  };

  const drawMinimapReadout = (widget: CompositionWidget, rect: Rect, timeMs: number): void => {
    const cfg = widget.config;
    const frames = getFrames();
    const fieldX = (cfg['fieldX'] as string) || widget.dataFields[0] || 'position_x';
    const fieldY = (cfg['fieldY'] as string) || widget.dataFields[1] || 'position_y';
    const fieldTheta = (cfg['fieldTheta'] as string) || widget.dataFields[2] || 'heading_deg';
    const specs: ValueSpec[] = [
      { key: 'x', get: (frame) => formatLegendValue(frame.data[fieldX]) },
      { key: 'y', get: (frame) => formatLegendValue(frame.data[fieldY]) },
      {
        key: 'theta',
        get: (frame) => {
          const t = frame.data[fieldTheta];
          return typeof t === 'number' ? `${t.toFixed(1)}°` : '--';
        },
      },
    ];
    const maxStrings = getMaxStrings(
      frames,
      specs,
      datasetSignature(frames, `readout:${fieldX},${fieldY},${fieldTheta}`)
    );

    // Como en la app: monoespaciada para que los dígitos queden tabulados.
    const mono = `${font}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.font = mono;
    const rows = [
      {
        key: 'x',
        label: 'X',
        color: '#3b82f6',
        value: formatLegendValue(valueAt(frames, fieldX, timeMs)),
      },
      {
        key: 'y',
        label: 'Y',
        color: '#22c55e',
        value: formatLegendValue(valueAt(frames, fieldY, timeMs)),
      },
      {
        key: 'theta',
        label: 'θ',
        color: '#F2BE22',
        value: (() => {
          const t = valueAt(frames, fieldTheta, timeMs);
          return typeof t === 'number' ? `${t.toFixed(1)}°` : '--';
        })(),
      },
    ];

    const pad = 10 * (layout.height / 1080);
    const rowH = font * 1.4;
    const dotR = Math.max(2, font * 0.18);
    const gap = font * 0.4;
    const dotW = dotR * 2;
    // Bloque a la izquierda; columna de valores a la derecha con ancho = el mayor
    // de X/Y/θ (valor más largo, signo incluido). Así no se mueve al aparecer
    // negativos.
    const maxLabelW = Math.max(...rows.map((r) => ctx.measureText(r.label).width));
    const maxValueW = Math.max(
      ...rows.map((r) => ctx.measureText(maxStrings.get(r.key)?.text ?? '').width)
    );
    const blockX = rect.x + pad;
    const labelX = blockX + dotW + gap;
    const valueRight = labelX + maxLabelW + gap + maxValueW;

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = mono;
    // Sombra para que el texto se lea sobre la trayectoria (como en la app).
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = Math.max(2, font * 0.25);
    rows.forEach((row, i) => {
      const y = rect.y + pad + font / 2 + i * rowH;
      ctx.fillStyle = row.color;
      ctx.beginPath();
      ctx.arc(blockX + dotR, y, dotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a2adc0';
      ctx.fillText(row.label, labelX, y);
      ctx.fillStyle = '#e6eaf2';
      ctx.textAlign = 'right';
      ctx.fillText(row.value, valueRight, y);
      ctx.textAlign = 'left';
    });
    ctx.restore();
  };

  const drawWidgetCell = (widgetId: string, rect: Rect, panel: string, timeMs: number): void => {
    const cellEl = cellRefs.get(widgetId);
    if (!cellEl) return;
    if (panel === 'translucent') {
      ctx.fillStyle = PANEL_COLOR;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    const cellRect = cellEl.getBoundingClientRect();
    for (const source of Array.from(cellEl.querySelectorAll('canvas'))) {
      const r = source.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      try {
        ctx.drawImage(
          source,
          rect.x + (r.left - cellRect.left) / scale,
          rect.y + (r.top - cellRect.top) / scale,
          r.width / scale,
          r.height / scale
        );
      } catch {
        // Canvas no dibujable (p. ej. sin bitmap): se ignora.
      }
    }

    const widget = widgetById.get(widgetId);
    if (widget?.type === 'TimeSeriesChart') drawChartLegend(widget, rect, timeMs);
    else if (widget?.type === 'Minimap2D') drawMinimapReadout(widget, rect, timeMs);
  };

  const drawItems = (video: HTMLVideoElement | null, timeMs: number): void => {
    for (const item of layout.items) {
      if (item.kind === 'widget' && item.widgetId) {
        drawWidgetCell(item.widgetId, item.rect, item.panel, timeMs);
      } else if (item.kind === 'video') {
        drawVideoInto(item.rect, video);
      }
      // `section`: transparente (no dibuja nada).
    }
  };

  const drawLabel = (label?: string): void => {
    if (!label) return;
    const ratio = layout.height / REFERENCE_HEIGHT;
    const barHeight = Math.max(1, Math.round(LABEL_BAR_HEIGHT * ratio));
    ctx.fillStyle = 'rgba(10, 14, 23, 0.6)';
    ctx.fillRect(0, 0, layout.width, barHeight);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `${Math.round(18 * ratio)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, Math.round(16 * ratio), Math.round(barHeight / 2));
  };

  const renderFrame = async (
    video: HTMLVideoElement | null,
    timeMs: number,
    overlay?: { label?: string }
  ): Promise<void> => {
    const size =
      options.videoSize ??
      (video ? { width: video.videoWidth, height: video.videoHeight } : null);
    const context: VideoFrameContext = {
      currentTime_s: timeMs / 1000,
      mediaTime_s: timeMs / 1000,
      presentedFrames: 0,
      duration_s: 0,
      playbackRate: 1,
      isPlaying: false,
      videoWidth: size?.width ?? 0,
      videoHeight: size?.height ?? 0,
      declaredFps: 30,
      viewTimestamp_ms: timeMs,
    };

    setWidgetDrawImmediate(true);
    try {
      bus.update(null, context);
    } finally {
      setWidgetDrawImmediate(false);
    }
    await Promise.resolve();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, layout.width, layout.height);
    ctx.fillStyle = layout.background;
    ctx.fillRect(0, 0, layout.width, layout.height);

    if (layout.backgroundVideoRect) drawVideoInto(layout.backgroundVideoRect, video);
    drawItems(video, timeMs);
    drawLabel(overlay?.label);
  };

  const getImageData = (): Uint8ClampedArray =>
    ctx.getImageData(0, 0, layout.width, layout.height).data;

  const dispose = (): void => {
    root.unmount();
    container.remove();
    cellRefs.clear();
  };

  return {
    width: layout.width,
    height: layout.height,
    renderFrame,
    getImageData,
    getCanvas: () => canvas,
    dispose,
  };
}
