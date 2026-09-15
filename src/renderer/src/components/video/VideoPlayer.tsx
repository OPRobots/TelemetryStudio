import { useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/app-store';
import { videoSynchronizer } from '@core/video-synchronizer';

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
  onFpsDetected?: (fps: number) => void;
}

export function VideoPlayer({ onFpsDetected }: VideoPlayerProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = useAppStore((s) => s.videoSrc);
  const videoPath = useAppStore((s) => s.videoPath);
  const setVideoInfo = useAppStore((s) => s.setVideoInfo);
  const setVideoElementState = useAppStore((s) => s.setVideoElementState);
  const setPlaybackRate = useAppStore((s) => s.setPlaybackRate);

  // Adjuntar el sincronizador al elemento de vídeo
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    videoSynchronizer.attach(video);

    const onLoadedMetadata = (): void => {
      const filename = videoPath ? videoPath.split(/[\\/]/).pop() ?? '' : '';
      setVideoInfo({
        filename,
        duration_s: video.duration || 0,
        fps: 30,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      setVideoElementState({ duration: video.duration || 0 });
      detectFps(video, (fps) => {
        videoSynchronizer.setDeclaredFps(fps);
        onFpsDetected?.(fps);
      });
    };

    const onPlay = (): void => setVideoElementState({ isPlaying: true });
    const onPause = (): void => setVideoElementState({ isPlaying: false });
    const onEnded = (): void => setVideoElementState({ isPlaying: false });
    const onTimeUpdate = (): void =>
      setVideoElementState({ currentTime: video.currentTime });
    const onRateChange = (): void => setPlaybackRate(video.playbackRate);
    const onSeeked = (): void => videoSynchronizer.refresh();

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
      videoSynchronizer.detach();
    };
  }, [setVideoInfo, setVideoElementState, setPlaybackRate, onFpsDetected, videoPath]);

  // Recargar cuando cambia el vídeo
  useEffect(() => {
    const video = videoRef.current;
    if (video && src) video.load();
  }, [src]);

  return (
    <div className="flex h-full w-full items-center justify-center" style={{ backgroundColor: '#000' }}>
      <video
        ref={videoRef}
        src={src ? toFileUrl(src) : undefined}
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
