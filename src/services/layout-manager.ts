import type { DashboardLayout, WidgetConfig } from '@core/types/layout';
import { DEFAULT_PANELS } from '@core/types/layout';
import { eventBus } from '@core/event-bus';

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
    return this.savedLayouts;
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
    const targetName = name ?? this.currentLayout.name;
    const existing = this.savedLayouts.find((l) => l.name === targetName);
    const toSave: DashboardLayout = {
      ...cloneLayout(this.currentLayout),
      name: targetName,
      createdAt: existing?.createdAt ?? this.currentLayout.createdAt,
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
    panels: { ...DEFAULT_PANELS },
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
