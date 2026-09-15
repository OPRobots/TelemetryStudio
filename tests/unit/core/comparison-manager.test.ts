import { describe, it, expect } from 'vitest';
import { ComparisonManager } from '@core/comparison-manager';
import type { SessionFile, SessionWidget } from '@core/types/session';

function makeSession(widgets: SessionWidget[]): SessionFile {
  return {
    v: 1,
    name: 'Test Session',
    created: '2026-01-01T00:00:00Z',
    video: { file: 'test.mp4', fps: 30, duration_s: 10, resolution: [1920, 1080] },
    sync: { offset_ms: 0, anchor: null, rate: 1.0 },
    telemetry: {
      schema: [['value', 'number']],
      frames: [],
    },
    layout: { widgets },
  };
}

describe('ComparisonManager', () => {
  it('should detect matching widgets', () => {
    const manager = new ComparisonManager();
    const widgets: SessionWidget[] = [
      { t: 'timeseries', pos: [0, 0], size: [4, 2], fields: ['value'] },
    ];

    const sessionA = makeSession(widgets);
    const sessionB = makeSession([...widgets]);

    const result = manager.validateWidgetCompatibility(
      sessionA.layout.widgets,
      sessionB.layout.widgets
    );

    expect(result.compatible).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  it('should detect different widget types', () => {
    const manager = new ComparisonManager();
    const widgetsA: SessionWidget[] = [
      { t: 'timeseries', pos: [0, 0], size: [4, 2], fields: ['value'] },
    ];
    const widgetsB: SessionWidget[] = [
      { t: 'bitmask', pos: [0, 0], size: [4, 2], fields: ['value'] },
    ];

    const result = manager.validateWidgetCompatibility(widgetsA, widgetsB);

    expect(result.compatible).toBe(false);
    expect(result.differences.some((d) => d.includes('tipo diferente'))).toBe(true);
  });

  it('should detect different number of widgets', () => {
    const manager = new ComparisonManager();
    const widgetsA: SessionWidget[] = [
      { t: 'timeseries', pos: [0, 0], size: [4, 2], fields: ['value'] },
    ];
    const widgetsB: SessionWidget[] = [];

    const result = manager.validateWidgetCompatibility(widgetsA, widgetsB);

    expect(result.compatible).toBe(false);
    expect(result.differences.some((d) => d.includes('Número de widgets'))).toBe(true);
  });

  it('should detect different fields', () => {
    const manager = new ComparisonManager();
    const widgetsA: SessionWidget[] = [
      { t: 'timeseries', pos: [0, 0], size: [4, 2], fields: ['temp'] },
    ];
    const widgetsB: SessionWidget[] = [
      { t: 'timeseries', pos: [0, 0], size: [4, 2], fields: ['speed'] },
    ];

    const result = manager.validateWidgetCompatibility(widgetsA, widgetsB);

    expect(result.compatible).toBe(false);
    expect(result.differences.some((d) => d.includes('campos diferentes'))).toBe(true);
  });

  it('should detect different positions', () => {
    const manager = new ComparisonManager();
    const widgetsA: SessionWidget[] = [
      { t: 'timeseries', pos: [0, 0], size: [4, 2], fields: ['value'] },
    ];
    const widgetsB: SessionWidget[] = [
      { t: 'timeseries', pos: [1, 1], size: [4, 2], fields: ['value'] },
    ];

    const result = manager.validateWidgetCompatibility(widgetsA, widgetsB);

    expect(result.compatible).toBe(false);
    expect(result.differences.some((d) => d.includes('posición diferente'))).toBe(true);
  });

  it('should track active state', () => {
    const manager = new ComparisonManager();
    expect(manager.isActive).toBe(false);
  });
});
