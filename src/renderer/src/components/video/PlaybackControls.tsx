import { useAppStore } from '../../stores/app-store';
import { videoSynchronizer } from '@core/video-synchronizer';

const SPEEDS = [0.25, 0.5, 1, 2];

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '00:00.000';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms
    .toString()
    .padStart(3, '0')}`;
}

export function PlaybackControls(): React.ReactElement {
  const isPlaying = useAppStore((s) => s.isPlaying);
  const currentTime = useAppStore((s) => s.currentTime);
  const duration = useAppStore((s) => s.duration);
  const playbackRate = useAppStore((s) => s.playbackRate);

  const togglePlay = (): void => {
    if (isPlaying) videoSynchronizer.pause();
    else videoSynchronizer.play();
  };

  return (
    <div className="flex items-center gap-2.5">
      <button
        onClick={() => videoSynchronizer.stepBackward()}
        className="toolbar-button"
        title="Frame anterior"
      >
        ◀
      </button>
      <button
        onClick={togglePlay}
        className="toolbar-button toolbar-button-primary min-w-[72px]"
        title={isPlaying ? 'Pausa' : 'Reproducir'}
      >
        {isPlaying ? 'Pausa' : 'Play'}
      </button>
      <button
        onClick={() => videoSynchronizer.stepForward()}
        className="toolbar-button"
        title="Frame siguiente"
      >
        ▶
      </button>

      <span className="mono ml-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
        {formatTime(currentTime)}
        <span style={{ color: 'var(--text-disabled)' }}> / </span>
        {formatTime(duration)}
      </span>

      <div className="ml-auto flex items-center gap-1">
        {SPEEDS.map((rate) => {
          const active = playbackRate === rate;
          return (
            <button
              key={rate}
              onClick={() => videoSynchronizer.setPlaybackRate(rate)}
              className="toolbar-button toolbar-button--compact"
              style={
                active
                  ? {
                      background: 'var(--accent-soft)',
                      borderColor: 'var(--accent-border)',
                      color: 'var(--accent)',
                    }
                  : undefined
              }
            >
              {rate}x
            </button>
          );
        })}
      </div>
    </div>
  );
}
