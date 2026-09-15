import type { FieldSchema } from '@core/types/telemetry';
import type { WidgetConfig } from '@core/types/layout';

let counter = 0;

function makeId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}`;
}

function findField(schema: FieldSchema[], patterns: RegExp[]): string | undefined {
  return schema.find((s) => patterns.some((p) => p.test(s.name)))?.name;
}

/**
 * Construye automáticamente un layout de widgets a partir del schema
 * de telemetría descubierto, teniendo en cuenta el tipo de cada campo.
 *
 * - Campos numéricos → una sola TimeSeriesChart con múltiples series
 * - Bitmasks/arrays → DigitalBitmask
 * - Campos position_x/y (+ heading) → Minimap2D
 * - Campo de estado → StateTimeline
 */
export function buildAutoLayoutWidgets(schema: FieldSchema[]): WidgetConfig[] {
  if (schema.length === 0) return [];

  const xField = findField(schema, [
    /^(position[_-]?x|pos[_-]?x|robot[_-]?x)$/i,
    /^x$/i,
  ]);
  const yField = findField(schema, [
    /^(position[_-]?y|pos[_-]?y|robot[_-]?y)$/i,
    /^y$/i,
  ]);
  const thetaField = findField(schema, [
    /^(heading|heading[_-]?deg|theta|yaw|angle[_-]?z)$/i,
  ]);
  const stateField = findField(schema, [/^(state|state[_-]?id|mode|status|fsm)$/i]);

  const bitmaskFields = schema
    .filter((s) => s.type === 'bitmask' || s.type === 'array')
    .map((s) => s.name);

  const excluded = new Set(
    [xField, yField, thetaField, stateField, ...bitmaskFields].filter(Boolean) as string[]
  );

  const numericFields = schema
    .filter((s) => s.type === 'number' && !excluded.has(s.name))
    .map((s) => s.name);

  const booleanFields = schema
    .filter((s) => s.type === 'boolean' && !excluded.has(s.name))
    .map((s) => s.name);

  const widgets: WidgetConfig[] = [];
  let row = 0;

  if (xField && yField) {
    widgets.push({
      id: makeId('minimap'),
      type: 'Minimap2D',
      label: 'Trayectoria',
      x: 0,
      y: row,
      width: 12,
      height: 8,
      dataFields: [xField, yField, thetaField].filter(Boolean) as string[],
      config: {},
      visible: true,
      zIndex: widgets.length,
    });
    row += 8;
  }

  const chartFields = [...numericFields, ...booleanFields];
  if (chartFields.length > 0) {
    widgets.push({
      id: makeId('chart'),
      type: 'TimeSeriesChart',
      label: 'Telemetría',
      x: 0,
      y: row,
      width: 12,
      height: 7,
      dataFields: chartFields,
      config: { autoFollow: true, windowSeconds: 10 },
      visible: true,
      zIndex: widgets.length,
    });
    row += 7;
  }

  if (bitmaskFields.length > 0) {
    widgets.push({
      id: makeId('bitmask'),
      type: 'DigitalBitmask',
      label: 'Bits',
      x: 0,
      y: row,
      width: 12,
      height: 3,
      dataFields: bitmaskFields,
      config: {},
      visible: true,
      zIndex: widgets.length,
    });
    row += 3;
  }

  if (stateField) {
    widgets.push({
      id: makeId('state'),
      type: 'StateTimeline',
      label: 'Estado',
      x: 0,
      y: row,
      width: 12,
      height: 3,
      dataFields: [stateField],
      config: {},
      visible: true,
      zIndex: widgets.length,
    });
    row += 3;
  }

  return widgets;
}
