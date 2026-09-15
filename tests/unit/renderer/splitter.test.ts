import { describe, it, expect } from 'vitest';
import { clampPanel } from '@renderer/components/layout/Splitter';

describe('clampPanel', () => {
  it('clamps values below the minimum', () => {
    expect(clampPanel(100, 200, 480)).toBe(200);
  });

  it('clamps values above the maximum', () => {
    expect(clampPanel(999, 200, 480)).toBe(480);
  });

  it('keeps values within range', () => {
    expect(clampPanel(300, 200, 480)).toBe(300);
  });

  it('works with ratios', () => {
    expect(clampPanel(0.05, 0.15, 0.8)).toBeCloseTo(0.15);
    expect(clampPanel(0.95, 0.15, 0.8)).toBeCloseTo(0.8);
  });
});
