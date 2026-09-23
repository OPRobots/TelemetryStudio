import { describe, it, expect } from 'vitest';
import { DEFAULT_LIVE_WINDOW_MS, liveRange } from '@widgets/live-view';

describe('liveRange', () => {
  it('usa la ventana por defecto de 10 s', () => {
    expect(DEFAULT_LIVE_WINDOW_MS).toBe(10000);
    expect(liveRange(30000)).toEqual({ startMs: 20000, endMs: 30000 });
  });

  it('respeta la ventana indicada', () => {
    expect(liveRange(30000, 5000)).toEqual({ startMs: 25000, endMs: 30000 });
  });

  it('ventana inválida cae al valor por defecto', () => {
    expect(liveRange(0, 0)).toEqual({ startMs: -10000, endMs: 0 });
    expect(liveRange(0, Number.NaN)).toEqual({ startMs: -10000, endMs: 0 });
  });

  it('ancla la página al inicio: crece desde la izquierda antes de llenarse', () => {
    expect(liveRange(3000, 10000, 0)).toEqual({ startMs: 0, endMs: 10000 });
  });

  it('una vez llena, la página se desplaza de forma continua', () => {
    expect(liveRange(12000, 10000, 0)).toEqual({ startMs: 2000, endMs: 12000 });
    expect(liveRange(25000, 10000, 0)).toEqual({ startMs: 15000, endMs: 25000 });
  });
});
