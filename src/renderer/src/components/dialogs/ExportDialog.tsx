import { useMemo, useRef, useState } from 'react';
import type { ExportConfig } from '@core/types/video';
import {
  computeBoardLayout,
  createDefaultBoard,
  normalizeBoard,
  type ExportBoard,
  type ResolutionPreset,
} from '@shared/export-composition';
import { exportVideo, type ExportProgress } from '@services/video-exporter';
import { useAppStore } from '../../stores/app-store';
import { useLayoutStore } from '../../stores/layout-store';
import { ExportBoardEditor } from './ExportBoardEditor';
import { ExportFramePreview } from './ExportFramePreview';

interface ExportDialogProps {
  onClose: () => void;
}

const PRESETS = ['veryfast', 'fast', 'medium', 'slow'];
const CRFS = [18, 20, 23, 28];
const RESOLUTIONS: ResolutionPreset[] = ['720p', '1080p', '1440p', '2160p', 'source'];

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'telemetria';
}

export function ExportDialog({ onClose }: ExportDialogProps): React.ReactElement {
  const videoInfo = useAppStore((s) => s.videoInfo);
  const dataset = useAppStore((s) => s.dataset);
  const widgets = useLayoutStore((s) => s.widgets);

  const source = useMemo(
    () => (videoInfo ? { width: videoInfo.width, height: videoInfo.height } : null),
    [videoInfo?.width, videoInfo?.height]
  );
  const visibleWidgets = useMemo(() => widgets.filter((w) => w.visible), [widgets]);

  const setExportBoard = useLayoutStore((s) => s.setExportBoard);

  const [step, setStep] = useState<1 | 2>(1);
  const [board, setBoard] = useState<ExportBoard>(() => {
    const stored = useLayoutStore.getState().exportBoard;
    if (stored) return normalizeBoard(stored, !!source);
    return createDefaultBoard(
      '16:9',
      visibleWidgets.map((w) => ({ id: w.id, height: w.height })),
      !!source
    );
  });

  const updateBoard = (next: ExportBoard): void => {
    setBoard(next);
    setExportBoard(next);
  };

  const [mode, setMode] = useState<'live' | 'full'>('live');
  const [liveWindowMs, setLiveWindowMs] = useState(10000);
  const [sessionLabel, setSessionLabel] = useState(dataset?.name ?? 'Telemetry Studio');
  const showLabel = board.showLabel ?? true;
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
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canceled, setCanceled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const backdropDownRef = useRef(false);

  const totalFrames = useMemo(
    () => Math.max(Math.round((videoInfo?.duration_s || 1) * fps), 1),
    [videoInfo?.duration_s, fps]
  );
  const effectiveEnd = endFrame ?? totalFrames - 1;
  const clampedEnd = Math.min(effectiveEnd, totalFrames - 1);
  const midFrame = Math.round((startFrame + clampedEnd) / 2);
  const previewMediaTime_s = midFrame / fps;
  const layout = useMemo(() => computeBoardLayout(board, source), [board, source]);
  const noItems = layout.items.length === 0;

  const run = async (outputPath: string): Promise<void> => {
    const api = window.api;
    if (!api) return;

    const config: ExportConfig = {
      outputPath,
      format: 'mp4',
      codec: 'h264',
      fps,
      crf,
      preset,
      startFrame,
      endFrame: Math.min(effectiveEnd, totalFrames - 1),
      layout,
      widgets: visibleWidgets,
      includeOverlays: showLabel,
      sessionLabel,
      live: mode === 'live',
      liveWindowMs,
    };

    setBusy(true);
    setError(null);
    setSavedPath(null);
    setCanceled(false);
    setProgress(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const path = await exportVideo(config, (p) => setProgress(p), controller.signal);
      setSavedPath(path);
    } catch (err) {
      if ((err as Error).name === 'AbortError') setCanceled(true);
      else setError((err as Error).message);
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  // "Exportar…": elige destino con el diálogo nativo y escribe ahí directo.
  const exportTo = async (): Promise<void> => {
    const api = window.api;
    if (!api) return;
    const dest = await api.exportChooseDestination({
      defaultName: `telemetria_${slugify(sessionLabel)}_${new Date().toISOString().slice(0, 10)}.mp4`,
    });
    if (dest.canceled || !dest.filePath) return;
    await run(dest.filePath);
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
        <div className="mb-3 flex items-baseline gap-2">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Exportar vídeo
          </h3>
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            Paso {step} de 2 · {step === 1 ? 'Layout' : 'Salida'}
          </span>
        </div>

        {step === 1 ? (
          <>
            <ExportBoardEditor
              board={board}
              widgets={visibleWidgets}
              source={source}
              previewTime_s={previewTime_s}
              live={mode === 'live'}
              liveWindowMs={liveWindowMs}
              includeOverlays={showLabel}
              sessionLabel={sessionLabel}
              onChange={updateBoard}
            />

            <div className="mt-3 flex flex-col gap-2">
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
                    checked={showLabel}
                    onChange={(e) => updateBoard({ ...board, showLabel: e.target.checked })}
                  />
                  <span className="text-xs">Etiqueta de sesión</span>
                </label>
                <input
                  id="export-label"
                  className="dialog-input"
                  value={sessionLabel}
                  disabled={!showLabel}
                  onChange={(e) => setSessionLabel(e.target.value)}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <div>
              <label className="dialog-label">
                Previsualización (frame {midFrame} de {totalFrames})
              </label>
              <ExportFramePreview
                layout={layout}
                widgets={visibleWidgets}
                mediaTime_s={previewMediaTime_s}
                live={mode === 'live'}
                liveWindowMs={liveWindowMs}
                sessionLabel={sessionLabel}
              />
            </div>

            <div className="dialog-row">
              <div>
                <label className="dialog-label">Resolución</label>
                <select
                  id="export-resolution"
                  className="dialog-input"
                  value={board.resolution}
                  onChange={(e) =>
                    updateBoard({ ...board, resolution: e.target.value as ResolutionPreset })
                  }
                >
                  {RESOLUTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
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
            </div>

            <div className="dialog-row">
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

            <div className="dialog-row">
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
          </div>
        )}

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
        {savedPath && (
          <div className="mt-3 text-xs" style={{ color: '#4ade80' }}>
            Exportado en: {savedPath}
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
          {step === 1 ? (
            <button
              className="toolbar-button toolbar-button-primary"
              onClick={() => setStep(2)}
              disabled={busy || noItems}
            >
              Siguiente
            </button>
          ) : (
            <>
              <button className="toolbar-button" onClick={() => setStep(1)} disabled={busy}>
                ← Atrás
              </button>
              <button
                className="toolbar-button toolbar-button-primary"
                onClick={() => void exportTo()}
                disabled={busy || noItems}
              >
                {busy ? 'Exportando…' : 'Exportar…'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
