import { create } from 'zustand';
import type { FieldSchema, TelemetryDataset } from '@core/types/telemetry';

export interface VideoInfo {
  filename: string;
  duration_s: number;
  fps: number;
  width: number;
  height: number;
}

export type StreamState = 'idle' | 'streaming' | 'stopped';

export interface SyncAnchor {
  video_ms: number;
  telemetry_ms: number;
}

interface AppState {
  // Vídeo
  videoPath: string | null;
  videoSrc: string | null;
  videoInfo: VideoInfo | null;
  videoFps: number | null;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  playbackRate: number;

  // Serial
  serialPorts: Array<{ path: string; manufacturer?: string; vendorId?: string }>;
  serialConnected: boolean;
  serialPort: string | null;
  baudRate: number;
  serialError: string | null;
  streamState: StreamState;

  // Telemetría
  dataset: TelemetryDataset | null;
  schema: FieldSchema[];
  frameCount: number;
  /** Timestamp del último dato de telemetría recibido por Serial. */
  lastDataAt: number | null;
  /** `false` si la captura no tenía timestamps (tiempo por índice de muestra). */
  telemetryTimeReliable: boolean;

  // Sincronización
  syncOffsetMs: number;
  syncAnchor: SyncAnchor | null;

  // Mensajes
  statusMessage: string;
  errorMessage: string | null;

  // Preparación de vídeo (transcode)
  videoPrepareActive: boolean;
  videoPreparePercent: number;
  videoPrepareFilename: string | null;

  // Acciones
  setVideo: (path: string, src: string) => void;
  clearVideo: () => void;
  setVideoInfo: (info: VideoInfo) => void;
  setVideoFps: (fps: number | null) => void;
  setVideoElementState: (state: { isPlaying?: boolean; duration?: number; currentTime?: number }) => void;
  setPlaybackRate: (rate: number) => void;

  setSerialPorts: (ports: Array<{ path: string; manufacturer?: string; vendorId?: string }>) => void;
  setSerialConnected: (connected: boolean, port?: string | null) => void;
  setBaudRate: (baudRate: number) => void;
  setSerialError: (error: string | null) => void;
  setStreamState: (state: StreamState) => void;

  setDataset: (dataset: TelemetryDataset | null, schema: FieldSchema[]) => void;
  setSchema: (schema: FieldSchema[]) => void;
  setFrameCount: (count: number) => void;
  setLastDataAt: (ts: number | null) => void;
  setTelemetryTimeReliable: (reliable: boolean) => void;

  setSyncOffset: (ms: number) => void;
  setSyncAnchor: (anchor: SyncAnchor | null) => void;
  setStatusMessage: (message: string) => void;
  setError: (message: string | null) => void;
  setVideoPrepare: (active: boolean, percent?: number, filename?: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  videoPath: null,
  videoSrc: null,
  videoInfo: null,
  videoFps: null,
  isPlaying: false,
  duration: 0,
  currentTime: 0,
  playbackRate: 1,

  serialPorts: [],
  serialConnected: false,
  serialPort: null,
  baudRate: 115200,
  serialError: null,
  streamState: 'idle',

  dataset: null,
  schema: [],
  frameCount: 0,
  lastDataAt: null,
  telemetryTimeReliable: true,

  syncOffsetMs: 0,
  syncAnchor: null,

  statusMessage: 'Listo',
  errorMessage: null,
  videoPrepareActive: false,
  videoPreparePercent: 0,
  videoPrepareFilename: null,

  setVideo: (path, src) => set({ videoPath: path, videoSrc: src, statusMessage: '' }),
  clearVideo: () =>
    set({
      videoPath: null,
      videoSrc: null,
      videoInfo: null,
      videoFps: null,
      isPlaying: false,
      duration: 0,
      currentTime: 0,
      playbackRate: 1,
      syncAnchor: null,
      syncOffsetMs: 0,
      statusMessage: '',
    }),
  setVideoInfo: (info) => set({ videoInfo: info }),
  setVideoFps: (fps) => set({ videoFps: fps }),
  setVideoElementState: (state) => set(state),
  setPlaybackRate: (rate) => set({ playbackRate: rate }),

  setSerialPorts: (ports) => set({ serialPorts: ports }),
  setSerialConnected: (connected, port) =>
    set((s) => ({ serialConnected: connected, serialPort: port ?? s.serialPort })),
  setBaudRate: (baudRate) => set({ baudRate }),
  setSerialError: (error) => set({ serialError: error }),
  setStreamState: (state) => set({ streamState: state }),

  setDataset: (dataset, schema) =>
    set({ dataset, schema, frameCount: dataset?.frameCount ?? 0 }),
  setSchema: (schema) => set({ schema }),
  setFrameCount: (count) => set({ frameCount: count }),
  setLastDataAt: (ts) => set({ lastDataAt: ts }),
  setTelemetryTimeReliable: (reliable) => set({ telemetryTimeReliable: reliable }),

  setSyncOffset: (ms) => set({ syncOffsetMs: ms }),
  setSyncAnchor: (anchor) => set({ syncAnchor: anchor }),
  setStatusMessage: (message) => set({ statusMessage: message }),
  setError: (message) => set({ errorMessage: message }),
  setVideoPrepare: (active, percent = 0, filename = null) =>
    set({
      videoPrepareActive: active,
      videoPreparePercent: active ? percent : 0,
      videoPrepareFilename: active ? filename : null,
    }),
}));
