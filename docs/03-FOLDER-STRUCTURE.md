# Estructura del Proyecto

## Árbol de Directorios

```
oprobots-telemetry-studio/
├── electron.vite.config.ts          # Configuración centralizada de electron-vite
├── package.json                     # Dependencias y scripts
├── tsconfig.json                    # Configuración TypeScript
├── tsconfig.node.json               # TS config para main process + workers
├── electron-builder.yml             # Configuración de empaquetado
├── index.html                       # Entry HTML para el renderer
├── tailwind.config.ts               # Configuración de Tailwind CSS
│
├── resources/                       # Assets estáticos empaquetados
│   ├── icon.ico                     # Icono Windows
│   ├── icon.icns                    # Icono macOS
│   ├── icon.png                     # Icono Linux (512x512)
│   ├── fonts/                       # Fuentes offline
│   │   ├── JetBrainsMono-Regular.woff2
│   │   ├── JetBrainsMono-Bold.woff2
│   │   └── Inter-Regular.woff2
│   └── icons/                       # SVG icons (Lucide-like)
│       ├── play.svg
│       ├── pause.svg
│       ├── skip-forward.svg
│       ├── skip-back.svg
│       ├── export.svg
│       └── settings.svg
│
├── build/                           # Configuración de build
│   ├── entitlements.mac.plist       # Permisos macOS para code signing
│   └── notarize.js                  # Script de notarización macOS
│
├── src/
│   ├── main/                        # ═══ MAIN PROCESS (Node.js) ═══
│   │   ├── index.ts                 # Entry point: app lifecycle, window creation
│   │   ├── ipc-handlers.ts          # Registro de todos los ipcMain.handle
│   │   ├── serial-service.ts        # Servicio SerialPort (apertura, streaming, cierre)
│   │   ├── session-service.ts       # Servicio de sesiones (exportar/importar JSON+MP4)
│   │   ├── file-service.ts          # Lectura de archivos del disco
│   │   └── export-service.ts        # Escritura de vídeos exportados a disco
│   │
│   ├── preload/                     # ═══ PRELOAD SCRIPT ═══
│   │   └── index.ts                 # contextBridge: expone API segura al renderer
│   │
│   ├── workers/                     # ═══ WORKER THREADS ═══
│   │   └── video-export.worker.ts   # Renderizado offscreen para exportación
│   │
│   ├── core/                        # ═══ CORE / DATA ENGINE ═══
│   │   ├── types/
│   │   │   ├── telemetry.ts         # TelemetryFrame, TelemetryDataset, FieldSchema
│   │   │   ├── video.ts             # VideoFrameContext, PlaybackState, ExportConfig
│   │   │   ├── layout.ts            # DashboardLayout, WidgetConfig, LayoutPreset
│   │   │   ├── session.ts           # SessionFile, SessionVideo, SessionSync
│   │   │   ├── comparison.ts        # ComparisonConfig, WidgetCompatibilityResult
│   │   │   └── events.ts            # EventMap, todos los tipos de eventos del bus
│   │   ├── event-bus.ts             # EventBus genérico typed (Pub-Sub)
│   │   ├── telemetry-store.ts       # Almacén de frames (multi-dataset: primario + comparación)
│   │   ├── video-synchronizer.ts    # Motor de sincronización vídeo-telemetría (dual)
│   │   ├── comparison-manager.ts    # Gestor de comparación side-by-side (validación widgets)
│   │   ├── session-codec.ts         # Codec de sesiones (encode/decode/sessionToDataset)
│   │   ├── lttb.ts                  # Downsampling LTTB (implementación inline)
│   │   └── binary-search.ts         # Búsqueda binaria O(log N) por timestamp
│   │
│   ├── parsers/                     # ═══ PLUGINS DE PARSER ═══
│   │   ├── parser-registry.ts       # Registro dinámico de parsers
│   │   ├── interfaces.ts            # ITelemetryParser + metadatos del parser
│   │   ├── json-session-parser.ts   # Parser de sesiones JSON (formato compacto)
│   │   └── serial-uart-parser.ts    # Parser UART/Serial (implementa ITelemetryParser)
│   │
│   ├── widgets/                     # ═══ PLUGINS DE WIDGET ═══
│   │   ├── widget-registry.ts       # Registro dinámico de widgets
│   │   ├── interfaces.ts            # ITelemetryWidget + metadatos del widget
│   │   ├── time-series-chart/       # Widget de gráficas temporales
│   │   │   ├── index.tsx            # Componente React
│   │   │   ├── uplot-config.ts      # Configuración uPlot
│   │   │   └── downsample.ts        # LTTB adaptado para viewport
│   │   ├── digital-bitmask/         # Widget de matriz de LEDs (sensors IR)
│   │   │   ├── index.tsx            # Componente React
│   │   │   └── canvas-renderer.ts   # Renderizado Canvas 2D de LEDs
│   │   ├── minimap-2d/              # Widget de minimapa de trayectoria
│   │   │   ├── index.tsx            # Componente React
│   │   │   └── canvas-renderer.ts   # Renderizado Canvas 2D del minimapa
│   │   └── state-timeline/          # Widget de línea de tiempo de estados
│   │       ├── index.tsx            # Componente React
│   │       └── canvas-renderer.ts   # Renderizado Canvas 2D de estados
│   │
│   ├── services/                    # ═══ SERVICIOS ═══
│   │   ├── session-manager.ts       # Exportar/importar sesiones (JSON + vídeo)
│   │   ├── video-exporter.ts        # Orquestador de exportación de vídeo
│   │   ├── layout-manager.ts        # Guardar/cargar layouts en JSON
│   │   └── file-dialogs.ts          # Diálogos de apertura/guardado de archivos
│   │
│   ├── renderer/                    # ═══ RENDERER PROCESS (React) ═══
│   │   ├── App.tsx                  # Componente raíz
│   │   ├── index.tsx                # ReactDOM.createRoot
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx     # Layout principal (sidebar + workspace)
│   │   │   │   ├── Sidebar.tsx      # Panel lateral (archivos, ajustes)
│   │   │   │   ├── Toolbar.tsx      # Barra de herramientas (play/pause, speed)
│   │   │   │   ├── StatusBar.tsx    # Barra de estado inferior
│   │   │   │   └── SplitView.tsx    # Vista split para comparación (duplica panel verticalmente)
│   │   │   ├── video/
│   │   │   │   ├── VideoPlayer.tsx  # Contenedor del elemento video
│   │   │   │   ├── PlaybackControls.tsx  # Controles de reproducción
│   │   │   │   ├── TimelineSlider.tsx    # Slider de seek
│   │   │   │   └── SpeedControl.tsx      # Selector de velocidad (0.1x - 2x)
│   │   │   ├── widgets/
│   │   │   │   ├── WidgetHost.tsx   # Contenedor dinámico de widgets
│   │   │   │   ├── WidgetToolbar.tsx # Barra para añadir/quitar widgets
│   │   │   │   └── WidgetWrapper.tsx # Wrapper con drag/resize
│   │   │   └── dialogs/
│   │   │       ├── FileImportDialog.tsx  # Diálogo de importación
│   │   │       ├── ExportDialog.tsx      # Diálogo de exportación de vídeo
│   │   │       ├── LayoutDialog.tsx      # Diálogo de guardado/carga de layouts
│   │   │       └── SerialConnectDialog.tsx # Diálogo de conexión serial
│   │   ├── hooks/
│   │   │   ├── useEventBus.ts       # Hook para suscribirse al EventBus
│   │   │   ├── useTelemetryStore.ts # Hook para acceder al TelemetryStore
│   │   │   ├── useVideoSync.ts      # Hook para el VideoSynchronizer
│   │   │   ├── useLayout.ts         # Hook para el LayoutManager
│   │   │   └── useElectronAPI.ts    # Hook para acceder al preload bridge
│   │   ├── stores/
│   │   │   ├── app-store.ts         # Zustand: estado global de la app
│   │   │   └── layout-store.ts      # Zustand: estado del layout
│   │   └── styles/
│   │       ├── globals.css          # Import de Tailwind + custom CSS
│   │       └── widgets.css          # Estilos específicos de widgets
│   │
│   └── shared/                      # ═══ SHARED (Main + Renderer + Workers) ═══
│       ├── constants.ts
│       └── utils.ts
│
├── tests/                           # ═══ TESTS ═══
│   ├── unit/
│   │   ├── core/
│   │   │   ├── event-bus.test.ts
│   │   │   ├── telemetry-store.test.ts
│   │   │   ├── comparison-manager.test.ts
│   │   │   ├── lttb.test.ts
│   │   │   └── binary-search.test.ts
│   │   ├── parsers/
│   │   │   ├── json-session-parser.test.ts
│   │   │   └── serial-uart-parser.test.ts
│   │   └── widgets/
│   │       └── digital-bitmask.test.ts
│   ├── integration/
│   │   ├── serial-echo.test.ts     # Test con SerialPortMock
│   │   └── video-sync.test.ts      # Test de sincronización
│   └── e2e/
│       ├── app-launch.spec.ts      # Playwright: app abre correctamente
│       └── file-import.spec.ts     # Playwright: importación de archivo
│
├── fixtures/                        # ═══ DATOS DE TEST ═══
│   ├── sample-session/              # Sesión de ejemplo
│   │   ├── session.json             # JSON de sesión compacto
│   │   └── sample.mp4               # Vídeo de ejemplo
│   └── sample.mp4                   # Vídeo suelto (10s, 30fps)
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
| Hooks | `camelCase` con prefijo `use` | `useEventBus.ts` |
| Worker threads | `*.worker.ts` | `video-export.worker.ts` |
| Test files | `*.test.ts` o `*.spec.ts` | `lttb.test.ts` |
| Constantes | `UPPER_SNAKE_CASE` | `MAX_BAUD_RATE` |
| CSS classes | `kebab-case` | `widget-host`, `timeline-slider` |

## Dependencias entre Módulos

```
shared/          ← No tiene dependencias internas
core/            ← Depende de shared/
parsers/         ← Depende de core/ (interfaces, types)
widgets/         ← Depende de core/ (interfaces, types, event-bus)
services/        ← Depende de core/ y parsers/
workers/         ← Depende de core/ y shared/
renderer/        ← Depende de core/, widgets/, services/, shared/
main/            ← Depende de shared/ (NO de renderer/ ni widgets/)
preload/         ← No tiene dependencias (solo electron API)
```

**Regla de dependencias**: Nunca importar desde `renderer/` hacia `main/` o `workers/`. La comunicación es exclusivamente via IPC.
