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
- [ ] `src/core/types/` — Todos los tipos TypeScript definidos
  - `telemetry.ts` (TelemetryFrame, TelemetryDataset, FieldSchema)
  - `video.ts` (VideoFrameContext, PlaybackState, ExportConfig)
  - `layout.ts` (DashboardLayout, WidgetConfig)
  - `events.ts` (EventMap completo)
  - `session.ts` (SessionFile, SessionVideo, SessionSync, etc.)
- [ ] `src/core/event-bus.ts` — EventBus genérico typed
  - `on()`, `emit()`, `once()`, `off()`, `clear()`
  - Type-safe con keyof EventMap
- [ ] `src/core/telemetry-store.ts` — Almacén de frames
  - `loadDataset()`, `addFrame()`, `findClosestFrame()`
  - Búsqueda binaria O(log N)
  - `findFramesInRange()` para ventanas de datos
- [ ] `src/core/binary-search.ts` — Búsqueda binaria
  - `binarySearch()` y `binarySearchIndex()`
- [ ] `src/core/lttb.ts` — Downsampling LTTB
  - Implementación inline sin dependencias externas
  - Helper `framesToLTTBPoints()`
- [ ] Tests unitarios para:
  - EventBus (emisión, suscripción, cleanup)
  - TelemetryStore (carga, búsqueda, orden)
  - Búsqueda binaria (edge cases)
  - LTTB (preservar first/last, edge cases)

### Validación
```bash
npm run test                   # Todos los tests de core pasan
```

---

## FASE 2: Serial UART + JSON Session Parser (2 semanas) ✅ COMPLETADA

### Objetivo
Implementar los dos modos de entrada: Serial UART (streaming) y carga de sesiones JSON (offline).

### Entregables
- [ ] `src/parsers/interfaces.ts` — ITelemetryParser + ParserMetadata
- [ ] `src/parsers/parser-registry.ts` — ParserRegistry singleton
- [ ] `src/parsers/serial-uart-parser.ts` — SerialUARTParser
  - Streaming mode (parseLine())
  - Soporte para baud rates: 115200, 230400, 460800, 921600
  - Formato: `T:<ms>,S:<speed>,M:<left>,<right>,G:<gyro>`
- [ ] `src/main/serial-service.ts` — Servicio en Main Process
  - `serial:open`, `serial:close`, `serial:list`
  - IPC bridge en preload
- [ ] `src/parsers/json-session-parser.ts` — JSONSessionParser
  - Parsing de `session.json` (formato compacto con keys: v, t, d, pos, size, fields)
  - Conversión de `sessionToDataset()`
- [ ] `src/core/session-codec.ts` — Codec de sesiones
  - `encodeSession()`, `decodeSession()`
  - `sessionToDataset()`, `datasetToSession()`
- [ ] Tests para SerialUARTParser con fixtures
- [ ] Tests para JSONSessionParser con fixture `session.json`
- [ ] Tests para session-codec (round-trip encode/decode)

### Validación
```bash
# Cargar un session.json → TelemetryDataset con frames correctos
# Conectar serial → frames en tiempo real
# Al terminar stream → nombres de campos disponibles para configurar widgets
npm run test
```

---

## FASE 3: Video Sync — Dual Synchronizer (2 semanas)

### Objetivo
Implementar la sincronización frame-a-frame entre vídeo MP4 y telemetría, con soporte para 2 synchronizers simultáneos (comparación side-by-side).

### Entregables
- [ ] `src/core/video-synchronizer.ts` — VideoSynchronizer
  - `requestVideoFrameCallback` loop
  - Búsqueda binaria mediaTime → TelemetryFrame
  - Soporte para drift offset manual (+/- ms)
  - Anchor point system
  - `stepForward()`, `stepBackward()` (1 frame exacto)
  - `setPlaybackRate()` (0.1x a 2x)
  - Polyfill para browsers sin RVFC
  - Soporte para 2 instancias simultáneas (comparación)
- [ ] `src/renderer/components/video/VideoPlayer.tsx`
  - Contenedor del elemento `<video>`
  - Carga de archivos locales via drag-and-drop
  - Soporte para VideoPlayer #2 (comparación)
- [ ] `src/renderer/components/video/PlaybackControls.tsx`
  - Play/Pause, Skip Forward/Back
  - Speed selector (0.1x, 0.25x, 0.5x, 1x, 2x)
  - Controles duplicables para comparación
- [ ] `src/renderer/components/video/TimelineSlider.tsx`
  - Slider de seek con preview
  - Display de timestamp actual / total
  - Modo compartido/independiente para comparación
- [ ] Tests de sincronización:
  - Drift medido < 33ms (1 frame a 30fps)
  - Búsqueda binaria correcta
  - Step forward/backward preciso
  - 2 synchronizers independientes

### Validación
```bash
# Cargar MP4 + session.json → sincronización correcta
# Drift < 33ms durante 60s de reproducción
# Step frame funciona sin saltos
# 2 synchronizers funcionan independientemente
npm run test
```

---

## FASE 4: Session Manager (1 semana)

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

## FASE 5: Widgets + Comparación Side-by-Side (3 semanas)

### Objetivo
Implementar los 4 widgets estándar con registro dinámico, más el sistema de comparación side-by-side.

### Semana 1: TimeSeriesChart + DigitalBitmask
- [ ] `src/widgets/interfaces.ts` — ITelemetryWidget + WidgetMetadata
- [ ] `src/widgets/widget-registry.ts` — WidgetRegistry singleton
- [ ] `src/widgets/time-series-chart/` — Widget de gráficas
  - Integración con uPlot
  - LTTB downsampling por viewport
  - Múltiples series con colores
  - Zoom/pan con uPlot cursor
- [ ] `src/widgets/digital-bitmask/` — Widget de LEDs IR
  - Canvas 2D renderer
  - Soporte para 8, 16, 32 bits
  - Glow effect en LEDs activos
  - Hex display del bitmask

### Semana 2: Minimap2D + StateTimeline
- [ ] `src/widgets/minap-2d/` — Widget de minimapa
  - Canvas 2D con trayectoria X,Y
  - Triángulo rotado para heading
  - Grid de fondo
  - Scroll y zoom
- [ ] `src/widgets/state-timeline/` — Widget de estados
  - Barra de tiempo con colores por estado
  - Estado actual grande
  - Línea de posición actual
  - Labels de transiciones

### Semana 3: Comparación Side-by-Side
- [ ] `src/core/comparison-manager.ts` — ComparisonManager
  - `startComparison()` — activa modo comparación con validación de widgets
  - `stopComparison()` — desactiva y limpia
  - `setSyncBarMode()` — toggle barra compartida/independiente
  - `validateWidgetCompatibility()` — valida widgets idénticos entre sesiones
- [ ] `src/renderer/components/layout/SplitView.tsx`
  - Alterna entre vista single y split
  - En split: duplica el panel completo verticalmente
  - Cada mitad tiene su propio VideoPlayer + WidgetHost
- [ ] Integración con VideoSynchronizer #2
  - Segundo synchronizer para vídeo B
  - Barra vertical compartida o independiente (toggle)
- [ ] Validación de widgets:
  - Si sesiones tienen widgets diferentes → error con lista de diferencias
  - Comparar: tipo, campos, posición, tamaño, configuración
- [ ] Tests de comparación:
  - Widgets idénticos → comparación activada
  - Widgets diferentes → error con diferencias listadas
  - Barra compartida/independiente funciona correctamente

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

## FASE 6: Layout Manager (1 semana)

### Objetivo
Persistencia de layouts en JSON con layouts predefinidos.

### Entregables
- [ ] `src/services/layout-manager.ts` — LayoutManager
  - `getAllLayouts()`, `loadLayout()`, `saveLayout()`
  - `createNew()`, `addWidget()`, `removeWidget()`, `updateWidget()`
  - 2 layouts built-in: Siguelíneas, Micromouse
- [ ] `src/main/ipc-handlers.ts` — Handlers de persistencia
  - `layout:save`, `layout:loadAll`, `layout:delete`
  - Almacenamiento en `app.getPath('userData')/layouts/`
- [ ] `src/renderer/components/dialogs/LayoutDialog.tsx`
  - Lista de layouts disponibles
  - Botones: cargar, guardar, nuevo, eliminar
- [ ] `src/renderer/stores/layout-store.ts` — Zustand store
- [ ] Test: guardar → cargar → verificar igualdad

### Validación
```bash
# Crear layout → guardar → recargar app → layout persiste
# Cargar layout built-in → widgets aparecen
npm run test
```

---

## FASE 7: Exportación para Redes Sociales (2 semanas)

### Objetivo
Pipeline de exportación de vídeo con gráficos superpuestos para crear contenido para redes sociales (Instagram, TikTok, YouTube Shorts).

### Semana 1: Core Export
- [ ] `src/services/video-exporter.ts` — Orquestador
  - `export()`, `cancel()`, progress reporting
  - Soporte para `sessionLabel` en overlays
- [ ] `src/main/export-service.ts` — Servicio en Main Process
  - `export:init`, `export:writeFrame`, `export:finalize`
- [ ] Integración con Mediabunny (reemplazo de mp4-muxer)
- [ ] Preload bridge para exportación

### Semana 2: UI + FFmpeg Fallback
- [ ] `src/renderer/components/dialogs/ExportDialog.tsx`
  - Configuración: formato, codec, resolución, bitrate
  - Selección de widgets a incluir
  - Campo para nombre de sesión (overlay)
  - Barra de progreso
- [ ] FFmpeg child process fallback (para alpha channel)
- [ ] `src/workers/video-export.worker.ts`
- [ ] Test de exportación: 60s → WebM reproducible

### Validación
```bash
# Exportar 10s de vídeo con 2 widgets → MP4 reproducible
# Progreso se reporta correctamente
# La exportación no congela la UI
npm run test
```

---

## FASE 8: Packaging + CI/CD (1 semana)

### Objetivo
Empaquetado multiplataforma funcional con pipeline de CI/CD.

### Entregables
- [ ] `electron-builder.yml` completo y probado
- [ ] Builds exitosos en las 3 plataformas:
  - Windows: `.exe` (NSIS) + portable
  - macOS: `.dmg` (universal binary)
  - Linux: `.AppImage` + `.deb`
- [ ] `resources/udev/69-oprobots-serial.rules` para Linux
- [ ] `build/entitlements.mac.plist` para macOS
- [ ] GitHub Actions CI/CD (`.github/workflows/build.yml`)
- [ ] PoC 4 validado: serial funciona en las 3 plataformas empaquetadas
- [ ] Tamaño de paquete < 200 MB en cada plataforma

### Validación
```bash
# Build completo en CI para las 3 plataformas
# App empaquetada detecta puertos serie en cada plataforma
# Portable build funciona sin instalación
```

---

## FASE 9: Polish + Testing Final (1 semana)

### Objetivo
Pulido final, testing integral, documentación de usuario.

### Entregables
- [ ] Tests e2e con Playwright:
  - App abre correctamente
  - Carga de sesión funciona
  - Exportación funciona
- [ ] Documentación de usuario (README con screenshots)
- [ ] Manejo de errores robusto (dialogs de error, no crashes)
- [ ] Keyboard shortcuts (Space=play/pause, ←→=step, etc.)
- [ ] Performance profiling final
- [ ] Fix de bugs restantes
- [ ] Release v1.0.0

### Validación
```bash
npm run test:e2e               # Tests e2e pasan
npm run test                   # Unit tests pasan
npm run typecheck              # Sin errores TS
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
