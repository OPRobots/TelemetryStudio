import { useEffect, useRef, useState } from 'react';
import { comparisonManager } from '@core/comparison-manager';
import { videoSynchronizer, type VideoSynchronizer } from '@core/video-synchronizer';
import { DEFAULT_PANELS } from '@core/types/layout';
import { comparisonSynchronizer } from '../../lib/comparison-sync';
import { useAppStore } from '../../stores/app-store';
import { useComparisonStore } from '../../stores/comparison-store';
import { useLayoutStore } from '../../stores/layout-store';
import { VideoPlayer } from '../video/VideoPlayer';
import { PaneControls } from '../video/PaneControls';
import { WidgetHost } from '../widgets/WidgetHost';
import { Splitter } from './Splitter';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

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
    <div className="flex items-center gap-2.5" style={{ padding: '10px 14px' }}>
      <button className="toolbar-button" onClick={() => step(-1)}>
        ◀
      </button>
      <button className="toolbar-button toolbar-button-primary min-w-[72px]" onClick={toggle}>
        {playing ? 'Pausa' : 'Play'}
      </button>
      <button className="toolbar-button" onClick={() => step(1)}>
        ▶
      </button>
      <span className="mono ml-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
        {time.toFixed(3)}
        <span style={{ color: 'var(--text-disabled)' }}> / </span>
        {Number.isFinite(duration) ? duration.toFixed(2) : '0.00'} s
      </span>
      <input
        type="range"
        min={0}
        max={duration > 0 ? duration : 1}
        step={0.001}
        value={time}
        onChange={(e) => seek(Number(e.target.value))}
        className="ml-2 flex-1"
      />
    </div>
  );
}

interface PaneProps {
  label: string;
  subtitle: string;
  src: string | null;
  synchronizer: VideoSynchronizer;
  eventName: 'sync:frame' | 'comparison:frame';
  dataset: 'primary' | 'comparison';
  primary: boolean;
  showControls: boolean;
  fps?: number | null;
  style?: React.CSSProperties;
}

function Pane({
  label,
  subtitle,
  src,
  synchronizer,
  eventName,
  dataset,
  primary,
  showControls,
  fps = null,
  style,
}: PaneProps): React.ReactElement {
  return (
    <div className="card" style={style}>
      <div className="card__header">
        <span className="card__title">{label}</span>
        <span className="card__subtitle">{subtitle}</span>
      </div>
      <div
        className="card__body"
        style={{ flex: '0 0 auto', height: '44%', backgroundColor: '#05070b' }}
      >
        <VideoPlayer synchronizer={synchronizer} src={src} primary={primary} fps={fps} />
      </div>
      {showControls && (
        <div className="card__footer">
          <PaneControls synchronizer={synchronizer} />
        </div>
      )}
      <div
        className="card__body"
        style={{ flex: '1 1 auto', minHeight: 0, padding: 12, borderTop: '1px solid var(--bg-border)' }}
      >
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
  const primaryFps = useAppStore((s) => s.videoFps);
  const referenceSrc = useComparisonStore((s) => s.referenceVideoSrc);
  const referenceFps = useComparisonStore((s) => s.referenceFps);
  const referenceName = useComparisonStore((s) => s.referenceName);
  const sharedBar = useComparisonStore((s) => s.sharedBar);
  const setSharedBar = useComparisonStore((s) => s.setSharedBar);
  const stopStore = useComparisonStore((s) => s.stop);

  const panels = useLayoutStore((s) => s.panels);
  const setPanels = useLayoutStore((s) => s.setPanels);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setContainerHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const paneAHeight = clamp(
    Math.round(panels.comparisonRatio * containerHeight),
    160,
    Math.max(160, containerHeight - 220)
  );

  const exit = (): void => {
    comparisonManager.stopComparison();
    stopStore();
  };

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <span className="section-label" style={{ marginBottom: 0 }}>
          Comparación · A (actual) vs B ({referenceName ?? 'sin nombre'})
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
          <button className="toolbar-button toolbar-button--compact" onClick={exit}>
            Salir
          </button>
        </div>
      </div>

      {sharedBar && (
        <div className="card" style={{ flexShrink: 0, marginBottom: 12 }}>
          <div className="card__header">
            <span className="card__title">Reproducción</span>
          </div>
          <SharedControls />
        </div>
      )}

      <Pane
        label="Panel A"
        subtitle="Sesión actual"
        src={primarySrc}
        synchronizer={videoSynchronizer}
        eventName="sync:frame"
        dataset="primary"
        primary
        showControls={!sharedBar}
        fps={primaryFps}
        style={{ height: paneAHeight, flexShrink: 0 }}
      />

      <Splitter
        orientation="horizontal"
        value={panels.comparisonRatio}
        min={0.3}
        max={0.7}
        unit="ratio"
        label="Alto del panel A"
        onChange={(v) => setPanels({ comparisonRatio: v })}
        onReset={() => setPanels({ comparisonRatio: DEFAULT_PANELS.comparisonRatio })}
      />

      <Pane
        label="Panel B"
        subtitle={referenceName ?? 'Referencia'}
        src={referenceSrc}
        synchronizer={comparisonSynchronizer}
        eventName="comparison:frame"
        dataset="comparison"
        primary={false}
        showControls={!sharedBar}
        fps={referenceFps}
        style={{ flex: '1 1 auto', minHeight: 0 }}
      />
    </div>
  );
}
