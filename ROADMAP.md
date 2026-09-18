# ROADMAP — Telemetry Studio

## Visión General

El desarrollo se divide en 10 fases, con PoCs obligatorios antes de la Fase 1. Cada fase tiene entregables concretos y criterios de aceptación.

```
Fase 0: Setup + Config                ← 1 semana
Fase 1: Core Data Engine              ← 2 semanas
Fase 2: Serial UART + JSON Sessions   ← 2 semanas
Fase 3: Video Sync (dual)             ← 2 semanas
Fase 4: Session Manager               ← 1 semana
Fase 5: Widgets                       ← 3 semanas (incluye comparación)
Fase 6: Layout Manager                ← 1 semana
Fase 7: Exportación para Redes        ← 2 semanas
Fase 8: Packaging + CI/CD             ← 1 semana
Fase 9: Polish + Testing              ← 1 semana
                                    ─────────────
                                    Total: ~13 semanas (sin contar PoCs)
```

---

## FASE 0: Setup del Proyecto (1 semana) ✅ COMPLETADA

### Objetivo
Scaffold completo del proyecto con todas las configs, dependencias y herramientas de build funcionando.

### Entregables
- [x] `npm init` + `package.json` con todas las dependencias
- [x] `electron.vite.config.ts` configurado (main, preload, renderer)
- [x] `tsconfig.json` + `tsconfig.node.json` optimizados
- [x] `electron-builder.yml` con configs para las 3 plataformas
- [x] `tailwind.config.ts` con paleta OPRobots (Tailwind 4: paleta vía CSS variables en globals.css)
- [x] Ventana Electron mínima mostrando "Telemetry Studio"
- [x] HMR funcionando en renderer (dev server verificado con `npm run dev`)
- [x] Hot reload en main process (electron-vite reconstruye main/preload al vuelo)
- [x] `serialport` en `dependencies` (NO en devDependencies)
- [x] `postinstall` ejecutando `electron-builder install-app-deps`
- [x] Estructura de carpetas creada según `docs/03-FOLDER-STRUCTURE.md`
- [x] `.gitignore` configurado
- [x] ESLint + Prettier configurados (integrados en `npm run verify`)
- [x] Vitest configurado con 1 test mínimo pasando

### Validación
```bash
npm run dev                    # App abre, dev server + Electron (verificado)
npm run build                  # Build exitoso sin errores (verificado)
npm run typecheck              # ✅ Sin errores de TypeScript
npm run test                   # ✅ Tests pasan
```

### Notas
- Tailwind CSS 4 configurado via `@tailwindcss/vite` plugin (no necesita tailwind.config.ts)
- Paleta de colores implementada via CSS variables en `globals.css`
- API de preload expuesta para serial, video, sesiones y exportación

---

## FASE 1: Core Data Engine (2 semanas) ✅ COMPLETADA — Commit `4207d3a`

### Objetivo
Implementar el motor de datos central: EventBus, TelemetryStore, búsqueda binaria y modelo de tipos.

### Entregables
- [x] `src/core/types/` — Todos los tipos TypeScript definidos
  - `telemetry.ts` (TelemetryFrame, TelemetryDataset, FieldSchema)
  - `video.ts` (VideoFrameContext, PlaybackState, ExportConfig)
  - `layout.ts` (DashboardLayout, WidgetConfig)
  - `events.ts` (EventMap completo)
  - `session.ts` (SessionFile, SessionVideo, SessionSync, etc.)
- [x] `src/core/event-bus.ts` — EventBus genérico typed
  - `on()`, `emit()`, `once()`, `off()`, `clear()`
  - Type-safe con keyof EventMap
- [x] `src/core/telemetry-store.ts` — Almacén de frames
  - `loadDataset()`, `addFrame()`, `findClosestFrame()`
  - Búsqueda binaria O(log N)
  - `findFramesInRange()` para ventanas de datos
- [x] `src/core/binary-search.ts` — Búsqueda binaria
  - `binarySearch()` y `binarySearchIndex()`
- [x] `src/core/lttb.ts` — Downsampling LTTB
  - Implementación inline sin dependencias externas
  - Helper `framesToLTTBPoints()`
- [x] Tests unitarios para:
  - EventBus (emisión, suscripción, cleanup)
  - TelemetryStore (carga, búsqueda, orden)
  - Búsqueda binaria (edge cases)
  - LTTB (preservar first/last, edge cases)

### Validación
```bash
npm run test                   # Todos los tests de core pasan
```

---

## FASE 2: Serial UART + JSON Session Parser (2 semanas) ✅ COMPLETADA — Commit `da40292`

### Objetivo
Implementar los dos modos de entrada: Serial UART (streaming) y carga de sesiones JSON (offline).

### Entregables
- [x] `src/parsers/interfaces.ts` — ITelemetryParser + ParserMetadata
- [x] `src/parsers/parser-registry.ts` — ParserRegistry singleton
- [x] `src/parsers/serial-uart-parser.ts` — SerialUARTParser
  - Streaming mode (parseLine())
  - Soporte para baud rates: 115200, 230400, 460800, 921600
  - Formatos: CSV posicional (firmware STM32), legacy `T:/S:/M:/G:` y genérico `campo:valor` con tipos inferidos
  - `setCsvFields()` para nombres de columna configurables
- [x] `src/main/serial-service.ts` — Servicio en Main Process
  - `serial:open`, `serial:close`, `serial:list`
  - IPC bridge en preload (`serialOnData`, `serialOnStatus`)
- [x] `src/parsers/json-session-parser.ts` — JSONSessionParser
  - Parsing de `session.json` (formato compacto: `schema` + `frames` posicionales)
  - Conversión de `sessionToDataset()`
- [x] `src/core/session-codec.ts` — Codec de sesiones
  - `encodeSession()`, `decodeSession()`
  - `sessionToDataset()`, `datasetToSession()`
- [x] Tests para SerialUARTParser con fixtures
- [x] Tests para JSONSessionParser con fixture `session.json`
- [x] Tests para session-codec (round-trip encode/decode)

### Validación
```bash
# Cargar un session.json → TelemetryDataset con frames correctos
# Conectar serial → frames en tiempo real
# Al terminar stream → nombres de campos disponibles para configurar widgets
npm run test
```

---

## FASE 3: Video Sync — Dual Synchronizer (2 semanas) ✅ COMPLETADA

### Objetivo
Implementar la sincronización frame-a-frame entre vídeo MP4 y telemetría, con soporte para 2 synchronizers simultáneos (comparación side-by-side).

### Entregables
- [x] `src/core/video-synchronizer.ts` — VideoSynchronizer
  - `requestVideoFrameCallback` loop
  - Búsqueda binaria mediaTime → TelemetryFrame
  - Soporte para drift offset manual (+/- ms)
  - Anchor point system
  - `stepForward()`, `stepBackward()` (1 frame exacto)
  - `setPlaybackRate()` (0.1x a 2x)
  - Polyfill para browsers sin RVFC
  - [x] Soporte para 2 instancias simultáneas (comparación)
- [x] `src/renderer/components/video/VideoPlayer.tsx`
  - Contenedor del elemento `<video>`
  - [x] Carga de archivos locales via drag-and-drop (o diálogo nativo)
  - [x] Soporte para VideoPlayer #2 (comparación)
- [x] `src/renderer/components/video/PlaybackControls.tsx`
  - Play/Pause, Skip Forward/Back
  - Speed selector (0.25x, 0.5x, 1x, 2x)
  - [x] Controles duplicables para comparación (sustituido por la barra de reproducción compartida)
- [x] `src/renderer/components/video/TimelineSlider.tsx`
  - [x] Slider de seek con tooltip de tiempo (preview con miniatura descartado)
  - Display de timestamp actual / total
  - [x] Reproducción siempre simétrica, scroll de widgets y zoom/cursor compartidos en comparación
- [x] Tests de sincronización:
  - Drift medido en e2e (`e2e:video`)
  - Búsqueda binaria correcta
  - Step forward/backward preciso
  - [x] 2 synchronizers independientes

### Validación
```bash
# Cargar MP4 + session.json → sincronización correcta
# Drift < 33ms durante 60s de reproducción
# Step frame funciona sin saltos
# 2 synchronizers funcionan independientemente
npm run test
```

---

## FASE 4: Session Manager (1 semana) ✅ COMPLETADA

### Objetivo
Exportar e importar sesiones completas (JSON + vídeo copiado).

### Entregables
- [x] `src/services/session-manager.ts` — SessionManager (adaptador IPC desacoplado)
  - `saveSession()` — crear carpeta con `session.json` + copia del `.mp4`
  - `readSession()` / `resolveVideoPath()` — cargar sesión (vídeo + datos + sync + layout)
  - `listSessions()` — listar sesiones en un directorio
- [x] `src/main/ipc-handlers.ts` — Handlers de sesión
  - `session:export` — crear carpeta + JSON + copiar vídeo
  - `session:read` — leer JSON de sesión
  - `session:getVideoPath` — resolver ruta del vídeo
  - `session:list` — listar sesiones en directorio
- [x] Integración con LayoutManager (restaurar layout al importar)
- [x] UI: `SessionBrowserDialog` (explorar y abrir sesiones) + `SaveSessionDialog`
- [x] Test: export → import → verificar que datos y sync se restauran (unit + integración)

### Validación
```bash
# Exportar sesión → crear carpeta con JSON + MP4
# Importar sesión → todo restaurado correctamente
npm run test
```

---

## FASE 5: Widgets + Comparación Side-by-Side (3 semanas) ✅ COMPLETADA

### Objetivo
Implementar los 4 widgets estándar con registro dinámico, más el sistema de comparación side-by-side.

### Semana 1: TimeSeriesChart + DigitalBitmask
- [x] `src/widgets/interfaces.ts` — WidgetDefinition + WidgetMetadata + WidgetProps
- [x] `src/widgets/widget-registry.ts` — WidgetRegistry singleton (agnóstico, `register-widgets.ts` registra los estándar)
- [x] `src/widgets/time-series-chart/` — Widget de gráficas
  - Integración con uPlot
  - [x] LTTB downsampling por viewport (ventana visible al hacer zoom)
  - Múltiples series con colores
  - [x] Zoom/pan con uPlot cursor (desactivar "autoFollow" en la config del widget)
- [x] `src/widgets/digital-bitmask/` — Widget de LEDs IR
  - Canvas 2D renderer
  - Soporte para 8, 16, 32 bits
  - Glow effect en LEDs activos
  - Hex display del bitmask

### Semana 2: Minimap2D + StateTimeline
- [x] `src/widgets/minimap-2d/` — Widget de minimapa
  - Canvas 2D con trayectoria X,Y
  - Triángulo rotado para heading
  - Grid de fondo
  - [x] Encuadre del recorrido completo (escala adaptativa) y zoom al rango seleccionado, atenuando lo que queda fuera
  - [x] Pan/zoom manual del minimapa (rueda/arrastre/doble clic)
- [x] `src/widgets/state-timeline/` — Widget de estados
  - Barra de tiempo con colores por estado
  - Estado actual grande
  - Línea de posición actual
  - Labels de transiciones

### Semana 3: Comparación en paralelo
- [x] `src/core/comparison-manager.ts` — ComparisonManager
  - `startComparison()` — activa modo comparación con validación de widgets
  - `stopComparison()` — desactiva y limpia
  - `validateWidgetCompatibility()` — valida widgets idénticos entre sesiones
- [x] `src/renderer/src/components/layout/SplitView.tsx`
  - A (actual) a la izquierda y B (comparada) a la derecha, con divisor vertical
  - Cada panel tiene su propio VideoPlayer + WidgetHost
  - Reproducción siempre simétrica (una barra compartida guiada por el panel con vídeo)
  - Scroll de widgets sincronizado; cursor y zoom (rango) compartidos
  - Soporte sin vídeo (placeholder alineado) y cierre de vídeo por panel
- [x] Integración con VideoSynchronizer #2 (`comparison:frame`, dataset de comparación)
- [x] Validación de widgets: tipo, campos, tamaño y configuración (si difieren → error con diferencias)
- [x] Tests de comparación + e2e (`e2e:comparison`, `e2e:comparison-reset`)

### Validación
```bash
# 4 widgets renderizan correctamente
# Widgets se redibujan con cada frame de vídeo
# Comparación en paralelo funciona con 2 sesiones
# Widgets idénticos → activa comparación
# Widgets diferentes → muestra error
# Reproducción, scroll, cursor y zoom sincronizados
npm run test
```

---

## FASE 6: Layout Manager (1 semana) ✅ COMPLETADA

### Objetivo
Persistencia de layouts en JSON con layouts predefinidos.

### Entregables
- [x] `src/services/layout-manager.ts` — LayoutManager
  - `getAllLayouts()`, `loadLayout()`, `saveLayout()`
  - `createNew()`, `addWidget()`, `removeWidget()`, `updateWidget()`
  - 2 layouts built-in: Siguelíneas, Micromouse
- [x] `src/main/ipc-handlers.ts` — Handlers de persistencia
  - `layout:save`, `layout:loadAll`, `layout:delete`
  - Almacenamiento en `app.getPath('userData')/layouts/`
- [x] `src/renderer/components/dialogs/LayoutDialog.tsx`
  - Lista de layouts disponibles
  - Botones: cargar, guardar, eliminar
  - [x] "Nuevo layout" (menú Ver → Nuevo layout…, con confirmación)
- [x] `src/renderer/stores/layout-store.ts` — Zustand store
- [x] Test: guardar → cargar → verificar igualdad

### Validación
```bash
# Crear layout → guardar → recargar app → layout persiste
# Cargar layout built-in → widgets aparecen
npm run test
```

---

## FASE 7: Exportación para Redes Sociales (2 semanas) ✅ COMPLETADA

### Objetivo
Pipeline de exportación de vídeo con gráficos superpuestos para crear contenido para redes sociales (Instagram, TikTok, YouTube Shorts).

### Semana 1: Core Export
- [x] `src/services/video-exporter.ts` — Orquestador (renderer)
  - Composición en canvas (vídeo base + widgets + overlay)
  - Progress reporting
  - Soporte para `sessionLabel` en overlays
- [x] `src/main/export-service.ts` — Servicio en Main Process
  - `export:start`, `export:writeFrame`, `export:finalize`, `export:save`, `export:abort`
  - Backpressure con callback de escritura de stdin
- [x] `src/shared/export-args.ts` — Construcción de argumentos FFmpeg (pura)
- [x] Preload bridge para exportación

### Semana 2: UI + FFmpeg
- [x] `src/renderer/src/components/dialogs/ExportDialog.tsx`
  - Configuración: resolución, fps, rango de frames
  - Selección de widgets a incluir
  - Campo para nombre de sesión (overlay)
  - Barra de progreso
- [x] Exportación con **FFmpeg** empaquetado como sidecar (raw RGBA por stdin)
  - FFmpeg directo: robusto y portable, validado en el PoC 3
- [x] Test unitario de argumentos + test de integración con FFmpeg real (MP4 + ffprobe)
- [x] E2E de exportación (composición del renderer + envío de frames)

### Validación
```bash
# Exportar 10s de vídeo con 2 widgets → MP4 reproducible
# Progreso se reporta correctamente
# La exportación no congela la UI
npm run test
```

---

## FASE 8: Packaging + CI/CD (1 semana) ✅ COMPLETADA (Linux local + Windows/macOS generados en CI)

### Objetivo
Empaquetado multiplataforma funcional con pipeline de CI/CD.

### Entregables
- [x] `electron-builder.yml` completo (extraResources de FFmpeg y udev)
- [x] Build Linux: `AppImage` + `.deb` (PoC 4) y `--dir` verificado en la app de producción
- [x] Windows: `.exe` (NSIS) + portable — generados en CI (release draft `v1.0.0`; sin firmar)
- [x] macOS: `.dmg` (x64 y arm64) — generados en CI (release draft `v1.0.0`; sin notarizar)
- [x] `resources/udev/69-oprobots-serial.rules` para Linux
- [x] `build/entitlements.mac.plist` para macOS
- [x] Iconos reales (`build/icon.svg` → `icon.png`/`icon.ico`/`icon.icns`) y `scripts/fetch-ffmpeg.mjs` (sidecar FFmpeg multiplataforma)
- [x] GitHub Actions: `ci.yml` (lint+typecheck+tests+build+e2e en Linux) y `release.yml` (draft release por tag `v*`)
- [ ] PoC 4 validado: serial en las 3 plataformas empaquetadas (Linux OK; Windows/macOS pendientes de hardware)
- [x] Artefactos con sidecar FFmpeg incluido (AppImage ~169 MB, deb ~117 MB;
  Windows exe ~221 MB; dmg ~154–159 MB). Windows supera 200 MB por los binarios
  estáticos de FFmpeg (~160 MB en total).

### Validación
```bash
# Build completo en CI para las 3 plataformas
# App empaquetada detecta puertos serie en cada plataforma
# Portable build funciona sin instalación
```

---

## FASE 9: Polish + Testing Final (1 semana) ✅ COMPLETADA

### Objetivo
Pulido final, testing integral, documentación de usuario.

### Entregables
- [x] Tests e2e (harness Electron propio en `scripts/`, 11 pruebas):
  - App abre correctamente (`smoke`)
  - Serial → widgets (`e2e:serial`)
  - Vídeo + sync (`e2e:video`)
  - Comparación en paralelo (`e2e:comparison`)
  - Exportación (`e2e:export`)
  - Preparación/transcode de vídeo (`e2e:prepare`)
  - Guardado de sesión (`e2e:save`)
  - Rejilla de widgets (`e2e:widgets`)
  - Render de los 4 widgets (`e2e:widget-kinds`)
  - Zoom compartido (`e2e:zoom`)
  - Reinicio de captura serial (`e2e:serial-reset`) y reset aislado en comparación (`e2e:comparison-reset`)
  - Nota: se descartó Playwright por el harness Electron propio (más estable y sin dependencias)
- [x] Documentación de usuario (`README.md`; capturas en `docs/assets`)
- [x] Manejo de errores robusto (banner global de errores; sin crashes)
- [x] Keyboard shortcuts (Espacio, ←/→, +/−, Home/End)
- [x] ESLint + Prettier configurados e integrados en `verify`
- [x] Rendimiento de widgets (P10.3: FrameBus + capa estática cacheada)
- [x] Fix de bugs restantes
- [x] Release v1.0.0

### Validación
```bash
npm run verify                 # lint + typecheck + tests + build + smoke + e2e
# App empaquetada probada manualmente en las 3 plataformas
```

---

## Dependencias entre Fases

```
Fase 0 (Setup) ✅
    ↓
Fase 1 (Core) ← No depende de nada más
    ↓
Fase 2 (Parsers) ← Depende de Fase 1 (tipos, EventBus, session-codec)
    ↓
Fase 3 (Video Sync Dual) ← Depende de Fase 1 (TelemetryStore)
    ↓
Fase 4 (Session Manager) ← Depende de Fase 2 (session-codec) + Fase 3 (sync config)
    ↓
Fase 5 (Widgets + Comparación) ← Depende de Fase 1 + Fase 3 (2 synchronizers)
    ↓
Fase 6 (Layout) ← Depende de Fase 5 (WidgetRegistry)
    ↓
Fase 7 (Export para Redes) ← Depende de Fase 3 + Fase 5
    ↓
Fase 8 (Packaging) ← Depende de todo funcional
    ↓
Fase 9 (Polish) ← Depende de todo empaquetado
```

---

## PoCs Obligatorios (antes de Fase 0)

Los PoCs se encuentran en `pocs/` como referencia de funcionamiento.

| PoC | Directorio | Estado |
|---|---|---|
| PoC 1: Serial → Widget | `pocs/01-serial-widget/` | ✅ Validado |
| PoC 2: Video Sync | `pocs/02-video-sync/` | ✅ Funcional |
| PoC 3: Video Export | `pocs/03-video-export/` | ✅ Funcional |
| PoC 4: Packaging | `pocs/04-packaging/` | ✅ Build Linux OK |
| PoC 5: Emisor de telemetría (STM32) | `pocs/05-telemetry-sender/` | ✅ Firmware de prueba |

Ver `docs/13-POC-TESTS.md` para los PoCs detallados con criterios de éxito.

---

## Hitos Clave

| Hito | Fecha Objetivo | Dependencias |
|---|---|---|
| **M1**: PoCs completados | Semana 2 | Hardware STM32 disponible |
| **M2**: App funcional (carga datos + widgets) | Semana 5 | Fases 0-2 completadas |
| **M3**: Sync vídeo-datos demo (dual) | Semana 7 | Fase 3 completada |
| **M4**: Comparación side-by-side funcional | Semana 10 | Fase 5 completada |
| **M5**: Sesiones + Layouts + Export funcionales | Semana 12 | Fases 4, 6, 7 completadas |
| **M6**: Release v1.0.0 | Semana 13 | Todas las fases |

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| `serialport` falla en packaging | Alta | Crítico | PoC 4 primero |
| LTTB bloquea UI en vista completa con >1M puntos | Media | Medio | Muestreo por ventana al hacer zoom (hecho); Worker opcional |
| macOS notarization rechazada | Baja | Alto | Seguir la guía de Apple exactamente |
| 2 synchronizers causan lag | Media | Medio | RVFC por synchronizer; probado con 2 vídeos |
| Widgets diferentes en comparación | Baja | Bajo | Validación estricta + error clarativo |

---

## Fase 10 — Pendientes (post v1.0.0)

> Trabajo restante tras la v1.0.0, en orden de ejecución. Documentado aquí para no
> perder el plan si se compacta el contexto.

### P10.1 — Limpieza y deuda técnica ✅

- `src/renderer/src/components/widgets/WidgetConfigDialog.tsx`: quitar la sección del
  Minimap2D ("Escala"/"Estela", claves deprecadas sin efecto) y corregir el default de
  "Filas" del DigitalBitmask a `?? 1`.
- `src/widgets/minimap-2d/index.tsx`: eliminar `scale` y `trailSeconds` de `MinimapConfig`
  y de los defaults.
- `src/widgets/time-series-chart/index.tsx`: eliminar `windowSeconds` de `TimeSeriesConfig`
  y de los defaults.
- Eliminar código muerto: `src/renderer/src/components/video/PaneControls.tsx` y
  `ComparisonConfig` (`src/core/types/comparison.ts`).
- `docs/00-PROJECT-OVERVIEW.md`: corregir el baud (es **lista fija** `BAUD_RATES`, no libre).
- **Aceptación**: `npm run verify` verde; sin imports rotos.

### P10.2 — "Nuevo" en LayoutDialog + capturas del README ✅

- `LayoutDialog.tsx`: botón **"Nuevo"** que parte de un layout vacío
  (`createEmptyLayout`/`clearWidgets`) y permite nombrar y guardar, sin alterar el layout
  activo hasta confirmar.
- README: capturas (análisis, comparación, export, modo sin vídeo) en `docs/assets/`,
  generadas/extendiendo `scripts/screenshot.mjs`.
- **Aceptación**: crear layout nuevo sin efectos colaterales; README con ≥3 capturas.

### P10.3 — Performance: redibujo imperativo de widgets (F-05) ✅

Objetivo: reducir el trabajo por frame sin perder fluidez. **Implementado y medido.**

- `src/widgets/frame-bus.ts`: `FrameBus` por `WidgetHost` (por contexto; evita cross-talk
  entre paneles de comparación). El host deja de guardar `frame`/`context` en estado React.
- `src/widgets/use-widget-draw.ts`: agenda `draw()` coalescido por `requestAnimationFrame`.
- Widgets canvas (`DigitalBitmask`, `Minimap2D`, `StateTimeline`, `TimeSeriesChart`) dibujan
  imperativamente. `WidgetProps` pasa `getFrames()` y `hoverTimestamp_ms`; el timestamp
  efectivo se resuelve con `resolveViewTimestamp`.
- **Capa estática cacheada** en canvas offscreen (fondo+segmentos+etiquetas en la timeline;
  bbox+rejilla+trayectoria en el minimapa); por frame solo se repinta la parte dinámica.
- `scripts/e2e-perf.mjs` (`npm run e2e:perf`, **standalone**): modo `stream` (20 widgets) y
  `video` (50k frames).

Resultados (1440×900, display 144 Hz):

| Escenario | Baseline | Solo bus (B) | B + cache (C) |
|---|---|---|---|
| Stream 100 Hz, 20 widgets | 4.5 % CPU · 144 fps | 4.5 % · 144 fps | 4.6 % · 144 fps |
| Stream 400 Hz, 20 widgets | 6.4 % · **9 fps** (p95 118 ms) | 6.9 % · **96 fps** (p95 14 ms) | 7.0 % · 94 fps |
| Vídeo, 50k frames, 5 widgets | 1.9 % CPU · 144 fps | 1.85 % · 144 fps | **0.7 % (−58 %)** · 144 fps |

Conclusión: el bus elimina el re-render por frame (fluidez a alta frecuencia); el cacheo
elimina el redibujado O(n) por frame (menos CPU con datasets grandes). Se adopta.

### P10.4 — Preview del TimelineSlider (tooltip) + pan/zoom del Minimap2D ✅

- **TimelineSlider**: tooltip con el **tiempo absoluto** (`mm:ss.mmm`) bajo el cursor y al
  arrastrar; formateo compartido en `lib/time-format.ts`.
- **Minimap2D**: **pan** (arrastrar) y **zoom** (rueda hacia el cursor, 0.5x–20x) con vista
  local no persistida; doble clic resetea solo la vista local. El `zoomRange` compartido se
  mantiene (resaltado y atenuación de lo de fuera).
- **Aceptación**: `e2e:video` valida el tooltip; `e2e:zoom` valida rueda/pan/reset. Verdes.

### P10.5 — Packaging multiplataforma + PoC 4 ✅ (PoC 4 hardware pendiente)

- **Windows**: `.exe` (NSIS) + portable generados en CI (release draft `v1.0.0`, sin firmar).
- **macOS**: `.dmg` x64 + arm64 generados en CI (sin notarizar; `notarize: false`).
- **PoC 4**: serial en las 3 plataformas empaquetadas — Linux OK; Windows/macOS pendientes de hardware.
- **CI**: `ci.yml` (lint+typecheck+tests+build; smoke+e2e en Ubuntu) y `release.yml`
  (tag `v*` → matriz 3 SOs → `electron-builder --publish always` → draft release).
- **Aceptación**: instaladores generados ✅ (draft `v1.0.0`); verificación de serial en
  Windows/macOS pendiente.

### P10.6 — Muestreo por ventana del TimeSeriesChart ✅

- `buildSampledData` (extraído a `src/widgets/time-series-chart/sample-data.ts`) acepta el
  rango de zoom y muestrea solo la **ventana visible** (+1 frame de margen por lado):
  ≤`maxPoints` (2000) frames → se muestran todos; >2000 → LTTB dentro de la ventana.
- `frameRangeBounds` (`src/core/binary-search.ts`) localiza la ventana en O(log n).
- Caché por ventana (índices `lo:hi` + último timestamp): en streaming solo recalcula si
  cambia el contenido visible.
- Tests: `tests/unit/widgets/sample-data.test.ts`. Documentado en `docs/08`.
- **Mejora futura (no planificada)**: LTTB en Web Worker para la **vista completa** con
  >1M puntos; no se espera necesaria con los tamaños previstos. Detalles y casos concretos
  en `docs/12-LIMITATIONS.md` #6.
