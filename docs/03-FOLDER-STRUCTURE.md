# Estructura del Proyecto

## Árbol de Directorios

> Estado actual del repositorio. Los archivos marcados _(planificado)_ todavía
> no existen y se añadirán en las fases correspondientes del roadmap.

```
telemetry-studio/
├── electron.vite.config.ts          # Configuración centralizada de electron-vite
├── package.json                     # Dependencias y scripts
├── tsconfig.json                    # Configuración TypeScript
├── tsconfig.node.json               # TS config para main process + workers
├── electron-builder.yml             # Configuración de empaquetado
├── vitest.config.ts                 # Configuración de Vitest (tests)
├── .gitignore                       # Archivos ignorados por git
│
├── pocs/                            # Pruebas de concepto (referencia)
│   ├── 01-serial-widget/            # PoC 1: Serial → parse → uPlot
│   ├── 02-video-sync/               # PoC 2: Video Sync (requestVideoFrameCallback)
│   ├── 03-video-export/             # PoC 3: Video Export (raw RGBA → FFmpeg)
│   ├── 04-packaging/                # PoC 4: Packaging multiplataforma
│   └── 05-telemetry-sender/         # PoC 5: emisor de telemetría STM32 (PlatformIO)
│
├── examples/                        # Pruebas manuales y utilidades
│   ├── README.md                    # Cómo probar sin hardware (socat + simulador)
│   └── serial-simulator.mjs         # Simulador de telemetría Serial
│
├── scripts/                         # Verificación automatizada (Electron)
│   ├── smoke-test.mjs               # Smoke test del renderer
│   ├── e2e-serial.mjs               # E2E: Serial → widgets
│   ├── e2e-video.mjs                # E2E: vídeo + sincronización
│   ├── e2e-comparison.mjs           # E2E: comparación side-by-side
│   ├── e2e-export.mjs               # E2E: composición de exportación
│   ├── e2e-prepare.mjs              # E2E: diálogo de transcode
│   ├── e2e-save.mjs                 # E2E: guardar sesión (bloqueo/reposo)
│   ├── e2e-widgets.mjs              # E2E: rejilla fluida (resize + reordenar)
│   ├── e2e-widget-kinds.mjs         # E2E: render de los 4 tipos de widget
│   ├── e2e-zoom.mjs                 # E2E: zoom compartido entre timelines
│   ├── e2e-serial-reset.mjs         # E2E: "recibiendo"/"en reposo" + reinicio de captura
│   ├── e2e-comparison-reset.mjs     # E2E: reset aislado en comparación
│   ├── run-electron.mjs             # Lanzador de Electron (filtra ruido ambiental)
│   ├── screenshot.mjs               # Captura de pantalla para revisión visual
│   ├── fonts.conf                   # Config mínima de fontconfig para dev
│   └── fetch-ffmpeg.mjs             # Descarga FFmpeg a resources/bin (sidecar)
│
├── resources/                       # Assets estáticos empaquetados
│   ├── udev/                        # Reglas udev para Linux
│   │   └── 69-oprobots-serial.rules
│   └── bin/                         # FFmpeg sidecar (no versionado)
│
├── build/                           # Configuración de build
│   ├── entitlements.mac.plist       # Permisos macOS para code signing
│   └── icon.png                     # Icono placeholder 512x512
│
├── src/
│   ├── main/                        # ═══ MAIN PROCESS (Node.js) ═══
│   │   ├── index.ts                 # Entry point: app lifecycle, window creation
│   │   ├── app-menu.ts              # Menú nativo (Archivo/Datos/Ver/Ayuda)
│   │   ├── ipc-handlers.ts          # Registro de todos los ipcMain.handle
│   │   ├── ffmpeg.ts                # Resolución de los binarios ffmpeg/ffprobe
│   │   ├── serial-service.ts        # Servicio SerialPort (apertura, streaming, cierre)
│   │   ├── video-service.ts         # Prepara vídeos (transcode HEVC→H.264)
│   │   └── export-service.ts        # Exportación de vídeo con FFmpeg (raw RGBA)
│   │
│   ├── preload/                     # ═══ PRELOAD SCRIPT ═══
│   │   └── index.ts                 # contextBridge: expone API segura al renderer
│   │
│   ├── core/                        # ═══ CORE / DATA ENGINE ═══
│   │   ├── types/
│   │   │   ├── telemetry.ts         # TelemetryFrame, TelemetryDataset, FieldSchema
│   │   │   ├── video.ts             # VideoFrameContext, PlaybackState, ExportConfig
│   │   │   ├── layout.ts            # DashboardLayout, WidgetConfig
│   │   │   ├── session.ts           # SessionFile, SessionVideo, SessionSync
│   │   │   ├── comparison.ts        # WidgetCompatibilityResult
│   │   │   └── events.ts            # EventMap, todos los tipos de eventos del bus
│   │   ├── event-bus.ts             # EventBus genérico typed (Pub-Sub)
│   │   ├── telemetry-store.ts       # Almacén de frames (primario + comparación)
│   │   ├── video-synchronizer.ts    # Motor de sincronización vídeo-telemetría
│   │   ├── comparison-manager.ts    # Gestor de comparación side-by-side
│   │   ├── session-codec.ts         # Codec de sesiones (encode/decode/sessionToDataset)
│   │   ├── lttb.ts                  # Downsampling LTTB (implementación inline)
│   │   └── binary-search.ts         # Búsqueda binaria O(log N) por timestamp
│   │
│   ├── parsers/                     # ═══ PLUGINS DE PARSER ═══
│   │   ├── interfaces.ts            # ITelemetryParser + metadatos del parser
│   │   ├── parser-registry.ts       # Registro dinámico de parsers
│   │   ├── json-session-parser.ts   # Parser de sesiones JSON (formato compacto)
│   │   └── serial-uart-parser.ts    # Parser UART/Serial (CSV, legacy, genérico)
│   │
│   ├── widgets/                     # ═══ PLUGINS DE WIDGET ═══
│   │   ├── interfaces.ts            # WidgetDefinition, WidgetMetadata, WidgetProps
│   │   ├── widget-registry.ts       # WidgetRegistry singleton (agnóstico)
│   │   ├── register-widgets.ts      # Registra los 4 widgets estándar
│   │   ├── frame-lookup.ts          # Frame más cercano a un timestamp (cursor)
│   │   ├── use-canvas-size.ts       # ResizeObserver para widgets canvas
│   │   ├── color-palette.ts         # Paletas automáticas (series / estados)
│   │   ├── zoom-range.ts            # Rango de zoom compartido (helpers puros)
│   │   ├── time-series-chart/       # Gráfica temporal multi-serie (uPlot)
│   │   │   └── index.tsx
│   │   ├── digital-bitmask/         # Matriz de LEDs (Canvas 2D)
│   │   │   └── index.tsx
│   │   ├── minimap-2d/              # Minimapa de trayectoria (Canvas 2D)
│   │   │   └── index.tsx
│   │   └── state-timeline/          # Línea de tiempo de estados (Canvas 2D)
│   │       ├── index.tsx
│   │       └── state-entry.ts       # Resolución de etiqueta/color por estado
│   │
│   ├── services/                    # ═══ SERVICIOS ═══
│   │   ├── layout-manager.ts        # Guardar/cargar layouts en JSON
│   │   ├── session-manager.ts       # Exportar/importar sesiones (adaptador IPC)
│   │   └── video-exporter.ts        # Orquestador de exportación (composición canvas)
│   │
│   ├── renderer/                    # ═══ RENDERER PROCESS (React) ═══
│   │   ├── index.html
│   │   └── src/
│   │       ├── App.tsx              # Componente raíz (registra widgets + polyfill)
│   │       ├── main.tsx             # ReactDOM.createRoot
│   │       ├── global.d.ts          # Tipos de window.api (bridge de preload)
│   │       ├── components/
│   │       │   ├── layout/
│   │       │   │   ├── AppShell.tsx     # Layout principal (menú, inspector, workspace)
│   │       │   │   ├── Inspector.tsx    # Panel izquierdo: sincronización y campos
│   │       │   │   ├── Splitter.tsx     # Divisores arrastrables entre paneles
│   │       │   │   ├── Toolbar.tsx      # Slider temporal + controles de reproducción
│   │       │   │   ├── StatusBar.tsx    # Barra de estado inferior (chips)
│   │       │   │   └── SplitView.tsx    # Vista split de comparación
│   │       │   ├── video/
│   │       │   │   ├── VideoPlayer.tsx      # Contenedor del elemento video
│   │   │   │   ├── PlaybackControls.tsx # Play/pause, step, velocidad
│   │   │   │   └── TimelineSlider.tsx   # Slider de seek
│   │       │   ├── widgets/
│   │       │   │   ├── WidgetHost.tsx       # Contenedor dinámico de widgets
│   │       │   │   ├── WidgetToolbar.tsx    # Añadir widgets (+ Añadir gráfica)
│   │       │   │   ├── WidgetWrapper.tsx    # Marco con título y acciones
│   │       │   │   └── WidgetConfigDialog.tsx # Configuración de campos/colores
│   │       │   └── dialogs/
│   │       │       ├── SerialConnectDialog.tsx # Conexión serial
│   │       │       ├── LayoutDialog.tsx        # Guardar/cargar layouts
│   │       │       ├── SaveSessionDialog.tsx   # Guardar sesión
│   │       │       ├── SessionBrowserDialog.tsx # Listar y abrir sesiones
│   │       │       ├── ComparisonDialog.tsx    # Activar comparación
│   │       │       ├── ExportDialog.tsx        # Exportar vídeo con overlays
│   │       │       └── PrepareVideoDialog.tsx   # Progreso de conversión + cancelar
│   │       ├── hooks/
│   │       │   ├── useEventListener.ts  # Suscripción al EventBus
│   │       │   └── useKeyboardShortcuts.ts # Atajos globales de teclado
│   │       ├── lib/
│   │       │   ├── auto-layout.ts       # Auto-configura widgets según el schema
│   │       │   ├── serial-ingest.ts     # Ingesta Serial → TelemetryStore
│   │       │   ├── session-actions.ts   # Abrir/guardar sesión
│   │       │   ├── session-save-status.ts # ¿Se puede guardar? (por último dato)
│   │       │   ├── sync-actions.ts      # Alinear/restablecer la sync (anchor)
│   │       │   ├── widget-layout.ts     # Snap de rejilla (ancho/alto) de widgets
│   │       │   ├── widget-scroll-sync.ts # Scroll sincronizado entre paneles
│   │       │   ├── video-prepare.ts     # Transcode de vídeo (diálogo + progreso)
│   │       │   └── comparison-sync.ts   # Sincronizador del panel de comparación
│   │       ├── stores/
│   │       │   ├── app-store.ts         # Zustand: estado global
│   │       │   ├── layout-store.ts      # Zustand: widgets del dashboard
│   │       │   ├── comparison-store.ts  # Zustand: estado de comparación
│   │       │   └── cursor-store.ts      # Zustand: cursor temporal compartido
│   │       └── styles/
│   │           └── globals.css          # Tailwind + variables de color
│   │
│   └── shared/                      # ═══ SHARED (Main + Renderer) ═══
│       ├── export-args.ts           # Construcción de argumentos de FFmpeg (puro)
│       ├── video-codecs.ts          # Códecs reproducibles (puro)
│       └── video-transcode.ts       # Argumentos de conversión a H.264 (puro)
│
├── tests/                           # ═══ TESTS (Vitest) ═══
│   ├── unit/
│   │   ├── core/                    # event-bus, telemetry-store, video-synchronizer,
│   │   │                            # layout-manager, session-codec, comparison-manager,
│   │   │                            # lttb, binary-search, session-manager, setup
│   │   ├── parsers/                 # serial-uart-parser, json-session-parser, parser-registry
│   │   ├── renderer/                # auto-layout, layout-store, comparison-store,
│   │   │                            # cursor-store, widget-layout, splitter, session-save-status
│   │   ├── shared/                  # export-args, video-codecs, video-transcode
│   │   └── widgets/                 # widget-registry, frame-lookup, state-entry, color-palette
│   ├── integration/
│   │   ├── serial-to-sync.test.ts   # Serial → Store → auto-layout → sync
│   │   ├── export-ffmpeg.test.ts    # Composición + FFmpeg real (ffprobe)
│   │   └── video-transcode.test.ts  # Transcode HEVC→H.264
│   ├── e2e/                         # (vacío) los e2e viven en scripts/*.mjs
│   └── fixtures/
│       └── session.json
│
└── docs/                            # ═══ ESTA DOCUMENTACIÓN ═══
    ├── 00-PROJECT-OVERVIEW.md
    ├── 01-ARCHITECTURE.md
    ├── 02-TECH-STACK.md
    ├── 03-FOLDER-STRUCTURE.md
    ├── 04-DATA-MODEL.md
    ├── 05-PLUGIN-SYSTEM.md
    ├── 06-VIDEO-SYNC.md
    ├── 07-DATA-ENGINE.md
    ├── 08-WIDGET-SYSTEM.md
    ├── 09-VIDEO-EXPORT.md
    ├── 10-LAYOUT-MANAGER.md
    ├── 11-PACKAGING.md
    ├── 12-LIMITATIONS.md
    ├── 13-POC-TESTS.md
    ├── 14-SESSION-FORMAT.md
    └── ROADMAP.md
```

## Convenciones de Nomenclatura

| Elemento | Convención | Ejemplo |
|---|---|---|
| Archivos de código | `kebab-case.ts` | `event-bus.ts` |
| Clases e interfaces | `PascalCase` | `TelemetryStore`, `ITelemetryParser` |
| Componentes React | `PascalCase.tsx` | `VideoPlayer.tsx` |
| Hooks | `camelCase` con prefijo `use` | `useEventListener.ts` |
| Test files | `*.test.ts` | `lttb.test.ts` |
| Scripts e2e | `e2e-*.mjs` | `e2e-serial.mjs` |
| Constantes | `UPPER_SNAKE_CASE` | `MAX_BAUD_RATE` |
| CSS classes | `kebab-case` | `widget-host`, `timeline-slider` |

## Dependencias entre Módulos

```
shared/          ← No tiene dependencias internas
core/            ← Depende de shared/
parsers/         ← Depende de core/ (interfaces, types)
widgets/         ← Depende de core/ (types, lttb, telemetry-store)
services/        ← Depende de core/ y parsers/
main/            ← Depende de shared/ (NO de renderer/ ni widgets/)
preload/         ← No tiene dependencias (solo electron API)
renderer/        ← Depende de core/, widgets/, services/, shared/
```

**Regla de dependencias**: Nunca importar desde `renderer/` hacia `main/`. La comunicación es exclusivamente via IPC.
