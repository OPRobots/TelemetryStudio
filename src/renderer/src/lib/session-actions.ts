import { sessionToDataset, datasetToSession } from '@core/session-codec';
import { telemetryStore } from '@core/telemetry-store';
import { videoSynchronizer } from '@core/video-synchronizer';
import { createEmptyLayout } from '@services/layout-manager';
import { sessionManager } from '@services/session-manager';
import type { SessionWidget } from '@core/types/session';
import type { DashboardLayout, WidgetConfig } from '@core/types/layout';
import type { TelemetryDataset } from '@core/types/telemetry';
import { useAppStore } from '../stores/app-store';
import { useLayoutStore } from '../stores/layout-store';
import { applySyncAnchor } from './sync-actions';
import { prepareVideoFile } from './video-prepare';

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? '';
}

/**
 * Dataset actual: el de la sesión cargada, o uno construido con los frames
 * capturados por Serial hasta el momento (aunque el stream no se haya cerrado).
 */
function currentDataset(): TelemetryDataset | null {
  const { dataset, schema } = useAppStore.getState();
  if (dataset) return dataset;

  const frames = [...telemetryStore.getAllFrames()].sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  if (frames.length === 0) return null;

  const startTime_ms = frames[0]!.timestamp_ms;
  const endTime_ms = frames[frames.length - 1]!.timestamp_ms;
  const duration_ms = endTime_ms - startTime_ms;

  return {
    id: `capture-${Date.now()}`,
    name: 'Captura Serial',
    frames,
    schema,
    startTime_ms,
    endTime_ms,
    duration_ms,
    avgSampleRate_hz: duration_ms > 0 ? (frames.length / duration_ms) * 1000 : 0,
    frameCount: frames.length,
    source: { type: 'serial', port: '', baudRate: 115200 },
  };
}

/**
 * Prepara un vídeo y lo carga en el reproductor. Guarda el fps real para que
 * el paso a paso sea de exactamente un frame.
 */
export async function loadVideoFile(path: string): Promise<void> {
  const prepared = await prepareVideoFile(path);
  if (!prepared) return;
  useAppStore.getState().setVideoFps(prepared.fps);
  useAppStore.getState().setVideo(prepared.path, prepared.path);
}

/**
 * Cierra/oculta el vídeo actual: limpia el estado del vídeo y su sincronización.
 * El sincronizador se desadjunta al desmontar el `<video>`.
 */
export function closeVideo(): void {
  videoSynchronizer.clearAnchor();
  useAppStore.getState().clearVideo();
}

export async function openVideoDialog(): Promise<void> {
  const api = window.api;
  if (!api) return;
  const res = await api.dialogOpenVideo();
  if (res.canceled || !res.filePath) return;
  await loadVideoFile(res.filePath);
}

export async function openSessionDialog(): Promise<void> {
  const api = window.api;
  if (!api) return;
  const res = await api.dialogOpenSession();
  if (res.canceled || !res.filePath) return;
  try {
    await loadSession(res.filePath);
  } catch (err) {
    useAppStore.getState().setError(`No se pudo abrir la sesión: ${(err as Error).message}`);
  }
}

/**
 * Carga una sesión completa: telemetría, vídeo, sincronización y layout.
 */
export async function loadSession(jsonPath: string): Promise<void> {
  const session = await sessionManager.readSession(jsonPath);
  const dataset = sessionToDataset(session);

  telemetryStore.loadDataset(dataset);
  useAppStore.getState().setDataset(dataset, dataset.schema);
  useAppStore.getState().setTelemetryTimeReliable(session.telemetry.timestamped ?? true);

  if (session.video.file) {
    const videoPath = await sessionManager.resolveVideoPath(jsonPath, session.video.file);
    if (videoPath) await loadVideoFile(videoPath);
  }

  videoSynchronizer.setPlaybackRate(session.sync.rate);
  applySyncAnchor(
    session.sync.anchor
      ? { video_ms: session.sync.anchor[0] * 1000, telemetry_ms: session.sync.anchor[1] }
      : null
  );

  const widgets: WidgetConfig[] = session.layout.widgets.map((w, i) => ({
    id: `session-widget-${i}`,
    type: w.t,
    label: w.t,
    width: w.size[0],
    height: w.size[1],
    dataFields: w.fields,
    config: w.config ?? {},
    visible: true,
  }));

  const layout: DashboardLayout = {
    ...createEmptyLayout(session.name, 'Sesión cargada'),
    createdAt: session.created,
    modifiedAt: session.created,
    widgets,
  };
  useLayoutStore.getState().setLayout(layout);
  useAppStore.getState().setStatusMessage(`Sesión cargada: ${session.name}`);
}

/**
 * Construye y persiste la sesión actual.
 */
export async function saveSession(name: string, outputDir: string): Promise<void> {
  const { videoPath, videoInfo, playbackRate, syncAnchor, telemetryTimeReliable } =
    useAppStore.getState();
  const dataset = currentDataset();
  if (!dataset) {
    useAppStore.getState().setStatusMessage('No hay telemetría para guardar');
    return;
  }

  const widgets: SessionWidget[] = useLayoutStore.getState().widgets.map((w) => ({
    t: w.type,
    size: [w.width, w.height],
    fields: w.dataFields,
    config: w.config,
  }));

  const session = datasetToSession(
    dataset,
    {
      file: videoPath ? basename(videoPath) : '',
      fps: videoInfo?.fps ?? 30,
      duration_s: videoInfo?.duration_s ?? 0,
      resolution: [videoInfo?.width ?? 0, videoInfo?.height ?? 0],
    },
    {
      offset_ms: 0,
      anchor: syncAnchor ? [syncAnchor.video_ms / 1000, syncAnchor.telemetry_ms] : null,
      rate: playbackRate,
    },
    widgets,
    telemetryTimeReliable
  );
  session.name = name;

  const dir = await sessionManager.saveSession(session, outputDir, videoPath ?? '');
  useAppStore.getState().setStatusMessage(`Sesión guardada en ${dir}`);
}
