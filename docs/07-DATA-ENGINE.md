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

## Cursor y zoom compartidos

`src/renderer/src/stores/cursor-store.ts` (`useCursorStore`):

- `hoverTimestamp_ms` — timestamp bajo el cursor (lo publican TimeSeriesChart y StateTimeline).
- `zoomRange: { startMs, endMs } | null` — rango de zoom global entre timelines.

`WidgetHost` entrega a cada widget el `hoverTimestamp_ms` y el frame actual vía
`FrameBus` (por panel); cada widget resuelve el timestamp efectivo (`hover → vídeo →
frame → último frame`) con `resolveViewTimestamp`. También reparte
`zoomRange`/`onCursorHover`. Ver `docs/08-WIDGET-SYSTEM.md`.

## ComparisonManager

`src/core/comparison-manager.ts` (`comparisonManager` singleton).

```typescript
startComparison(reference: SessionFile, currentWidgets: SessionWidget[]): WidgetCompatibilityResult
stopComparison();          // clearComparison() + evento comparison:stop
validateWidgetCompatibility(a, b);
isActive; currentReference;
```

`WidgetCompatibilityResult = { compatible, differences, sessionAWidgets, sessionBWidgets }`.
La validación compara **tipo, campos, tamaño y configuración** (el orden de la lista es libre).
Si los widgets difieren, emite `comparison:widget-mismatch` con las diferencias.

## Búsqueda binaria

`src/core/binary-search.ts`:

- `binarySearch(frames, target_ms)` → frame más cercano.
- `binarySearchIndex(frames, target_ms)` → índice del frame más cercano.
- `findFramesInRange(frames, start_ms, end_ms)` → subarray en el rango.

## Downsampling LTTB

`src/core/lttb.ts`:

- `downsampleLTTB(points, targetPoints)` — Largest-Triangle-Three-Buckets; preserva
  el primer y último punto.
- `framesToLTTBPoints(frames, field)` — convierte frames a puntos `{x, y}`.

El `TimeSeriesChart` usa `downsampleLTTB` con `{ x: i, y: valor }` para elegir un
**único conjunto de índices** y alinear X y todas las Y por índice.

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

`src/main/ipc-handlers.ts` expone (vía `preload/index.ts`):

- Diálogos: `dialog:openVideo`, `dialog:openSession`, `dialog:openDirectory`.
- Serial: `serial:open`, `serial:close`, `serial:list` (+ `serial:data`/`serial:status` push).
- Sesiones: `session:export`, `session:read`, `session:getVideoPath`, `session:list`, `file:read`.
- Layouts: `layout:save`, `layout:loadAll`, `layout:delete`.
- Vídeo: `video:prepare`, `video:cancel-prepare` (+ `video:prepare-status` push).
- Exportación: `export:start`, `export:writeFrame`, `export:finalize`, `export:abort`, `export:save`.

El menú nativo empuja `menu:action` al renderer.
