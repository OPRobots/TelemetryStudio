import { useEffect, useState } from 'react';
import type { VideoSynchronizer } from '@core/video-synchronizer';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '00:00.000';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms
    .toString()
    .padStart(3, '0')}`;
}

interface PaneControlsProps {
  synchronizer: VideoSynchronizer;
}

/**
 * Controles de reproducción genéricos para un sincronizador concreto.
 * Usados en el panel de comparación (y en modo independiente).
 */
export function PaneControls({ synchronizer }: PaneControlsProps): React.ReactElement {
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTime(synchronizer.currentTime);
      setDuration(synchronizer.duration);
      setPlaying(synchronizer.isPlaying);
    }, 200);
    return () => window.clearInterval(id);
  }, [synchronizer]);

  return (
    <div
      className="flex items-center gap-2 px-2 py-1"
      style={{ borderTop: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-secondary)' }}
    >
      <button className="toolbar-button" onClick={() => synchronizer.stepBackward()} title="Frame anterior">
        ◀
      </button>
      <button
        className="toolbar-button toolbar-button-primary min-w-[64px]"
        onClick={() => (playing ? synchronizer.pause() : synchronizer.play())}
      >
        {playing ? 'Pausa' : 'Play'}
      </button>
      <button className="toolbar-button" onClick={() => synchronizer.stepForward()} title="Frame siguiente">
        ▶
      </button>
      <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
        {formatTime(time)} / {formatTime(duration)}
      </span>
      <input
        type="range"
        min={0}
        max={duration > 0 ? duration : 1}
        step={0.001}
        value={time}
        onChange={(e) => synchronizer.seekTo(Number(e.target.value))}
        className="flex-1"
        style={{ accentColor: '#3b82f6' }}
      />
    </div>
  );
}
