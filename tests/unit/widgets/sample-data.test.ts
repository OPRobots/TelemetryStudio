import { describe, it, expect } from 'vitest';
import { buildSampledData } from '@widgets/time-series-chart/sample-data';
import type { TelemetryFrame } from '@core/types/telemetry';

/** `n` frames con `ts = i*10 ms` y un campo `v = i`. */
function makeFrames(n: number): TelemetryFrame[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp_ms: i * 10,
    data: { v: i },
  }));
}

describe('buildSampledData', () => {
  it('devuelve null sin frames o sin campos', () => {
    expect(buildSampledData([], ['v'], 2000)).toBeNull();
    expect(buildSampledData(makeFrames(10), [], 2000)).toBeNull();
  });

  it('sin rango y por debajo del límite: usa todos los frames', () => {
    const sampled = buildSampledData(makeFrames(100), ['v'], 2000);
    expect(sampled).not.toBeNull();
    expect(sampled!.x).toHaveLength(100);
    expect(sampled!.x[0]).toBeCloseTo(0);
    expect(sampled!.x[99]).toBeCloseTo(0.99);
    // Valores reales (no promediados).
    expect(sampled!.series[0]![42]).toBe(42);
  });

  it('sin rango y por encima del límite: LTTB conserva primero y último', () => {
    const frames = makeFrames(4000);
    const sampled = buildSampledData(frames, ['v'], 2000);
    expect(sampled!.x).toHaveLength(2000);
    expect(sampled!.x[0]).toBeCloseTo(frames[0]!.timestamp_ms / 1000);
    expect(sampled!.x[sampled!.x.length - 1]).toBeCloseTo(
      frames[frames.length - 1]!.timestamp_ms / 1000
    );
  });

  it('con rango pequeño: muestra TODOS los frames reales de la ventana (+vecinos)', () => {
    const frames = makeFrames(4000);
    // Ventana [10000, 14990] ms → frames 1000..1499; +1 vecino por lado = 999..1500
    const sampled = buildSampledData(frames, ['v'], 2000, { startMs: 10000, endMs: 14990 });
    expect(sampled!.x).toHaveLength(502);
    expect(sampled!.x[0]).toBeCloseTo(9.99); // frame 999
    expect(sampled!.x[501]).toBeCloseTo(15); // frame 1500
    // Todos son valores reales consecutivos.
    expect(sampled!.series[0]![0]).toBe(999);
    expect(sampled!.series[0]![501]).toBe(1500);
  });

  it('con rango grande: LTTB dentro de la ventana (hasta 2000)', () => {
    const frames = makeFrames(4000);
    const sampled = buildSampledData(frames, ['v'], 2000, { startMs: 5000, endMs: 34990 });
    expect(sampled!.x).toHaveLength(2000);
    expect(sampled!.x[0]).toBeCloseTo(4.99); // frame 499 (vecino)
    expect(sampled!.x[sampled!.x.length - 1]).toBeCloseTo(35); // frame 3500 (vecino)
  });

  it('representa booleanos como 1/0', () => {
    const frames: TelemetryFrame[] = [
      { timestamp_ms: 0, data: { b: true } },
      { timestamp_ms: 10, data: { b: false } },
    ];
    const sampled = buildSampledData(frames, ['b'], 2000);
    expect(sampled!.series[0]).toEqual([1, 0]);
  });

  it('con rango sin frames dentro: cae al dataset completo', () => {
    const frames = makeFrames(4000);
    const sampled = buildSampledData(frames, ['v'], 2000, { startMs: -1000, endMs: -500 });
    expect(sampled!.x).toHaveLength(2000);
    expect(sampled!.x[0]).toBeCloseTo(0);
    expect(sampled!.x[sampled!.x.length - 1]).toBeCloseTo(39.99);
  });
});
