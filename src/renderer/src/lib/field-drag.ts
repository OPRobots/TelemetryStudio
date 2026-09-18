import { create } from 'zustand';
import { useLayoutStore } from '../stores/layout-store';
import { useComparisonStore } from '../stores/comparison-store';

interface FieldDragState {
  /** Campo que se está arrastrando desde el Inspector. */
  field: string | null;
  /** Widget sobre el que se soltaría (si el campo no está ya presente). */
  targetWidgetId: string | null;
  start: (field: string) => void;
  setTarget: (id: string | null) => void;
  end: () => void;
}

export const useFieldDragStore = create<FieldDragState>((set) => ({
  field: null,
  targetWidgetId: null,
  start: (field) => set({ field, targetWidgetId: null }),
  setTarget: (id) => set({ targetWidgetId: id }),
  end: () => set({ field: null, targetWidgetId: null }),
}));

function widgetAtPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  const cell = el?.closest('[data-widget-id]') as HTMLElement | null;
  return cell?.dataset.widgetId ?? null;
}

let active = false;

function updateTarget(x: number, y: number): void {
  const field = useFieldDragStore.getState().field;
  if (!field) return;
  const id = widgetAtPoint(x, y);
  const widget = id ? useLayoutStore.getState().widgets.find((w) => w.id === id) : undefined;
  const valid = !!widget && !widget.dataFields.includes(field);
  useFieldDragStore.getState().setTarget(valid ? id : null);
  document.body.classList.toggle('field-drag-copy', valid);
}

function onMove(e: PointerEvent): void {
  updateTarget(e.clientX, e.clientY);
}

function onUp(e: PointerEvent): void {
  const { field, targetWidgetId } = useFieldDragStore.getState();
  if (field && targetWidgetId) {
    useLayoutStore.getState().addFieldToWidget(targetWidgetId, field);
  }
  endFieldDrag();
  void e;
}

function endFieldDrag(): void {
  useFieldDragStore.getState().end();
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onUp);
  document.body.classList.remove('field-dragging', 'field-drag-copy');
  document.body.style.userSelect = '';
  active = false;
}

/**
 * Inicia el arrastre de un campo desde el Inspector (pointer events). Controla
 * el cursor (`copy`) y muestra el overlay en el widget destino. No hace nada en
 * modo comparación.
 */
export function startFieldDrag(field: string): void {
  if (typeof window === 'undefined') return;
  if (useComparisonStore.getState().active) return;
  useFieldDragStore.getState().start(field);
  if (active) return;
  active = true;
  document.body.classList.add('field-dragging');
  document.body.style.userSelect = 'none';
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}
