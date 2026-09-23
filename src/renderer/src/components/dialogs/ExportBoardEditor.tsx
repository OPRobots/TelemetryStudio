import { useEffect, useMemo, useRef, useState } from 'react';
import {
  boardPadding,
  computeBoardLayout,
  createBoardPreset,
  type AspectPreset,
  type BoardPreset,
  type CompositionWidget,
  type ExportBoard,
  type ExportItem,
  type PanelStyle,
  type ResolutionPreset,
  type Size,
  type VideoFit,
} from '@shared/export-composition';
import { clampGridHeight, clampGridWidth, snapGridWidth } from '@shared/grid';
import { telemetryStore } from '@core/telemetry-store';
import { videoSynchronizer } from '@core/video-synchronizer';
import { columnsFromPixels } from '../../lib/widget-layout';
import { createExportStage, type ExportStage } from '../../lib/export-stage';

const PREVIEW_MAX_WIDTH = 720;

const ASPECTS: AspectPreset[] = ['source', '16:9', '9:16', '1:1', '4:5', 'custom'];
const RESOLUTIONS: ResolutionPreset[] = ['720p', '1080p', '1440p', '2160p', 'source'];
const PRESETS: Array<{ id: BoardPreset; label: string }> = [
  { id: 'overlay', label: 'Overlay' },
  { id: 'vertical', label: 'Vertical' },
  { id: 'horizontal', label: 'Horizontal' },
  { id: 'charts-only', label: 'Solo gráficas' },
];

function newItemId(): string {
  return `exp_${Math.random().toString(36).slice(2, 9)}`;
}

interface DragState {
  kind: 'reorder' | 'width' | 'height';
  id: string;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  ghostW: number;
  ghostH: number;
  ghostY: number;
  pointerY: number;
}

interface ExportBoardEditorProps {
  board: ExportBoard;
  widgets: CompositionWidget[];
  source: Size | null;
  previewTime_s: number;
  live: boolean;
  liveWindowMs: number;
  includeOverlays: boolean;
  sessionLabel: string;
  onChange: (board: ExportBoard) => void;
}

/**
 * Editor WYSIWYG del board de exportación: compone el board a resolución real
 * (canvas escalado por CSS) y superpone cajas para reordenar/redimensionar.
 */
export function ExportBoardEditor({
  board,
  widgets,
  source,
  previewTime_s,
  live,
  liveWindowMs,
  includeOverlays,
  sessionLabel,
  onChange,
}: ExportBoardEditorProps): React.ReactElement {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<ExportStage | null>(null);
  const [ready, setReady] = useState(false);
  const [containerWidth, setContainerWidth] = useState(PREVIEW_MAX_WIDTH);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const boardRef = useRef(board);
  boardRef.current = board;

  const widgetById = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);
  const layout = useMemo(() => computeBoardLayout(board, source), [board, source]);
  const { pad, gap } = boardPadding(layout.width, layout.height);
  const innerW = layout.width - pad * 2;
  const k = Math.min(1, containerWidth / layout.width);
  const displayW = Math.round(layout.width * k);
  const displayH = Math.round(layout.height * k);
  const widgetsKey = widgets.map((w) => w.id).join('|');

  // Medir el ancho disponible.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Crear el compositor cuando cambia el board o el set de widgets.
  useEffect(() => {
    let disposed = false;
    setReady(false);
    createExportStage({
      layout,
      widgets,
      getFrames: () => telemetryStore.getAllFrames(),
      live,
      liveWindowMs,
    })
      .then((stage) => {
        stageRef.current?.dispose();
        if (disposed) {
          stage.dispose();
          return;
        }
        stageRef.current = stage;
        setReady(true);
      })
      .catch(() => setReady(false));
    return () => {
      disposed = true;
      stageRef.current?.dispose();
      stageRef.current = null;
    };
    // `widgets` se usa por valor; `widgetsKey` captura cambios relevantes.
  }, [layout, widgetsKey, live, liveWindowMs]);

  // Recomponer el frame de preview.
  useEffect(() => {
    if (!ready) return;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        const video = document.querySelector<HTMLVideoElement>('video');
        const viewMs = videoSynchronizer.mapTime(previewTime_s * 1000);
        await stage.renderFrame(
          video,
          viewMs,
          includeOverlays ? { label: sessionLabel } : undefined
        );
        if (cancelled) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(stage.getCanvas(), 0, 0);
      })();
    }, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [ready, previewTime_s, includeOverlays, sessionLabel, layout]);

  // --- Interacción: reordenar / redimensionar ---
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent): void => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.startX) / k;
      const dy = (e.clientY - d.startY) / k;
      const next: DragState = { ...d };
      if (d.kind === 'reorder') {
        next.ghostY = dy;
        next.pointerY = e.clientY;
      } else if (d.kind === 'width') {
        next.ghostW = Math.max(24, d.startW + dx);
      } else {
        next.ghostH = Math.max(24, d.startH + dy);
      }
      dragRef.current = next;
      setDrag(next);
    };
    const onUp = (): void => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (d) commitDrag(d);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag, k]);

  const commitDrag = (d: DragState): void => {
    const current = boardRef.current;
    const items = [...current.items];
    const index = items.findIndex((i) => i.id === d.id);
    if (index < 0) return;
    const item = items[index]!;

    if (d.kind === 'reorder') {
      const centers = layout.items.map((it) => it.rect.y + it.rect.h / 2);
      const pointerRealY = (d.pointerY - (viewportRef.current?.getBoundingClientRect().top ?? 0)) / k;
      let target = items.length - 1;
      for (let i = 0; i < centers.length; i++) {
        if (pointerRealY < centers[i]!) {
          target = i;
          break;
        }
      }
      const [moved] = items.splice(index, 1);
      if (moved) items.splice(Math.max(0, Math.min(target, items.length)), 0, moved);
      onChange({ ...current, items });
      return;
    }

    if (d.kind === 'width') {
      const cols = snapGridWidth(columnsFromPixels(d.ghostW, innerW, gap));
      items[index] = { ...item, width: clampGridWidth(cols) };
      onChange({ ...current, items });
      return;
    }

    const ratio = d.ghostH / Math.max(d.startH, 1);
    const rows = clampGridHeight(Math.round(item.height * ratio));
    items[index] = { ...item, height: rows };
    onChange({ ...current, items });
  };

  const startDrag = (
    kind: DragState['kind'],
    itemId: string,
    rect: { w: number; h: number },
    e: React.PointerEvent
  ): void => {
    e.stopPropagation();
    e.preventDefault();
    const next: DragState = {
      kind,
      id: itemId,
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.w,
      startH: rect.h,
      ghostW: rect.w,
      ghostH: rect.h,
      ghostY: 0,
      pointerY: e.clientY,
    };
    dragRef.current = next;
    setDrag(next);
  };

  // --- Mutaciones del board ---
  const patchItem = (id: string, patch: Partial<ExportItem>): void => {
    onChange({ ...board, items: board.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  };
  const removeItem = (id: string): void => {
    onChange({ ...board, items: board.items.filter((i) => i.id !== id) });
  };
  const addWidget = (widgetId: string): void => {
    if (!widgetId) return;
    onChange({
      ...board,
      items: [...board.items, { id: newItemId(), kind: 'widget', widgetId, width: 6, height: 6 }],
    });
  };
  const addSection = (): void => {
    onChange({
      ...board,
      items: [...board.items, { id: newItemId(), kind: 'section', width: 6, height: 4 }],
    });
  };
  const hasVideoItem = board.items.some((i) => i.kind === 'video');
  const toggleVideo = (on: boolean): void => {
    if (on && !hasVideoItem) {
      onChange({
        ...board,
        items: [...board.items, { id: newItemId(), kind: 'video', width: 12, height: 6 }],
      });
    } else if (!on) {
      onChange({ ...board, items: board.items.filter((i) => i.kind !== 'video') });
    }
  };

  const placedWidgetIds = new Set(
    board.items.filter((i) => i.kind === 'widget').map((i) => i.widgetId)
  );
  const availableWidgets = widgets.filter((w) => !placedWidgetIds.has(w.id));

  const setBoard = (patch: Partial<ExportBoard>): void => onChange({ ...board, ...patch });

  return (
    <div className="flex flex-col gap-2">
      {/* Presets + controles del board */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className="toolbar-button toolbar-button--compact"
            onClick={() =>
              onChange(
                createBoardPreset(p.id, { widgetIds: widgets.map((w) => w.id), hasVideo: !!source })
              )
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="dialog-row">
        <div>
          <label className="dialog-label">Aspecto</label>
          <select
            className="dialog-input"
            value={board.aspect}
            onChange={(e) => setBoard({ aspect: e.target.value as AspectPreset })}
          >
            {ASPECTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="dialog-label">Resolución</label>
          <select
            id="export-resolution"
            className="dialog-input"
            value={board.resolution}
            onChange={(e) => setBoard({ resolution: e.target.value as ResolutionPreset })}
          >
            {RESOLUTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="dialog-label">Vídeo</label>
          <select
            className="dialog-input"
            value={board.videoPlacement}
            onChange={(e) => setBoard({ videoPlacement: e.target.value as 'flow' | 'background' })}
          >
            <option value="flow">En flujo</option>
            <option value="background">Fondo (overlay)</option>
          </select>
        </div>
        <div>
          <label className="dialog-label">Vídeo ajuste</label>
          <select
            className="dialog-input"
            value={board.videoFit}
            onChange={(e) => setBoard({ videoFit: e.target.value as VideoFit })}
          >
            <option value="contain">Ajustar</option>
            <option value="cover">Rellenar</option>
          </select>
        </div>
        <div>
          <label className="dialog-label">Panel</label>
          <select
            className="dialog-input"
            value={board.panel}
            onChange={(e) => setBoard({ panel: e.target.value as PanelStyle })}
          >
            <option value="translucent">Translúcido</option>
            <option value="none">Sin panel</option>
          </select>
        </div>
      </div>

      {/* Añadir ítems */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="dialog-input"
          style={{ width: 200 }}
          value=""
          onChange={(e) => {
            addWidget(e.target.value);
            e.target.value = '';
          }}
        >
          <option value="">+ Widget…</option>
          {availableWidgets.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label} · {w.type}
            </option>
          ))}
        </select>
        <button className="toolbar-button toolbar-button--compact" onClick={addSection}>
          + Sección / Espacio
        </button>
        <label className="dialog-checkbox">
          <input
            type="checkbox"
            checked={hasVideoItem}
            onChange={(e) => toggleVideo(e.target.checked)}
          />
          <span className="text-xs">Vídeo</span>
        </label>
      </div>

      {/* Lienzo WYSIWYG */}
      <div ref={viewportRef} style={{ width: '100%' }}>
        <div
          style={{
            width: displayW,
            height: displayH,
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 6,
            border: '1px solid var(--bg-border)',
            background: '#000',
          }}
        >
          <div
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${k})`,
              transformOrigin: 'top left',
              position: 'absolute',
            }}
          >
            <canvas
              ref={canvasRef}
              width={layout.width}
              height={layout.height}
              style={{ position: 'absolute', top: 0, left: 0 }}
            />
            {layout.items.map((item) => {
              const dragging = drag?.id === item.id;
              const placedWidget = item.widgetId ? widgetById.get(item.widgetId) : undefined;
              const title =
                item.kind === 'video'
                  ? '🎬 Vídeo'
                  : item.kind === 'section'
                    ? '␣ Sección'
                    : `📈 ${placedWidget?.label ?? item.widgetId ?? 'widget'} · ${
                        placedWidget?.type ?? ''
                      }`;
              const wx = item.rect.x;
              const wy = item.rect.y + (dragging && drag?.kind === 'reorder' ? drag.ghostY : 0);
              const ww = dragging && drag?.kind === 'width' ? drag.ghostW : item.rect.w;
              const wh = dragging && drag?.kind === 'height' ? drag.ghostH : item.rect.h;
              return (
                <div
                  key={item.id}
                  style={{
                    position: 'absolute',
                    left: wx,
                    top: wy,
                    width: ww,
                    height: wh,
                    border: '1px dashed rgba(59,130,246,0.7)',
                    boxSizing: 'border-box',
                    pointerEvents: 'auto',
                  }}
                >
                  <div
                    onPointerDown={(e) => startDrag('reorder', item.id, item.rect, e)}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 22,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 4px',
                      background: 'rgba(10,14,23,0.7)',
                      cursor: 'grab',
                      fontSize: 11,
                      color: '#cbd5e1',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {title}
                    </span>
                    <button
                      className="icon-button icon-button--compact"
                      title="Quitar"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => removeItem(item.id)}
                    >
                      ✕
                    </button>
                  </div>
                  {/* Asa derecha */}
                  <div
                    onPointerDown={(e) => startDrag('width', item.id, item.rect, e)}
                    style={{
                      position: 'absolute',
                      top: '50%',
                      right: -4,
                      width: 8,
                      height: 24,
                      marginTop: -12,
                      background: 'rgba(59,130,246,0.9)',
                      cursor: 'ew-resize',
                    }}
                  />
                  {/* Asa inferior (el vídeo mantiene su aspecto: no se estira) */}
                  {item.kind !== 'video' && (
                    <div
                      onPointerDown={(e) => startDrag('height', item.id, item.rect, e)}
                      style={{
                        position: 'absolute',
                        bottom: -4,
                        left: '50%',
                        width: 24,
                        height: 8,
                        marginLeft: -12,
                        background: 'rgba(59,130,246,0.9)',
                        cursor: 'ns-resize',
                      }}
                    />
                  )}
                  {item.kind === 'section' && (
                    <input
                      className="dialog-input"
                      style={{ position: 'absolute', top: 24, left: 4, right: 4, width: 'auto', fontSize: 11 }}
                      placeholder="etiqueta de sección"
                      value={item.label ?? ''}
                      onChange={(e) => patchItem(item.id, { label: e.target.value })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          {layout.width}×{layout.height} · arrastra la cabecera para reordenar, las asas para redimensionar
        </div>
      </div>
    </div>
  );
}
