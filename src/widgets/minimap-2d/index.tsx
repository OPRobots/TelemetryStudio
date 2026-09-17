import { useEffect, useRef } from 'react';
import type { WidgetProps, WidgetDefinition } from '../interfaces';
import { frameAt } from '../frame-lookup';
import { useCanvasSize } from '../use-canvas-size';

interface MinimapConfig {
  fieldX?: string;
  fieldY?: string;
  fieldTheta?: string;
  /** @deprecated La escala se adapta siempre al recorrido completo. */
  scale: number;
  trailColor: string;
  robotColor: string;
  robotLength: number;
  robotWidth: number;
  showGrid: boolean;
  gridSize: number;
  /** @deprecated La trayectoria muestra siempre el recorrido completo. */
  trailSeconds: number;
}

const DEFAULT_CONFIG: MinimapConfig = {
  scale: 60,
  trailColor: '#3b82f6',
  robotColor: '#F2BE22',
  robotLength: 18,
  robotWidth: 11,
  showGrid: true,
  gridSize: 0.5,
  trailSeconds: 15,
};

const PAD = 26;
const TEXT_HEIGHT = 18;

/**
 * Minimapa 2D de trayectoria (X, Y, heading).
 * Ajusta la escala para mostrar el recorrido completo, centrado; el triángulo
 * del robot se desplaza por la posición del timestamp visualizado.
 */
export function Minimap2D({ config, dataFields, frame, frames, viewTimestamp_ms }: WidgetProps): React.ReactElement {
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

    // Bounding box de TODO el recorrido.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const f of frames) {
      const fx = f.data[fieldX];
      const fy = f.data[fieldY];
      if (typeof fx !== 'number' || typeof fy !== 'number') continue;
      if (fx < minX) minX = fx;
      if (fx > maxX) maxX = fx;
      if (fy < minY) minY = fy;
      if (fy > maxY) maxY = fy;
    }
    const hasBounds = Number.isFinite(minX) && Number.isFinite(minY);

    const cx = cursorFrame?.data[fieldX];
    const cy = cursorFrame?.data[fieldY];
    if (!hasBounds && (typeof cx !== 'number' || typeof cy !== 'number')) {
      ctx.fillStyle = '#475569';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Sin datos de posición', width / 2, height / 2);
      return;
    }

    if (!hasBounds) {
      minX = maxX = typeof cx === 'number' ? cx : 0;
      minY = maxY = typeof cy === 'number' ? cy : 0;
    }

    const rangeX = Math.max(maxX - minX, 1e-6);
    const rangeY = Math.max(maxY - minY, 1e-6);
    const availW = Math.max(width - PAD * 2, 1);
    const availH = Math.max(height - PAD * 2 - TEXT_HEIGHT, 1);
    const scale = Math.min(availW / rangeX, availH / rangeY);

    const centerX = PAD + availW / 2;
    const centerY = PAD + TEXT_HEIGHT + availH / 2;
    const dataCenterX = (minX + maxX) / 2;
    const dataCenterY = (minY + maxY) / 2;
    const mapX = (x: number): number => centerX + (x - dataCenterX) * scale;
    const mapY = (y: number): number => centerY - (y - dataCenterY) * scale;

    // Grid en coordenadas de datos.
    if (cfg.showGrid && cfg.gridSize > 0 && cfg.gridSize * scale > 4) {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.5;
      const startKx = Math.floor(minX / cfg.gridSize);
      const endKx = Math.ceil(maxX / cfg.gridSize);
      for (let k = startKx; k <= endKx; k++) {
        const px = mapX(k * cfg.gridSize);
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();
      }
      const startKy = Math.floor(minY / cfg.gridSize);
      const endKy = Math.ceil(maxY / cfg.gridSize);
      for (let k = startKy; k <= endKy; k++) {
        const py = mapY(k * cfg.gridSize);
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
        ctx.stroke();
      }
    }

    // Trayectoria completa.
    if (frames.length > 1) {
      ctx.strokeStyle = cfg.trailColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      let started = false;
      for (const f of frames) {
        const fx = f.data[fieldX];
        const fy = f.data[fieldY];
        if (typeof fx !== 'number' || typeof fy !== 'number') continue;
        const px = mapX(fx);
        const py = mapY(fy);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      if (started) ctx.stroke();
      ctx.globalAlpha = 1;

      // Punto de inicio.
      const first = frames.find((f) => {
        const fx = f.data[fieldX];
        const fy = f.data[fieldY];
        return typeof fx === 'number' && typeof fy === 'number';
      });
      if (first) {
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(mapX(first.data[fieldX] as number), mapY(first.data[fieldY] as number), 3, 0, Math.PI * 2);
        ctx.fill();
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
