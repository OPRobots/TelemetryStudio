import { useMemo, useRef, useState } from 'react';
import type { ExportConfig } from '@core/types/video';
import { telemetryStore } from '@core/telemetry-store';
import { videoSynchronizer } from '@core/video-synchronizer';
import {
  computeBoardLayout,
  createDefaultBoard,
  normalizeBoard,
  type ExportBoard,
  type ResolutionPreset,
} from '@shared/export-composition';
import { exportVideo, type ExportProgress } from '@services/video-exporter';
import {
  datasetRangeMs,
  framesRangeMs,
  telemetryToVideoRangeMs,
} from '../../lib/telemetry-range';
import { formatEta } from '../../lib/time-format';
import { useAppStore } from '../../stores/app-store';
import { useLayoutStore } from '../../stores/layout-store';
import { ExportBoardEditor } from './ExportBoardEditor';
import { ExportFramePreview } from './ExportFramePreview';
import { InfoHint } from './InfoHint';
import { RangeSlider } from './RangeSlider';

interface ExportDialogProps {
  onClose: () => void;
}

const PRESETS = ['veryfast', 'fast', 'medium', 'slow'];
const CRFS = [18, 20, 23, 28];
const FPS_OPTIONS = [30, 60] as const;
const RANGE_MARGIN_MS = 2000;
const RESOLUTIONS: ResolutionPreset[] = ['720p', '1080p', '1440p', '2160p'];

function formatSeconds(value_s: number): string {
  return `${value_s.toFixed(2)} s`;
}

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
  const syncAnchor = useAppStore((s) => s.syncAnchor);
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
  // Sin check: el título se muestra si el campo tiene texto.
  const showLabel = sessionLabel.trim().length > 0;
  const nativeFps = Math.round(videoInfo?.fps ?? 30);
  const [fps, setFps] = useState<number>(
    (FPS_OPTIONS as readonly number[]).includes(nativeFps) ? nativeFps : 30
  );
  const [crf, setCrf] = useState(18);
  const [preset, setPreset] = useState('medium');

  const videoDuration_s = videoInfo?.duration_s ?? 0;
  const hasVideo = videoDuration_s > 0;
  const margin_s = RANGE_MARGIN_MS / 1000;

  // Rango de telemetría mapeado a tiempo de vídeo (inversa de mapTime).
  const telemetryVideoRangeMs = useMemo(() => {
    const anchor = syncAnchor ?? videoSynchronizer.anchor;
    const teleRange = datasetRangeMs(dataset) ?? framesRangeMs(telemetryStore.getAllFrames());
    if (!teleRange) return null;
    return telemetryToVideoRangeMs(teleRange, anchor, videoSynchronizer.driftOffset);
  }, [dataset, syncAnchor]);

  const domainMax_s = hasVideo
    ? videoDuration_s
    : Math.max((telemetryVideoRangeMs?.end_ms ?? 0) / 1000 + margin_s, 1);

  // Por defecto: 2 s antes del inicio de telemetría y 2 s después del fin.
  const defaultRange_s = useMemo((): [number, number] => {
    if (telemetryVideoRangeMs) {
      const start = Math.max(0, telemetryVideoRangeMs.start_ms / 1000 - margin_s);
      const end = Math.min(domainMax_s, telemetryVideoRangeMs.end_ms / 1000 + margin_s);
      return [start, Math.max(start, end)];
    }
    return [0, domainMax_s];
  }, [telemetryVideoRangeMs, domainMax_s, margin_s]);

  const [range_s, setRange_s] = useState<[number, number]>(defaultRange_s);
  // La preview por defecto es el punto medio del rango de exportación.
  const [previewTime_s, setPreviewTime_s] = useState(
    () => (defaultRange_s[0] + defaultRange_s[1]) / 2
  );

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canceled, setCanceled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const backdropDownRef = useRef(false);

  const totalFrames = useMemo(
    () => Math.max(Math.round(domainMax_s * fps), 1),
    [domainMax_s, fps]
  );
  const startFrame = Math.max(0, Math.min(Math.round(range_s[0] * fps), totalFrames - 1));
  const endFrame = Math.max(startFrame, Math.min(Math.round(range_s[1] * fps), totalFrames - 1));
  const midFrame = Math.round((startFrame + endFrame) / 2);
  const previewMediaTime_s = midFrame / fps;
  const effectiveBoard = useMemo(() => ({ ...board, showLabel }), [board, showLabel]);
  const layout = useMemo(() => computeBoardLayout(effectiveBoard, source), [effectiveBoard, source]);
  const noItems = layout.items.length === 0;

  // Banda fija de telemetría sobre la pista del vídeo.
  const telemetryBand_s = useMemo((): [number, number] | null => {
    if (!hasVideo || !telemetryVideoRangeMs) return null;
    const start = Math.max(0, Math.min(telemetryVideoRangeMs.start_ms / 1000, videoDuration_s));
    const end = Math.max(0, Math.min(telemetryVideoRangeMs.end_ms / 1000, videoDuration_s));
    return end > start ? [start, end] : null;
  }, [hasVideo, telemetryVideoRangeMs, videoDuration_s]);

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
      endFrame,
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
              board={effectiveBoard}
              widgets={visibleWidgets}
              source={source}
              previewTime_s={previewTime_s}
              live={mode === 'live'}
              liveWindowMs={liveWindowMs}
              includeOverlays={showLabel}
              sessionLabel={sessionLabel}
              onSessionLabelChange={setSessionLabel}
              onChange={updateBoard}
            />

            <div className="mt-3 flex flex-col gap-2">
              <div>
                <label className="dialog-label">Tiempo de previsualización (s)</label>
                <input
                  id="export-preview-time"
                  type="range"
                  min={0}
                  max={Math.max(domainMax_s, 0.1)}
                  step={0.1}
                  value={previewTime_s}
                  onChange={(e) => setPreviewTime_s(Number(e.target.value))}
                  style={{ width: '100%' }}
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

            <div className="dialog-grid">
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
                <label className="dialog-label">FPS</label>
                <select
                  id="export-fps"
                  className="dialog-input"
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                >
                  {FPS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="dialog-label-row">
                  <label className="dialog-label">Calidad (CRF)</label>
                  <InfoHint text="Calidad de codificación H.264 (CRF): valores bajos = más calidad y archivo más grande; 18 alta, 28 baja." />
                </div>
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
                <div className="dialog-label-row">
                  <label className="dialog-label">Preset</label>
                  <InfoHint text="Velocidad de codificación de FFmpeg: más lento da mejor compresión (archivo más pequeño) a igual calidad." />
                </div>
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

            <div className="dialog-grid">
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
                <div className="dialog-label-row">
                  <label className="dialog-label">Supersampling</label>
                  <InfoHint text="Renderiza los widgets a doble resolución y los reduce al componer: líneas y textos más suaves. Aumenta el tiempo de exportación." />
                </div>
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
                <div className="dialog-label-row">
                  <label className="dialog-label">Modo de gráficas</label>
                  <InfoHint text="Directo: la gráfica avanza con el vídeo (ventana deslizante). Completo: se dibuja la traza entera de telemetría, sin desplazamiento." />
                </div>
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
                  <div className="dialog-label-row">
                    <label className="dialog-label">Ventana</label>
                    <InfoHint text="Duración de la traza visible en modo Directo; la ventana avanza con el vídeo." />
                  </div>
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

            {hasVideo && (
              <div>
                <div className="dialog-label-row">
                  <label className="dialog-label">Rango de exportación</label>
                  <InfoHint text="Recorta o prolonga el tramo a exportar. La banda amarilla marca dónde hay datos de telemetría; por defecto se añaden 2 s antes y después." />
                </div>
                <RangeSlider
                  min={0}
                  max={videoDuration_s}
                  step={1 / fps}
                  value={range_s}
                  onChange={setRange_s}
                  band={telemetryBand_s}
                  bandLabel="Telemetría"
                  idStart="export-start"
                  idEnd="export-end"
                />
                <div
                  className="mt-1 flex flex-wrap justify-between gap-x-3 text-[10px]"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <span>
                    Inicio {formatSeconds(range_s[0])} · frame {startFrame}
                  </span>
                  <span>
                    Fin {formatSeconds(range_s[1])} · frame {endFrame}
                  </span>
                  {telemetryBand_s && (
                    <span>
                      Telemetría {formatSeconds(telemetryBand_s[0])}–
                      {formatSeconds(telemetryBand_s[1])}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {busy && (
          <div className="mt-3">
            <div className="flex items-center gap-3">
              <div
                className="h-2 flex-1 overflow-hidden rounded"
                style={{ backgroundColor: 'var(--bg-primary)' }}
              >
                <div
                  className="h-full"
                  style={{ width: `${progress?.percent ?? 0}%`, backgroundColor: '#3b82f6' }}
                />
              </div>
              <button
                className="toolbar-button toolbar-button--compact"
                onClick={() => abortRef.current?.abort()}
              >
                Cancelar
              </button>
            </div>
            <div
              className="mt-1 flex items-center justify-between text-[10px] tabular-nums"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <span>
                {progress
                  ? `${progress.currentFrame}/${progress.totalFrames} frames (${progress.percent}%)`
                  : 'Preparando…'}
              </span>
              {progress?.etaMs ? (
                <span className="shrink-0 pl-3">~{formatEta(progress.etaMs)} restantes</span>
              ) : null}
            </div>
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
