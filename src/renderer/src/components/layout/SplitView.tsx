import { useEffect, useState } from 'react';
import { comparisonManager } from '@core/comparison-manager';
import { videoSynchronizer } from '@core/video-synchronizer';
import { comparisonSynchronizer } from '../../lib/comparison-sync';
import { useAppStore } from '../../stores/app-store';
import { useComparisonStore } from '../../stores/comparison-store';
import { VideoPlayer } from '../video/VideoPlayer';
import { PaneControls } from '../video/PaneControls';
import { WidgetHost } from '../widgets/WidgetHost';

function SharedControls(): React.ReactElement {
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTime(videoSynchronizer.currentTime);
      setDuration(videoSynchronizer.duration);
      setPlaying(videoSynchronizer.isPlaying);
    }, 150);
    return () => window.clearInterval(id);
  }, []);

  const toggle = (): void => {
    if (playing) {
      videoSynchronizer.pause();
      comparisonSynchronizer.pause();
    } else {
      videoSynchronizer.play();
      comparisonSynchronizer.play();
    }
  };

  const seek = (t: number): void => {
    videoSynchronizer.seekTo(t);
    comparisonSynchronizer.seekTo(t);
  };

  const step = (dir: 1 | -1): void => {
    if (dir === 1) {
      videoSynchronizer.stepForward();
      comparisonSynchronizer.stepForward();
    } else {
      videoSynchronizer.stepBackward();
      comparisonSynchronizer.stepBackward();
    }
  };

  return (
    <div
      className="flex items-center gap-2 px-2 py-1"
      style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--bg-border)' }}
    >
      <button className="toolbar-button" onClick={() => step(-1)}>
        ◀
      </button>
      <button className="toolbar-button toolbar-button-primary min-w-[64px]" onClick={toggle}>
        {playing ? 'Pausa' : 'Play'}
      </button>
      <button className="toolbar-button" onClick={() => step(1)}>
        ▶
      </button>
      <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
        {time.toFixed(3)} / {Number.isFinite(duration) ? duration.toFixed(2) : '0.00'} s
      </span>
      <input
        type="range"
        min={0}
        max={duration > 0 ? duration : 1}
        step={0.001}
        value={time}
        onChange={(e) => seek(Number(e.target.value))}
        className="flex-1"
        style={{ accentColor: '#3b82f6' }}
      />
    </div>
  );
}

interface PaneProps {
  label: string;
  src: string | null;
  eventName: 'sync:frame' | 'comparison:frame';
  dataset: 'primary' | 'comparison';
  primary: boolean;
  showControls: boolean;
}

function Pane({ label, src, eventName, dataset, primary, showControls }: PaneProps): React.ReactElement {
  const sync = primary ? videoSynchronizer : comparisonSynchronizer;
  return (
    <div
      className="flex min-h-0 flex-col overflow-hidden"
      style={{ border: '1px solid var(--bg-border)', borderRadius: 6 }}
    >
      <div
        className="truncate px-2 py-1 text-xs"
        style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
      >
        {label}
      </div>
      <div className="min-h-0" style={{ height: '42%' }}>
        <VideoPlayer synchronizer={sync} src={src} primary={primary} />
      </div>
      {showControls && <PaneControls synchronizer={sync} />}
      <div className="min-h-0 flex-1 overflow-hidden">
        <WidgetHost eventName={eventName} dataset={dataset} primary={primary} />
      </div>
    </div>
  );
}

/**
 * Vista de comparación side-by-side: dos paneles apilados con vídeo y widgets.
 * Los widgets son idénticos (validados por ComparisonManager); solo cambia el dato.
 */
export function SplitView(): React.ReactElement {
  const primarySrc = useAppStore((s) => s.videoSrc);
  const referenceSrc = useComparisonStore((s) => s.referenceVideoSrc);
  const referenceName = useComparisonStore((s) => s.referenceName);
  const sharedBar = useComparisonStore((s) => s.sharedBar);
  const setSharedBar = useComparisonStore((s) => s.setSharedBar);
  const stopStore = useComparisonStore((s) => s.stop);

  const exit = (): void => {
    comparisonManager.stopComparison();
    stopStore();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex items-center justify-between px-3 py-1"
        style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--bg-border)' }}
      >
        <span className="truncate text-xs" style={{ color: 'var(--text-primary)' }}>
          Comparación — A (actual) vs B ({referenceName ?? 'sin nombre'})
        </span>
        <div className="flex items-center gap-3">
          <label className="dialog-checkbox">
            <input
              type="checkbox"
              checked={sharedBar}
              onChange={(e) => {
                setSharedBar(e.target.checked);
                comparisonManager.setSyncBarMode(e.target.checked);
              }}
            />
            <span className="text-xs">Barra compartida</span>
          </label>
          <button className="toolbar-button" onClick={exit}>
            Salir de comparación
          </button>
        </div>
      </div>

      {sharedBar && <SharedControls />}

      <div className="grid min-h-0 flex-1 gap-1 p-1" style={{ gridTemplateRows: '1fr 1fr' }}>
        <Pane
          label="A — Sesión actual"
          src={primarySrc}
          eventName="sync:frame"
          dataset="primary"
          primary
          showControls={!sharedBar}
        />
        <Pane
          label={`B — ${referenceName ?? 'Referencia'}`}
          src={referenceSrc}
          eventName="comparison:frame"
          dataset="comparison"
          primary={false}
          showControls={!sharedBar}
        />
      </div>
    </div>
  );
}
