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
});
