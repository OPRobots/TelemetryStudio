# Layout Manager y Persistencia

## Visión General

Un **layout** describe la disposición del dashboard: la lista de widgets (tipo,
campos, tamaño y configuración) y las proporciones de los paneles. **No hay layouts
predefinidos**: el usuario guarda los suyos (con **nombre y descripción**) y se
persisten en `app.getPath('userData')/layouts/`.

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
  "videoPanel": {
    "x": 0,
    "y": 0,
    "width": 12,
    "height": 6,
    "showOverlays": true,
    "overlays": []
  },
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
  },
  "exportBoard": {
    "aspect": "16:9",
    "resolution": "1080p",
    "videoMode": "flow",
    "panel": "translucent",
    "supersample": 1,
    "lineScale": 1.5,
    "showLabel": true,
    "background": "#0a0e17",
    "items": []
  }
}
```

- `width` (columnas de 12) y `height` (filas de 40 px) definen el tamaño en la rejilla
  fluida. El **orden** de `widgets` es el de colocación (no hay x/y).
- `videoPanel` es **requerido** por el tipo (`VideoPanelConfig`).
- `panels.comparisonRatio` es el **ancho** del panel A en comparación.
- `exportBoard` (opcional): board del **editor de exportación** (ítems
  widget/vídeo/sección). Se guarda y carga con el layout; ver `docs/09-VIDEO-EXPORT.md`.

## Layout Manager

`src/services/layout-manager.ts` (`layoutManager` singleton y `createEmptyLayout`).
Usa un `LayoutPersistence` (adaptador) para no depender de `electron`.

```typescript
createEmptyLayout(name, description?): DashboardLayout

layoutManager.getCurrentLayout(): DashboardLayout | null
layoutManager.getAllLayouts(): DashboardLayout[]   // alias de getSavedLayouts()
layoutManager.getSavedLayouts(): DashboardLayout[]
layoutManager.loadLayout(layout: DashboardLayout): void
layoutManager.createNew(name, description?): DashboardLayout
layoutManager.saveLayout(name?): Promise<void>
layoutManager.deleteLayout(name): Promise<void>
layoutManager.refreshSavedLayouts(): Promise<void>
layoutManager.addWidget(widget) / removeWidget(id) / updateWidget(id, patch)
layoutManager.replaceWidgets(widgets)
```

Al **guardar** desde `LayoutDialog` se pide **nombre** y **descripción** (opcional); el
layout se guarda como `<nombre>.json` y, si ya existe, se sobrescribe conservando su
`createdAt`. La lista muestra nombre y descripción (o `N widgets` si no hay descripción).
Los parámetros de salida **no** se persisten aquí (van con la sesión, ver `docs/14`).

## Store del renderer

`src/renderer/src/stores/layout-store.ts` (`useLayoutStore`) mantiene el estado en vivo
(`widgets`, `panels`, `layoutName`, `layoutDescription`, `exportBoard`) y las acciones:
`setLayout`, `addWidget`, `removeWidget`, `updateWidget`, `replaceWidgets`,
`clearWidgets`, `moveWidget`, `setWidgetWidth`, `setWidgetHeight`, `setPanels`,
`addFieldToWidget`, `mergeWidgets`, `setExportBoard`.

La lógica de rejilla (snap y clamp de ancho/alto, empaquetado en filas) vive en
`src/shared/grid.ts` (`snapGridWidth`, `clampGridWidth`, `clampGridHeight`,
`packGridRows`). En `src/renderer/src/lib/widget-layout.ts` solo hay conversión
**píxeles → celdas** (`columnsFromPixels`, `rowsFromPixels`).

## Edición por arrastre

- **Añadir un campo a un widget**: arrastra un campo desde el panel izquierdo
  (**Campos**) y suéltalo sobre el widget. Se añade a `dataFields` (sin duplicar) y, si el
  widget tiene colores explícitos, se le asigna un color nuevo conservando los existentes.
  Mientras se arrastra, el widget muestra un overlay **“+” / Añadir campo** (HTML5 DnD).
  Se permite soltar en **cualquier** widget; si el tipo de dato no encaja, la
  representación fallará y se corrige en la configuración del widget.
- **Fusionar gráficas**: arrastra la **cabecera** de una `TimeSeriesChart` sobre otra
  manteniendo **Shift**. En lugar de reordenar, los campos de la arrastrada se añaden a la
  de destino (sin duplicar, conservando sus colores) y **la de origen se elimina**. El
  destino muestra un overlay **“+” / Fusionar**. Sin Shift el arrastre reordena como
  siempre; con Shift sobre un destino **no válido** no se hace nada.
- La edición por arrastre está **deshabilitada en comparación**.

`seriesPalette` (`src/widgets/color-palette.ts`) aporta los colores nuevos; los booleanos
en una gráfica se representan como **1/0**.

## Persistencia en Main Process

`src/main/ipc-handlers.ts`:

- `layout:save`, `layout:loadAll`, `layout:delete`.

Almacenamiento: `app.getPath('userData')/layouts/`. La UI de gestión es
`LayoutDialog` (listar/cargar/guardar/eliminar). **Nuevo layout** es una acción del menú
nativo (**Ver → Nuevo layout…**) con confirmación propia en el main process
(`dialog.showMessageBoxSync`): parte de un layout vacío (`createEmptyLayout`,
`Sin guardar`) y limpia el lienzo. El layout nuevo no se persiste hasta pulsar
**Guardar** en `LayoutDialog`.
