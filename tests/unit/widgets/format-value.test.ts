import { describe, it, expect } from 'vitest';
import { formatLegendValue } from '@widgets/format-value';

describe('formatLegendValue', () => {
  it('valores vacíos o no finitos → --', () => {
    expect(formatLegendValue(null)).toBe('--');
    expect(formatLegendValue(undefined)).toBe('--');
    expect(formatLegendValue(NaN)).toBe('--');
    expect(formatLegendValue(Infinity)).toBe('--');
  });

  it('booleanos y strings', () => {
    expect(formatLegendValue(true)).toBe('true');
    expect(formatLegendValue(false)).toBe('false');
    expect(formatLegendValue('RUNNING')).toBe('RUNNING');
  });

  it('cero', () => {
    expect(formatLegendValue(0)).toBe('0');
  });

  it('precisión adaptativa según magnitud', () => {
    expect(formatLegendValue(1.2345)).toBe('1.23'); // |v| en [1,10) → 2 dec
    expect(formatLegendValue(12.345)).toBe('12.3'); // [10,100) → 1
    expect(formatLegendValue(123.456)).toBe('123'); // >=100 → 0
    expect(formatLegendValue(0.12345)).toBe('0.123'); // [0.1,1) → 3
    expect(formatLegendValue(0.012345)).toBe('0.0123'); // [0.01,0.1) → 4
    expect(formatLegendValue(0.0012345)).toBe('0.00123'); // [0.001,0.01) → 5
    expect(formatLegendValue(0.00012345)).toBe('0.000123'); // <0.001 → 6
  });

  it('recorta ceros finales', () => {
    expect(formatLegendValue(1.5)).toBe('1.5');
    expect(formatLegendValue(100)).toBe('100');
    expect(formatLegendValue(-2.25)).toBe('-2.25');
  });

  it('magnitudes extremas en notación exponencial', () => {
    expect(formatLegendValue(1e7)).toBe('1.00e+7');
    expect(formatLegendValue(1.5e-7)).toBe('1.50e-7');
  });
});
