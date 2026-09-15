import { useEffect, useRef } from 'react';
import type { WidgetProps, WidgetDefinition } from '../interfaces';

interface MinimapConfig {
  fieldX?: string;
  fieldY?: string;
  fieldTheta?: string;
  scale: number;
  trailColor: string;
  robotColor: string;
  robotLength: number;
  robotWidth: number;
  showGrid: boolean;
  gridSize: number;
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

/**
 * Minimapa 2D de trayectoria (X, Y, heading).
 */
export function Minimap2D({ config, dataFields, frame, frames }: WidgetProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(rect.width * dpr, 1);
    canvas.height = Math.max(rect.height * dpr, 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, width, height);

    const x = frame?.data[fieldX] as number | undefined;
    const y = frame?.data[fieldY] as number | undefined;
    const theta = (frame?.data[fieldTheta] as number | undefined) ?? 0;

    if (x == null || y == null) {
      ctx.fillStyle = '#475569';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Sin datos de posición', width / 2, height / 2);
      return;
    }

    const cx = width / 2;
    const cy = height / 2;

    // Grid
    if (cfg.showGrid) {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.5;
      const step = cfg.gridSize * cfg.scale;
      if (step > 4) {
        for (let px = cx % step; px < width; px += step) {
          ctx.beginPath();
          ctx.moveTo(px, 0);
          ctx.lineTo(px, height);
          ctx.stroke();
        }
        for (let py = cy % step; py < height; py += step) {
          ctx.beginPath();
          ctx.moveTo(0, py);
          ctx.lineTo(width, py);
          ctx.stroke();
        }
      }
    }

    // Trayectoria reciente
    const allFrames = frames;
    if (allFrames.length > 1 && frame) {
      const cutoff = frame.timestamp_ms - cfg.trailSeconds * 1000;
      const trail = allFrames.filter((f) => f.timestamp_ms >= cutoff && f.timestamp_ms <= frame.timestamp_ms);

      // Centrar en el robot para que la trayectoria sea visible
      const ox = cx - x * cfg.scale;
      const oy = cy + y * cfg.scale;

      ctx.strokeStyle = cfg.trailColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      let started = false;
      for (const f of trail) {
        const fx = f.data[fieldX] as number | undefined;
        const fy = f.data[fieldY] as number | undefined;
        if (fx == null || fy == null) continue;
        const px = ox + fx * cfg.scale;
        const py = oy - fy * cfg.scale;
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      if (started) ctx.stroke();
      ctx.globalAlpha = 1;

      // Punto de inicio
      const first = trail.find(
        (f) => f.data[fieldX] != null && f.data[fieldY] != null
      );
      if (first) {
        const sx = ox + (first.data[fieldX] as number) * cfg.scale;
        const sy = oy - (first.data[fieldY] as number) * cfg.scale;
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Robot (triángulo rotado)
    const angleRad = (-theta * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angleRad);
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

    // Coordenadas
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `X: ${x.toFixed(2)}  Y: ${y.toFixed(2)}  θ: ${theta.toFixed(1)}°`,
      8,
      8
    );
  }, [frame, frames, fieldX, fieldY, fieldTheta, cfg.scale, cfg.trailColor, cfg.robotColor, cfg.robotLength, cfg.robotWidth, cfg.showGrid, cfg.gridSize, cfg.trailSeconds]);

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
