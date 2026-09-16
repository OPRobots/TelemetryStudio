# Layout Manager y Persistencia

## Visión General

El LayoutManager permite guardar y cargar esquemas de pantalla completos en JSON. Cada layout define qué widgets están activos, su posición, configuración, y la distribución del panel de vídeo.

## Estructura JSON de un Layout

```json
{
  "version": 1,
  "name": "Siguelíneas - Entrenamiento",
  "description": "Layout para análisis de robots Siguelíneas con IR sensors y PID",
  "createdAt": "2026-08-15T10:30:00Z",
  "modifiedAt": "2026-08-15T14:22:00Z",
  "videoPanel": {
    "x": 0,
    "y": 0,
    "width": 12,
    "height": 8,
    "showOverlays": true,
    "overlays": [
      {
        "type": "speed",
        "position": { "x": 20, "y": 460 },
        "dataField": "speed_rpm",
        "style": { "fontSize": 18, "color": "#22d3ee" }
      }
    ]
  },
  "widgets": [
    {
      "id": "widget-ir-sensors",
      "type": "DigitalBitmask",
      "label": "IR Sensors",
      "width": 6,
      "height": 4,
      "dataFields": ["ir_sensors"],
      "config": {
        "ledsPerRow": 8,
        "rows": 2,
        "onColor": "#22d3ee"
      },
      "visible": true
    },
    {
      "id": "widget-pid-chart",
      "type": "TimeSeriesChart",
      "label": "PID Output",
      "width": 6,
      "height": 6,
      "dataFields": ["motor_left", "motor_right"],
      "config": {
        "colors": ["#22d3ee", "#4ade80"],
        "yLabel": "PWM",
        "yMin": -1000,
        "yMax": 1000
      },
      "visible": true
    },
    {
      "id": "widget-state",
      "type": "StateTimeline",
      "label": "Robot State",
      "width": 12,
      "height": 3,
      "dataFields": ["state"],
      "config": {
        "stateMap": {
          "0": { "label": "IDLE", "color": "#64748b" },
          "1": { "label": "FOLLOWING", "color": "#22c55e" },
          "2": { "label": "TURNING", "color": "#eab308" }
        }
      },
      "visible": true
    }
  ],
  "panels": {
    "inspectorWidth": 288,
    "inspectorVisible": true,
    "videoRatio": 0.42,
    "comparisonRatio": 0.5
  },
  "global": {
    "theme": "dark",
    "units": {
      "speed": "rpm",
      "distance": "m",
      "angle": "deg"
    },
    "showGrid": true,
    "snapToGrid": true,
    "gridSize": 40
  }
}
```

## Implementación del Layout Manager

```typescript
// src/services/layout-manager.ts

import { ipcRenderer } from 'electron';
import type { DashboardLayout, WidgetConfig } from '@core/types/layout';
import { eventBus } from '@core/event-bus';

/**
 * Layouts predefinidos para cada disciplina de robótica.
 */
const BUILT_IN_LAYOUTS: DashboardLayout[] = [
  {
    version: 1,
    name: 'Siguelíneas',
    description: 'IR sensors + PID + State para robots Siguelíneas',
    createdAt: '2026-01-01T00:00:00Z',
    modifiedAt: '2026-01-01T00:00:00Z',
    videoPanel: { x: 0, y: 0, width: 12, height: 8, showOverlays: true, overlays: [] },
    widgets: [
      { id: 'w1', type: 'DigitalBitmask', label: 'IR Sensors', width: 12, height: 4, dataFields: ['ir_sensors'], config: {}, visible: true },
      { id: 'w2', type: 'TimeSeriesChart', label: 'PID Output', width: 12, height: 6, dataFields: ['motor_left', 'motor_right'], config: {}, visible: true },
      { id: 'w3', type: 'StateTimeline', label: 'State', width: 12, height: 3, dataFields: ['state'], config: {}, visible: true },
    ],
    global: { theme: 'dark', units: { speed: 'rpm', distance: 'm', angle: 'deg' }, showGrid: true, snapToGrid: true, gridSize: 40 },
  },
  {
    version: 1,
    name: 'Micromouse',
    description: 'Minimap 2D + Velocity para robots Micromouse',
    createdAt: '2026-01-01T00:00:00Z',
    modifiedAt: '2026-01-01T00:00:00Z',
    videoPanel: { x: 0, y: 0, width: 12, height: 8, showOverlays: true, overlays: [] },
    widgets: [
      { id: 'w1', type: 'Minimap2D', label: 'Maze Path', width: 12, height: 8, dataFields: ['position_x', 'position_y', 'heading_deg'], config: {}, visible: true },
      { id: 'w2', type: 'TimeSeriesChart', label: 'Speed', width: 12, height: 4, dataFields: ['speed_rpm'], config: {}, visible: true },
    ],
    global: { theme: 'dark', units: { speed: 'cm/s', distance: 'cm', angle: 'deg' }, showGrid: true, snapToGrid: true, gridSize: 40 },
  },
];

class LayoutManager {
  private currentLayout: DashboardLayout | null = null;
  private savedLayouts: DashboardLayout[] = [];

  constructor() {
    this.loadSavedLayouts();
  }

  /**
   * Obtiene todos los layouts disponibles (built-in + guardados).
   */
  getAllLayouts(): DashboardLayout[] {
    return [...BUILT_IN_LAYOUTS, ...this.savedLayouts];
  }

  /**
   * Obtiene el layout actual.
   */
  getCurrentLayout(): DashboardLayout | null {
    return this.currentLayout;
  }

  /**
   * Carga un layout y lo establece como actual.
   */
  loadLayout(layout: DashboardLayout): void {
    this.currentLayout = { ...layout };
    eventBus.emit('ui:layout-load', { layout: this.currentLayout });
  }

  /**
   * Guarda el layout actual en disco.
   */
  async saveLayout(name?: string): Promise<void> {
    if (!this.currentLayout) return;

    const layoutToSave: DashboardLayout = {
      ...this.currentLayout,
      name: name ?? this.currentLayout.name,
      modifiedAt: new Date().toISOString(),
    };

    // Guardar en disco via IPC
    await ipcRenderer.invoke('layout:save', layoutToSave);

    // Actualizar en la lista local
    const existingIdx = this.savedLayouts.findIndex(l => l.name === layoutToSave.name);
    if (existingIdx >= 0) {
      this.savedLayouts[existingIdx] = layoutToSave;
    } else {
      this.savedLayouts.push(layoutToSave);
    }

    this.currentLayout = layoutToSave;
  }

  /**
   * Crea un layout nuevo a partir del layout actual.
   */
  createNew(name: string, description?: string): DashboardLayout {
    const newLayout: DashboardLayout = {
      version: 1,
      name,
      description,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      videoPanel: { x: 0, y: 0, width: 12, height: 8, showOverlays: true, overlays: [] },
      widgets: [],
      global: { theme: 'dark', units: { speed: 'rpm', distance: 'm', angle: 'deg' }, showGrid: true, snapToGrid: true, gridSize: 40 },
    };

    this.currentLayout = newLayout;
    return newLayout;
  }

  /**
   * Añade un widget al layout actual.
   */
  addWidget(config: WidgetConfig): void {
    if (!this.currentLayout) return;
    this.currentLayout.widgets.push(config);
    this.currentLayout.modifiedAt = new Date().toISOString();
    eventBus.emit('ui:widget-add', { widgetConfig: config });
  }

  /**
   * Elimina un widget del layout actual.
   */
  removeWidget(widgetId: string): void {
    if (!this.currentLayout) return;
    this.currentLayout.widgets = this.currentLayout.widgets.filter(w => w.id !== widgetId);
    this.currentLayout.modifiedAt = new Date().toISOString();
    eventBus.emit('ui:widget-remove', { widgetId });
  }

  /**
   * Actualiza un widget del layout actual.
   */
  updateWidget(widgetId: string, updates: Partial<WidgetConfig>): void {
    if (!this.currentLayout) return;
    const widget = this.currentLayout.widgets.find(w => w.id === widgetId);
    if (widget) {
      Object.assign(widget, updates);
      this.currentLayout.modifiedAt = new Date().toISOString();
      eventBus.emit('ui:widget-update', { widgetId, config: updates });
    }
  }

  /**
   * Elimina un layout guardado.
   */
  async deleteLayout(name: string): Promise<void> {
    await ipcRenderer.invoke('layout:delete', name);
    this.savedLayouts = this.savedLayouts.filter(l => l.name !== name);
  }

  /**
   * Carga layouts guardados del disco.
   */
  private async loadSavedLayouts(): Promise<void> {
    try {
      this.savedLayouts = await ipcRenderer.invoke('layout:loadAll') ?? [];
    } catch {
      this.savedLayouts = [];
    }
  }
}

export const layoutManager = new LayoutManager();
```

## Servicio de Persistencia en Main Process

```typescript
// src/main/ipc-handlers.ts (añadido)

import { readFile, writeFile, readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';

const LAYOUTS_DIR = join(app.getPath('userData'), 'layouts');

async function ensureLayoutsDir(): Promise<void> {
  const { mkdir } = await import('fs/promises');
  await mkdir(LAYOUTS_DIR, { recursive: true });
}

// Registrar handlers
ipcMain.handle('layout:save', async (_event, layout: DashboardLayout) => {
  await ensureLayoutsDir();
  const filename = `${layout.name.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`;
  await writeFile(join(LAYOUTS_DIR, filename), JSON.stringify(layout, null, 2));
});

ipcMain.handle('layout:loadAll', async () => {
  await ensureLayoutsDir();
  const files = await readdir(LAYOUTS_DIR);
  const layouts: DashboardLayout[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const content = await readFile(join(LAYOUTS_DIR, file), 'utf-8');
      layouts.push(JSON.parse(content));
    } catch (error) {
      console.error(`Failed to load layout ${file}:`, error);
    }
  }

  return layouts;
});

ipcMain.handle('layout:delete', async (_event, name: string) => {
  await ensureLayoutsDir();
  const filename = `${name.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`;
  await unlink(join(LAYOUTS_DIR, filename)).catch(() => {});
});
```
