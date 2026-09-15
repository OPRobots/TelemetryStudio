/** Versión del formato de sesión */
export const SESSION_VERSION = 1;

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
}

export interface SessionVideo {
  file: string;
  fps: number;
  duration_ms: number;
  width: number;
  height: number;
}

export interface SessionSync {
  offset_ms: number;
  anchor: [number, number] | null;
  rate: number;
}

export interface SessionTelemetry {
  fps: number;
  num_frames: number;
  duration_ms: number;
  fields: string[];
  frames: SessionFrame[];
}

export interface SessionFrame {
  t: number;
  d: Record<string, number | boolean | number[] | null>;
}

export interface SessionLayout {
  widgets: SessionWidget[];
}

export interface SessionWidget {
  t: string;
  pos: [number, number];
  size: [number, number];
  fields: string[];
  config?: Record<string, unknown>;
}
