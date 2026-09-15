import { describe, it, expect } from 'vitest';
import { buildAutoLayoutWidgets } from '@renderer/lib/auto-layout';
import type { FieldSchema } from '@core/types/telemetry';

const FULL_SCHEMA: FieldSchema[] = [
  { name: 'position_x', type: 'number' },
  { name: 'position_y', type: 'number' },
  { name: 'heading_deg', type: 'number' },
  { name: 'speed_rpm', type: 'number' },
  { name: 'motor_left', type: 'number' },
  { name: 'motor_right', type: 'number' },
  { name: 'ir_sensors', type: 'bitmask', bitmaskWidth: 16 },
  { name: 'state', type: 'number' },
];

describe('buildAutoLayoutWidgets', () => {
  it('returns empty for empty schema', () => {
    expect(buildAutoLayoutWidgets([])).toHaveLength(0);
  });

  it('creates a Minimap2D when position fields exist', () => {
    const widgets = buildAutoLayoutWidgets(FULL_SCHEMA);
    const minimap = widgets.find((w) => w.type === 'Minimap2D');
    expect(minimap).toBeDefined();
    expect(minimap!.dataFields).toEqual(['position_x', 'position_y', 'heading_deg']);
  });

  it('creates a single TimeSeriesChart with all numeric fields', () => {
    const widgets = buildAutoLayoutWidgets(FULL_SCHEMA);
    const charts = widgets.filter((w) => w.type === 'TimeSeriesChart');
    expect(charts).toHaveLength(1);
    // Incluye velocidad y motores, excluye posiciones/estado/bitmask
    expect(charts[0]!.dataFields).toContain('speed_rpm');
    expect(charts[0]!.dataFields).toContain('motor_left');
    expect(charts[0]!.dataFields).toContain('motor_right');
    expect(charts[0]!.dataFields).not.toContain('position_x');
    expect(charts[0]!.dataFields).not.toContain('state');
  });

  it('creates a DigitalBitmask for bitmask fields', () => {
    const widgets = buildAutoLayoutWidgets(FULL_SCHEMA);
    const bitmask = widgets.find((w) => w.type === 'DigitalBitmask');
    expect(bitmask).toBeDefined();
    expect(bitmask!.dataFields).toEqual(['ir_sensors']);
  });

  it('creates a StateTimeline for a state field', () => {
    const widgets = buildAutoLayoutWidgets(FULL_SCHEMA);
    const state = widgets.find((w) => w.type === 'StateTimeline');
    expect(state).toBeDefined();
    expect(state!.dataFields).toEqual(['state']);
  });

  it('handles a schema with only numeric fields', () => {
    const widgets = buildAutoLayoutWidgets([
      { name: 'a', type: 'number' },
      { name: 'b', type: 'number' },
    ]);
    expect(widgets).toHaveLength(1);
    expect(widgets[0]!.type).toBe('TimeSeriesChart');
    expect(widgets[0]!.dataFields).toEqual(['a', 'b']);
  });

  it('stacks widgets without overlapping rows', () => {
    const widgets = buildAutoLayoutWidgets(FULL_SCHEMA);
    for (let i = 1; i < widgets.length; i++) {
      const prev = widgets[i - 1]!;
      expect(widgets[i]!.y).toBeGreaterThanOrEqual(prev.y + prev.height);
    }
  });
});
