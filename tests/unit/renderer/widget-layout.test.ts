import { describe, it, expect } from 'vitest';
import { columnsFromPixels, rowsFromPixels } from '@renderer/lib/widget-layout';

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
