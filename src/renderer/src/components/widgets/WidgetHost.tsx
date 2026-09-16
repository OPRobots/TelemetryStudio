import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { widgetRegistry } from '@widgets/widget-registry';
import { telemetryStore } from '@core/telemetry-store';
import type { TelemetryFrame } from '@core/types/telemetry';
import type { VideoFrameContext } from '@core/types/video';
import { useEventListener } from '../../hooks/useEventListener';
import { useLayoutStore } from '../../stores/layout-store';
import { useAppStore } from '../../stores/app-store';
import { WidgetWrapper } from './WidgetWrapper';
import { WidgetConfigDialog } from './WidgetConfigDialog';
import {
  columnsFromPixels,
  rowsFromPixels,
  snapWidthToPreset,
} from '../../lib/widget-layout';

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

/** Anima posición y tamaño de los widgets al cambiar (FLIP). */
function useFlipAnimation(deps: unknown[], gridRef: React.RefObject<HTMLDivElement | null>): void {
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
      if (!prev || rect.width === 0 || rect.height === 0) continue;

      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      const sx = prev.width / rect.width;
      const sy = prev.height / rect.height;

      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) {
        continue;
      }

      node.style.transition = 'none';
      node.style.transformOrigin = 'top left';
      node.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

      requestAnimationFrame(() => {
        node.style.transition = 'transform 150ms ease';
        node.style.transform = '';
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
}: WidgetHostProps): React.ReactElement {
  const widgets = useLayoutStore((s) => s.widgets);
  const removeWidget = useLayoutStore((s) => s.removeWidget);
  const moveWidget = useLayoutStore((s) => s.moveWidget);
  const setWidgetWidth = useLayoutStore((s) => s.setWidgetWidth);
  const setWidgetHeight = useLayoutStore((s) => s.setWidgetHeight);
  const hasTelemetry = useAppStore((s) => s.frameCount > 0);

  const [frame, setFrame] = useState<TelemetryFrame | null>(null);
  const [context, setContext] = useState<VideoFrameContext | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragKind, setDragKind] = useState<DragKind | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  useEventListener(eventName, ({ frame: f, context: c }) => {
    setFrame(f);
    setContext(c);
  });

  useEventListener('data:streaming-frame', ({ frame: f }) => {
    const hasVideo = primary && !useAppStore.getState().videoSrc;
    if (hasVideo) setFrame(f);
  });

  const frames =
    dataset === 'comparison' ? telemetryStore.getComparisonFrames() : telemetryStore.getAllFrames();

  const editingWidget = useMemo(
    () => widgets.find((w) => w.id === editingId) ?? null,
    [widgets, editingId]
  );

  useFlipAnimation([widgets], gridRef);

  const startDrag = useCallback((state: DragState) => {
    dragRef.current = state;
    setDragKind(state.kind);
    document.body.style.userSelect = 'none';
  }, []);

  const finishDrag = useCallback(() => {
    const drag = dragRef.current;
    if (drag?.kind === 'reorder' && dropIndex !== null) {
      const clampedDrop = Math.min(dropIndex, widgets.length);
      const target = clampedDrop > drag.startIndex ? clampedDrop - 1 : clampedDrop;
      moveWidget(drag.id, target);
    }
    dragRef.current = null;
    setDragKind(null);
    setDropIndex(null);
    document.body.style.userSelect = '';
  }, [dropIndex, widgets.length, moveWidget]);

  const handleMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      const grid = gridRef.current;
      if (!drag || !grid) return;

      if (drag.kind === 'reorder') {
        const nodes = Array.from(grid.querySelectorAll<HTMLElement>('[data-widget-id]'));
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
    const onUp = (): void => finishDrag();
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

  return (
    <>
      <div
        ref={gridRef}
        className="h-full w-full overflow-auto"
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
          gridAutoRows: '40px',
          gridAutoFlow: 'row',
          gap: `${GRID_GAP}px`,
        }}
      >
        {widgets
          .filter((w) => w.visible)
          .map((widget, index) => {
            const definition = widgetRegistry.get(widget.type);
            const isDropTarget = dragKind === 'reorder' && dropIndex === index;
            return (
              <div
                key={widget.id}
                data-widget-id={widget.id}
                className="min-h-0 min-w-0"
                style={{
                  gridColumn: `span ${Math.max(widget.width, 3)}`,
                  gridRow: `span ${Math.max(widget.height, 2)}`,
                }}
              >
                <WidgetWrapper
                  title={widget.label}
                  type={widget.type}
                  dropTarget={isDropTarget}
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
                      frame={frame}
                      context={context}
                      frames={frames}
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
      </div>

      {editingWidget && (
        <WidgetConfigDialog widget={editingWidget} onClose={() => setEditingId(null)} />
      )}
    </>
  );
}
