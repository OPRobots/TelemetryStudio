# Stack Tecnológico

## Framework Base: Electron vs Tauri

| Criterio | Electron 34 | Tauri 2.x | Veredicto |
|---|---|---|---|
| `serialport` (C++ native module) | Funciona con `electron-rebuild` | Sin binding Rust maduro; USB/serial parcial y variable por plataforma | **Electron** |
| Parsing binario C/C++ (SRAM dumps) | Node.js `Buffer` + `DataView` + Worker Threads | Requiere sidecar C++ o FFI Rust | **Electron** |
| Exportación de vídeo | WebCodecs nativo en Chromium; codecs consistentes | Depende del WebView del SO (WebKitGTK en Linux = codecs limitados) | **Electron** |
| Bundle size | ~150 MB (Chromium embebido) | ~10 MB | Tauri |
| RAM idle | ~250 MB | ~80 MB | Tauri |
| Consistencia cross-platform | Pixel-perfect (mismo Chromium) | Varía: WebView2 / WKWebView / WebKitGTK | **Electron** |
| Ecosistema / Stack Overflow | Masivo | Creciente pero gaps en "long tail" | **Electron** |
| DX (Hot Reload) | Instantáneo (Vite) | Rust compile times 3-7 min fresh | **Electron** |

**Decisión final: Electron 34.x**

Justificación: La dependencia de `serialport` para UART, el procesamiento de binarios STM32, y la exportación de vídeo con codecs consistentes en 3 plataformas hacen que Electron sea la única opción viable. El overhead de ~150 MB es irrelevante para una app de análisis técnico de escritorio.

---

## Librería de Gráficas: uPlot vs Chart.js vs ECharts

Benchmark real con 166,650 puntos:

| Librería | Tamaño | Render init | Memoria heap | mousemove 10s | Streaming 60fps |
|---|---|---|---|---|---|
| **uPlot 1.6** | **48 KB** | **34 ms** | **21→3 MB** | **146 ms avg** | **10% CPU, 12 MB RAM** |
| Chart.js 4.2 | 254 KB | 38 ms | 29→10 MB | 235 ms avg | ~30% CPU |
| ECharts 5.4 | 1000 KB | 55 ms | 17→3 MB | 208 ms avg | ~40% CPU |

**Decisión final: uPlot + Canvas 2D nativo**

- **48 KB** vs 254 KB (Chart.js) o 1000 KB (ECharts)
- **10% CPU** para streaming de 3,600 pts a 60fps — crítico cuando el video MP4 ya consume recursos
- Canvas 2D nativo — sin overhead de SVG ni virtual DOM
- API imperative — ideal para `requestVideoFrameCallback` sync sin re-renders React innecesarios
- Downsample automático con LTTB (Largest Triangle Three Buckets)

**Rechazo de ECharts**: Sistema declarativo de options cloning genera GC spikes que matan el FPS en streaming real-time.

---

## Frontend UI Framework

| Framework | FPS redraw widgets | Ecosistema componentes | Curva aprendizaje | Veredicto |
|---|---|---|---|---|
| **React 19** | Excelente con `useSyncExternalStore` | El más grande del mundo | Ya lo conoce el equipo | **Ganador** |
| Vue 3 | Muy bueno (reactivity) | Grande | Rápida | Alternativa para v2 |
| Svelte 5 | Excelente (compilación directa) | Moderado | Nuevo paradigma | Para v2 |
| HTML5 nativo | Manual, sin virtual DOM | N/A | Lento dev | No |

**Decisión final: React 19 + TypeScript 5.6**

Para widgets dinámicos que se registran/desregistran en runtime, React tiene el patrón más maduro de "componentes como datos". `useSyncExternalStore` para suscripciones al EventBus (NO Redux/Context para datos de alta frecuencia).

---

## Estilado y UI

| Opción | Tamaño bundle | Personalización IDE oscuro | Accesibilidad | Veredicto |
|---|---|---|---|---|
| **Tailwind 4 + shadcn/ui** | ~8 KB gzipped | Total via CSS vars | WAI-ARIA built-in | **Ganador** |
| Material UI | ~80 KB | Limitado | Excelente | Demasiado pesado |
| CSS Modules puro | 0 KB | Total pero sin componentes | Manual | Mucho trabajo |

**Decisión final: Tailwind CSS 4.x + Radix UI Primitives + shadcn/ui**

Theme oscuro tipo IDE robótico con paleta OPRobots (cyan accent, dark backgrounds, JetBrains Mono para datos).

---

## State Management

| Opción | Overhead | Tipo | Veredicto |
|---|---|---|---|
| **Zustand 5** | ~1 KB | Pub-Sub ligero con selectores | **Ganador** |
| Jotai | ~2 KB | Atomic state | Bueno pero más overhead |
| XState | ~15 KB | Máquinas formales | Solo para StateTimeline |
| Custom EventBus | 0 KB | Hand-rolled | Máximo control pero reinventar rueda |

**Decisión final: Zustand 5 + EventBus custom para streaming de frames**

Zustand para estado de UI (layout, settings, widget active). EventBus custom para distribución de `TelemetryFrame` de alta frecuencia (evita overhead de Zustand en cada frame).

---

## Empaquetado y Build

| Herramienta | Función | Veredicto |
|---|---|---|
| **electron-vite 2.x** | Bundler (Vite para Electron) | **Ganador** — worker threads built-in, native modules externals automáticos |
| **electron-builder 25.x** | Packaging multiplataforma | **Ganador** — soporte nativo para ASAR unpack, universal macOS |
| **Mediabunny** | Muxer para exportación de vídeo | **Ganador** — reemplaza mp4-muxer/webm-muxer deprecados |

---

## Resumen del Stack

| Capa | Tecnología | Versión |
|---|---|---|
| Runtime | Electron | 34.x |
| Frontend | React + TypeScript | 19.x / 5.6 |
| Styling | Tailwind CSS + shadcn/ui | 4.x |
| Charts | uPlot (time-series) | 1.6.x |
| State | Zustand + EventBus custom | 5.x |
| Build | electron-vite | 2.x |
| Package | electron-builder | 25.x |
| Native | serialport (C++ binding) | 13.x |
| Video Export | WebCodecs API + Mediabunny | Browser native + 1.x |
| Testing | Vitest + Playwright | 2.x |
