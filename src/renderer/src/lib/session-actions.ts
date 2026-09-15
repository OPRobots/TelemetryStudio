import {
  decodeSession,
  encodeSession,
  sessionToDataset,
  datasetToSession,
} from '@core/session-codec';
import { telemetryStore } from '@core/telemetry-store';
import { videoSynchronizer } from '@core/video-synchronizer';
import { createEmptyLayout } from '@services/layout-manager';
import type { SessionWidget } from '@core/types/session';
import type { DashboardLayout, WidgetConfig } from '@core/types/layout';
import { useAppStore } from '../stores/app-store';
import { useLayoutStore } from '../stores/layout-store';

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? '';
}

export async function openVideoDialog(): Promise<void> {
  const api = window.api;
  if (!api) return;
  const res = await api.dialogOpenVideo();
  if (res.canceled || !res.filePath) return;
  useAppStore.getState().setVideo(res.filePath, res.filePath);
}

export async function openSessionDialog(): Promise<void> {
  const api = window.api;
  if (!api) return;
  const res = await api.dialogOpenSession();
  if (res.canceled || !res.filePath) return;
  await loadSession(res.filePath);
}

export async function loadSession(jsonPath: string): Promise<void> {
  const api = window.api;
  if (!api) return;

  const json = await api.sessionRead(jsonPath);
  const session = decodeSession(json);
  const dataset = sessionToDataset(session);

  telemetryStore.loadDataset(dataset);
  useAppStore.getState().setDataset(dataset, dataset.schema);

  if (session.video.file) {
    const videoPath = await api.sessionGetVideoPath(jsonPath, session.video.file);
    useAppStore.getState().setVideo(videoPath, videoPath);
  }

  videoSynchronizer.setDriftOffset(session.sync.offset_ms);
  useAppStore.getState().setSyncOffset(session.sync.offset_ms);
  videoSynchronizer.setPlaybackRate(session.sync.rate);
  if (session.sync.anchor) {
    videoSynchronizer.setAnchorPoint(session.sync.anchor[0], session.sync.anchor[1]);
  }

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

export async function saveSession(name: string, outputDir: string): Promise<void> {
  const api = window.api;
  if (!api) return;

  const { dataset, videoPath, videoInfo, syncOffsetMs, playbackRate } = useAppStore.getState();
  if (!dataset) {
    useAppStore.getState().setStatusMessage('No hay telemetría para guardar');
    return;
  }

  const anchor = videoSynchronizer.anchor;
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
      offset_ms: syncOffsetMs,
      anchor: anchor ? [anchor.video_ms / 1000, anchor.telemetry_ms] : null,
      rate: playbackRate,
    },
    widgets
  );
  session.name = name;

  const dir = await api.sessionExport(name, outputDir, encodeSession(session), videoPath ?? '');
  useAppStore.getState().setStatusMessage(`Sesión guardada en ${dir}`);
}
