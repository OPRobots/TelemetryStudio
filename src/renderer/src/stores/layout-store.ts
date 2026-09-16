import { create } from 'zustand';
import type { DashboardLayout, LayoutPanels, WidgetConfig } from '@core/types/layout';
import { DEFAULT_PANELS } from '@core/types/layout';
import { clampHeight, clampWidth } from '../lib/widget-layout';

interface LayoutState {
  layoutName: string;
  layoutDescription: string;
  widgets: WidgetConfig[];
  panels: LayoutPanels;

  setLayout: (layout: DashboardLayout) => void;
  addWidget: (widget: WidgetConfig) => void;
  removeWidget: (widgetId: string) => void;
  updateWidget: (widgetId: string, updates: Partial<WidgetConfig>) => void;
  replaceWidgets: (widgets: WidgetConfig[]) => void;
  clearWidgets: () => void;
  setPanels: (panels: Partial<LayoutPanels>) => void;
  /** Mueve un widget a la posición `targetIndex` (reordena la lista). */
  moveWidget: (widgetId: string, targetIndex: number) => void;
  setWidgetWidth: (widgetId: string, columns: number) => void;
  setWidgetHeight: (widgetId: string, rows: number) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  layoutName: 'Sin guardar',
  layoutDescription: '',
  widgets: [],
  panels: { ...DEFAULT_PANELS },

  setLayout: (layout) =>
    set({
      layoutName: layout.name,
      layoutDescription: layout.description ?? '',
      widgets: layout.widgets.map((w) => ({ ...w })),
      panels: { ...DEFAULT_PANELS, ...layout.panels },
    }),

  addWidget: (widget) => set((s) => ({ widgets: [...s.widgets, widget] })),

  removeWidget: (widgetId) =>
    set((s) => ({ widgets: s.widgets.filter((w) => w.id !== widgetId) })),

  updateWidget: (widgetId, updates) =>
    set((s) => ({
      widgets: s.widgets.map((w) => (w.id === widgetId ? { ...w, ...updates } : w)),
    })),

  replaceWidgets: (widgets) => set({ widgets }),

  clearWidgets: () => set({ widgets: [] }),

  setPanels: (panels) => set((s) => ({ panels: { ...s.panels, ...panels } })),

  moveWidget: (widgetId, targetIndex) =>
    set((s) => {
      const from = s.widgets.findIndex((w) => w.id === widgetId);
      if (from < 0) return {};
      const next = [...s.widgets];
      const [item] = next.splice(from, 1);
      if (!item) return {};
      const index = Math.max(0, Math.min(targetIndex, next.length));
      next.splice(index, 0, item);
      return { widgets: next };
    }),

  setWidgetWidth: (widgetId, columns) =>
    set((s) => ({
      widgets: s.widgets.map((w) =>
        w.id === widgetId ? { ...w, width: clampWidth(columns) } : w
      ),
    })),

  setWidgetHeight: (widgetId, rows) =>
    set((s) => ({
      widgets: s.widgets.map((w) => (w.id === widgetId ? { ...w, height: clampHeight(rows) } : w)),
    })),
}));

export function toDashboardLayout(
  name: string,
  description: string,
  widgets: WidgetConfig[],
  panels: LayoutPanels = DEFAULT_PANELS
): DashboardLayout {
  const now = new Date().toISOString();
  return {
    version: 1,
    name,
    description,
    createdAt: now,
    modifiedAt: now,
    videoPanel: { x: 0, y: 0, width: 12, height: 8, showOverlays: false, overlays: [] },
    widgets: widgets.map((w) => ({ ...w })),
    panels: { ...panels },
    global: {
      theme: 'dark',
      units: { speed: 'rpm', distance: 'm', angle: 'deg' },
      showGrid: true,
      snapToGrid: false,
      gridSize: 40,
    },
  };
}
