import type { SessionFile, SessionFrame, SessionTelemetry } from './types/session';
import type { TelemetryDataset, TelemetryFrame } from './types/telemetry';

/**
 * Decodifica un JSON de sesión en un SessionFile.
 */
export function decodeSession(json: string): SessionFile {
  const data = JSON.parse(json);

  if (data.v !== 1) {
    throw new Error(`Unsupported session version: ${data.v}`);
  }

  return {
    v: 1,
    name: data.name ?? 'Untitled',
    created: data.created ?? new Date().toISOString(),
    video: {
      file: data.video?.file ?? '',
      fps: data.video?.fps ?? 30,
      duration_ms: data.video?.duration_ms ?? 0,
      width: data.video?.width ?? 0,
      height: data.video?.height ?? 0,
    },
    sync: {
      offset_ms: data.sync?.offset_ms ?? 0,
      anchor: data.sync?.anchor ?? null,
      rate: data.sync?.rate ?? 1.0,
    },
    telemetry: {
      fps: data.telemetry?.fps ?? 30,
      num_frames: data.telemetry?.num_frames ?? 0,
      duration_ms: data.telemetry?.duration_ms ?? 0,
      fields: data.telemetry?.fields ?? [],
      frames: (data.telemetry?.frames ?? []).map((f: SessionFrame) => ({
        t: f.t ?? 0,
        d: f.d ?? {},
      })),
    },
    layout: {
      widgets: (data.layout?.widgets ?? []).map((w: SessionWidget) => ({
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
 * Codifica un SessionFile a JSON string.
 */
export function encodeSession(session: SessionFile): string {
  return JSON.stringify(session);
}

/**
 * Convierte un SessionFile a un TelemetryDataset.
 */
export function sessionToDataset(session: SessionFile): TelemetryDataset {
  const frames: TelemetryFrame[] = session.telemetry.frames.map((f) => ({
    timestamp_ms: f.t,
    data: { ...f.d },
  }));

  frames.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

  const startTime_ms = frames.length > 0 ? frames[0].timestamp_ms : 0;
  const endTime_ms = frames.length > 0 ? frames[frames.length - 1].timestamp_ms : 0;
  const duration_ms = endTime_ms - startTime_ms;

  return {
    id: `session-${session.name.replace(/\s+/g, '-').toLowerCase()}`,
    name: session.name,
    frames,
    schema: session.telemetry.fields.map((name) => ({
      name,
      type: 'number' as const,
    })),
    startTime_ms,
    endTime_ms,
    duration_ms,
    avgSampleRate_hz:
      duration_ms > 0 ? (frames.length / duration_ms) * 1000 : 0,
    frameCount: frames.length,
    source: {
      type: 'session',
      sessionName: session.name,
      path: session.video.file,
    },
  };
}

/**
 * Convierte un TelemetryDataset de vuelta a formato SessionTelemetry.
 */
export function datasetToSessionTelemetry(
  dataset: TelemetryDataset
): SessionTelemetry {
  const frames: SessionFrame[] = dataset.frames.map((f) => ({
    t: f.timestamp_ms,
    d: f.data as SessionFrame['d'],
  }));

  return {
    fps: Math.round(dataset.avgSampleRate_hz),
    num_frames: dataset.frameCount,
    duration_ms: dataset.duration_ms,
    fields: dataset.schema.map((s) => s.name),
    frames,
  };
}

// Re-export SessionWidget for convenience
import type { SessionWidget } from './types/session';
export type { SessionWidget };
