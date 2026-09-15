import { useEffect } from 'react';
import { videoSynchronizer } from '@core/video-synchronizer';

const RATES = [0.25, 0.5, 1, 2];

function nextRate(current: number, dir: 1 | -1): number {
  const idx = RATES.indexOf(current);
  const base = idx === -1 ? RATES.indexOf(1) : idx;
  const next = Math.max(0, Math.min(RATES.length - 1, base + dir));
  return RATES[next] ?? 1;
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'SELECT' ||
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable
  );
}

/**
 * Atajos de teclado globales:
 *   Espacio = play/pausa · ←/→ = frame · +/− = velocidad · Home/End = inicio/fin
 */
export function useKeyboardShortcuts(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditable(event.target)) return;

      switch (event.code) {
        case 'Space':
          event.preventDefault();
          if (videoSynchronizer.isPlaying) videoSynchronizer.pause();
          else videoSynchronizer.play();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          videoSynchronizer.stepBackward();
          break;
        case 'ArrowRight':
          event.preventDefault();
          videoSynchronizer.stepForward();
          break;
        case 'Home':
          event.preventDefault();
          videoSynchronizer.seekTo(0);
          break;
        case 'End':
          event.preventDefault();
          videoSynchronizer.seekTo(videoSynchronizer.duration);
          break;
        case 'Equal':
        case 'NumpadAdd':
          videoSynchronizer.setPlaybackRate(nextRate(videoSynchronizer.playbackRate, 1));
          break;
        case 'Minus':
        case 'NumpadSubtract':
          videoSynchronizer.setPlaybackRate(nextRate(videoSynchronizer.playbackRate, -1));
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
