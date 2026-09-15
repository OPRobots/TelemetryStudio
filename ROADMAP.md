# ROADMAP — OPRobots Telemetry Studio

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
- [ ] `tailwind.config.ts` con paleta OPRobots (usado CSS variables en globals.css)
- [x] Ventana Electron mínima mostrando "OPRobots Telemetry Studio"
- [ ] HMR funcionando en renderer (pendiente de probar con `npm run dev`)
- [ ] Hot reload en main process (pendiente de probar con `npm run dev`)
- [x] `serialport` en `dependencies` (NO en devDependencies)
- [x] `postinstall` ejecutando `electron-builder install-app-deps`
- [x] Estructura de carpetas creada según `docs/03-FOLDER-STRUCTURE.md`
- [x] `.gitignore` configurado
- [ ] ESLint + Prettier configurados (pendiente configuración)
- [x] Vitest configurado con 1 test mínimo pasando

### Validación
```bash
npm run dev                    # App abre, HMR funciona (pendiente de probar)
npm run build                  # Build exitoso sin errores (pendiente de probar)
npm run typecheck              # ✅ Sin errores de TypeScript
npm run test                   # ✅ 2 tests pasan
```

### Notas
- Tailwind CSS 4 configurado via `@tailwindcss/vite` plugin (no necesita tailwind.config.ts)
- Paleta de colores implementada via CSS variables en `globals.css`
- API de preload expuesta para serial, video, sesiones y exportación

---

## FASE 1: Core Data Engine (2 semanas) ✅ COMPLETADA — Commit `c1de566`

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

## FASE 2: Serial UART + JSON Session Parser (2 semanas) ✅ COMPLETADA — Commit `f5c1510`

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
  - [x] Controles duplicables para comparación (PaneControls)
- [x] `src/renderer/components/video/TimelineSlider.tsx`
  - [ ] Slider de seek con preview (seek funcional sin preview)
  - Display de timestamp actual / total
  - [x] Modo compartido/independiente para comparación
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

## FASE 4: Session Manager (1 semana) 🟡 PARCIAL (export/import de sesión JSON + vídeo)

### Objetivo
Exportar e importar sesiones completas (JSON + vídeo copiado).

### Entregables
- [ ] `src/services/session-manager.ts` — SessionManager
  - `exportSession()` — crear carpeta con `session.json` + copia del `.mp4`
  - `importSession()` — cargar sesión completa (vídeo + datos + sync + layout)
  - `listSessions()` — listar sesiones en un directorio
- [ ] `src/main/ipc-handlers.ts` — Handlers de sesión
  - `session:export` — crear carpeta + JSON + copiar vídeo
  - `session:read` — leer JSON de sesión
  - `session:getVideoPath` — resolver ruta del vídeo
  - `session:list` — listar sesiones en directorio
- [ ] Integración con LayoutManager (restaurar layout al importar)
- [ ] Test: export → import → verificar que datos, sync y layout se restauran

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
  - LTTB downsampling por viewport
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
  - [ ] Scroll/zoom manual (auto-centrado en el robot)
- [x] `src/widgets/state-timeline/` — Widget de estados
  - Barra de tiempo con colores por estado
  - Estado actual grande
  - Línea de posición actual
  - Labels de transiciones

### Semana 3: Comparación Side-by-Side
- [x] `src/core/comparison-manager.ts` — ComparisonManager
  - `startComparison()` — activa modo comparación con validación de widgets
  - `stopComparison()` — desactiva y limpia
  - `setSyncBarMode()` — toggle barra compartida/independiente
  - `validateWidgetCompatibility()` — valida widgets idénticos entre sesiones
- [x] `src/renderer/src/components/layout/SplitView.tsx`
  - Alterna entre vista single y split
  - En split: apila los paneles verticalmente
  - Cada mitad tiene su propio VideoPlayer + WidgetHost
- [x] Integración con VideoSynchronizer #2
  - Segundo synchronizer (`comparison:frame`, dataset de comparación)
  - Barra vertical compartida o independiente (toggle)
- [x] Validación de widgets:
  - Si sesiones tienen widgets diferentes → error con lista de diferencias
  - Comparar: tipo, campos, posición, tamaño, configuración
- [x] Tests de comparación:
  - Widgets idénticos → comparación activada
  - Widgets diferentes → error con diferencias listadas
  - Estado aislado entre synchronizers

### Validación
```bash
# 4 widgets renderizan correctamente
# Widgets se redibujan con cada frame de vídeo
# Comparación side-by-side funciona con 2 sesiones
# Widgets idénticos → activa comparación
# Widgets diferentes → muestra error
# Barra compartida/independiente funciona
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
  - [ ] Botón "nuevo" dedicado (se puede crear guardando con un nombre nuevo)
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
  - Se eligió FFmpeg directo en lugar de WebCodecs/Mediabunny (más robusto, validado en PoC 3)
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

## FASE 8: Packaging + CI/CD (1 semana) 🟡 PARCIAL (Linux OK; Windows/macOS manual; CI preparado sin repo)

### Objetivo
Empaquetado multiplataforma funcional con pipeline de CI/CD.

### Entregables
- [x] `electron-builder.yml` completo (extraResources de FFmpeg y udev)
- [x] Build Linux: `AppImage` + `.deb` (PoC 4) y `--dir` verificado en la app de producción
- [ ] Windows: `.exe` (NSIS) + portable — requiere build manual en Windows
- [ ] macOS: `.dmg` (universal) — build manual (PoC 4 validó DMG)
- [x] `resources/udev/69-oprobots-serial.rules` para Linux
- [x] `build/entitlements.mac.plist` para macOS
- [x] `build/icon.png` (placeholder) y `scripts/fetch-ffmpeg.mjs` (sidecar FFmpeg)
- [x] GitHub Actions CI/CD (`.github/workflows/build.yml`) preparado — inactivo hasta tener repo remoto
- [ ] PoC 4 validado: serial en las 3 plataformas empaquetadas (Linux OK; Windows pendiente)
- [x] Tamaño de paquete < 200 MB (AppImage ~109 MB, deb ~75 MB)

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
- [x] Tests e2e (harness Electron propio en `scripts/`):
  - App abre correctamente (`smoke`)
  - Serial → widgets (`e2e:serial`)
  - Vídeo + sync (`e2e:video`)
  - Comparación (`e2e:comparison`)
  - Exportación (`e2e:export`)
  - Nota: se descartó Playwright por el harness Electron propio (más estable y sin dependencias)
- [x] Documentación de usuario (`README.md`; capturas pendientes)
- [x] Manejo de errores robusto (banner global de errores; sin crashes)
- [x] Keyboard shortcuts (Espacio, ←/→, +/−, Home/End)
- [x] ESLint + Prettier configurados e integrados en `verify`
- [ ] Performance profiling final (pendiente; WidgetHost re-renderiza por frame con pocos widgets)
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

Ver `docs/13-POC-TESTS.md` para los 4 PoCs detallados con criterios de éxito.

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
| `serialport` falla en packaging | Alta | Crítico | PoC 4 primero; fallback a Web Serial API |
| WebCodecs no soportado en Electron | Media | Bajo | Resuelto: fallback a raw RGBA + FFmpeg libx264 (PoC 3) |
| LTTB bloquea UI con >1M puntos | Media | Medio | Ejecutar en Worker Thread |
| macOS notarization rechazada | Baja | Alto | Seguir guía Apple exactamente |
| encodeQueueSize overflow | Media | Medio | Check `> 2` antes de encode (P1) |
| 2 synchronizers causan lag | Media | Medio | Throttle RVFC callback; test con 2 vídeos 1080p30 |
| Widgets diferentes en comparación | Baja | Bajo | Validación estricta + error clarativo |
