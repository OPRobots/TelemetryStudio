import type {
  SessionFile,
  SessionFieldSchema,
  SessionTelemetry,
  SessionWidget,
  SessionFrameValue,
  SessionVideo,
  SessionSync,
} from './types/session';
import type { TelemetryDataset, TelemetryFrame, FieldSchema, TelemetryValue } from './types/telemetry';

/**
 * Decodifica un JSON de sesión con validación básica.
 */
export function decodeSession(json: string): SessionFile {
  const raw = JSON.parse(json) as Partial<SessionFile> & { v?: number };

  if (raw.v !== 1) {
    throw new Error(`Unsupported session version: ${raw.v}`);
  }
  if (!raw.telemetry || !Array.isArray(raw.telemetry.frames) || !Array.isArray(raw.telemetry.schema)) {
    throw new Error('Missing telemetry data');
  }

  return {
    v: 1,
    name: raw.name ?? 'Untitled',
    created: raw.created ?? new Date().toISOString(),
    video: {
      file: raw.video?.file ?? '',
      fps: raw.video?.fps ?? 30,
      duration_s: raw.video?.duration_s ?? 0,
      resolution: raw.video?.resolution ?? [0, 0],
    },
    sync: {
      offset_ms: raw.sync?.offset_ms ?? 0,
      anchor: raw.sync?.anchor ?? null,
      rate: raw.sync?.rate ?? 1.0,
    },
    telemetry: {
      schema: raw.telemetry.schema,
      frames: raw.telemetry.frames,
    },
    layout: {
      widgets: (raw.layout?.widgets ?? []).map((w) => ({
        t: w.t ?? 'unknown',
        pos: w.pos ?? [0, 0],
        size: w.size ?? [1, 1],
        fields: w.fields ?? [],
        config: w.config ?? {},
      })),
    },
  };
}

/**
 * Codifica un SessionFile a JSON minificado.
 */
export function encodeSession(session: SessionFile): string {
  return JSON.stringify(session);
}

/**
 * Convierte el schema compacto de sesión a `FieldSchema[]`.
 */
export function decodeFieldSchema(schema: SessionFieldSchema[]): FieldSchema[] {
  return schema.map((s) => {
    const [name, type] = s;
    const base: FieldSchema = { name, type: type as FieldSchema['type'] };
    if (type === 'number') {
      if (typeof s[2] === 'string') base.unit = s[2];
      if (typeof s[3] === 'number') base.min = s[3];
      if (typeof s[4] === 'number') base.max = s[4];
    } else if (type === 'bitmask') {
      base.bitmaskWidth = s[2] as number;
    } else if (type === 'array') {
      base.arrayLength = s[2] as number;
    } else if (type === 'boolean') {
      base.recommendedWidget = 'timeline';
    }
    return base;
  });
}

/**
 * Convierte `FieldSchema[]` al schema compacto de sesión.
 */
export function encodeFieldSchema(schema: FieldSchema[]): SessionFieldSchema[] {
  return schema.map((s) => {
    if (s.type === 'number') {
      if (s.unit && s.min != null && s.max != null) return [s.name, 'number', s.unit, s.min, s.max];
      if (s.unit) return [s.name, 'number', s.unit];
      return [s.name, 'number'];
    }
    if (s.type === 'bitmask') return [s.name, 'bitmask', s.bitmaskWidth ?? 8];
    if (s.type === 'boolean') return [s.name, 'boolean'];
    if (s.type === 'array') return [s.name, 'array', s.arrayLength ?? 0];
    return [s.name, 'number'];
  });
}

function toFrameValue(value: TelemetryValue): SessionFrameValue {
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value;
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>);
  return null;
}

/**
 * Convierte un SessionFile a un TelemetryDataset.
 */
export function sessionToDataset(session: SessionFile): TelemetryDataset {
  const fieldSchemas = decodeFieldSchema(session.telemetry.schema);
  const frames: TelemetryFrame[] = session.telemetry.frames.map((row) => {
    const [timestamp_ms, ...values] = row;
    const data: Record<string, TelemetryValue> = {};
    fieldSchemas.forEach((schema, i) => {
      data[schema.name] = (values[i] ?? null) as TelemetryValue;
    });
    return { timestamp_ms: Number(timestamp_ms) || 0, data };
  });

  frames.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

  const startTime_ms = frames.length > 0 ? frames[0].timestamp_ms : 0;
  const endTime_ms = frames.length > 0 ? frames[frames.length - 1].timestamp_ms : 0;
  const duration_ms = endTime_ms - startTime_ms;

  return {
    id: `session-${session.name.replace(/\s+/g, '-').toLowerCase()}`,
    name: session.name,
    frames,
    schema: fieldSchemas,
    startTime_ms,
    endTime_ms,
    duration_ms,
    avgSampleRate_hz: duration_ms > 0 ? (frames.length / duration_ms) * 1000 : 0,
    frameCount: frames.length,
    source: {
      type: 'session',
      sessionName: session.name,
      path: session.video.file,
    },
  };
}

/**
 * Convierte un TelemetryDataset al bloque de telemetría compacto de sesión.
 */
export function datasetToSessionTelemetry(dataset: TelemetryDataset): SessionTelemetry {
  const schema = encodeFieldSchema(dataset.schema);
  const fieldNames = dataset.schema.map((s) => s.name);

  const frames: SessionFrameValue[][] = dataset.frames.map((f) => [
    f.timestamp_ms,
    ...fieldNames.map((name) => toFrameValue(f.data[name])),
  ]);

  return { schema, frames };
}

/**
 * Construye un SessionFile completo a partir de los datos actuales.
 */
export function datasetToSession(
  dataset: TelemetryDataset,
  video: SessionVideo,
  sync: SessionSync,
  widgets: SessionWidget[]
): SessionFile {
  return {
    v: 1,
    name: dataset.name,
    created: new Date().toISOString(),
    video,
    sync,
    telemetry: datasetToSessionTelemetry(dataset),
    layout: { widgets },
  };
}

export type { SessionWidget };
