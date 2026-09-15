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

interface AppState {
  // Vídeo
  videoPath: string | null;
  videoSrc: string | null;
  videoInfo: VideoInfo | null;
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

  // Sincronización
  syncOffsetMs: number;

  // Mensajes
  statusMessage: string;
  errorMessage: string | null;

  // Acciones
  setVideo: (path: string, src: string) => void;
  setVideoInfo: (info: VideoInfo) => void;
  setVideoElementState: (state: { isPlaying?: boolean; duration?: number; currentTime?: number }) => void;
  setPlaybackRate: (rate: number) => void;

  setSerialPorts: (ports: Array<{ path: string; manufacturer?: string; vendorId?: string }>) => void;
  setSerialConnected: (connected: boolean, port?: string | null) => void;
  setSerialError: (error: string | null) => void;
  setStreamState: (state: StreamState) => void;

  setDataset: (dataset: TelemetryDataset | null, schema: FieldSchema[]) => void;
  setSchema: (schema: FieldSchema[]) => void;
  setFrameCount: (count: number) => void;

  setSyncOffset: (ms: number) => void;
  setStatusMessage: (message: string) => void;
  setError: (message: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  videoPath: null,
  videoSrc: null,
  videoInfo: null,
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

  syncOffsetMs: 0,

  statusMessage: 'Listo',
  errorMessage: null,

  setVideo: (path, src) => set({ videoPath: path, videoSrc: src, statusMessage: '' }),
  setVideoInfo: (info) => set({ videoInfo: info }),
  setVideoElementState: (state) => set(state),
  setPlaybackRate: (rate) => set({ playbackRate: rate }),

  setSerialPorts: (ports) => set({ serialPorts: ports }),
  setSerialConnected: (connected, port) =>
    set((s) => ({ serialConnected: connected, serialPort: port ?? s.serialPort })),
  setSerialError: (error) => set({ serialError: error }),
  setStreamState: (state) => set({ streamState: state }),

  setDataset: (dataset, schema) =>
    set({ dataset, schema, frameCount: dataset?.frameCount ?? 0 }),
  setSchema: (schema) => set({ schema }),
  setFrameCount: (count) => set({ frameCount: count }),

  setSyncOffset: (ms) => set({ syncOffsetMs: ms }),
  setStatusMessage: (message) => set({ statusMessage: message }),
  setError: (message) => set({ errorMessage: message }),
}));
