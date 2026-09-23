import { describe, it, expect } from 'vitest';
import {
  computeBoardLayout,
  createBoardPreset,
  fitRect,
  resolveOutputSize,
  toEven,
  type CompositionWidget,
  type ExportBoard,
} from '@shared/export-composition';

const widget = (id: string): CompositionWidget => ({
  id,
  type: 'TimeSeriesChart',
  label: id,
  dataFields: [],
  config: {},
});

const widgets = (n: number): CompositionWidget[] =>
  Array.from({ length: n }, (_, i) => widget(`w${i}`));

function board(partial: Partial<ExportBoard>): ExportBoard {
  return {
    aspect: '16:9',
    resolution: '1080p',
    videoPlacement: 'flow',
    videoFit: 'contain',
    panel: 'translucent',
    supersample: 1,
    background: '#0a0e17',
    items: [],
    ...partial,
  };
}

describe('toEven', () => {
  it('redondea al par más cercano con mínimo 2', () => {
    expect(toEven(1921)).toBe(1922);
    expect(toEven(1917)).toBe(1918);
    expect(toEven(1)).toBe(2);
  });
});

describe('resolveOutputSize', () => {
  it('1080p en 16:9 son 1920x1080', () => {
    expect(resolveOutputSize('1080p', 16 / 9)).toEqual({ width: 1920, height: 1080 });
  });
  it('1080p en 9:16 son 1080x1920', () => {
    expect(resolveOutputSize('1080p', 9 / 16)).toEqual({ width: 1080, height: 1920 });
  });
  it('source usa el lado corto del vídeo', () => {
    expect(resolveOutputSize('source', 4 / 3, { width: 640, height: 480 })).toEqual({
      width: 640,
      height: 480,
    });
  });
});

describe('fitRect', () => {
  const dst = { x: 0, y: 0, w: 100, h: 100 };
  it('contain cabe entero y centra', () => {
    expect(fitRect({ width: 200, height: 100 }, dst, 'contain')).toEqual({
      x: 0,
      y: 25,
      w: 100,
      h: 50,
    });
  });
  it('cover llena recortando', () => {
    expect(fitRect({ width: 200, height: 100 }, dst, 'cover')).toEqual({
      x: -50,
      y: 0,
      w: 200,
      h: 100,
    });
  });
});

describe('computeBoardLayout', () => {
  it('empaqueta en filas: vídeo arriba y widgets debajo al 50%', () => {
    const layout = computeBoardLayout(
      board({
        items: [
          { id: 'v', kind: 'video', width: 12, height: 6 },
          { id: 'a', kind: 'widget', widgetId: 'w0', width: 6, height: 6 },
          { id: 'b', kind: 'widget', widgetId: 'w1', width: 6, height: 6 },
        ],
      })
    );

    expect(layout.width).toBe(1920);
    expect(layout.height).toBe(1080);
    expect(layout.backgroundVideoRect).toBeNull();
    expect(layout.items).toHaveLength(3);

    const video = layout.items.find((i) => i.id === 'v')!;
    const a = layout.items.find((i) => i.id === 'a')!;
    const b = layout.items.find((i) => i.id === 'b')!;
    expect(video.rect.y).toBeLessThan(a.rect.y);
    expect(a.rect.y).toBe(b.rect.y);
    expect(a.rect.x).toBeLessThan(b.rect.x);
    expect(a.rect.x + a.rect.w).toBeLessThanOrEqual(b.rect.x + 1);
  });

  it('el vídeo en background sale del flujo y va a sangre', () => {
    const layout = computeBoardLayout(
      board({
        videoPlacement: 'background',
        items: [
          { id: 'v', kind: 'video', width: 12, height: 6 },
          { id: 'a', kind: 'widget', widgetId: 'w0', width: 12, height: 6 },
        ],
      })
    );
    expect(layout.backgroundVideoRect).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    expect(layout.items.map((i) => i.kind)).toEqual(['widget']);
  });

  it('una sección delante empuja el widget hacia abajo (y es transparente)', () => {
    const layout = computeBoardLayout(
      board({
        items: [
          { id: 's', kind: 'section', width: 12, height: 6 },
          { id: 'a', kind: 'widget', widgetId: 'w0', width: 12, height: 6 },
        ],
      })
    );
    const section = layout.items.find((i) => i.id === 's')!;
    const a = layout.items.find((i) => i.id === 'a')!;
    expect(section.kind).toBe('section');
    expect(section.rect.y).toBeLessThan(a.rect.y);
  });

  it('una sección a la izquierda alinea el widget a la derecha', () => {
    const layout = computeBoardLayout(
      board({
        items: [
          { id: 's', kind: 'section', width: 6, height: 6 },
          { id: 'a', kind: 'widget', widgetId: 'w0', width: 6, height: 6 },
        ],
      })
    );
    const a = layout.items.find((i) => i.id === 'a')!;
    expect(a.rect.x).toBeGreaterThan(layout.width / 2 - 100);
  });

  it('la fila del vídeo conserva el aspecto del vídeo (con `source`)', () => {
    const layout = computeBoardLayout(
      board({
        items: [
          { id: 'v', kind: 'video', width: 6, height: 6 },
          { id: 'a', kind: 'widget', widgetId: 'w0', width: 6, height: 6 },
        ],
      }),
      { width: 1920, height: 1080 }
    );
    const video = layout.items.find((i) => i.id === 'v')!;
    const widgetItem = layout.items.find((i) => i.id === 'a')!;
    expect(video.rect.w / video.rect.h).toBeCloseTo(16 / 9, 1);
    expect(widgetItem.rect.h).toBe(video.rect.h);
  });

  it('respeta outputSize (previsualización) con dimensiones pares', () => {
    const layout = computeBoardLayout(
      board({ items: [{ id: 'a', kind: 'widget', widgetId: 'w0', width: 12, height: 6 }] }),
      null,
      { width: 461, height: 259 }
    );
    expect(layout.width % 2).toBe(0);
    expect(layout.height % 2).toBe(0);
  });
});

describe('createBoardPreset', () => {
  it('overlay: vídeo de fondo + sección + widgets', () => {
    const b = createBoardPreset('overlay', { widgetIds: ['w0', 'w1'], hasVideo: true });
    expect(b.videoPlacement).toBe('background');
    expect(b.items[0]!.kind).toBe('video');
    expect(b.items.some((i) => i.kind === 'section')).toBe(true);
    expect(b.items.filter((i) => i.kind === 'widget')).toHaveLength(2);
  });

  it('vertical: vídeo en flujo y aspecto 9:16', () => {
    const b = createBoardPreset('vertical', { widgetIds: ['w0'], hasVideo: true });
    expect(b.aspect).toBe('9:16');
    expect(b.videoPlacement).toBe('flow');
    expect(b.items[0]!.kind).toBe('video');
  });

  it('charts-only: sin vídeo', () => {
    const b = createBoardPreset('charts-only', { widgetIds: ['w0', 'w1'], hasVideo: true });
    expect(b.items.some((i) => i.kind === 'video')).toBe(false);
    expect(b.items).toHaveLength(2);
  });

  it('sin vídeo no añade ítem de vídeo', () => {
    const b = createBoardPreset('vertical', { widgetIds: ['w0'], hasVideo: false });
    expect(b.items.some((i) => i.kind === 'video')).toBe(false);
  });
});
