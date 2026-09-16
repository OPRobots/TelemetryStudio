import { describe, it, expect } from 'vitest';
import {
  clampHeight,
  clampWidth,
  columnsFromPixels,
  packWidgetRows,
  rowsFromPixels,
  snapWidthToPreset,
} from '@renderer/lib/widget-layout';

describe('snapWidthToPreset', () => {
  it('ajusta al preset más cercano', () => {
    expect(snapWidthToPreset(12)).toBe(12);
    expect(snapWidthToPreset(9.4)).toBe(9);
    expect(snapWidthToPreset(7.6)).toBe(8);
    expect(snapWidthToPreset(5.6)).toBe(6);
    expect(snapWidthToPreset(3)).toBe(3);
  });

  it('limita al rango [3, 12]', () => {
    expect(snapWidthToPreset(0)).toBe(3);
    expect(snapWidthToPreset(99)).toBe(12);
  });
});

describe('clampWidth', () => {
  it('limita y redondea a columnas', () => {
    expect(clampWidth(0)).toBe(3);
    expect(clampWidth(20)).toBe(12);
    expect(clampWidth(6.4)).toBe(6);
  });
});

describe('clampHeight', () => {
  it('limita a [2, 16] filas', () => {
    expect(clampHeight(0)).toBe(2);
    expect(clampHeight(99)).toBe(16);
    expect(clampHeight(5.2)).toBe(5);
  });
});

describe('columnsFromPixels', () => {
  it('convierte píxeles a columnas según la rejilla', () => {
    // container 1300, gap 12 → columna = (1300 - 11*12)/12
    expect(columnsFromPixels(1300, 1300, 12)).toBeCloseTo(12, 1);
    // media anchura (6 columnas con gap) ≈ 644 px
    expect(columnsFromPixels(644, 1300, 12)).toBeCloseTo(6, 1);
  });

  it('devuelve el mínimo si la rejilla no tiene ancho', () => {
    expect(columnsFromPixels(100, 0, 12)).toBe(3);
  });
});

describe('rowsFromPixels', () => {
  it('convierte píxeles a filas', () => {
    // 2 filas → alto = 2*40 + 1*12 = 92
    expect(rowsFromPixels(92, 12)).toBeCloseTo(2, 5);
    // 4 filas → alto = 4*40 + 3*12 = 196
    expect(rowsFromPixels(196, 12)).toBeCloseTo(4, 5);
  });
});

describe('packWidgetRows', () => {
  const w = (id: string, width: number) => ({ id, width });

  it('coloca dos widgets al 50% en la misma fila', () => {
    const rows = packWidgetRows([w('a', 6), w('b', 6)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('baja a la siguiente fila cuando no cabe', () => {
    const rows = packWidgetRows([w('a', 8), w('b', 6), w('c', 6)]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.map((x) => x.id)).toEqual(['a']);
    expect(rows[1]!.map((x) => x.id)).toEqual(['b', 'c']);
  });

  it('un widget a ancho completo ocupa su propia fila', () => {
    const rows = packWidgetRows([w('a', 6), w('b', 12), w('c', 6)]);
    expect(rows).toHaveLength(3);
  });

  it('cuatro al 25% caben en una fila', () => {
    const rows = packWidgetRows([w('a', 3), w('b', 3), w('c', 3), w('d', 3)]);
    expect(rows).toHaveLength(1);
  });
});
