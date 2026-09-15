import { useMemo, useState } from 'react';
import type { ExportConfig } from '@core/types/video';
import { exportVideo, type ExportProgress } from '@services/video-exporter';
import { useAppStore } from '../../stores/app-store';
import { useLayoutStore } from '../../stores/layout-store';

interface ExportDialogProps {
  onClose: () => void;
}

export function ExportDialog({ onClose }: ExportDialogProps): React.ReactElement {
  const videoInfo = useAppStore((s) => s.videoInfo);
  const dataset = useAppStore((s) => s.dataset);
  const widgets = useLayoutStore((s) => s.widgets);

  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(720);
  const [fps, setFps] = useState(30);
  const [startFrame, setStartFrame] = useState(0);
  const [includeBaseVideo, setIncludeBaseVideo] = useState(true);
  const [includeOverlays, setIncludeOverlays] = useState(true);
  const [includeWidgets, setIncludeWidgets] = useState(true);
  const [sessionLabel, setSessionLabel] = useState(dataset?.name ?? 'OPRobots Telemetry Studio');

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalFrames = useMemo(
    () => Math.max(Math.round((videoInfo?.duration_s || 1) * fps), 1),
    [videoInfo?.duration_s, fps]
  );
  const [endFrame, setEndFrame] = useState<number | null>(null);
  const effectiveEnd = endFrame ?? totalFrames - 1;

  const run = async (): Promise<void> => {
    const api = window.api;
    if (!api) return;

    const config: ExportConfig = {
      outputPath: '',
      format: 'mp4',
      codec: 'h264',
      fps,
      width,
      height,
      bitrate: 0,
      keyframeInterval_s: 2,
      startFrame,
      endFrame: Math.min(effectiveEnd, totalFrames - 1),
      includedWidgets: includeWidgets ? widgets.filter((w) => w.visible).map((w) => w.id) : [],
      includeBaseVideo,
      includeOverlays,
      sessionLabel,
    };

    setBusy(true);
    setError(null);
    setOutputPath(null);
    try {
      const path = await exportVideo(config, (p) => setProgress(p));
      setOutputPath(path);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    await window.api?.exportSave();
  };

  return (
    <div className="dialog-backdrop" onClick={busy ? undefined : onClose}>
      <div className="dialog-panel" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Exportar vídeo con overlays
        </h3>

        <div className="dialog-row">
          <div>
            <label className="dialog-label">Ancho</label>
            <input id="export-width" type="number" className="dialog-input" value={width} onChange={(e) => setWidth(Number(e.target.value))} />
          </div>
          <div>
            <label className="dialog-label">Alto</label>
            <input id="export-height" type="number" className="dialog-input" value={height} onChange={(e) => setHeight(Number(e.target.value))} />
          </div>
          <div>
            <label className="dialog-label">FPS</label>
            <input id="export-fps" type="number" className="dialog-input" value={fps} onChange={(e) => setFps(Number(e.target.value))} />
          </div>
        </div>

        <div className="dialog-row">
          <div>
            <label className="dialog-label">Frame inicio</label>
            <input id="export-start" type="number" className="dialog-input" value={startFrame} onChange={(e) => setStartFrame(Number(e.target.value))} />
          </div>
          <div>
            <label className="dialog-label">Frame fin</label>
            <input
              id="export-end"
              type="number"
              className="dialog-input"
              value={effectiveEnd}
              onChange={(e) => setEndFrame(Number(e.target.value))}
            />
          </div>
        </div>

        <label className="dialog-label">Etiqueta de sesión (overlay)</label>
        <input
          id="export-label"
          className="dialog-input"
          value={sessionLabel}
          onChange={(e) => setSessionLabel(e.target.value)}
        />

        <div className="mt-2 flex flex-col gap-1">
          <label className="dialog-checkbox">
            <input type="checkbox" checked={includeBaseVideo} onChange={(e) => setIncludeBaseVideo(e.target.checked)} />
            <span className="text-xs">Incluir vídeo base</span>
          </label>
          <label className="dialog-checkbox">
            <input type="checkbox" checked={includeWidgets} onChange={(e) => setIncludeWidgets(e.target.checked)} />
            <span className="text-xs">Incluir widgets ({widgets.filter((w) => w.visible).length})</span>
          </label>
          <label className="dialog-checkbox">
            <input type="checkbox" checked={includeOverlays} onChange={(e) => setIncludeOverlays(e.target.checked)} />
            <span className="text-xs">Incluir overlay de etiqueta</span>
          </label>
        </div>

        {progress && busy && (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded" style={{ backgroundColor: 'var(--bg-primary)' }}>
              <div
                className="h-full"
                style={{ width: `${progress.percent}%`, backgroundColor: '#3b82f6' }}
              />
            </div>
            <div className="mt-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
              {progress.currentFrame}/{progress.totalFrames} frames ({progress.percent}%)
            </div>
          </div>
        )}

        {outputPath && (
          <div className="mt-3 text-xs" style={{ color: '#4ade80' }}>
            Exportado en: {outputPath}
          </div>
        )}
        {error && (
          <div className="mt-3 text-xs" style={{ color: '#f87171' }}>
            {error}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button className="toolbar-button" onClick={onClose} disabled={busy}>
            Cerrar
          </button>
          <button
            className="toolbar-button"
            onClick={() => void save()}
            disabled={busy || !outputPath}
          >
            Guardar como…
          </button>
          <button className="toolbar-button toolbar-button-primary" onClick={() => void run()} disabled={busy}>
            {busy ? 'Exportando…' : 'Iniciar exportación'}
          </button>
        </div>
      </div>
    </div>
  );
}
