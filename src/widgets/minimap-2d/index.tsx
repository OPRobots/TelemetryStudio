import { useEffect, useRef } from 'react';
import type { TelemetryFrame } from '@core/types/telemetry';
import type { WidgetProps, WidgetDefinition } from '../interfaces';
import { frameAt } from '../frame-lookup';
import { useCanvasSize } from '../use-canvas-size';

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

/**
 * Minimapa 2D de trayectoria (X, Y, heading).
 * Ajusta la escala para mostrar el recorrido completo, centrado; el triángulo
 * del robot se desplaza por la posición del timestamp visualizado.
 */
export function Minimap2D({ config, dataFields, frame, frames, viewTimestamp_ms, zoomRange }: WidgetProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvasRef);

  const cfg = { ...DEFAULT_CONFIG, ...(config as Partial<MinimapConfig>) };
  const fieldX = cfg.fieldX || dataFields[0] || 'position_x';
  const fieldY = cfg.fieldY || dataFields[1] || 'position_y';
  const fieldTheta = cfg.fieldTheta || dataFields[2] || 'heading_deg';

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

    // Frame del cursor: timestamp visualizado > frame actual.
    const cursorFrame = frameAt(frames, viewTimestamp_ms) ?? frame;

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

    const inRange = (f: TelemetryFrame): boolean =>
      zoomRange == null || (f.timestamp_ms >= zoomRange.startMs && f.timestamp_ms <= zoomRange.endMs);

    // Con zoom, encuadra el tramo seleccionado; si no hay puntos, cae al completo.
    let bounds = zoomRange ? bboxFor(inRange) : bboxFor(() => true);
    const hasBounds = Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY);
    if (!hasBounds && zoomRange) bounds = bboxFor(() => true);
    const boundsOk = Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY);

    const cx = cursorFrame?.data[fieldX];
    const cy = cursorFrame?.data[fieldY];
    if (!boundsOk && (typeof cx !== 'number' || typeof cy !== 'number')) {
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
    const mapX = (x: number): number => centerX + (x - dataCenterX) * scale;
    const mapY = (y: number): number => centerY - (y - dataCenterY) * scale;

    // Grid en coordenadas de datos. El paso se adapta a la escala para que la
    // separación en pantalla sea legible aunque haya zoom (múltiplos de gridSize).
    if (cfg.showGrid && cfg.gridSize > 0) {
      let step = cfg.gridSize;
      while (step * scale < 40) step *= 2;
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.5;
      const startKx = Math.floor(bMinX / step);
      const endKx = Math.ceil(bMaxX / step);
      for (let k = startKx; k <= endKx; k++) {
        const px = mapX(k * step);
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();
      }
      const startKy = Math.floor(bMinY / step);
      const endKy = Math.ceil(bMaxY / step);
      for (let k = startKy; k <= endKy; k++) {
        const py = mapY(k * step);
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
        ctx.stroke();
      }
    }

    // Trayectoria. Con zoom, fuera del rango con opacidad baja (contexto) y
    // dentro del rango resaltada.
    const strokeTrail = (include: (f: TelemetryFrame) => boolean, alpha: number): void => {
      ctx.strokeStyle = cfg.trailColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      // `penDown` se corta en cada frame excluido: así no se unen los tramos
      // separados (p. ej. antes y después del rango de zoom) con una cuerda.
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
          ctx.moveTo(px, py);
          penDown = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    if (frames.length > 1) {
      if (zoomRange) {
        strokeTrail((f) => !inRange(f), 0.2);
        strokeTrail(inRange, 0.9);
      } else {
        strokeTrail(() => true, 0.85);
      }

      // Punto de inicio (resaltado si cae dentro del rango).
      const first = frames.find((f) => {
        const fx = f.data[fieldX];
        const fy = f.data[fieldY];
        return typeof fx === 'number' && typeof fy === 'number';
      });
      if (first) {
        ctx.globalAlpha = zoomRange && !inRange(first) ? 0.35 : 1;
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(mapX(first.data[fieldX] as number), mapY(first.data[fieldY] as number), 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Robot (triángulo rotado) en la posición del cursor.
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

      // Coordenadas del cursor.
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`X: ${cx.toFixed(2)}  Y: ${cy.toFixed(2)}  θ: ${theta.toFixed(1)}°`, 8, 8);
    }
  }, [
    frame,
    frames,
    frames.length,
    viewTimestamp_ms,
    zoomRange,
    size.width,
    size.height,
    fieldX,
    fieldY,
    fieldTheta,
    cfg.trailColor,
    cfg.robotColor,
    cfg.robotLength,
    cfg.robotWidth,
    cfg.showGrid,
    cfg.gridSize,
  ]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
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
