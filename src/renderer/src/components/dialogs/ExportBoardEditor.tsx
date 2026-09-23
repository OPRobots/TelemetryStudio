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
const STAGE_DEBOUNCE_MS = 180;

const ASPECTS: AspectPreset[] = ['source', '16:9', '9:16', '1:1', '4:5', 'custom'];
const RESOLUTIONS: ResolutionPreset[] = ['720p', '1080p', '1440p', '2160p', 'source'];
const PRESETS: Array<{ id: BoardPreset; label: string }> = [
  { id: 'overlay', label: 'Overlay' },
  { id: 'vertical', label: 'Vertical' },
  { id: 'horizontal', label: 'Horizontal' },
  { id: 'charts-only', label: 'Solo gráficas' },
];

const ITEM_ICON: Record<ExportItem['kind'], string> = {
  widget: '▦',
  video: '▶',
  section: '␣',
};

function newItemId(): string {
  return `exp_${Math.random().toString(36).slice(2, 9)}`;
}

/** Valor `value` retardado `delay` ms (para no recomponer en cada píxel). */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);
  return debounced;
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
 * Mientras se redimensiona, un board "borrador" reajusta en vivo los demás
 * ítems (con transiciones), y el canvas se recompone con *debounce*.
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
  const [draft, setDraft] = useState<ExportBoard | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const draftRef = useRef<ExportBoard | null>(null);
  draftRef.current = draft;

  const widgetById = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);

  // Canvas: board retardado (no recompone en cada movimiento).
  const stageBoard = useDebouncedValue(draft ?? board, STAGE_DEBOUNCE_MS);
  const stageLayout = useMemo(() => computeBoardLayout(stageBoard, source), [stageBoard, source]);
  // Cajas: board en vivo (reflow inmediato con transiciones).
  const boxLayout = useMemo(
    () => computeBoardLayout(draft ?? board, source),
    [draft, board, source]
  );

  const { pad, gap } = boardPadding(stageLayout.width, stageLayout.height);
  const innerW = stageLayout.width - pad * 2;
  const k = Math.min(1, containerWidth / stageLayout.width);
  const displayW = Math.round(stageLayout.width * k);
  const displayH = Math.round(stageLayout.height * k);
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

  // Crear el compositor cuando cambia el board (retardado) o el set de widgets.
  useEffect(() => {
    let disposed = false;
    setReady(false);
    createExportStage({
      layout: stageLayout,
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
  }, [stageLayout, widgetsKey, live, liveWindowMs]);

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
  }, [ready, previewTime_s, includeOverlays, sessionLabel, stageLayout]);

  const patchItem = (
    base: ExportBoard,
    id: string,
    patch: Partial<ExportItem>
  ): ExportBoard => ({
    ...base,
    items: base.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
  });

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
        const cols = snapGridWidth(columnsFromPixels(next.ghostW, innerW, gap));
        setDraft(patchItem(board, d.id, { width: clampGridWidth(cols) }));
      } else {
        next.ghostH = Math.max(24, d.startH + dy);
        const item = board.items.find((i) => i.id === d.id);
        if (item) {
          const ratio = next.ghostH / Math.max(d.startH, 1);
          setDraft(patchItem(board, d.id, { height: clampGridHeight(Math.round(item.height * ratio)) }));
        }
      }
      dragRef.current = next;
      setDrag(next);
    };
    const onUp = (): void => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      if (d.kind === 'reorder') {
        const viewportTop = viewportRef.current?.getBoundingClientRect().top ?? 0;
        const pointerRealY = (d.pointerY - viewportTop) / k;
        const current = board;
        const centers = boxLayout.items.map((it) => it.rect.y + it.rect.h / 2);
        const index = current.items.findIndex((i) => i.id === d.id);
        let target = current.items.length - 1;
        for (let i = 0; i < centers.length; i++) {
          if (pointerRealY < centers[i]!) {
            target = i;
            break;
          }
        }
        const items = [...current.items];
        const [moved] = items.splice(index, 1);
        if (moved) items.splice(Math.max(0, Math.min(target, items.length)), 0, moved);
        setDraft(null);
        onChange({ ...current, items });
        return;
      }
      const pending = draftRef.current;
      setDraft(null);
      if (pending) onChange(pending);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag, k, board, boxLayout, innerW, gap, onChange]);

  const startDrag = (
    kind: DragState['kind'],
    itemId: string,
    rect: { w: number; h: number },
    e: React.PointerEvent
  ): void => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(itemId);
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
        items: [...board.items, { id: newItemId(), kind: 'video', width: 6, height: 6 }],
      });
    } else if (!on) {
      onChange({ ...board, items: board.items.filter((i) => i.kind !== 'video') });
    }
  };
  const setBoard = (patch: Partial<ExportBoard>): void => onChange({ ...board, ...patch });
  const patchItemBoard = (id: string, patch: Partial<ExportItem>): void =>
    onChange(patchItem(board, id, patch));

  const placedWidgetIds = new Set(
    board.items.filter((i) => i.kind === 'widget').map((i) => i.widgetId)
  );
  const availableWidgets = widgets.filter((w) => !placedWidgetIds.has(w.id));

  const BOX_TRANSITION = 'left 140ms ease, top 140ms ease, width 140ms ease, height 140ms ease';

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
            borderRadius: 8,
            border: '1px solid var(--bg-border)',
            background: '#000',
          }}
        >
          <div
            style={{
              width: stageLayout.width,
              height: stageLayout.height,
              transform: `scale(${k})`,
              transformOrigin: 'top left',
              position: 'absolute',
            }}
          >
            <canvas
              ref={canvasRef}
              width={stageLayout.width}
              height={stageLayout.height}
              style={{ position: 'absolute', top: 0, left: 0 }}
            />
            {boxLayout.items.map((item) => {
              const dragging = drag?.id === item.id;
              const placedWidget = item.widgetId ? widgetById.get(item.widgetId) : undefined;
              const title =
                item.kind === 'video'
                  ? 'Vídeo'
                  : item.kind === 'section'
                    ? 'Sección'
                    : `${placedWidget?.label ?? item.widgetId ?? 'widget'} · ${
                        placedWidget?.type ?? ''
                      }`;
              const selected = selectedId === item.id;
              const active = selected || hoveredId === item.id;
              const rect = dragging && drag
                ? {
                    x: item.rect.x,
                    y: item.rect.y + (drag.kind === 'reorder' ? drag.ghostY : 0),
                    w: drag.kind === 'width' ? drag.ghostW : item.rect.w,
                    h: drag.kind === 'height' ? drag.ghostH : item.rect.h,
                  }
                : item.rect;
              return (
                <div
                  key={item.id}
                  onPointerDown={() => setSelectedId(item.id)}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId((id) => (id === item.id ? null : id))}
                  style={{
                    position: 'absolute',
                    left: rect.x,
                    top: rect.y,
                    width: rect.w,
                    height: rect.h,
                    boxSizing: 'border-box',
                    borderRadius: 8,
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--bg-border)'}`,
                    background: active ? 'rgba(59,130,246,0.06)' : 'rgba(17,21,29,0.18)',
                    boxShadow: selected ? '0 0 0 1px var(--accent)' : 'none',
                    overflow: 'hidden',
                    pointerEvents: 'auto',
                    transition: dragging ? 'none' : BOX_TRANSITION,
                  }}
                >
                  <div
                    onPointerDown={(e) => startDrag('reorder', item.id, item.rect, e)}
                    style={{
                      height: 26,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '0 6px',
                      background: 'rgba(10,14,23,0.82)',
                      borderBottom: '1px solid var(--bg-border)',
                      cursor: 'grab',
                      fontSize: 12,
                      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    <span style={{ opacity: 0.8 }}>{ITEM_ICON[item.kind]}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

                  {item.kind === 'section' && (
                    <input
                      className="dialog-input"
                      style={{ position: 'absolute', top: 30, left: 6, right: 6, width: 'auto', fontSize: 11 }}
                      placeholder="etiqueta de sección"
                      value={item.label ?? ''}
                      onChange={(e) => patchItemBoard(item.id, { label: e.target.value })}
                    />
                  )}

                  {active && item.kind !== 'video' && (
                    <div
                      onPointerDown={(e) => startDrag('height', item.id, item.rect, e)}
                      title="Alto"
                      style={{
                        position: 'absolute',
                        bottom: -3,
                        left: '50%',
                        width: 30,
                        height: 6,
                        marginLeft: -15,
                        borderRadius: 3,
                        background: 'var(--accent)',
                        cursor: 'ns-resize',
                      }}
                    />
                  )}
                  {active && (
                    <div
                      onPointerDown={(e) => startDrag('width', item.id, item.rect, e)}
                      title="Ancho"
                      style={{
                        position: 'absolute',
                        top: '50%',
                        right: -3,
                        width: 6,
                        height: 30,
                        marginTop: -15,
                        borderRadius: 3,
                        background: 'var(--accent)',
                        cursor: 'ew-resize',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          {stageLayout.width}×{stageLayout.height} · arrastra la cabecera para reordenar, las asas para redimensionar
        </div>
      </div>
    </div>
  );
}
