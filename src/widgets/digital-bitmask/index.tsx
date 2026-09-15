import { useEffect, useRef } from 'react';
import type { WidgetProps, WidgetDefinition } from '../interfaces';

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
  rows: 2,
  onColor: '#F2BE22',
  offColor: '#1e293b',
  backgroundColor: '#0a0e17',
  showBitIndex: true,
  showHexValue: true,
};

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
 */
export function DigitalBitmask({ config, dataFields, frame }: WidgetProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cfg = { ...DEFAULT_CONFIG, ...(config as Partial<BitmaskConfig>) };
  const field = dataFields[0];

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

    ctx.fillStyle = cfg.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    const value = field ? frame?.data[field] : null;
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

    const reserved = cfg.showHexValue ? 18 : 6;
    const usableHeight = height - reserved;
    const cellW = width / cfg.ledsPerRow;
    const cellH = usableHeight / cfg.rows;
    const ledSize = Math.max(Math.min(cellW, cellH) * 0.62, 4);
    const gapX = cellW;
    const gapY = cellH;

    for (let row = 0; row < cfg.rows; row++) {
      for (let col = 0; col < cfg.ledsPerRow; col++) {
        const bitIndex = row * cfg.ledsPerRow + col;
        const isOn = ((bitmask >> bitIndex) & 1) === 1;

        const cx = col * gapX + gapX / 2;
        const cy = row * gapY + gapY / 2;

        ctx.beginPath();
        ctx.roundRect(cx - ledSize / 2, cy - ledSize / 2, ledSize, ledSize, ledSize * 0.22);

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
          ctx.fillText(String(bitIndex), cx, cy);
        }
      }
    }

    if (cfg.showHexValue) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const hex = bitmask.toString(16).toUpperCase().padStart(Math.ceil(totalBits / 4), '0');
      ctx.fillText(`0x${hex}`, width / 2, height - 3);
    }
  }, [frame, field, cfg.ledsPerRow, cfg.rows, cfg.onColor, cfg.offColor, cfg.backgroundColor, cfg.showBitIndex, cfg.showHexValue]);

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
