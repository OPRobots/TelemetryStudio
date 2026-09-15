import { videoSynchronizer } from '@core/video-synchronizer';
import { useAppStore, type SyncAnchor } from '../stores/app-store';

/**
 * Alinea la telemetría con el vídeo: el frame actual del reproductor pasa a ser
 * el t=0 de la telemetría (anchor `{ video_ms: frameActual, telemetry_ms: 0 }`).
 */
export function alignHere(): SyncAnchor {
  const anchor: SyncAnchor = {
    video_ms: Math.round(videoSynchronizer.currentTime * 1000),
    telemetry_ms: 0,
  };
  videoSynchronizer.setDriftOffset(0);
  videoSynchronizer.setAnchorPoint(anchor.video_ms, anchor.telemetry_ms);
  useAppStore.getState().setSyncAnchor(anchor);
  videoSynchronizer.refresh();
  return anchor;
}

/** Elimina el anchor y vuelve a tiempo absoluto de vídeo. */
export function resetSync(): void {
  videoSynchronizer.clearAnchor();
  videoSynchronizer.setDriftOffset(0);
  useAppStore.getState().setSyncAnchor(null);
  videoSynchronizer.refresh();
}

/** Aplica un anchor (p. ej. al cargar una sesión). */
export function applySyncAnchor(anchor: SyncAnchor | null): void {
  if (anchor) {
    videoSynchronizer.setDriftOffset(0);
    videoSynchronizer.setAnchorPoint(anchor.video_ms, anchor.telemetry_ms);
    useAppStore.getState().setSyncAnchor(anchor);
    videoSynchronizer.refresh();
  } else {
    resetSync();
  }
}
