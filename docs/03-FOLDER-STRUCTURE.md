# Estructura del Proyecto

## Árbol de Directorios

> Estado actual del repositorio. Los archivos marcados _(planificado)_ todavía
> no existen y se añadirán en las fases correspondientes del roadmap.

```
oprobots-telemetry-studio/
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
│   └── 04-packaging/                # PoC 4: Packaging multiplataforma
│
├── examples/                        # Pruebas manuales y utilidades
│   ├── README.md                    # Cómo probar sin hardware (socat + simulador)
│   └── serial-simulator.mjs         # Simulador de telemetría Serial
│
├── scripts/                         # Verificación automatizada (Electron)
│   ├── smoke-test.mjs               # Smoke test del renderer
│   ├── e2e-serial.mjs               # E2E: Serial → widgets
│   ├── e2e-video.mjs                # E2E: vídeo + sincronización
│   └── fetch-ffmpeg.mjs             # _(planificado)_ Descarga FFmpeg a resources/bin
│
├── resources/                       # Assets estáticos empaquetados
│   ├── udev/                        # _(planificado)_ Reglas udev para Linux
│   │   └── 69-oprobots-serial.rules
│   └── bin/                         # _(planificado)_ FFmpeg sidecar (no versionado)
│
├── build/                           # Configuración de build
│   ├── entitlements.mac.plist       # Permisos macOS para code signing
│   └── icon.png                     # _(planificado placeholder)_ Icono 512x512
│
├── src/
│   ├── main/                        # ═══ MAIN PROCESS (Node.js) ═══
│   │   ├── index.ts                 # Entry point: app lifecycle, window creation
│   │   ├── ipc-handlers.ts          # Registro de todos los ipcMain.handle
│   │   ├── serial-service.ts        # Servicio SerialPort (apertura, streaming, cierre)
│   │   └── export-service.ts        # Exportación de vídeo con FFmpeg (raw RGBA)
│   │
│   ├── preload/                     # ═══ PRELOAD SCRIPT ═══
│   │   └── index.ts                 # contextBridge: expone API segura al renderer
│   │
│   ├── workers/                     # ═══ WORKER THREADS ═══ (vacío; export corre en main)
│   │
│   ├── core/                        # ═══ CORE / DATA ENGINE ═══
│   │   ├── types/
│   │   │   ├── telemetry.ts         # TelemetryFrame, TelemetryDataset, FieldSchema
│   │   │   ├── video.ts             # VideoFrameContext, PlaybackState, ExportConfig
│   │   │   ├── layout.ts            # DashboardLayout, WidgetConfig
│   │   │   ├── session.ts           # SessionFile, SessionVideo, SessionSync
│   │   │   ├── comparison.ts        # ComparisonConfig, WidgetCompatibilityResult
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
│   │   ├── time-series-chart/       # Gráfica temporal multi-serie (uPlot)
│   │   │   └── index.tsx
│   │   ├── digital-bitmask/         # Matriz de LEDs (Canvas 2D)
│   │   │   └── index.tsx
│   │   ├── minimap-2d/              # Minimapa de trayectoria (Canvas 2D)
│   │   │   └── index.tsx
│   │   └── state-timeline/          # Línea de tiempo de estados (Canvas 2D)
│   │       └── index.tsx
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
│   │       │   │   ├── AppShell.tsx     # Layout principal (header + sidebar + workspace)
│   │       │   │   ├── Sidebar.tsx      # Fuentes de datos, sincronización, campos
│   │       │   │   ├── Toolbar.tsx      # Slider temporal + controles de reproducción
│   │       │   │   ├── StatusBar.tsx    # Barra de estado inferior
│   │       │   │   └── SplitView.tsx    # Vista split de comparación
│   │       │   ├── video/
│   │       │   │   ├── VideoPlayer.tsx      # Contenedor del elemento video
│   │       │   │   ├── PlaybackControls.tsx # Play/pause, step, velocidad
│   │       │   │   ├── PaneControls.tsx     # Controles de un sincronizador concreto
│   │       │   │   └── TimelineSlider.tsx   # Slider de seek
│   │       │   ├── widgets/
│   │       │   │   ├── WidgetHost.tsx       # Contenedor dinámico de widgets
│   │       │   │   ├── WidgetToolbar.tsx    # Añadir widgets
│   │       │   │   ├── WidgetWrapper.tsx    # Marco con título y acciones
│   │       │   │   └── WidgetConfigDialog.tsx # Configuración de campos/colores
│   │       │   └── dialogs/
│   │       │       ├── SerialConnectDialog.tsx # Conexión serial
│   │       │       ├── LayoutDialog.tsx        # Guardar/cargar layouts
│   │       │       ├── SaveSessionDialog.tsx   # Guardar sesión
│   │       │       ├── SessionBrowserDialog.tsx # Listar y abrir sesiones
│   │       │       ├── ComparisonDialog.tsx    # Activar comparación
│   │       │       └── ExportDialog.tsx        # Exportar vídeo con overlays
│   │       ├── hooks/
│   │       │   ├── useEventListener.ts  # Suscripción al EventBus
│   │       │   └── useKeyboardShortcuts.ts # _(planificado Fase 9)_
│   │       ├── lib/
│   │       │   ├── auto-layout.ts       # Auto-configura widgets según el schema
│   │       │   ├── serial-ingest.ts     # Ingesta Serial → TelemetryStore
│   │       │   ├── session-actions.ts   # Abrir/guardar sesión
│   │       │   └── comparison-sync.ts   # Sincronizador del panel de comparación
│   │       ├── stores/
│   │       │   ├── app-store.ts         # Zustand: estado global
│   │       │   ├── layout-store.ts      # Zustand: widgets del dashboard
│   │       │   └── comparison-store.ts  # Zustand: estado de comparación
│   │       └── styles/
│   │           └── globals.css          # Tailwind + variables de color
│   │
│   └── shared/                      # ═══ SHARED (Main + Renderer) ═══
│       └── export-args.ts           # Construcción de argumentos de FFmpeg (puro)
│
├── tests/                           # ═══ TESTS (Vitest) ═══
│   ├── unit/
│   │   ├── core/                    # event-bus, telemetry-store, video-synchronizer,
│   │   │                            # layout-manager, session-codec, comparison-manager,
│   │   │                            # lttb, binary-search
│   │   ├── parsers/                 # serial-uart-parser, json-session-parser, parser-registry
│   │   ├── renderer/                # auto-layout
│   │   └── widgets/                 # widget-registry
│   ├── integration/
│   │   └── serial-to-sync.test.ts   # Serial → Store → auto-layout → sync
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
| Worker threads | `*.worker.ts` | `video-export.worker.ts` |
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

**Regla de dependencias**: Nunca importar desde `renderer/` hacia `main/` o `workers/`. La comunicación es exclusivamente via IPC.
