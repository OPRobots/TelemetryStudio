import type { FieldSchema } from '@core/types/telemetry';
import type { WidgetConfig } from '@core/types/layout';

/** Campos que representan un estado (uno o varios): `state`, `state_*`, `mode`, `status`, `fsm`. */
export const STATE_FIELD_PATTERN = /^(state|state[_-].*|mode|status|fsm)$/i;

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
 * Todos los widgets se crean a ancho completo; el orden define su colocación
 * en la rejilla fluida.
 *
 * - Cada campo numérico → su propia TimeSeriesChart, a media anchura
 * - Campos booleanos → una TimeSeriesChart conjunta (a media anchura)
 * - Bitmasks/arrays → DigitalBitmask (todos los bits en una sola fila)
 * - Campos position_x/y (+ heading) → Minimap2D
 * - Cada campo de estado (`state`, `state_*`, `mode`, `status`, `fsm`) → un
 *   StateTimeline propio
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
  const stateFields = schema.filter((s) => STATE_FIELD_PATTERN.test(s.name));

  const bitmaskFields = schema
    .filter((s) => s.type === 'bitmask' || s.type === 'array')
    .map((s) => s.name);

  const excluded = new Set(
    [xField, yField, thetaField, ...stateFields.map((s) => s.name), ...bitmaskFields].filter(
      Boolean
    ) as string[]
  );

  const numericFields = schema
    .filter((s) => s.type === 'number' && !excluded.has(s.name))
    .map((s) => s.name);

  const booleanFields = schema
    .filter((s) => s.type === 'boolean' && !excluded.has(s.name))
    .map((s) => s.name);

  const widgets: WidgetConfig[] = [];

  if (xField && yField) {
    widgets.push({
      id: makeId('minimap'),
      type: 'Minimap2D',
      label: 'Trayectoria',
      width: 12,
      height: 8,
      dataFields: [xField, yField, thetaField].filter(Boolean) as string[],
      config: {},
      visible: true,
    });
  }

  // Una gráfica independiente por cada campo numérico (media anchura).
  for (const field of numericFields) {
    widgets.push({
      id: makeId('chart'),
      type: 'TimeSeriesChart',
      label: field,
      width: 6,
      height: 6,
      dataFields: [field],
      config: { autoFollow: true, smoothing: 1 },
      visible: true,
    });
  }

  // Los booleanos se agrupan en una única gráfica (media anchura).
  if (booleanFields.length > 0) {
    widgets.push({
      id: makeId('chart'),
      type: 'TimeSeriesChart',
      label: 'Booleanos',
      width: 6,
      height: 6,
      dataFields: booleanFields,
      config: { autoFollow: true, smoothing: 1 },
      visible: true,
    });
  }

  if (bitmaskFields.length > 0) {
    // Todos los bits en una sola fila (arrays de sensores de línea).
    const firstBitmask = schema.find((s) => bitmaskFields.includes(s.name));
    const width = firstBitmask?.bitmaskWidth ?? firstBitmask?.arrayLength ?? 8;
    widgets.push({
      id: makeId('bitmask'),
      type: 'DigitalBitmask',
      label: 'Bits',
      width: 12,
      height: 3,
      dataFields: bitmaskFields,
      config: { ledsPerRow: Math.max(width, 1), rows: 1 },
      visible: true,
    });
  }

  for (const state of stateFields) {
    const suffix = state.name.replace(/^state[_-]/, '');
    widgets.push({
      id: makeId('state'),
      type: 'StateTimeline',
      label: state.name === 'state' ? 'Estado' : `Estado: ${suffix}`,
      width: 12,
      height: 3,
      dataFields: [state.name],
      config: {},
      visible: true,
    });
  }

  return widgets;
}
