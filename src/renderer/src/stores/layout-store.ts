import { create } from 'zustand';
import type { DashboardLayout, WidgetConfig } from '@core/types/layout';

interface LayoutState {
  layoutName: string;
  layoutDescription: string;
  widgets: WidgetConfig[];

  setLayout: (layout: DashboardLayout) => void;
  addWidget: (widget: WidgetConfig) => void;
  removeWidget: (widgetId: string) => void;
  updateWidget: (widgetId: string, updates: Partial<WidgetConfig>) => void;
  replaceWidgets: (widgets: WidgetConfig[]) => void;
  clearWidgets: () => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  layoutName: 'Sin guardar',
  layoutDescription: '',
  widgets: [],

  setLayout: (layout) =>
    set({
      layoutName: layout.name,
      layoutDescription: layout.description ?? '',
      widgets: layout.widgets.map((w) => ({ ...w })),
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
}));

export function toDashboardLayout(
  name: string,
  description: string,
  widgets: WidgetConfig[]
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
    global: {
      theme: 'dark',
      units: { speed: 'rpm', distance: 'm', angle: 'deg' },
      showGrid: true,
      snapToGrid: false,
      gridSize: 40,
    },
  };
}
