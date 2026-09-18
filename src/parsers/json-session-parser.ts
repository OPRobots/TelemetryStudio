import type { ITelemetryParser, ParserMetadata } from './interfaces';
import type { TelemetryFrame, TelemetryDataset, FieldSchema } from '@core/types/telemetry';

/**
 * Parser para archivos de sesión JSON (formato compacto).
 * Lee session.json y produce un TelemetryDataset.
 */
export class JSONSessionParser implements ITelemetryParser {
  readonly metadata: ParserMetadata = {
    name: 'JSON Session',
    description: 'Loads telemetry from a Telemetry Studio session (.json)',
    extensions: ['.json'],
    icon: 'folder-open',
    supportsStreaming: false,
    priority: 10,
  };

  canParse(data: ArrayBuffer, filename: string): boolean {
    if (!filename.endsWith('.json')) return false;
    try {
      const text = new TextDecoder().decode(data.slice(0, 512));
      const raw = JSON.parse(text);
      return raw.v === 1 && Array.isArray(raw.telemetry?.frames);
    } catch {
      return false;
    }
  }

  async parse(
    data: ArrayBuffer,
    filename: string,
    onProgress?: (percent: number) => void
  ): Promise<TelemetryDataset> {
    onProgress?.(0);

    const text = new TextDecoder().decode(data);
    const raw = JSON.parse(text);

    if (raw.v !== 1) {
      throw new Error(`Unsupported session version: ${raw.v}`);
    }

    const schema = (raw.telemetry?.schema ?? []) as unknown[];
    const rawFrames = (raw.telemetry?.frames ?? []) as unknown[];

    const fieldSchemas: FieldSchema[] = schema.map((s) => {
      const arr = s as unknown[];
      const [name, type] = arr as [string, string];
      const base: FieldSchema = { name, type: type as FieldSchema['type'] };

      if (type === 'number') {
        if (arr[2]) base.unit = arr[2] as string;
        if (arr[3] != null) base.min = arr[3] as number;
        if (arr[4] != null) base.max = arr[4] as number;
      } else if (type === 'bitmask') {
        base.bitmaskWidth = arr[2] as number;
      } else if (type === 'array') {
        base.arrayLength = arr[2] as number;
      } else if (type === 'boolean' || type === 'string') {
        base.recommendedWidget = 'timeline';
      }

      return base;
    });

    const fieldNames = fieldSchemas.map((s) => s.name);

    onProgress?.(50);

    const telemetryFrames: TelemetryFrame[] = rawFrames.map((frame) => {
      const arr = frame as Array<number | boolean | string | number[] | null>;
      const [timestamp_ms, ...values] = arr;
      const data: Record<string, number | boolean | string | number[] | null> = {};

      fieldNames.forEach((name, i) => {
        data[name] = values[i] ?? null;
      });

      return { timestamp_ms: typeof timestamp_ms === 'number' ? timestamp_ms : 0, data };
    });

    telemetryFrames.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

    const startTime_ms = telemetryFrames[0]?.timestamp_ms ?? 0;
    const endTime_ms = telemetryFrames[telemetryFrames.length - 1]?.timestamp_ms ?? 0;
    const duration_ms = endTime_ms - startTime_ms;

    onProgress?.(100);

    return {
      id: `session-${(raw.name ?? filename).replace(/\s+/g, '-').toLowerCase()}`,
      name: raw.name ?? filename,
      frames: telemetryFrames,
      schema: fieldSchemas,
      startTime_ms,
      endTime_ms,
      duration_ms,
      avgSampleRate_hz:
        duration_ms > 0 ? ((telemetryFrames.length - 1) / (duration_ms / 1000)) : 0,
      frameCount: telemetryFrames.length,
      source: {
        type: 'session',
        sessionName: raw.name ?? filename,
        path: filename,
      },
    };
  }

  destroy(): void {}
}
