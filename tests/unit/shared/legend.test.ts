import { describe, it, expect } from 'vitest';
import { reservedLength, wrapByWidth } from '@shared/legend';

const item = (width: number, id = String(width)) => ({ id, width });

describe('reservedLength', () => {
  it('los positivos usan su longitud tal cual', () => {
    expect(reservedLength('0')).toBe(1);
    expect(reservedLength('12.3')).toBe(4);
    expect(reservedLength('1.23e+6')).toBe(7);
  });

  it('los negativos cuentan el signo una sola vez', () => {
    expect(reservedLength('-5')).toBe(2);
    expect(reservedLength('-12.3')).toBe(5);
    expect(reservedLength('-27.42')).toBe(6);
  });

  it('el vacío y el placeholder no cambian', () => {
    expect(reservedLength('')).toBe(0);
    expect(reservedLength('--')).toBe(2);
  });
});

describe('wrapByWidth', () => {
  it('sin ítems devuelve sin filas', () => {
    expect(wrapByWidth([], 100, 10)).toEqual([]);
  });

  it('coloca en una fila lo que cabe (contando gaps)', () => {
    // 30 + 10 + 30 + 10 + 30 = 110 > 100 → no cabe el tercero
    const rows = wrapByWidth([item(30, 'a'), item(30, 'b'), item(30, 'c')], 100, 10);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.map((x) => x.id)).toEqual(['a', 'b']);
    expect(rows[1]!.map((x) => x.id)).toEqual(['c']);
  });

  it('un ítem más ancho que la fila ocupa su propia fila', () => {
    const rows = wrapByWidth([item(30, 'a'), item(200, 'wide'), item(30, 'b')], 100, 10);
    expect(rows.map((r) => r.map((x) => x.id))).toEqual([['a'], ['wide'], ['b']]);
  });

  it('varias filas completas', () => {
    const items = Array.from({ length: 6 }, (_, i) => item(40, `i${i}`));
    // 40+10+40 = 90 ≤ 100 → 2 por fila
    const rows = wrapByWidth(items, 100, 10);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.length === 2)).toBe(true);
  });
});
