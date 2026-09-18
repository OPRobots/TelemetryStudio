import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { widgetRegistry } from '@widgets/widget-registry';
import { telemetryStore } from '@core/telemetry-store';
import { FrameBus, FrameBusContext } from '@widgets/frame-bus';
import { useEventListener } from '../../hooks/useEventListener';
import { useLayoutStore } from '../../stores/layout-store';
import { useAppStore } from '../../stores/app-store';
import { useCursorStore } from '../../stores/cursor-store';
import { useComparisonStore } from '../../stores/comparison-store';
import { useFieldDragStore } from '../../lib/field-drag';
import { WidgetWrapper } from './WidgetWrapper';
import { WidgetConfigDialog } from './WidgetConfigDialog';
import {
  columnsFromPixels,
  packWidgetRows,
  rowsFromPixels,
  snapWidthToPreset,
} from '../../lib/widget-layout';
import { propagateScroll, registerScrollElement } from '../../lib/widget-scroll-sync';

const GRID_GAP = 12;

interface WidgetHostProps {
  /** Evento de sincronización del que se leen los frames. */
  eventName?: 'sync:frame' | 'comparison:frame';
  /** Dataset de telemetría a visualizar. */
  dataset?: 'primary' | 'comparison';
  /** Si el panel es el primario (recibe también frames de streaming). */
  primary?: boolean;
  /** Abre el selector de widgets (estado vacío). */
  onRequestAdd?: () => void;
  /** Grupo de sincronización de scroll (p. ej. ambos paneles de comparación). */
  scrollGroup?: string;
}

type DragKind = 'reorder' | 'width' | 'height';

interface DragState {
  kind: DragKind;
  id: string;
  startIndex: number;
  startX: number;
  startY: number;
  startWidthPx: number;
  startHeightPx: number;
}

/**
 * Anima la **posición** de los widgets al cambiar (FLIP solo con translación).
 * El tamaño se anima por CSS (transición de `flex-grow`/`height`). Mientras se
 * arrastra (`disabled`) no se aplica ninguna animación para que el tamaño siga
 * al ratón al instante y no se realimente la medición.
 */
function useFlipAnimation(
  deps: unknown[],
  gridRef: React.RefObject<HTMLDivElement | null>,
  disabled: boolean
): void {
  const prevRects = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const nodes = Array.from(grid.querySelectorAll<HTMLElement>('[data-widget-id]'));
    const nextRects = new Map<string, DOMRect>();

    for (const node of nodes) {
      const id = node.dataset.widgetId;
      if (!id) continue;
      const rect = node.getBoundingClientRect();
      nextRects.set(id, rect);

      const prev = prevRects.current.get(id);
      if (!prev || disabled) continue;

      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      node.style.transition = 'none';
      node.style.transform = `translate(${dx}px, ${dy}px)`;

      requestAnimationFrame(() => {
        node.style.transition = 'transform 150ms ease';
        node.style.transform = '';
        window.setTimeout(() => {
          node.style.transition = '';
        }, 170);
      });
    }

    prevRects.current = nextRects;
  }, deps);
}

export function WidgetHost({
  eventName = 'sync:frame',
  dataset = 'primary',
  primary = true,
  onRequestAdd,
  scrollGroup,
}: WidgetHostProps): React.ReactElement {
  const widgets = useLayoutStore((s) => s.widgets);
  const removeWidget = useLayoutStore((s) => s.removeWidget);
  const moveWidget = useLayoutStore((s) => s.moveWidget);
  const setWidgetWidth = useLayoutStore((s) => s.setWidgetWidth);
  const setWidgetHeight = useLayoutStore((s) => s.setWidgetHeight);
  const mergeWidgets = useLayoutStore((s) => s.mergeWidgets);
  const hasTelemetry = useAppStore((s) => s.frameCount > 0);
  const hoverTimestamp = useCursorStore((s) => s.hoverTimestamp_ms);
  const setHoverTimestamp = useCursorStore((s) => s.setHoverTimestamp);
  const zoomRange = useCursorStore((s) => s.zoomRange);
  const setZoomRange = useCursorStore((s) => s.setZoomRange);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragKind, setDragKind] = useState<DragKind | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const fieldDropTargetId = useFieldDragStore((s) => s.targetWidgetId);

  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const mergeTargetRef = useRef<string | null>(null);
  const shiftRef = useRef(false);

  // Bus de frames por panel: los widgets se redibujan sin re-render React.
  const frameBusRef = useRef<FrameBus | null>(null);
  if (frameBusRef.current === null) frameBusRef.current = new FrameBus();
  const frameBus = frameBusRef.current;

  useEventListener(eventName, ({ frame: f, context: c }) => {
    frameBus.update(f, c);
  });

  useEventListener('data:streaming-frame', ({ frame: f }) => {
    const hasVideo = primary && !useAppStore.getState().videoSrc;
    if (hasVideo) frameBus.update(f, frameBus.getSnapshot().context);
  });

  const getFrames = useCallback(
    () =>
      dataset === 'comparison'
        ? telemetryStore.getComparisonFrames()
        : telemetryStore.getAllFrames(),
    [dataset]
  );

  // Limpia hover y zoom al cambiar de dataset o al desmontar el panel.
  useEffect(() => {
    setHoverTimestamp(null);
    setZoomRange(null);
    return () => {
      setHoverTimestamp(null);
      setZoomRange(null);
    };
  }, [dataset, eventName, setHoverTimestamp, setZoomRange]);

  // Registra la rejilla en el grupo de scroll (comparación).
  useEffect(() => {
    const el = gridRef.current;
    if (!el || !scrollGroup || widgets.length === 0) return;
    return registerScrollElement(scrollGroup, el);
  }, [scrollGroup, widgets.length]);

  const editingWidget = useMemo(
    () => widgets.find((w) => w.id === editingId) ?? null,
    [widgets, editingId]
  );

  useFlipAnimation([widgets, dragKind], gridRef, dragKind !== null);

  const startDrag = useCallback((state: DragState) => {
    dragRef.current = state;
    setDragKind(state.kind);
    document.body.style.userSelect = 'none';
  }, []);

  const finishDrag = useCallback(
    (shiftKey = false) => {
      const drag = dragRef.current;
      if (drag?.kind === 'reorder') {
        const mergeTarget = mergeTargetRef.current;
        if (shiftRef.current || shiftKey) {
          // Shift = fusionar; sin destino válido no se hace nada.
          if (mergeTarget) mergeWidgets(drag.id, mergeTarget);
        } else if (dropIndex !== null) {
          const total = useLayoutStore.getState().widgets.length;
          const clampedDrop = Math.min(dropIndex, total);
          const target = clampedDrop > drag.startIndex ? clampedDrop - 1 : clampedDrop;
          moveWidget(drag.id, target);
        }
      }
      dragRef.current = null;
      mergeTargetRef.current = null;
      shiftRef.current = false;
      setDragKind(null);
      setDropIndex(null);
      setMergeTargetId(null);
      document.body.style.userSelect = '';
    },
    [dropIndex, moveWidget, mergeWidgets]
  );

  const handleMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      const grid = gridRef.current;
      if (!drag || !grid) return;

      if (drag.kind === 'reorder') {
        const nodes = Array.from(grid.querySelectorAll<HTMLElement>('[data-widget-id]'));

        // Widget bajo el puntero (para el merge con Shift).
        let hoveredId: string | null = null;
        for (const node of nodes) {
          const r = node.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            hoveredId = node.dataset.widgetId ?? null;
            break;
          }
        }

        if (e.shiftKey) {
          const all = useLayoutStore.getState().widgets;
          const sourceType = all.find((w) => w.id === drag.id)?.type;
          const targetType = hoveredId ? all.find((w) => w.id === hoveredId)?.type : undefined;
          const canMerge =
            !useComparisonStore.getState().active &&
            hoveredId != null &&
            hoveredId !== drag.id &&
            sourceType === 'TimeSeriesChart' &&
            targetType === 'TimeSeriesChart';
          mergeTargetRef.current = canMerge ? hoveredId : null;
          shiftRef.current = true;
          setMergeTargetId(canMerge ? hoveredId : null);
          setDropIndex(null);
          return;
        }

        shiftRef.current = false;
        mergeTargetRef.current = null;
        setMergeTargetId(null);

        let index = nodes.length;
        for (let i = 0; i < nodes.length; i++) {
          const rect = nodes[i]!.getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) {
            index = i;
            break;
          }
        }
        setDropIndex(index);
        return;
      }

      if (drag.kind === 'width') {
        const rect = grid.getBoundingClientRect();
        const targetPx = drag.startWidthPx + (e.clientX - drag.startX);
        const columns = columnsFromPixels(targetPx, rect.width, GRID_GAP);
        setWidgetWidth(drag.id, snapWidthToPreset(columns));
        return;
      }

      const targetPx = drag.startHeightPx + (e.clientY - drag.startY);
      setWidgetHeight(drag.id, rowsFromPixels(targetPx, GRID_GAP));
    },
    [setWidgetWidth, setWidgetHeight]
  );

  useEffect(() => {
    if (!dragKind) return;
    const onMove = (e: PointerEvent): void => handleMove(e);
    const onUp = (e: PointerEvent): void => finishDrag(e.shiftKey);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragKind, handleMove, finishDrag]);

  if (widgets.length === 0) {
    if (!hasTelemetry) {
      return (
        <div className="empty-drop" style={{ cursor: 'default' }}>
          <span className="empty-drop__title">Sin telemetría</span>
          <span className="empty-drop__hint">
            Conecta el Serial, abre una sesión o carga un vídeo
          </span>
        </div>
      );
    }
    return (
      <button
        className="empty-drop"
        onClick={onRequestAdd}
        disabled={!onRequestAdd}
        style={{ cursor: onRequestAdd ? 'pointer' : 'default' }}
      >
        <span className="empty-drop__title">Sin visualizaciones</span>
        <span className="empty-drop__hint">Pulsa para añadir una gráfica</span>
      </button>
    );
  }

  const visibleWidgets = widgets.filter((w) => w.visible);
  const rows = packWidgetRows(visibleWidgets);

  return (
    <FrameBusContext.Provider value={frameBus}>
      <div
        ref={gridRef}
        data-dragging={dragKind !== null}
        className="widget-grid flex flex-col overflow-auto"
        style={{ position: 'relative', gap: `${GRID_GAP}px` }}
        onScroll={scrollGroup ? (e) => propagateScroll(e.currentTarget) : undefined}
      >
        {rows.map((row, rowIndex) => {
          const used = row.reduce((sum, w) => sum + Math.min(Math.max(w.width, 3), 12), 0);
          const spacer = 12 - used;
          return (
            <div
              key={rowIndex}
              className="flex"
              style={{ gap: `${GRID_GAP}px`, alignItems: 'flex-start' }}
            >
              {row.map((widget) => {
                const index = visibleWidgets.indexOf(widget);
                const definition = widgetRegistry.get(widget.type);
                const isDropTarget = dragKind === 'reorder' && dropIndex === index;
                const cols = Math.min(Math.max(widget.width, 3), 12);
                const rowSpan = Math.max(widget.height, 2);
                const heightPx = rowSpan * 40 + (rowSpan - 1) * GRID_GAP;
                return (
                  <div
                    key={widget.id}
                    data-widget-id={widget.id}
                    data-cols={cols}
                    data-rows={rowSpan}
                    className="widget-cell min-w-0"
                    style={{ flex: `${cols} 1 0`, minWidth: 0, height: heightPx }}
                  >
                    <WidgetWrapper
                      title={widget.label}
                      type={widget.type}
                      dropTarget={isDropTarget}
                      overlay={
                        mergeTargetId === widget.id
                          ? 'merge'
                          : fieldDropTargetId === widget.id
                            ? 'add'
                            : null
                      }
                      onConfigure={primary ? () => setEditingId(widget.id) : undefined}
                      onRemove={primary ? () => removeWidget(widget.id) : undefined}
                      onHeaderPointerDown={
                        primary
                          ? () =>
                              startDrag({
                                kind: 'reorder',
                                id: widget.id,
                                startIndex: index,
                                startX: 0,
                                startY: 0,
                                startWidthPx: 0,
                                startHeightPx: 0,
                              })
                          : undefined
                      }
                      onResizeWidthStart={
                        primary
                          ? (e) => {
                              const el = gridRef.current?.querySelector<HTMLElement>(
                                `[data-widget-id="${widget.id}"]`
                              );
                              startDrag({
                                kind: 'width',
                                id: widget.id,
                                startIndex: index,
                                startX: e.clientX,
                                startY: e.clientY,
                                startWidthPx: el?.getBoundingClientRect().width ?? 0,
                                startHeightPx: 0,
                              });
                            }
                          : undefined
                      }
                      onResizeHeightStart={
                        primary
                          ? (e) => {
                              const el = gridRef.current?.querySelector<HTMLElement>(
                                `[data-widget-id="${widget.id}"]`
                              );
                              startDrag({
                                kind: 'height',
                                id: widget.id,
                                startIndex: index,
                                startX: e.clientX,
                                startY: e.clientY,
                                startWidthPx: 0,
                                startHeightPx: el?.getBoundingClientRect().height ?? 0,
                              });
                            }
                          : undefined
                      }
                    >
                      {definition ? (
                        <definition.component
                          widgetId={widget.id}
                          config={widget.config}
                          dataFields={widget.dataFields}
                          getFrames={getFrames}
                          hoverTimestamp_ms={hoverTimestamp}
                          onCursorHover={setHoverTimestamp}
                          zoomRange={zoomRange}
                          onZoomRangeChange={setZoomRange}
                        />
                      ) : (
                        <div
                          className="flex h-full items-center justify-center text-xs"
                          style={{ color: '#f87171' }}
                        >
                          Widget desconocido: {widget.type}
                        </div>
                      )}
                    </WidgetWrapper>
                  </div>
                );
              })}
              {spacer > 0 && <div aria-hidden style={{ flex: `${spacer} 1 0`, minWidth: 0 }} />}
            </div>
          );
        })}
      </div>

      {editingWidget && (
        <WidgetConfigDialog widget={editingWidget} onClose={() => setEditingId(null)} />
      )}
    </FrameBusContext.Provider>
  );
}
