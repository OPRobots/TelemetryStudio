import { useCallback, useRef } from 'react';
import type { WidgetProps, WidgetDefinition } from '../interfaces';
import { valueAt } from '../frame-lookup';
import { useCanvasSize } from '../use-canvas-size';
import { resolveViewTimestamp, useFrameBus } from '../frame-bus';
import { useWidgetDraw } from '../use-widget-draw';

interface BitmaskConfig {
  ledsPerRow: number;
  rows: number;
  onColor: string;
  offColor: string;
  backgroundColor: string;
  showBitIndex: boolean;
  showHexValue: boolean;
}

const DEFAULT_CONFIG: BitmaskConfig = {
  ledsPerRow: 8,
  rows: 1,
  onColor: '#F2BE22',
  offColor: '#1e293b',
  backgroundColor: '#0a0e17',
  showBitIndex: true,
  showHexValue: true,
};

const PAD = 8;

/**
 * Normaliza el valor de un campo a un bitmask entero.
 */
function toBitmask(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value >>> 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (Array.isArray(value)) {
    let mask = 0;
    for (let i = 0; i < value.length; i++) {
      if (value[i]) mask |= 1 << i;
    }
    return mask >>> 0;
  }
  if (ArrayBuffer.isView(value)) {
    const arr = value as unknown as ArrayLike<number>;
    let mask = 0;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i]) mask |= 1 << i;
    }
    return mask >>> 0;
  }
  return null;
}

/**
 * Matriz de LEDs para bitmasks (ej. sensores IR).
 * Muestra el valor del timestamp visualizado (hover/vídeo/último frame).
 */
export function DigitalBitmask({
  config,
  dataFields,
  getFrames,
  hoverTimestamp_ms,
  transparentBackground,
}: WidgetProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvasRef);
  const bus = useFrameBus();

  const cfg = { ...DEFAULT_CONFIG, ...(config as Partial<BitmaskConfig>) };
  const field = dataFields[0];

  const latest = useRef({ getFrames, field, hoverTimestamp_ms, cfg, size, transparentBackground });
  latest.current = { getFrames, field, hoverTimestamp_ms, cfg, size, transparentBackground };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { getFrames, field, hoverTimestamp_ms, cfg, size, transparentBackground } =
      latest.current;
    const frames = getFrames();
    const snapshot = bus?.getSnapshot() ?? { frame: null, context: null };
    const viewTimestamp = resolveViewTimestamp(frames, hoverTimestamp_ms, snapshot);

    const dpr = window.devicePixelRatio || 1;
    const width = size.width;
    const height = size.height;
    if (width <= 0 || height <= 0) return;

    canvas.width = Math.max(width * dpr, 1);
    canvas.height = Math.max(height * dpr, 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // En exportación el fondo lo pone el panel de composición.
    if (!transparentBackground) {
      ctx.fillStyle = cfg.backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }

    const sampled = valueAt(frames, field, viewTimestamp);
    const value = sampled ?? (field ? snapshot.frame?.data[field] : null);
    const bitmask = toBitmask(value);
    const totalBits = cfg.ledsPerRow * cfg.rows;

    if (bitmask == null) {
      ctx.fillStyle = '#475569';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Sin datos', width / 2, height / 2);
      return;
    }

    // Rejilla cuadrada, centrada, que se adapta al tamaño disponible.
    const reserved = cfg.showHexValue ? 20 : 0;
    const availW = Math.max(width - PAD * 2, 1);
    const availH = Math.max(height - PAD * 2 - reserved, 1);
    const cell = Math.max(Math.min(availW / cfg.ledsPerRow, availH / cfg.rows), 1);
    const gridW = cell * cfg.ledsPerRow;
    const gridH = cell * cfg.rows;
    const ox = (width - gridW) / 2;
    const oy = (height - reserved - gridH) / 2;
    const ledSize = Math.max(cell * 0.62, 4);

    for (let row = 0; row < cfg.rows; row++) {
      for (let col = 0; col < cfg.ledsPerRow; col++) {
        const bitIndex = row * cfg.ledsPerRow + col;
        const isOn = ((bitmask >> bitIndex) & 1) === 1;

        const ccx = ox + col * cell + cell / 2;
        const ccy = oy + row * cell + cell / 2;

        ctx.beginPath();
        ctx.roundRect(ccx - ledSize / 2, ccy - ledSize / 2, ledSize, ledSize, ledSize * 0.22);

        if (isOn) {
          ctx.fillStyle = cfg.onColor;
          ctx.shadowColor = cfg.onColor;
          ctx.shadowBlur = ledSize * 0.5;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = cfg.offColor;
          ctx.fill();
        }

        if (cfg.showBitIndex && ledSize > 16) {
          ctx.fillStyle = isOn ? '#0a0e17' : '#64748b';
          ctx.font = `${Math.min(10, ledSize * 0.32)}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(bitIndex), ccx, ccy);
        }
      }
    }

    if (cfg.showHexValue) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const hex = bitmask.toString(16).toUpperCase().padStart(Math.ceil(totalBits / 4), '0');
      ctx.fillText(`0x${hex}`, width / 2, height - 4);
    }
  }, [bus]);

  useWidgetDraw(draw, [
    getFrames,
    field,
    hoverTimestamp_ms,
    size.width,
    size.height,
    cfg.ledsPerRow,
    cfg.rows,
    cfg.onColor,
    cfg.offColor,
    cfg.backgroundColor,
    cfg.showBitIndex,
    cfg.showHexValue,
  ]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}

export const digitalBitmaskDefinition: WidgetDefinition = {
  metadata: {
    name: 'DigitalBitmask',
    displayName: 'Matriz de bits',
    description: 'LEDs on/off para bitmasks (sensores IR, flags)',
    icon: 'grid',
    category: 'indicator',
    acceptedFieldTypes: ['bitmask', 'array', 'number', 'boolean'],
    minSize: { width: 4, height: 2 },
    defaultSize: { width: 8, height: 3 },
    defaultConfig: { ...DEFAULT_CONFIG },
    priority: 20,
  },
  component: DigitalBitmask,
};
