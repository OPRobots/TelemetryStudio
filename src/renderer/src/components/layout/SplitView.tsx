import { useEffect, useRef, useState } from 'react';
import { comparisonManager } from '@core/comparison-manager';
import { videoSynchronizer, type VideoSynchronizer } from '@core/video-synchronizer';
import { DEFAULT_PANELS } from '@core/types/layout';
import { comparisonSynchronizer } from '../../lib/comparison-sync';
import { useAppStore } from '../../stores/app-store';
import { useComparisonStore } from '../../stores/comparison-store';
import { useLayoutStore } from '../../stores/layout-store';
import { VideoPlayer } from '../video/VideoPlayer';
import { WidgetHost } from '../widgets/WidgetHost';
import { Splitter } from './Splitter';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Barra de reproducción compartida: mueve ambos sincronizadores en paralelo. */
function SharedControls({ driver }: { driver: VideoSynchronizer }): React.ReactElement {
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTime(driver.currentTime);
      setDuration(driver.duration);
      setPlaying(driver.isPlaying);
    }, 150);
    return () => window.clearInterval(id);
  }, [driver]);

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
  /** Muestra un hueco del alto del vídeo cuando este panel no tiene vídeo. */
  placeholder: boolean;
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
  placeholder,
  fps = null,
  style,
}: PaneProps): React.ReactElement {
  const hasVideo = !!src;
  const videoAreaStyle: React.CSSProperties = { flex: '0 0 auto', height: '44%' };

  return (
    <div className="card" style={style}>
      <div className="card__header">
        <span className="card__title">{label}</span>
        <span className="card__subtitle">{subtitle}</span>
      </div>

      {hasVideo ? (
        <div className="card__body" style={{ ...videoAreaStyle, backgroundColor: '#05070b' }}>
          <VideoPlayer synchronizer={synchronizer} src={src} primary={primary} fps={fps} />
        </div>
      ) : placeholder ? (
        <div
          className="card__body flex items-center justify-center"
          style={{ ...videoAreaStyle, backgroundColor: '#05070b', color: 'var(--text-disabled)' }}
        >
          <span className="text-xs">Sin vídeo</span>
        </div>
      ) : null}

      <div
        className="card__body card__body--fill"
        style={{
          padding: 12,
          ...(hasVideo || placeholder ? { borderTop: '1px solid var(--bg-border)' } : {}),
        }}
      >
        <WidgetHost
          eventName={eventName}
          dataset={dataset}
          primary={primary}
          scrollGroup="comparison"
        />
      </div>
    </div>
  );
}

/**
 * Vista de comparación en paralelo: A (actual) a la izquierda y B (comparada)
 * a la derecha, separadas por un divisor vertical. Los widgets son idénticos
 * (validados por ComparisonManager); el scroll y el cursor/zoom están
 * sincronizados entre ambos paneles.
 */
export function SplitView(): React.ReactElement {
  const primarySrc = useAppStore((s) => s.videoSrc);
  const primaryFps = useAppStore((s) => s.videoFps);
  const referenceSrc = useComparisonStore((s) => s.referenceVideoSrc);
  const referenceFps = useComparisonStore((s) => s.referenceFps);
  const referenceName = useComparisonStore((s) => s.referenceName);
  const stopStore = useComparisonStore((s) => s.stop);

  const panels = useLayoutStore((s) => s.panels);
  const setPanels = useLayoutStore((s) => s.setPanels);

  const rowRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(900);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const paneAWidth = clamp(
    Math.round(panels.comparisonRatio * containerWidth),
    280,
    Math.max(280, containerWidth - 280)
  );

  const hasAnyVideo = !!primarySrc || !!referenceSrc;
  // La barra compartida la guía el panel que sí tiene vídeo.
  const driver = primarySrc ? videoSynchronizer : comparisonSynchronizer;

  const exit = (): void => {
    comparisonManager.stopComparison();
    stopStore();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <span className="section-label" style={{ marginBottom: 0 }}>
          Comparación · A (actual) vs B ({referenceName ?? 'sin nombre'})
        </span>
        <button className="toolbar-button toolbar-button--compact" onClick={exit}>
          Salir
        </button>
      </div>

      {hasAnyVideo && (
        <div className="card" style={{ flexShrink: 0, marginBottom: 12 }}>
          <div className="card__header">
            <span className="card__title">Reproducción</span>
          </div>
          <SharedControls driver={driver} />
        </div>
      )}

      <div ref={rowRef} className="flex min-h-0 flex-1">
        <Pane
          label="Panel A"
          subtitle="Sesión actual"
          src={primarySrc}
          synchronizer={videoSynchronizer}
          eventName="sync:frame"
          dataset="primary"
          primary
          placeholder={!primarySrc && !!referenceSrc}
          fps={primaryFps}
          style={{ width: paneAWidth, flexShrink: 0, minHeight: 0 }}
        />

        <Splitter
          orientation="vertical"
          value={panels.comparisonRatio}
          min={0.3}
          max={0.7}
          unit="ratio"
          label="Ancho del panel A"
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
          placeholder={!referenceSrc && !!primarySrc}
          fps={referenceFps}
          style={{ flex: '1 1 auto', minWidth: 0, minHeight: 0 }}
        />
      </div>
    </div>
  );
}
