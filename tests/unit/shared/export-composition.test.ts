import { describe, it, expect } from 'vitest';
import {
  computeBoardLayout,
  createDefaultBoard,
  normalizeBoard,
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
    videoMode: 'flow',
    panel: 'translucent',
    supersample: 1,
    lineScale: 1,
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
        videoMode: 'background',
        items: [
          { id: 'v', kind: 'video', width: 12, height: 6 },
          { id: 'a', kind: 'widget', widgetId: 'w0', width: 12, height: 6 },
        ],
      })
    );
    expect(layout.backgroundVideoRect).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    expect(layout.items.map((i) => i.kind)).toEqual(['widget']);
  });

  it('videoMode hidden no dibuja ni incluye el vídeo', () => {
    const layout = computeBoardLayout(
      board({
        videoMode: 'hidden',
        items: [
          { id: 'v', kind: 'video', width: 12, height: 6 },
          { id: 'a', kind: 'widget', widgetId: 'w0', width: 12, height: 6 },
        ],
      })
    );
    expect(layout.backgroundVideoRect).toBeNull();
    expect(layout.items.map((i) => i.kind)).toEqual(['widget']);
  });

  it('el panel solo aplica con el vídeo de fondo', () => {
    const flow = computeBoardLayout(
      board({
        videoMode: 'flow',
        panel: 'none',
        items: [{ id: 'a', kind: 'widget', widgetId: 'w0', width: 12, height: 6 }],
      })
    );
    expect(flow.items[0]!.panel).toBe('translucent');

    const background = computeBoardLayout(
      board({
        videoMode: 'background',
        panel: 'none',
        items: [
          { id: 'v', kind: 'video', width: 12, height: 6 },
          { id: 'a', kind: 'widget', widgetId: 'w0', width: 12, height: 6 },
        ],
      })
    );
    expect(background.items[0]!.panel).toBe('none');
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

  it('el vídeo en flujo conserva su aspecto', () => {
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
    expect(video.rect.w / video.rect.h).toBeCloseTo(16 / 9, 1);
  });

  it('reserva la franja de etiqueta y la de copyright (el board no las pisa)', () => {
    const layout = computeBoardLayout(
      board({
        showLabel: true,
        items: [{ id: 'a', kind: 'widget', widgetId: 'w0', width: 12, height: 6 }],
      })
    );
    expect(layout.labelRect).not.toBeNull();
    expect(layout.copyrightRect.w).toBe(layout.width);
    expect(layout.copyrightRect.h).toBeGreaterThan(0);
    const item = layout.items[0]!;
    expect(item.rect.y).toBeGreaterThanOrEqual(layout.labelRect!.y + layout.labelRect!.h);
    expect(item.rect.y + item.rect.h).toBeLessThanOrEqual(layout.copyrightRect.y + 1);
  });

  it('sin showLabel no hay franja superior pero sí copyright', () => {
    const layout = computeBoardLayout(
      board({ items: [{ id: 'a', kind: 'widget', widgetId: 'w0', width: 12, height: 6 }] })
    );
    expect(layout.labelRect).toBeNull();
    expect(layout.copyrightRect.y).toBeLessThan(layout.height);
  });

  it('empaquetado staggered: rellena el hueco de la fila anterior', () => {
    const layout = computeBoardLayout(
      board({
        items: [
          { id: 'a', kind: 'widget', widgetId: 'w0', width: 6, height: 4 },
          { id: 'b', kind: 'widget', widgetId: 'w1', width: 6, height: 2 },
          { id: 'c', kind: 'widget', widgetId: 'w2', width: 6, height: 2 },
        ],
      })
    );
    const a = layout.items.find((i) => i.id === 'a')!;
    const b = layout.items.find((i) => i.id === 'b')!;
    const c = layout.items.find((i) => i.id === 'c')!;
    // A a la izquierda; B y C apilados en la mitad derecha.
    expect(a.rect.x).toBeLessThan(b.rect.x);
    expect(c.rect.x).toBe(b.rect.x);
    expect(c.rect.y).toBeGreaterThanOrEqual(b.rect.y + b.rect.h - 1);
    expect(c.rect.y + c.rect.h).toBeLessThanOrEqual(a.rect.y + a.rect.h + 1);
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

describe('createDefaultBoard', () => {
  it('16:9: vídeo y widgets a media anchura, alturas del layout', () => {
    const b = createDefaultBoard('16:9', [{ id: 'w0', height: 4 }], true);
    expect(b.videoMode).toBe('flow');
    expect(b.aspect).toBe('16:9');
    expect(b.items[0]!.kind).toBe('video');
    expect(b.items[0]!.width).toBe(6);
    const w0 = b.items.find((i) => i.widgetId === 'w0')!;
    expect(w0.width).toBe(6);
    expect(w0.height).toBe(4);
  });

  it('9:16: items a ancho completo', () => {
    const b = createDefaultBoard('9:16', [{ id: 'w0', height: 4 }], true);
    expect(b.aspect).toBe('9:16');
    expect(b.items[0]!.width).toBe(12);
    expect(b.items.find((i) => i.widgetId === 'w0')!.width).toBe(12);
  });

  it('sin vídeo: oculto y sin ítem de vídeo', () => {
    const b = createDefaultBoard('16:9', [{ id: 'w0', height: 4 }], false);
    expect(b.videoMode).toBe('hidden');
    expect(b.items.some((i) => i.kind === 'video')).toBe(false);
    expect(b.items).toHaveLength(1);
  });
});

describe('normalizeBoard', () => {
  it('deriva videoMode del videoPlacement antiguo y rellena defaults', () => {
    const b = normalizeBoard({ videoPlacement: 'background' }, true);
    expect(b.videoMode).toBe('background');
    expect(b.panel).toBe('translucent');
    expect(b.lineScale).toBe(1.5);
    expect(b.supersample).toBe(1);
  });

  it('sin vídeo fuerza videoMode hidden', () => {
    expect(normalizeBoard({ videoMode: 'flow' }, false).videoMode).toBe('hidden');
  });
});
