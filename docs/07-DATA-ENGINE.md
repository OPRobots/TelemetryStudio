# Motor de Datos (Data Engine)

## EventBus — Publicación/Suscripción

`src/core/event-bus.ts` (`eventBus` singleton). Tipado por `EventMap` (`docs/04-DATA-MODEL.md`).

```typescript
on(event, cb): () => void   // suscribe; devuelve el cleanup
once(event, cb): () => void
off(event): void            // elimina los listeners de ese evento
clear(): void               // elimina todos los listeners
emit(event, payload): void  // los errores de un listener no rompen a los demás
```

Uso en React: `src/renderer/src/hooks/useEventListener.ts`.

## TelemetryStore — Almacén de frames (multi-dataset)

`src/core/telemetry-store.ts` (`telemetryStore` singleton). Guarda el dataset
**primario** (sesión/captura actual) y el de **comparación** (sesión B).

```typescript
// Primario
loadDataset(dataset); addFrame(frame);
findClosestFrame(timestamp_ms);        // búsqueda binaria
findFramesInRange(start_ms, end_ms);
getFrameAt(index); frameCount; currentDataset; getAllFrames();
clearPrimary();                        // vacía SOLO el primario

// Comparación
loadComparisonDataset(dataset);
findClosestFrameComparison(timestamp_ms);
comparisonData; getComparisonFrames(); clearComparison();

// Todo
clear();
```

> `clearPrimary()` es clave: al **reiniciar una captura serial** se vacía solo el
> dataset actual, sin borrar la sesión de comparación.
>
> `loadDataset` y `loadComparisonDataset` emiten el **mismo** `data:loaded` (sin
> discriminador); `clear()` no emite evento, pero `clearComparison()` sí
> (`comparison:stop`). `clearPrimary()` además resetea el flag de ordenación.

## Cursor y zoom compartidos

`src/renderer/src/stores/cursor-store.ts` (`useCursorStore`):

- `hoverTimestamp_ms` — timestamp bajo el cursor (lo publican TimeSeriesChart y StateTimeline).
- `zoomRange: { startMs, endMs } | null` — rango de zoom global entre timelines.

`WidgetHost` entrega a cada widget el `hoverTimestamp_ms` y el frame actual vía
`FrameBus` (por panel); **casi todos** los widgets resuelven el timestamp efectivo
(`hover → vídeo → frame → último frame`) con `resolveViewTimestamp` (la leyenda de
`TimeSeriesChart` usa su propia expresión, sin el fallback a último frame). También
reparte `zoomRange`/`onCursorHover`. Ver `docs/08-WIDGET-SYSTEM.md`.

## ComparisonManager

`src/core/comparison-manager.ts` (`comparisonManager` singleton).

```typescript
startComparison(reference: SessionFile, currentWidgets: SessionWidget[]): WidgetCompatibilityResult
stopComparison();          // clearComparison() + comparison:stop
isActive; currentReference;
```

`WidgetCompatibilityResult = { compatible, differences, sessionAWidgets, sessionBWidgets }`.
La validación compara **posición a posición** el mismo índice: tipo, campos, tamaño y
configuración. Reordenar la lista las hace incompatibles aunque el conjunto sea idéntico.
Si difieren, emite `comparison:widget-mismatch` con las diferencias.

> `validateWidgetCompatibility(a, b)` es **público** (útil para tests y para validar sin
> arrancar la comparación).
>
> Se impone el límite de **una comparación activa**: `startComparison()` devuelve
> `compatible:false` con un mensaje si ya hay una en curso. `stopComparison()` delega en
> `telemetryStore.clearComparison()`, que es quien emite `comparison:stop` (una sola vez).

## Búsqueda binaria

`src/core/binary-search.ts`:

- `binarySearch(frames, target_ms)` → frame más cercano.
- `binarySearchIndex(frames, target_ms)` → índice del frame más cercano.
- `findFramesInRange(frames, start_ms, end_ms)` → subarray en el rango.
- `frameRangeBounds(frames, start_ms, end_ms, pad = 1)` → índices `[lo, hi]` del rango
  (con margen); lo usa el `TimeSeriesChart`.

Edge cases: `binarySearch` devuelve el primer frame si el target es menor que el mínimo y
el último si es mayor que el máximo; los empates se rompen hacia el índice inferior.
`binarySearchIndex([])` devuelve `0` (no `-1`) y `findFramesInRange` devuelve `[]` si el
rango es invertido o vacío.

## Downsampling LTTB

`src/core/lttb.ts`:

- `downsampleLTTB(points, targetPoints)` — Largest-Triangle-Three-Buckets; preserva
  el primer y último punto. Devuelve una copia si `data.length <= 2` o si
  `targetPoints >= data.length`; con `targetPoints <= 2` devuelve solo extremos.
- `framesToLTTBPoints(frames, field)` — convierte frames a puntos `{x, y}` (usado en tests).

El `TimeSeriesChart` construye los puntos con `{ x: i - lo, y: valor }` (índice **relativo
a la ventana**) y solo aplica LTTB cuando el nº de frames de la ventana supera
`maxPoints` (por defecto **2000**, configurable por widget).

## Session Manager

`src/services/session-manager.ts` (`sessionManager` singleton). Usa un
`SessionStorageAdapter` (no importa `electron` directamente), de modo que el core
queda desacoplado del proceso.

```typescript
readSession(jsonPath): Promise<SessionFile>
resolveVideoPath(jsonPath, videoFile): Promise<string>
saveSession(session, outputDir, videoPath): Promise<string>
listSessions(directory): Promise<SessionInfo[]>
```

La orquestación de UI (cargar/guardar, aplicar sync y layout) vive en
`src/renderer/src/lib/session-actions.ts`.

## Main Process — Handlers IPC

`src/main/index.ts` registra tres grupos de handlers (todos accesibles vía
`preload/index.ts`):

- `src/main/ipc-handlers.ts`:
  - Diálogos: `dialog:openVideo`, `dialog:openSession`, `dialog:openDirectory`.
  - Serial: `serial:open`, `serial:close`, `serial:list` (+ `serial:data`/`serial:status` push).
  - Sesiones: `session:export`, `session:read`, `session:getVideoPath`, `session:list`, `file:read`.
  - Layouts: `layout:save`, `layout:loadAll`, `layout:delete`.
  - App: `app:version`, `open-external`, `settings:getSerial`, `settings:setSerial`,
    `settings:getUpdate`, `settings:setUpdate`.
- `src/main/video-service.ts`: `video:prepare`, `video:cancel-prepare`
  (+ `video:prepare-status` push).
- `src/main/update-service.ts`: `update:check` (consulta la última release de GitHub,
  sin bloquear; falla en silencio).
- `src/main/export-service.ts`: `export:start`, `export:choose-destination`,
  `export:writeFrame`, `export:finalize`, `export:abort`.

El menú nativo empuja `menu:action` al renderer y el estado del menú se sincroniza con
`menu:set-state`.
