import { describe, it, expect } from 'vitest';
import { clampGridHeight, clampGridWidth, packGridRows, snapGridWidth } from '@shared/grid';

describe('snapGridWidth', () => {
  it('ajusta al preset más cercano', () => {
    expect(snapGridWidth(12)).toBe(12);
    expect(snapGridWidth(9.4)).toBe(9);
    expect(snapGridWidth(7.6)).toBe(8);
    expect(snapGridWidth(5.6)).toBe(6);
    expect(snapGridWidth(3)).toBe(3);
  });

  it('limita al rango [3, 12]', () => {
    expect(snapGridWidth(0)).toBe(3);
    expect(snapGridWidth(99)).toBe(12);
  });
});

describe('clampGridWidth', () => {
  it('limita y redondea a columnas', () => {
    expect(clampGridWidth(0)).toBe(3);
    expect(clampGridWidth(20)).toBe(12);
    expect(clampGridWidth(6.4)).toBe(6);
  });
});

describe('clampGridHeight', () => {
  it('limita a [2, 16] filas', () => {
    expect(clampGridHeight(0)).toBe(2);
    expect(clampGridHeight(99)).toBe(16);
    expect(clampGridHeight(5.2)).toBe(5);
  });
});

describe('packGridRows', () => {
  const w = (id: string, width: number) => ({ id, width });

  it('coloca dos ítems al 50% en la misma fila', () => {
    const rows = packGridRows([w('a', 6), w('b', 6)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('baja a la siguiente fila cuando no cabe', () => {
    const rows = packGridRows([w('a', 8), w('b', 6), w('c', 6)]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.map((x) => x.id)).toEqual(['a']);
    expect(rows[1]!.map((x) => x.id)).toEqual(['b', 'c']);
  });

  it('un ítem a ancho completo ocupa su propia fila', () => {
    const rows = packGridRows([w('a', 6), w('b', 12), w('c', 6)]);
    expect(rows).toHaveLength(3);
  });

  it('cuatro al 25% caben en una fila', () => {
    const rows = packGridRows([w('a', 3), w('b', 3), w('c', 3), w('d', 3)]);
    expect(rows).toHaveLength(1);
  });
});
