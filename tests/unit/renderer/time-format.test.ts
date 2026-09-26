import { describe, it, expect } from 'vitest';
import { formatEta, formatTime } from '@renderer/lib/time-format';

describe('formatTime', () => {
  it('formatea segundos como mm:ss.mmm', () => {
    expect(formatTime(0)).toBe('00:00.000');
    expect(formatTime(12.5)).toBe('00:12.500');
    expect(formatTime(65.5)).toBe('01:05.500');
  });

  it('mantiene el signo y tolera valores no finitos', () => {
    expect(formatTime(-1.5)).toBe('-00:01.500');
    expect(formatTime(Number.NaN)).toBe('00:00.000');
  });
});

describe('formatEta', () => {
  it('devuelve vacío sin estimación', () => {
    expect(formatEta(null)).toBe('');
    expect(formatEta(-1)).toBe('');
    expect(formatEta(Number.NaN)).toBe('');
  });

  it('formatea segundos y minutos en formato corto', () => {
    expect(formatEta(0)).toBe('0 s');
    expect(formatEta(12_340)).toBe('12 s');
    expect(formatEta(65_000)).toBe('1 min 05 s');
    expect(formatEta(120_000)).toBe('2 min');
  });
});
