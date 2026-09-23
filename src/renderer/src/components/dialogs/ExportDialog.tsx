import { useMemo, useRef, useState } from 'react';
import type { ExportConfig } from '@core/types/video';
import {
  computeBoardLayout,
  createBoardPreset,
  type CompositionWidget,
  type ExportBoard,
} from '@shared/export-composition';
import { exportVideo, type ExportProgress } from '@services/video-exporter';
import { useAppStore } from '../../stores/app-store';
import { useLayoutStore } from '../../stores/layout-store';
import { ExportBoardEditor } from './ExportBoardEditor';

interface ExportDialogProps {
  onClose: () => void;
}

const PRESETS = ['veryfast', 'fast', 'medium', 'slow'];
const CRFS = [18, 20, 23, 28];

export function ExportDialog({ onClose }: ExportDialogProps): React.ReactElement {
  const videoInfo = useAppStore((s) => s.videoInfo);
  const dataset = useAppStore((s) => s.dataset);
  const widgets = useLayoutStore((s) => s.widgets);

  const source = useMemo(
    () => (videoInfo ? { width: videoInfo.width, height: videoInfo.height } : null),
    [videoInfo?.width, videoInfo?.height]
  );
  const visibleWidgets = useMemo(
    () => widgets.filter((w) => w.visible),
    [widgets]
  ) as CompositionWidget[];

  const setExportBoard = useLayoutStore((s) => s.setExportBoard);

  const [board, setBoard] = useState<ExportBoard>(
    () =>
      useLayoutStore.getState().exportBoard ??
      createBoardPreset('overlay', {
        widgetIds: visibleWidgets.map((w) => w.id),
        hasVideo: !!source,
      })
  );

  const updateBoard = (next: ExportBoard): void => {
    setBoard(next);
    setExportBoard(next);
  };

  const [mode, setMode] = useState<'live' | 'full'>('live');
  const [liveWindowMs, setLiveWindowMs] = useState(10000);
  const [includeOverlays, setIncludeOverlays] = useState(true);
  const [sessionLabel, setSessionLabel] = useState(dataset?.name ?? 'Telemetry Studio');
  const [fps, setFps] = useState(30);
  const [crf, setCrf] = useState(18);
  const [preset, setPreset] = useState('medium');
  // Por defecto, el export empieza en el punto alineado menos 2 s de pre-roll,
  // para que el vídeo arranque junto a las gráficas sin alargarse de más.
  const PREROLL_MS = 2000;
  const [startFrame, setStartFrame] = useState(() => {
    const anchor = useAppStore.getState().syncAnchor;
    if (!anchor) return 0;
    return Math.max(0, Math.round(((anchor.video_ms - PREROLL_MS) / 1000) * fps));
  });
  const [endFrame, setEndFrame] = useState<number | null>(null);
  const [previewTime_s, setPreviewTime_s] = useState(() => {
    const anchor = useAppStore.getState().syncAnchor;
    return anchor ? Math.max(0, anchor.video_ms / 1000) : 0;
  });

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canceled, setCanceled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const backdropDownRef = useRef(false);

  const totalFrames = useMemo(
    () => Math.max(Math.round((videoInfo?.duration_s || 1) * fps), 1),
    [videoInfo?.duration_s, fps]
  );
  const effectiveEnd = endFrame ?? totalFrames - 1;

  const layout = useMemo(() => computeBoardLayout(board, source), [board, source]);

  const run = async (): Promise<void> => {
    const api = window.api;
    if (!api) return;

    const config: ExportConfig = {
      format: 'mp4',
      codec: 'h264',
      fps,
      crf,
      preset,
      startFrame,
      endFrame: Math.min(effectiveEnd, totalFrames - 1),
      layout,
      widgets: visibleWidgets,
      includeOverlays,
      sessionLabel,
      live: mode === 'live',
      liveWindowMs,
    };

    setBusy(true);
    setError(null);
    setOutputPath(null);
    setCanceled(false);
    setProgress(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const path = await exportVideo(config, (p) => setProgress(p), controller.signal);
      setOutputPath(path);
    } catch (err) {
      if ((err as Error).name === 'AbortError') setCanceled(true);
      else setError((err as Error).message);
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    await window.api?.exportSave();
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        backdropDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (busy) return;
        if (e.target !== e.currentTarget || !backdropDownRef.current) return;
        backdropDownRef.current = false;
        onClose();
      }}
    >
      <div
        className="dialog-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 980, maxHeight: '92vh', overflow: 'auto' }}
      >
        <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Exportar vídeo
        </h3>

        <ExportBoardEditor
          board={board}
          widgets={visibleWidgets}
          source={source}
          previewTime_s={previewTime_s}
          live={mode === 'live'}
          liveWindowMs={liveWindowMs}
          includeOverlays={includeOverlays}
          sessionLabel={sessionLabel}
          onChange={updateBoard}
        />

        <div className="mt-3 flex flex-col gap-2">
          <div className="dialog-row">
            <div>
              <label className="dialog-label">Modo de gráficas</label>
              <select
                id="export-mode"
                className="dialog-input"
                value={mode}
                onChange={(e) => setMode(e.target.value as 'live' | 'full')}
              >
                <option value="live">Directo (avanzan con el vídeo)</option>
                <option value="full">Completo (traza entera)</option>
              </select>
            </div>
            {mode === 'live' && (
              <div>
                <label className="dialog-label">Ventana</label>
                <select
                  id="export-live-window"
                  className="dialog-input"
                  value={liveWindowMs}
                  onChange={(e) => setLiveWindowMs(Number(e.target.value))}
                >
                  <option value={5000}>5 s</option>
                  <option value={10000}>10 s</option>
                  <option value={20000}>20 s</option>
                  <option value={30000}>30 s</option>
                </select>
              </div>
            )}
            <div>
              <label className="dialog-label">Grosor de líneas</label>
              <select
                id="export-line-scale"
                className="dialog-input"
                value={board.lineScale}
                onChange={(e) => updateBoard({ ...board, lineScale: Number(e.target.value) })}
              >
                <option value={1}>1×</option>
                <option value={1.5}>1.5×</option>
                <option value={2}>2×</option>
                <option value={2.5}>2.5×</option>
              </select>
            </div>
            <div>
              <label className="dialog-label">Supersampling</label>
              <select
                className="dialog-input"
                value={board.supersample}
                onChange={(e) => updateBoard({ ...board, supersample: Number(e.target.value) })}
              >
                <option value={1}>1×</option>
                <option value={2}>2×</option>
              </select>
            </div>
          </div>

          <div className="dialog-row">
            <div>
              <label className="dialog-label">FPS</label>
              <input
                id="export-fps"
                className="dialog-input"
                type="number"
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="dialog-label">Frame inicio</label>
              <input
                id="export-start"
                className="dialog-input"
                type="number"
                value={startFrame}
                onChange={(e) => setStartFrame(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="dialog-label">Frame fin</label>
              <input
                id="export-end"
                className="dialog-input"
                type="number"
                value={effectiveEnd}
                onChange={(e) => setEndFrame(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="dialog-row">
            <div>
              <label className="dialog-label">Calidad (CRF)</label>
              <select
                className="dialog-input"
                value={crf}
                onChange={(e) => setCrf(Number(e.target.value))}
              >
                {CRFS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                    {c === 18 ? ' (alta)' : c === 28 ? ' (baja)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="dialog-label">Preset</label>
              <select
                className="dialog-input"
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
              >
                {PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="dialog-label">Tiempo de previsualización (s)</label>
            <input
              id="export-preview-time"
              type="range"
              min={0}
              max={Math.max(videoInfo?.duration_s ?? 0, 0.1)}
              step={0.1}
              value={previewTime_s}
              onChange={(e) => setPreviewTime_s(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label className="dialog-checkbox">
              <input
                type="checkbox"
                checked={includeOverlays}
                onChange={(e) => setIncludeOverlays(e.target.checked)}
              />
              <span className="text-xs">Etiqueta de sesión</span>
            </label>
            <input
              id="export-label"
              className="dialog-input"
              value={sessionLabel}
              disabled={!includeOverlays}
              onChange={(e) => setSessionLabel(e.target.value)}
            />
          </div>
        </div>

        {busy && (
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1">
              <div
                className="h-2 w-full overflow-hidden rounded"
                style={{ backgroundColor: 'var(--bg-primary)' }}
              >
                <div
                  className="h-full"
                  style={{ width: `${progress?.percent ?? 0}%`, backgroundColor: '#3b82f6' }}
                />
              </div>
              <div className="mt-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                {progress
                  ? `${progress.currentFrame}/${progress.totalFrames} frames (${progress.percent}%)`
                  : 'Preparando…'}
              </div>
            </div>
            <button
              className="toolbar-button toolbar-button--compact"
              onClick={() => abortRef.current?.abort()}
            >
              Cancelar
            </button>
          </div>
        )}

        {canceled && (
          <div className="mt-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Exportación cancelada.
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
          <button className="toolbar-button" onClick={() => void save()} disabled={busy || !outputPath}>
            Guardar como…
          </button>
          <button
            className="toolbar-button toolbar-button-primary"
            onClick={() => void run()}
            disabled={busy || layout.items.length === 0}
          >
            {busy ? 'Exportando…' : 'Iniciar exportación'}
          </button>
        </div>
      </div>
    </div>
  );
}
