import { createRoot, type Root } from 'react-dom/client';
import { FrameBus, FrameBusContext } from '@widgets/frame-bus';
import { setWidgetDrawImmediate } from '@widgets/use-widget-draw';
import { widgetRegistry } from '@widgets/widget-registry';
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
 * oculto. El vídeo y las secciones los pinta el compositor (canvas).
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
  /**
   * Fija el frame de telemetría del instante `timeMs` y compone la imagen.
   * `overlay.label` dibuja la etiqueta de sesión (si se indica).
   */
  renderFrame(
    video: HTMLVideoElement | null,
    timeMs: number,
    overlay?: { label?: string }
  ): Promise<void>;
  /** Píxeles RGBA del último frame compuesto. */
  getImageData(): Uint8ClampedArray;
  /** Canvas interno con el último frame compuesto (para la previsualización). */
  getCanvas(): HTMLCanvasElement;
  dispose(): void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Espera (sin depender de `requestAnimationFrame`, que se limita con ventanas
 * ocultas) a que los widgets hayan medido su contenedor y sus canvas tengan
 * tamaño. Da un margen extra para que React aplique el estado de tamaño.
 */
async function waitForCells(cellRefs: Map<string, HTMLDivElement>): Promise<void> {
  if (cellRefs.size === 0) return;
  const deadline = performance.now() + 1500;
  while (performance.now() < deadline) {
    const allSized = Array.from(cellRefs.values()).every((el) =>
      Array.from(el.querySelectorAll('canvas')).some((c) => c.getBoundingClientRect().width > 0)
    );
    if (allSized) break;
    await delay(16);
  }
  await delay(48);
}

/**
 * Crea el compositor offscreen de la exportación a partir del board. Monta los
 * widgets una vez y, por cada frame, los conduce con el timestamp y dibuja el
 * resultado (vídeo con `contain`/`cover` + celdas de gráficas) en un canvas del
 * tamaño final.
 */
export async function createExportStage(options: ExportStageOptions): Promise<ExportStage> {
  const { layout, widgets, getFrames } = options;
  const scale = Math.max(1, Math.round(layout.supersample || 1));

  const container = document.createElement('div');
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
  await waitForCells(cellRefs);

  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No se pudo crear el canvas de exportación');

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

  const drawWidgetCell = (widgetId: string, rect: Rect, panel: string): void => {
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
  };

  const drawItems = (video: HTMLVideoElement | null): void => {
    for (const item of layout.items) {
      if (item.kind === 'widget' && item.widgetId) {
        drawWidgetCell(item.widgetId, item.rect, item.panel);
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

    // Dibujo síncrono: los widgets se repintan al publicar el frame, sin rAF.
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
    drawItems(video);
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
