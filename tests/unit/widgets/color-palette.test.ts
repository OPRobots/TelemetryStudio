import { describe, it, expect } from 'vitest';
import { seriesPalette, statePalette, lighten, SERIES_PALETTE } from '@widgets/color-palette';

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function distance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function minDistance(colors: string[]): number {
  const rgb = colors.map(toRgb);
  let min = Infinity;
  for (let i = 0; i < rgb.length; i++) {
    for (let j = i + 1; j < rgb.length; j++) {
      min = Math.min(min, distance(rgb[i]!, rgb[j]!));
    }
  }
  return min;
}

/** Luminosidad HSL (0..1) de un color hex. */
function lightness(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => v / 255) as Rgb;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

describe('seriesPalette', () => {
  it('returns the requested number of hex colors', () => {
    expect(seriesPalette(0)).toEqual([]);
    for (const color of seriesPalette(4)) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('keeps the original vivid base palette', () => {
    expect(seriesPalette(3)).toEqual(SERIES_PALETTE.slice(0, 3));
  });

  it('extends beyond the base palette without repeating', () => {
    const palette = seriesPalette(12);
    expect(palette).toHaveLength(12);
    expect(new Set(palette).size).toBe(12);
  });

  it('is stable per index as the count grows', () => {
    expect(seriesPalette(3)[0]).toBe(seriesPalette(12)[0]);
    expect(seriesPalette(2)[1]).toBe(seriesPalette(9)[1]);
  });
});

describe('statePalette', () => {
  it('returns the requested number of hex colors', () => {
    expect(statePalette(0)).toEqual([]);
    for (const color of statePalette(4)) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('never repeats a color and keeps them distinguishable', () => {
    const palette = statePalette(6);
    expect(new Set(palette).size).toBe(6);
    expect(minDistance(palette)).toBeGreaterThan(40);
  });

  it('is dark enough for solid blocks', () => {
    for (const color of statePalette(8)) {
      expect(lightness(color)).toBeLessThanOrEqual(0.45);
    }
  });

  it('is stable per index as the count grows', () => {
    expect(statePalette(3)[0]).toBe(statePalette(10)[0]);
    expect(statePalette(2)[1]).toBe(statePalette(7)[1]);
  });
});

describe('lighten', () => {
  it('moves a color toward white', () => {
    expect(lightness(lighten('#000000', 0.5))).toBeCloseTo(0.5, 1);
    expect(lighten('#000000', 0)).toBe('#000000');
  });
});
