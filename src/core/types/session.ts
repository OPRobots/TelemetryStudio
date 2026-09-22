import type { ExportBoard } from '@shared/export-composition';

/** Versión del formato de sesión */
export const SESSION_VERSION = 1;

/**
 * Schema de campo en formato compacto (array de tuplas).
 *
 * - "number":   [nombre, "number", unidad?, min?, max?]
 * - "bitmask":  [nombre, "bitmask", bits]
 * - "boolean":  [nombre, "boolean"]
 * - "string":   [nombre, "string"]
 * - "array":    [nombre, "array", longitud]
 */
export type SessionFieldSchema =
  | [string, 'number']
  | [string, 'number', string]
  | [string, 'number', string, number, number]
  | [string, 'bitmask', number]
  | [string, 'boolean']
  | [string, 'string']
  | [string, 'array', number];

/**
 * Archivo de sesión completo.
 */
export interface SessionFile {
  v: 1;
  name: string;
  created: string;
  video: SessionVideo;
  sync: SessionSync;
  telemetry: SessionTelemetry;
  layout: SessionLayout;
  /**
   * Board de exportación (editor de la composición de vídeo). Opcional: las
   * sesiones antiguas no lo tienen y se usa un preset por defecto.
   */
  export?: ExportBoard;
}

export interface SessionVideo {
  file: string;
  fps: number;
  duration_s: number;
  resolution: [number, number];
}

export interface SessionSync {
  offset_ms: number;
  anchor: [number, number] | null;
  rate: number;
}

export interface SessionTelemetry {
  schema: SessionFieldSchema[];
  /**
   * Frames en formato compacto: [timestamp_ms, valor_1, valor_2, ...]
   */
  frames: SessionFrameValue[][];
  /**
   * `false` si la captura no tenía timestamps (el tiempo es el índice de
   * muestra). Ausente en sesiones antiguas → se asume `true`.
   */
  timestamped?: boolean;
}

export type SessionFrameValue = number | boolean | string | number[] | null;

export interface SessionLayout {
  widgets: SessionWidget[];
}

export interface SessionWidget {
  /** Identificador estable (para referencias del board de exportación). */
  id?: string;
  t: string;
  size: [number, number];
  fields: string[];
  config?: Record<string, unknown>;
}
