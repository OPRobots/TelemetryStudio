import { useCallback, useEffect, useRef } from 'react';
import type { TelemetryFrame } from '@core/types/telemetry';
import type { WidgetProps, WidgetDefinition } from '../interfaces';
import { frameAt } from '../frame-lookup';
import { useCanvasSize } from '../use-canvas-size';
import { resolveViewTimestamp, useFrameBus } from '../frame-bus';
import { formatLegendValue } from '../format-value';
import { useWidgetDraw } from '../use-widget-draw';

interface MinimapConfig {
  fieldX?: string;
  fieldY?: string;
  fieldTheta?: string;
  trailColor: string;
  robotColor: string;
  robotLength: number;
  robotWidth: number;
  showGrid: boolean;
  gridSize: number;
}

const DEFAULT_CONFIG: MinimapConfig = {
  trailColor: '#3b82f6',
  robotColor: '#F2BE22',
  robotLength: 18,
  robotWidth: 11,
  showGrid: true,
  gridSize: 0.5,
};

const PAD = 26;
const TEXT_HEIGHT = 18;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 20;
const ZOOM_STEP = 1.1;

function clampZoom(value: number): number {
  return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);
}

/**
 * Minimapa 2D de trayectoria (X, Y, heading).
 * Ajusta la escala para mostrar el recorrido completo, centrado; el triángulo
 * del robot se desplaza por la posición del timestamp visualizado.
 */
export function Minimap2D({
  config,
  dataFields,
  getFrames,
  hoverTimestamp_ms,
  zoomRange,
}: WidgetProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvasRef);
  const bus = useFrameBus();

  const cfg = { ...DEFAULT_CONFIG, ...(config as Partial<MinimapConfig>) };

  const latest = useRef({ getFrames, dataFields, hoverTimestamp_ms, zoomRange, cfg, size });
  latest.current = { getFrames, dataFields, hoverTimestamp_ms, zoomRange, cfg, size };

  // BBox cacheada (la parte O(n) al encuadrar la trayectoria).
  const bboxRef = useRef<{ sig: string; bounds: { minX: number; maxX: number; minY: number; maxY: number } }>({
    sig: '',
    bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
  });
  // Capa estática (fondo + rejilla + trayectoria + inicio), cacheada en un canvas.
  const baseRef = useRef<{ canvas: HTMLCanvasElement | null; sig: string }>({ canvas: null, sig: '' });
  // Vista local (zoom/pan manuales), independiente de cada widget.
  const viewRef = useRef({ zoom: 1, panX: 0, panY: 0 });
  const mappingRef = useRef<{
    scale: number;
    centerX: number;
    centerY: number;
    dataCenterX: number;
    dataCenterY: number;
  } | null>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const readoutRef = useRef<{
    x: HTMLSpanElement | null;
    y: HTMLSpanElement | null;
    theta: HTMLSpanElement | null;
  }>({ x: null, y: null, theta: null });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { getFrames, dataFields, hoverTimestamp_ms, zoomRange, cfg, size } = latest.current;
    const frames = getFrames();
    const fieldX = cfg.fieldX || dataFields[0] || 'position_x';
    const fieldY = cfg.fieldY || dataFields[1] || 'position_y';
    const fieldTheta = cfg.fieldTheta || dataFields[2] || 'heading_deg';

    const snapshot = bus?.getSnapshot() ?? { frame: null, context: null };
    const viewTimestamp = resolveViewTimestamp(frames, hoverTimestamp_ms, snapshot);

    const dpr = window.devicePixelRatio || 1;
    const width = size.width;
    const height = size.height;
    if (width <= 0 || height <= 0) return;

    canvas.width = Math.max(width * dpr, 1);
    canvas.height = Math.max(height * dpr, 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Frame del cursor: timestamp visualizado > frame actual.
    const cursorFrame = frameAt(frames, viewTimestamp) ?? snapshot.frame;

    const inRange = (f: TelemetryFrame): boolean =>
      zoomRange == null || (f.timestamp_ms >= zoomRange.startMs && f.timestamp_ms <= zoomRange.endMs);

    const bboxFor = (
      include: (f: TelemetryFrame) => boolean
    ): { minX: number; maxX: number; minY: number; maxY: number } => {
      let bMinX = Infinity;
      let bMaxX = -Infinity;
      let bMinY = Infinity;
      let bMaxY = -Infinity;
      for (const f of frames) {
        if (!include(f)) continue;
        const fx = f.data[fieldX];
        const fy = f.data[fieldY];
        if (typeof fx !== 'number' || typeof fy !== 'number') continue;
        if (fx < bMinX) bMinX = fx;
        if (fx > bMaxX) bMaxX = fx;
        if (fy < bMinY) bMinY = fy;
        if (fy > bMaxY) bMaxY = fy;
      }
      return { minX: bMinX, maxX: bMaxX, minY: bMinY, maxY: bMaxY };
    };

    // BBox (cacheada por dataset + zoom).
    const bboxSig = `${frames.length}|${fieldX}|${fieldY}|${
      zoomRange ? `${zoomRange.startMs}:${zoomRange.endMs}` : 'full'
    }`;
    if (bboxRef.current.sig !== bboxSig) {
      let bounds = zoomRange ? bboxFor(inRange) : bboxFor(() => true);
      if (!Number.isFinite(bounds.minX) && zoomRange) bounds = bboxFor(() => true);
      bboxRef.current = { sig: bboxSig, bounds };
    }
    const bounds = bboxRef.current.bounds;
    const boundsOk = Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY);

    const cx = cursorFrame?.data[fieldX];
    const cy = cursorFrame?.data[fieldY];
    const thetaValue = cursorFrame?.data[fieldTheta];

    // Readout HTML (esquina): X/Y/θ del cursor de tiempo.
    const readout = readoutRef.current;
    if (readout.x) readout.x.textContent = typeof cx === 'number' ? formatLegendValue(cx) : '--';
    if (readout.y) readout.y.textContent = typeof cy === 'number' ? formatLegendValue(cy) : '--';
    if (readout.theta) {
      readout.theta.textContent =
        typeof thetaValue === 'number' ? `${thetaValue.toFixed(1)}°` : '--';
    }

    if (!boundsOk && (typeof cx !== 'number' || typeof cy !== 'number')) {
      ctx.fillStyle = '#0a0e17';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#475569';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Sin datos de posición', width / 2, height / 2);
      return;
    }

    const bMinX = boundsOk ? bounds.minX : typeof cx === 'number' ? cx : 0;
    const bMaxX = boundsOk ? bounds.maxX : typeof cx === 'number' ? cx : 0;
    const bMinY = boundsOk ? bounds.minY : typeof cy === 'number' ? cy : 0;
    const bMaxY = boundsOk ? bounds.maxY : typeof cy === 'number' ? cy : 0;

    const rangeX = Math.max(bMaxX - bMinX, 1e-6);
    const rangeY = Math.max(bMaxY - bMinY, 1e-6);
    const availW = Math.max(width - PAD * 2, 1);
    const availH = Math.max(height - PAD * 2 - TEXT_HEIGHT, 1);
    const scale = Math.min(availW / rangeX, availH / rangeY);

    const centerX = PAD + availW / 2;
    const centerY = PAD + TEXT_HEIGHT + availH / 2;
    const dataCenterX = (bMinX + bMaxX) / 2;
    const dataCenterY = (bMinY + bMaxY) / 2;

    // Vista local: el encuadre adaptativo base + zoom/pan del usuario.
    const view = viewRef.current;
    const cxScreen = centerX + view.panX;
    const cyScreen = centerY + view.panY;
    const mapX = (x: number): number => cxScreen + (x - dataCenterX) * scale * view.zoom;
    const mapY = (y: number): number => cyScreen - (y - dataCenterY) * scale * view.zoom;
    mappingRef.current = { scale, centerX, centerY, dataCenterX, dataCenterY };

    // --- Capa estática (fondo + rejilla + trayectoria + inicio) ---
    let base = baseRef.current.canvas;
    if (!base) {
      base = document.createElement('canvas');
      baseRef.current.canvas = base;
    }
    const baseSig = `${frames.length}|${fieldX}|${fieldY}|${
      zoomRange ? `${zoomRange.startMs}:${zoomRange.endMs}` : 'full'
    }|${Math.round(width)}x${Math.round(height)}|${scale.toFixed(3)}|${centerX.toFixed(2)}|${centerY.toFixed(
      2
    )}|${dataCenterX.toFixed(3)}|${dataCenterY.toFixed(3)}|${view.zoom}|${view.panX.toFixed(
      2
    )}|${view.panY.toFixed(2)}|${cfg.showGrid}|${cfg.gridSize}|${cfg.trailColor}`;
    if (baseRef.current.sig !== baseSig) {
      base.width = Math.max(width * dpr, 1);
      base.height = Math.max(height * dpr, 1);
      const bctx = base.getContext('2d');
      if (bctx) {
        bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        bctx.fillStyle = '#0a0e17';
        bctx.fillRect(0, 0, width, height);

        // Grid en coordenadas de datos.
        if (cfg.showGrid && cfg.gridSize > 0) {
          let step = cfg.gridSize;
          while (step * scale < 40) step *= 2;
          bctx.strokeStyle = '#1e293b';
          bctx.lineWidth = 0.5;
          const startKx = Math.floor(bMinX / step);
          const endKx = Math.ceil(bMaxX / step);
          for (let k = startKx; k <= endKx; k++) {
            const px = mapX(k * step);
            bctx.beginPath();
            bctx.moveTo(px, 0);
            bctx.lineTo(px, height);
            bctx.stroke();
          }
          const startKy = Math.floor(bMinY / step);
          const endKy = Math.ceil(bMaxY / step);
          for (let k = startKy; k <= endKy; k++) {
            const py = mapY(k * step);
            bctx.beginPath();
            bctx.moveTo(0, py);
            bctx.lineTo(width, py);
            bctx.stroke();
          }
        }

        // Trayectoria.
        const strokeTrail = (include: (f: TelemetryFrame) => boolean, alpha: number): void => {
          bctx.strokeStyle = cfg.trailColor;
          bctx.lineWidth = 2;
          bctx.globalAlpha = alpha;
          bctx.beginPath();
          let penDown = false;
          for (const f of frames) {
            const fx = f.data[fieldX];
            const fy = f.data[fieldY];
            if (!include(f) || typeof fx !== 'number' || typeof fy !== 'number') {
              penDown = false;
              continue;
            }
            const px = mapX(fx);
            const py = mapY(fy);
            if (!penDown) {
              bctx.moveTo(px, py);
              penDown = true;
            } else {
              bctx.lineTo(px, py);
            }
          }
          bctx.stroke();
          bctx.globalAlpha = 1;
        };

        if (frames.length > 1) {
          if (zoomRange) {
            strokeTrail((f) => !inRange(f), 0.2);
            strokeTrail(inRange, 0.9);
          } else {
            strokeTrail(() => true, 0.85);
          }

          const first = frames.find((f) => {
            const fx = f.data[fieldX];
            const fy = f.data[fieldY];
            return typeof fx === 'number' && typeof fy === 'number';
          });
          if (first) {
            bctx.globalAlpha = zoomRange && !inRange(first) ? 0.35 : 1;
            bctx.fillStyle = '#22c55e';
            bctx.beginPath();
            bctx.arc(
              mapX(first.data[fieldX] as number),
              mapY(first.data[fieldY] as number),
              3,
              0,
              Math.PI * 2
            );
            bctx.fill();
            bctx.globalAlpha = 1;
          }
        }
      }
      baseRef.current.sig = baseSig;
    }
    ctx.drawImage(base, 0, 0, width, height);

    // --- Dinámico: robot y coordenadas del cursor ---
    if (typeof cx === 'number' && typeof cy === 'number') {
      const theta = (cursorFrame?.data[fieldTheta] as number | undefined) ?? 0;
      ctx.save();
      ctx.translate(mapX(cx), mapY(cy));
      ctx.rotate((-theta * Math.PI) / 180);
      ctx.fillStyle = cfg.robotColor;
      ctx.shadowColor = cfg.robotColor;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(cfg.robotLength / 2, 0);
      ctx.lineTo(-cfg.robotLength / 2, -cfg.robotWidth / 2);
      ctx.lineTo(-cfg.robotLength / 2, cfg.robotWidth / 2);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }, [bus]);

  const schedule = useWidgetDraw(draw, [
    getFrames,
    dataFields,
    hoverTimestamp_ms,
    zoomRange,
    size.width,
    size.height,
    cfg.fieldX,
    cfg.fieldY,
    cfg.fieldTheta,
    cfg.trailColor,
    cfg.robotColor,
    cfg.robotLength,
    cfg.robotWidth,
    cfg.showGrid,
    cfg.gridSize,
  ]);

  // Rueda: zoom hacia el cursor (listener no pasivo para no hacer scroll).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent): void => {
      const m = mappingRef.current;
      if (!m) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const view = viewRef.current;
      const nextZoom = clampZoom(view.zoom * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
      if (nextZoom === view.zoom) return;
      // Punto de datos bajo el cursor (antes) para mantenerlo fijo al hacer zoom.
      const dx = (sx - (m.centerX + view.panX)) / (m.scale * view.zoom) + m.dataCenterX;
      const dy = m.dataCenterY - (sy - (m.centerY + view.panY)) / (m.scale * view.zoom);
      const nextCxScreen = sx - (dx - m.dataCenterX) * m.scale * nextZoom;
      const nextCyScreen = sy + (dy - m.dataCenterY) * m.scale * nextZoom;
      viewRef.current = {
        zoom: nextZoom,
        panX: nextCxScreen - m.centerX,
        panY: nextCyScreen - m.centerY,
      };
      schedule();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [schedule]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    panRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer no activo (p. ej. eventos sintéticos en tests).
    }
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const pan = panRef.current;
    if (!pan) return;
    viewRef.current = {
      ...viewRef.current,
      panX: viewRef.current.panX + (e.clientX - pan.x),
      panY: viewRef.current.panY + (e.clientY - pan.y),
    };
    pan.x = e.clientX;
    pan.y = e.clientY;
    schedule();
  };
  const handlePointerUp = (): void => {
    panRef.current = null;
  };
  const handleDoubleClick = (): void => {
    viewRef.current = { zoom: 1, panX: 0, panY: 0 };
    schedule();
  };

  return (
    <div className="minimap-widget">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ cursor: 'grab' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      />
      <div className="minimap-readout">
        <span className="minimap-readout__item">
          <span className="minimap-readout__dot" style={{ backgroundColor: '#3b82f6' }} />
          <span className="minimap-readout__label">X</span>
          <span
            className="minimap-readout__value"
            ref={(el) => {
              readoutRef.current.x = el;
            }}
          >
            --
          </span>
        </span>
        <span className="minimap-readout__item">
          <span className="minimap-readout__dot" style={{ backgroundColor: '#22c55e' }} />
          <span className="minimap-readout__label">Y</span>
          <span
            className="minimap-readout__value"
            ref={(el) => {
              readoutRef.current.y = el;
            }}
          >
            --
          </span>
        </span>
        <span className="minimap-readout__item">
          <span className="minimap-readout__dot" style={{ backgroundColor: '#F2BE22' }} />
          <span className="minimap-readout__label">θ</span>
          <span
            className="minimap-readout__value"
            ref={(el) => {
              readoutRef.current.theta = el;
            }}
          >
            --
          </span>
        </span>
      </div>
    </div>
  );
}

export const minimap2dDefinition: WidgetDefinition = {
  metadata: {
    name: 'Minimap2D',
    displayName: 'Minimapa 2D',
    description: 'Trayectoria del robot en el plano (X, Y, orientación)',
    icon: 'map',
    category: 'spatial',
    acceptedFieldTypes: ['number'],
    minSize: { width: 5, height: 4 },
    defaultSize: { width: 10, height: 8 },
    defaultConfig: { ...DEFAULT_CONFIG },
    priority: 30,
  },
  component: Minimap2D,
};
