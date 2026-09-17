import { useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { useEventListener } from '../../hooks/useEventListener';
import { videoSynchronizer } from '@core/video-synchronizer';
import { alignHere, resetSync } from '../../lib/sync-actions';
import { formatTime } from '../../lib/time-format';

const SPEEDS = [0.25, 0.5, 1, 2];

export function PlaybackControls(): React.ReactElement {
  const isPlaying = useAppStore((s) => s.isPlaying);
  const currentTime = useAppStore((s) => s.currentTime);
  const duration = useAppStore((s) => s.duration);
  const playbackRate = useAppStore((s) => s.playbackRate);
  const anchor = useAppStore((s) => s.syncAnchor);
  const [telemetryTime, setTelemetryTime] = useState(0);

  useEventListener('sync:frame', ({ context }) => {
    setTelemetryTime(context.viewTimestamp_ms);
  });

  const anchorSec = anchor ? anchor.video_ms / 1000 : 0;
  const relative = currentTime - anchorSec;
  const relativeTotal = Math.max((duration || 0) - anchorSec, 0);

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
        {formatTime(relative)}
        <span style={{ color: 'var(--text-disabled)' }}> / </span>
        {formatTime(relativeTotal)}
      </span>

      <span className="sync-time mono ml-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
        t {telemetryTime.toFixed(0)} ms
      </span>

      <div className="ml-auto flex items-center gap-2">
        <button
          className="toolbar-button toolbar-button--compact"
          onClick={() => alignHere()}
          title="Usa el frame actual como t=0 de la telemetría"
        >
          Alinear aquí
        </button>
        <button
          className="toolbar-button toolbar-button--compact"
          onClick={() => resetSync()}
          disabled={!anchor}
        >
          Reset
        </button>

        <div className="ml-1 flex items-center gap-1">
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
    </div>
  );
}
