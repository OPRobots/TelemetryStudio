import { useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/app-store';
import { videoSynchronizer, type VideoSynchronizer } from '@core/video-synchronizer';

/**
 * Convierte una ruta local en una URL `file://` válida.
 */
export function toFileUrl(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${normalized}`;
  }
  return `file://${normalized}`;
}

interface VideoPlayerProps {
  /** Sincronizador a usar (por defecto el primario). */
  synchronizer?: VideoSynchronizer;
  /** Fuente del vídeo. Si es undefined usa la del store primario. */
  src?: string | null;
  /** Si es el panel primario, actualiza el estado global y detecta FPS. */
  primary?: boolean;
  onFpsDetected?: (fps: number) => void;
}

export function VideoPlayer({
  synchronizer,
  src,
  primary = true,
  onFpsDetected,
}: VideoPlayerProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const storeSrc = useAppStore((s) => s.videoSrc);
  const videoPath = useAppStore((s) => s.videoPath);
  const setVideoInfo = useAppStore((s) => s.setVideoInfo);
  const setVideoElementState = useAppStore((s) => s.setVideoElementState);
  const setPlaybackRate = useAppStore((s) => s.setPlaybackRate);

  const sync = synchronizer ?? videoSynchronizer;
  const effectiveSrc = src !== undefined ? src : storeSrc;

  // Adjuntar el sincronizador al elemento de vídeo
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    sync.attach(video);

    const onLoadedMetadata = (): void => {
      const filename = videoPath ? videoPath.split(/[\\/]/).pop() ?? '' : '';
      if (primary) {
        setVideoInfo({
          filename,
          duration_s: video.duration || 0,
          fps: 30,
          width: video.videoWidth,
          height: video.videoHeight,
        });
        setVideoElementState({ duration: video.duration || 0 });
      }
      detectFps(video, (fps) => {
        sync.setDeclaredFps(fps);
        onFpsDetected?.(fps);
      });
    };

    const onPlay = (): void => {
      if (primary) setVideoElementState({ isPlaying: true });
    };
    const onPause = (): void => {
      if (primary) setVideoElementState({ isPlaying: false });
    };
    const onEnded = (): void => {
      if (primary) setVideoElementState({ isPlaying: false });
    };
    const onTimeUpdate = (): void => {
      if (primary) setVideoElementState({ currentTime: video.currentTime });
    };
    const onRateChange = (): void => {
      if (primary) setPlaybackRate(video.playbackRate);
    };
    const onSeeked = (): void => sync.refresh();

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ratechange', onRateChange);
    video.addEventListener('seeked', onSeeked);

    // Si los metadatos ya están cargados (caché), dispararlos manualmente
    if (video.readyState >= 1) onLoadedMetadata();

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ratechange', onRateChange);
      video.removeEventListener('seeked', onSeeked);
      sync.detach();
    };
  }, [sync, setVideoInfo, setVideoElementState, setPlaybackRate, onFpsDetected, videoPath, primary]);

  // Recargar cuando cambia el vídeo
  useEffect(() => {
    const video = videoRef.current;
    if (video && effectiveSrc) video.load();
  }, [effectiveSrc]);

  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden"
      style={{
        backgroundColor: '#05070b',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--bg-border)',
      }}
    >
      <video
        ref={videoRef}
        src={effectiveSrc ? toFileUrl(effectiveSrc) : undefined}
        controls={false}
        className="max-h-full max-w-full"
        style={{ backgroundColor: '#000' }}
      />
    </div>
  );
}

/**
 * Detecta el FPS real del vídeo midiendo el delta de `mediaTime`.
 */
function detectFps(video: HTMLVideoElement, onDetected: (fps: number) => void): void {
  const samples: number[] = [];
  let lastMediaTime = -1;

  const sample = (_now: number, metadata: { mediaTime: number }): void => {
    if (lastMediaTime >= 0) {
      const delta = metadata.mediaTime - lastMediaTime;
      if (delta > 0.001) samples.push(delta);
    }
    lastMediaTime = metadata.mediaTime;

    if (samples.length < 12) {
      video.requestVideoFrameCallback(sample);
    } else {
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      const fps = Math.round(1 / avg);
      onDetected(fps >= 1 && fps <= 240 ? fps : 30);
    }
  };

  video.requestVideoFrameCallback(sample);
}
