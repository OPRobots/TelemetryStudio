/**
 * Un fotograma individual de telemetría.
 * Representa el estado completo del robot en un instante dado.
 */
export interface TelemetryFrame {
  /** Timestamp en milisegundos desde el inicio de la grabación */
  timestamp_ms: number;

  /** Datos del sensor/actuador como mapa genérico */
  data: Record<string, TelemetryValue>;
}

/**
 * Valores permitidos en un TelemetryFrame.
 */
export type TelemetryValue =
  | number
  | boolean
  | string
  | number[]
  | Int8Array
  | Uint8Array
  | Uint16Array
  | Float32Array
  | null;

/**
 * Conjunto completo de telemetría cargado desde un archivo o streaming.
 */
export interface TelemetryDataset {
  id: string;
  name: string;
  frames: TelemetryFrame[];
  schema: FieldSchema[];
  startTime_ms: number;
  endTime_ms: number;
  duration_ms: number;
  avgSampleRate_hz: number;
  frameCount: number;
  source: DataSource;
}

/**
 * Descripción de un campo de datos dentro de un TelemetryFrame.
 */
export interface FieldSchema {
  name: string;
  type: 'number' | 'boolean' | 'string' | 'array' | 'bitmask';
  unit?: string;
  min?: number;
  max?: number;
  label?: string;
  arrayLength?: number;
  bitmaskWidth?: number;
  recommendedWidget?: 'timeseries' | 'bitmask' | 'minimap' | 'timeline';
}

/**
 * Origen de los datos de telemetría.
 */
export type DataSource =
  | { type: 'session'; sessionName: string; path: string }
  | { type: 'serial'; port: string; baudRate: number };
