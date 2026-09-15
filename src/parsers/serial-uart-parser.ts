import type { ITelemetryParser, ParserMetadata } from './interfaces';
import type { TelemetryFrame, TelemetryDataset, FieldSchema, TelemetryValue } from '@core/types/telemetry';

/** Metadatos enriquecidos para campos conocidos (formato legacy). */
const KNOWN_FIELDS: Record<string, Partial<FieldSchema>> = {
  speed_rpm: { unit: 'RPM', label: 'Velocidad' },
  motor_left: { unit: 'PWM', min: -1000, max: 1000, label: 'Motor izq.' },
  motor_right: { unit: 'PWM', min: -1000, max: 1000, label: 'Motor der.' },
  gyro_z: { unit: '°/s', label: 'Giro Z' },
  accX: { unit: 'm/s²', label: 'Acel X' },
  accY: { unit: 'm/s²', label: 'Acel Y' },
  accZ: { unit: 'm/s²', label: 'Acel Z' },
  gyroX: { unit: '°/s', label: 'Giro X' },
  gyroY: { unit: '°/s', label: 'Giro Y' },
  battery: { unit: '%', min: 0, max: 100, label: 'Batería' },
};

/**
 * Nombres de columna por defecto para el formato CSV sin encabezado.
 * Coincide con el firmware STM32 de referencia:
 * `timestamp_ms, accX, accY, accZ, gyroX, gyroY, gyroZ, battery`
 */
export const DEFAULT_CSV_FIELDS = [
  'accX',
  'accY',
  'accZ',
  'gyroX',
  'gyroY',
  'gyroZ',
  'battery',
];

/** Mapeo del formato legacy de letras a nombres de campo. */
const LEGACY_KEYS: Record<string, string | [string, string]> = {
  S: 'speed_rpm',
  G: 'gyro_z',
  M: ['motor_left', 'motor_right'],
};

function parseValue(raw: string): number | boolean | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
  if (/^0x[0-9a-f]+$/i.test(trimmed)) return parseInt(trimmed, 16);
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d*\.\d+([eE][-+]?\d+)?$/.test(trimmed)) return parseFloat(trimmed);
  return null;
}

/**
 * Parser de telemetría Serial UART.
 *
 * Soporta dos formatos en la misma línea:
 *
 * 1. Legacy:  `T:<ms>,S:<speed>,M:<left>,<right>,G:<gyro>`
 * 2. Genérico: `T:<ms>,<campo>:<valor>,<campo>:<valor>,...`
 *
 * En el formato genérico los campos se descubren dinámicamente y su tipo
 * (number/boolean) se infiere del valor. El timestamp siempre proviene del
 * prefijo `T:` y es el que se usa para sincronizar con el vídeo.
 */
export class SerialUARTParser implements ITelemetryParser {
  readonly metadata: ParserMetadata = {
    name: 'Serial UART',
    description: 'Parsea telemetría en vivo de un stream Serial UART',
    extensions: [],
    icon: 'radio',
    supportsStreaming: true,
    priority: 10,
  };

  private frames: TelemetryFrame[] = [];
  private streamComplete = false;
  private fieldSchemas = new Map<string, FieldSchema>();
  private csvFields: string[] = [...DEFAULT_CSV_FIELDS];

  private readonly TIMESTAMP_REGEX = /^[Tt]\s*[:=]\s*(\d+)/;
  private readonly PAIR_REGEX = /^([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.+)$/;

  /**
   * Configura los nombres de columna para el formato CSV sin encabezado.
   * La primera columna siempre se interpreta como timestamp en ms.
   */
  setCsvFields(fields: string[]): void {
    if (fields.length > 0) {
      this.csvFields = [...fields];
      this.fieldSchemas.clear();
    }
  }

  canParse(): boolean {
    return false;
  }

  async parse(): Promise<TelemetryDataset> {
    throw new Error('Serial parser does not support file parsing. Use parseLine() instead.');
  }

  parseLine(line: string): TelemetryFrame | null {
    const trimmed = line.trim().replace(/\r$/, '');
    if (trimmed.length === 0) return null;

    // Con ':' es formato con claves (legacy T:/S:/M:/G: o genérico campo:valor).
    // Sin ':' es CSV posicional (timestamp primero).
    const frame = trimmed.includes(':') ? this.parseKeyed(trimmed) : this.parseCsv(trimmed);
    if (!frame) return null;

    this.frames.push(frame);
    return frame;
  }

  /**
   * Formato CSV sin encabezado: `<timestamp_ms>,v1,v2,...`
   */
  private parseCsv(trimmed: string): TelemetryFrame | null {
    const tokens = trimmed.split(',').map((t) => t.trim());
    if (tokens.length < 2) return null;

    const tsValue = parseValue(tokens[0]!);
    if (tsValue === null || typeof tsValue === 'boolean') return null;
    const timestamp_ms = Math.round(tsValue);

    const data: Record<string, TelemetryValue> = {};
    for (let i = 1; i < tokens.length; i++) {
      const name = this.csvFields[i - 1] ?? `field_${i}`;
      const value = parseValue(tokens[i]!);
      if (value !== null) this.assign(data, name, value);
    }

    if (Object.keys(data).length === 0) return null;
    return { timestamp_ms, data };
  }

  /**
   * Formato con claves: `T:<ms>,...` (legacy o genérico `campo:valor`).
   */
  private parseKeyed(trimmed: string): TelemetryFrame | null {
    const tokens = trimmed.split(',');
    const tsMatch = this.TIMESTAMP_REGEX.exec(tokens[0] ?? '');
    if (!tsMatch) return null;

    const timestamp_ms = parseInt(tsMatch[1]!, 10);
    const data: Record<string, TelemetryValue> = {};

    let pendingLegacyKey: string | null = null;

    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i]!.trim();
      if (token.length === 0) continue;

      const pairMatch = this.PAIR_REGEX.exec(token);
      if (pairMatch) {
        const key = pairMatch[1]!;
        const rawValue = pairMatch[2]!;
        const value = parseValue(rawValue);

        if (key === 'M' && Array.isArray(LEGACY_KEYS.M)) {
          if (value !== null) {
            const [left, right] = LEGACY_KEYS.M;
            this.assign(data, left!, value);
            pendingLegacyKey = right!;
          }
          continue;
        }

        const mapped = this.mapLegacyKey(key);
        if (value !== null) {
          this.assign(data, mapped, value);
        }
        pendingLegacyKey = null;
      } else if (pendingLegacyKey) {
        const value = parseValue(token);
        if (value !== null) this.assign(data, pendingLegacyKey, value);
        pendingLegacyKey = null;
      }
    }

    if (Object.keys(data).length === 0) return null;
    return { timestamp_ms, data };
  }

  private mapLegacyKey(key: string): string {
    const mapped = LEGACY_KEYS[key];
    if (typeof mapped === 'string') return mapped;
    return key;
  }

  private assign(
    data: Record<string, TelemetryValue>,
    name: string,
    value: number | boolean
  ): void {
    data[name] = value;

    if (!this.fieldSchemas.has(name)) {
      const known = KNOWN_FIELDS[name] ?? {};
      this.fieldSchemas.set(name, {
        name,
        type: typeof value === 'boolean' ? 'boolean' : 'number',
        recommendedWidget: typeof value === 'boolean' ? 'timeline' : 'timeseries',
        ...known,
      });
    }
  }

  isStreamComplete(): boolean {
    return this.streamComplete;
  }

  completeStream(): void {
    this.streamComplete = true;
  }

  getDiscoveredSchema(): FieldSchema[] {
    return Array.from(this.fieldSchemas.values());
  }

  buildDataset(name: string): TelemetryDataset {
    const frames = [...this.frames];
    frames.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

    const startTime_ms = frames.length > 0 ? frames[0].timestamp_ms : 0;
    const endTime_ms = frames.length > 0 ? frames[frames.length - 1].timestamp_ms : 0;
    const duration_ms = endTime_ms - startTime_ms;

    return {
      id: `serial-${Date.now()}`,
      name,
      frames,
      schema: this.getDiscoveredSchema(),
      startTime_ms,
      endTime_ms,
      duration_ms,
      avgSampleRate_hz: duration_ms > 0 ? (frames.length / duration_ms) * 1000 : 0,
      frameCount: frames.length,
      source: { type: 'serial', port: '', baudRate: 115200 },
    };
  }

  get frameCount(): number {
    return this.frames.length;
  }

  destroy(): void {
    this.frames = [];
    this.fieldSchemas.clear();
    this.streamComplete = false;
  }
}
