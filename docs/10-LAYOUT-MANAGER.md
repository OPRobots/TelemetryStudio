# Layout Manager y Persistencia

## Visión General

Un **layout** describe la disposición del dashboard: la lista de widgets (tipo,
campos, tamaño y configuración) y las proporciones de los paneles. Los layouts
predefinidos y los guardados por el usuario se persisten en
`app.getPath('userData')/layouts/`.

## Estructura JSON de un Layout

```json
{
  "version": 1,
  "name": "Siguelíneas",
  "description": "IR sensors + PWM + estados",
  "createdAt": "2026-01-01T00:00:00Z",
  "modifiedAt": "2026-01-01T00:00:00Z",
  "widgets": [
    {
      "id": "w-ir",
      "type": "DigitalBitmask",
      "label": "Sensores IR",
      "width": 12,
      "height": 3,
      "dataFields": ["ir_sensors"],
      "config": { "ledsPerRow": 24, "rows": 1 },
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
    "units": { "speed": "rpm", "distance": "m", "angle": "deg" },
    "showGrid": true,
    "snapToGrid": false,
    "gridSize": 40
  }
}
```

- `width` (columnas de 12) y `height` (filas de 40 px) definen el tamaño en la rejilla
  fluida. El **orden** de `widgets` es el de colocación (no hay x/y).
- `panels.comparisonRatio` es el **ancho** del panel A en comparación.

## Layout Manager

`src/services/layout-manager.ts` (`layoutManager` singleton y `createEmptyLayout`).
Usa un `LayoutPersistence` (adaptador) para no depender de `electron`.

```typescript
BUILT_IN_LAYOUTS: DashboardLayout[]      // Siguelíneas, Micromouse
createEmptyLayout(name, description?): DashboardLayout

layoutManager.getCurrentLayout(): DashboardLayout | null
layoutManager.getSavedLayouts(): DashboardLayout[]
layoutManager.getBuiltInLayouts(): DashboardLayout[]
layoutManager.loadLayout(name): void
layoutManager.saveLayout(name?): Promise<void>
layoutManager.deleteLayout(name): Promise<void>
layoutManager.refreshSavedLayouts(): Promise<void>
layoutManager.addWidget(widget) / removeWidget(id) / updateWidget(id, patch)
layoutManager.replaceWidgets(widgets)
```

Los layouts built-in vienen **sin campos asignados** (`dataFields: []`): al cargarlos,
los widgets se muestran vacíos hasta que el usuario elige campos (o hasta que el
auto-layout los rellene).

## Store del renderer

`src/renderer/src/stores/layout-store.ts` (`useLayoutStore`) mantiene el estado en vivo
(`widgets`, `panels`, `layoutName`) y las acciones: `setLayout`, `addWidget`,
`removeWidget`, `updateWidget`, `replaceWidgets`, `clearWidgets`, `moveWidget`,
`setWidgetWidth`, `setWidgetHeight`, `setPanels`.

La lógica de rejilla (snap de ancho/alto, empaquetado en filas) vive en
`src/renderer/src/lib/widget-layout.ts` (`packWidgetRows`, `snapWidthToPreset`,
`columnsFromPixels`, `rowsFromPixels`, `clampHeight`).

## Persistencia en Main Process

`src/main/ipc-handlers.ts`:

- `layout:save`, `layout:loadAll`, `layout:delete`.

Almacenamiento: `app.getPath('userData')/layouts/`. La UI de gestión es
`LayoutDialog` (listar/cargar/guardar/eliminar). **Nuevo layout** es una acción del menú
nativo (**Ver → Nuevo layout…**) con confirmación propia en el main process
(`dialog.showMessageBoxSync`): parte de un layout vacío (`createEmptyLayout`,
`Sin guardar`) y limpia el lienzo. El layout nuevo no se persiste hasta pulsar
**Guardar** en `LayoutDialog`.
