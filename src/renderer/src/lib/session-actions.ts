import { sessionToDataset, datasetToSession } from '@core/session-codec';
import { telemetryStore } from '@core/telemetry-store';
import { videoSynchronizer } from '@core/video-synchronizer';
import { createEmptyLayout } from '@services/layout-manager';
import { sessionManager } from '@services/session-manager';
import type { SessionWidget } from '@core/types/session';
import type { DashboardLayout, WidgetConfig } from '@core/types/layout';
import { useAppStore } from '../stores/app-store';
import { useLayoutStore } from '../stores/layout-store';
import { applySyncAnchor } from './sync-actions';

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? '';
}

/**
 * Prepara un vídeo para su reproducción. Si su códec no está soportado por
 * Chromium (p. ej. HEVC/H.265), lo transcodea a H.264 con FFmpeg.
 * Devuelve la ruta reproducible o `null` si se canceló o falló.
 */
async function prepareVideoPath(path: string): Promise<string | null> {
  const api = window.api;
  if (!api?.videoPrepare) return path;
  useAppStore.getState().setStatusMessage('Preparando vídeo…');
  try {
    const res = await api.videoPrepare(path);
    if (!res.success) {
      useAppStore.getState().setError(res.error ?? 'No se pudo preparar el vídeo');
      useAppStore.getState().setStatusMessage('');
      return null;
    }
    if (res.cancelled) {
      useAppStore.getState().setStatusMessage('Conversión cancelada');
      return null;
    }
    useAppStore.getState().setStatusMessage(res.transcoded ? 'Vídeo convertido a H.264' : '');
    return res.path || path;
  } catch (err) {
    useAppStore.getState().setError((err as Error).message);
    useAppStore.getState().setStatusMessage('');
    return null;
  } finally {
    useAppStore.getState().setVideoPrepare(false);
  }
}

/** Carga un vídeo (transcodificando si es necesario) en el reproductor. */
export async function loadVideoFile(path: string): Promise<void> {
  const playable = await prepareVideoPath(path);
  if (playable) useAppStore.getState().setVideo(playable, playable);
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
    x: w.pos[0],
    y: w.pos[1],
    width: w.size[0],
    height: w.size[1],
    dataFields: w.fields,
    config: w.config ?? {},
    visible: true,
    zIndex: i,
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
  const { dataset, videoPath, videoInfo, playbackRate, syncAnchor } = useAppStore.getState();
  if (!dataset) {
    useAppStore.getState().setStatusMessage('No hay telemetría para guardar');
    return;
  }

  const widgets: SessionWidget[] = useLayoutStore.getState().widgets.map((w) => ({
    t: w.type,
    pos: [w.x, w.y],
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
    widgets
  );
  session.name = name;

  const dir = await sessionManager.saveSession(session, outputDir, videoPath ?? '');
  useAppStore.getState().setStatusMessage(`Sesión guardada en ${dir}`);
}
