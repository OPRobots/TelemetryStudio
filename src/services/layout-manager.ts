import type { DashboardLayout, WidgetConfig } from '@core/types/layout';
import { eventBus } from '@core/event-bus';

/**
 * Layouts predefinidos por disciplina de robótica.
 */
export const BUILT_IN_LAYOUTS: DashboardLayout[] = [
  {
    version: 1,
    name: 'Siguelíneas',
    description: 'IR sensors + PWM + estados para robots Siguelíneas',
    createdAt: '2026-01-01T00:00:00Z',
    modifiedAt: '2026-01-01T00:00:00Z',
    videoPanel: { x: 0, y: 0, width: 12, height: 8, showOverlays: false, overlays: [] },
    widgets: [
      {
        id: 'w-ir',
        type: 'DigitalBitmask',
        label: 'Sensores IR',
        x: 0,
        y: 0,
        width: 8,
        height: 3,
        dataFields: [],
        config: {},
        visible: true,
        zIndex: 0,
      },
      {
        id: 'w-chart',
        type: 'TimeSeriesChart',
        label: 'Señales',
        x: 0,
        y: 3,
        width: 12,
        height: 6,
        dataFields: [],
        config: {},
        visible: true,
        zIndex: 1,
      },
      {
        id: 'w-state',
        type: 'StateTimeline',
        label: 'Estado',
        x: 0,
        y: 9,
        width: 12,
        height: 3,
        dataFields: [],
        config: {},
        visible: true,
        zIndex: 2,
      },
    ],
    global: {
      theme: 'dark',
      units: { speed: 'rpm', distance: 'm', angle: 'deg' },
      showGrid: true,
      snapToGrid: false,
      gridSize: 40,
    },
  },
  {
    version: 1,
    name: 'Micromouse',
    description: 'Minimapa 2D + velocidad + sensores para Micromouse',
    createdAt: '2026-01-01T00:00:00Z',
    modifiedAt: '2026-01-01T00:00:00Z',
    videoPanel: { x: 0, y: 0, width: 12, height: 8, showOverlays: false, overlays: [] },
    widgets: [
      {
        id: 'w-map',
        type: 'Minimap2D',
        label: 'Trayectoria',
        x: 0,
        y: 0,
        width: 12,
        height: 8,
        dataFields: [],
        config: {},
        visible: true,
        zIndex: 0,
      },
      {
        id: 'w-speed',
        type: 'TimeSeriesChart',
        label: 'Velocidad',
        x: 0,
        y: 8,
        width: 12,
        height: 4,
        dataFields: [],
        config: {},
        visible: true,
        zIndex: 1,
      },
    ],
    global: {
      theme: 'dark',
      units: { speed: 'cm/s', distance: 'cm', angle: 'deg' },
      showGrid: true,
      snapToGrid: false,
      gridSize: 40,
    },
  },
];

interface LayoutPersistence {
  save(layout: DashboardLayout): Promise<void>;
  loadAll(): Promise<DashboardLayout[]>;
  remove(name: string): Promise<void>;
}

function defaultPersistence(): LayoutPersistence | null {
  const api = (globalThis as unknown as { api?: Record<string, unknown> }).api;
  if (!api || typeof api['layoutSave'] !== 'function') return null;
  return {
    save: (layout) => (api['layoutSave'] as (l: DashboardLayout) => Promise<void>)(layout),
    loadAll: () => (api['layoutLoadAll'] as () => Promise<DashboardLayout[]>)() ?? Promise.resolve([]),
    remove: (name) => (api['layoutDelete'] as (n: string) => Promise<void>)(name),
  };
}

/**
 * Gestiona el layout del dashboard: widgets, posiciones y persistencia.
 */
export class LayoutManager {
  private currentLayout: DashboardLayout | null = null;
  private savedLayouts: DashboardLayout[] = [];
  private persistence: LayoutPersistence | null;

  constructor(persistence: LayoutPersistence | null = defaultPersistence()) {
    this.persistence = persistence;
    void this.refreshSavedLayouts();
  }

  getAllLayouts(): DashboardLayout[] {
    const names = new Set(this.savedLayouts.map((l) => l.name));
    return [...BUILT_IN_LAYOUTS.filter((l) => !names.has(l.name)), ...this.savedLayouts];
  }

  getBuiltInLayouts(): DashboardLayout[] {
    return BUILT_IN_LAYOUTS;
  }

  getSavedLayouts(): DashboardLayout[] {
    return this.savedLayouts;
  }

  getCurrentLayout(): DashboardLayout | null {
    return this.currentLayout;
  }

  loadLayout(layout: DashboardLayout): void {
    this.currentLayout = cloneLayout(layout);
    eventBus.emit('ui:layout-load', { layout: this.currentLayout });
  }

  createNew(name: string, description?: string): DashboardLayout {
    const layout = createEmptyLayout(name, description);
    this.currentLayout = layout;
    eventBus.emit('ui:layout-load', { layout });
    return layout;
  }

  addWidget(config: WidgetConfig): void {
    if (!this.currentLayout) return;
    this.currentLayout.widgets.push(config);
    this.touch();
    eventBus.emit('ui:widget-add', { widgetConfig: config });
  }

  removeWidget(widgetId: string): void {
    if (!this.currentLayout) return;
    this.currentLayout.widgets = this.currentLayout.widgets.filter((w) => w.id !== widgetId);
    this.touch();
    eventBus.emit('ui:widget-remove', { widgetId });
  }

  updateWidget(widgetId: string, updates: Partial<WidgetConfig>): void {
    if (!this.currentLayout) return;
    const widget = this.currentLayout.widgets.find((w) => w.id === widgetId);
    if (!widget) return;
    Object.assign(widget, updates);
    this.touch();
    eventBus.emit('ui:widget-update', { widgetId, config: updates });
  }

  replaceWidgets(widgets: WidgetConfig[]): void {
    if (!this.currentLayout) return;
    this.currentLayout.widgets = widgets;
    this.touch();
  }

  async saveLayout(name?: string): Promise<void> {
    if (!this.currentLayout) return;
    const toSave: DashboardLayout = {
      ...cloneLayout(this.currentLayout),
      name: name ?? this.currentLayout.name,
      modifiedAt: new Date().toISOString(),
    };

    if (this.persistence) {
      await this.persistence.save(toSave);
    }

    const idx = this.savedLayouts.findIndex((l) => l.name === toSave.name);
    if (idx >= 0) this.savedLayouts[idx] = toSave;
    else this.savedLayouts.push(toSave);

    this.currentLayout = toSave;
    eventBus.emit('ui:layout-save', { layout: toSave });
  }

  async deleteLayout(name: string): Promise<void> {
    if (this.persistence) {
      await this.persistence.remove(name);
    }
    this.savedLayouts = this.savedLayouts.filter((l) => l.name !== name);
  }

  async refreshSavedLayouts(): Promise<void> {
    if (!this.persistence) return;
    try {
      this.savedLayouts = (await this.persistence.loadAll()) ?? [];
    } catch {
      this.savedLayouts = [];
    }
  }

  private touch(): void {
    if (this.currentLayout) {
      this.currentLayout.modifiedAt = new Date().toISOString();
    }
  }
}

export function createEmptyLayout(name: string, description?: string): DashboardLayout {
  const now = new Date().toISOString();
  return {
    version: 1,
    name,
    description,
    createdAt: now,
    modifiedAt: now,
    videoPanel: { x: 0, y: 0, width: 12, height: 8, showOverlays: false, overlays: [] },
    widgets: [],
    global: {
      theme: 'dark',
      units: { speed: 'rpm', distance: 'm', angle: 'deg' },
      showGrid: true,
      snapToGrid: false,
      gridSize: 40,
    },
  };
}

function cloneLayout(layout: DashboardLayout): DashboardLayout {
  return JSON.parse(JSON.stringify(layout)) as DashboardLayout;
}

export const layoutManager = new LayoutManager();
