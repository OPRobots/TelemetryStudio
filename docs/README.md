# Documentación de Telemetry Studio

Índice, recorrido por capas y glosario. Si es tu primera vez aquí, lee esta página y
luego el documento de la capa o función que te interese.

## ¿Qué es?

**Telemetry Studio** es una app de escritorio (Electron 34 + React 19 + TypeScript)
para **analizar telemetría de robots de competición con vídeo pregrabado
sincronizado**. Funciona **100 % offline** y **portable**. Captura por Serial o carga
sesiones guardadas, dibuja la telemetría con widgets (uPlot/Canvas 2D), sincroniza
todo con el vídeo por timestamp, permite comparar dos sesiones y exportar vídeo MP4
con los gráficos superpuestos.

## Mapa de documentos

| Documento | Contenido | Cuándo leerlo |
|---|---|---|
| [00 — Visión general](00-PROJECT-OVERVIEW.md) | Casos de uso, flujos, restricciones | Para entender el producto |
| [01 — Arquitectura](01-ARCHITECTURE.md) | Diagramas y flujos main/renderer/IPC | Antes de tocar el código |
| [02 — Stack tecnológico](02-TECH-STACK.md) | Decisiones (Electron, uPlot, Zustand…) | Para dudas de por qué cada tecnología |
| [03 — Estructura de carpetas](03-FOLDER-STRUCTURE.md) | Árbol de ficheros y reglas de dependencias | Para encontrar dónde vive algo |
| [04 — Modelo de datos](04-DATA-MODEL.md) | Tipos TS, `EventMap`, modelos de export/sesión | Al trabajar con datos |
| [05 — Sistema de plugins](05-PLUGIN-SYSTEM.md) | Parsers y widgets | Para añadir un parser/widget |
| [06 — Sincronización vídeo](06-VIDEO-SYNC.md) | `VideoSynchronizer`, anchor/drift | Para entender el sync |
| [07 — Motor de datos](07-DATA-ENGINE.md) | EventBus, TelemetryStore, ComparisonManager, búsqueda/LTTB | Al trabajar con el core |
| [08 — Sistema de widgets](08-WIDGET-SYSTEM.md) | Los 4 widgets, rejilla, auto-layout | Para tocar widgets |
| [09 — Exportación de vídeo](09-VIDEO-EXPORT.md) | Asistente de 2 pasos, composición, FFmpeg | Para tocar la exportación |
| [10 — Layout Manager](10-LAYOUT-MANAGER.md) | Persistencia de layouts y edición por arrastre | Para tocar layouts |
| [11 — Empaquetado](11-PACKAGING.md) | electron-builder, CI/CD, sidecar FFmpeg | Para publicar builds |
| [12 — Limitaciones](12-LIMITATIONS.md) | Known issues y workarounds | Antes de reportar/arreglar |
| [13 — PoCs](13-POC-TESTS.md) | Pruebas de concepto obligatorias | Para reproducir validaciones |
| [14 — Formato de sesión](14-SESSION-FORMAT.md) | Especificación de `session.json` | Para leer/escribir sesiones |
| [ROADMAP](../ROADMAP.md) | Fases y timeline | Para contexto histórico |
| [AGENTS](../AGENTS.md) | Guía para agentes/colaboradores | Al contribuir |

## Recorrido por capas

La regla de oro: **el renderer nunca importa de `main/`**; toda comunicación pasa por
IPC. `shared/` no depende de nada; `main/` no depende del renderer.

```
main/      Node.js: ciclo de vida, serialport, ffprobe/transcode, FFmpeg, I/O de ficheros
preload/   contextBridge → window.api (tipado en renderer/src/global.d.ts)
renderer/  UI React + stores Zustand; orquesta todo
  core/      motor de datos puro-lógico (EventBus, TelemetryStore, VideoSynchronizer…)
  parsers/   entrada de datos (Serial, JSON)
  widgets/   visualización (TimeSeriesChart, DigitalBitmask, Minimap2D, StateTimeline)
  services/  orquestación (layout, sesión, exportación)
  shared/    utilidades puras compartidas (rejilla, composición, args FFmpeg)
```

Dependencias: `shared` ← `core` ← `parsers`/`widgets` ← `services` ← `renderer`;
`main` depende solo de `shared`. Detalle en [03](03-FOLDER-STRUCTURE.md).

## Flujos clave

- **Serial + Vídeo**: cargar vídeo → conectar Serial → streaming → auto-layout →
  «Alinear aquí» (anchor) → analizar → guardar sesión.
- **Sesión guardada**: abrir `session.json` → se restaura telemetría, sync, layout y
  board de exportación → analizar.
- **Comparación**: sesión A + sesión B (widgets idénticos y en el mismo orden) →
  `SplitView` en paralelo con reproducción/cursor/zoom sincronizados.
- **Exportación**: requiere telemetría → asistente de 2 pasos (board + salida) →
  `ExportStage` compone frames → raw RGBA → FFmpeg → MP4 H.264.

## Glosario

| Término | Significado |
|---|---|
| **TelemetryFrame** | Muestra individual: `{ timestamp_ms, data }`. |
| **TelemetryDataset** | Conjunto de frames + schema + `startTime_ms`/`endTime_ms`/`duration_ms`. |
| **DataSource** | Origen del dataset: `session` o `serial`. |
| **EventBus** | Pub/Sub tipado por `EventMap`; eventos de alto nivel (`sync:frame`, `data:*`, `comparison:*`…). |
| **FrameBus** | Bus **por panel** que entrega el frame sincronizado a los widgets; redibujado imperativo sin re-render React. |
| **TelemetryStore** | Almacén de frames en memoria: dataset **primario** + **comparación**. Búsqueda binaria por timestamp. |
| **VideoSynchronizer** | Motor que mapea el tiempo de vídeo a timestamp de telemetría (`mapTime`) con **anchor** y **drift**; su inversa es `unmapTime`. |
| **Anchor** | Punto de alineación `{ video_ms, telemetry_ms }`; «Alinear aquí» fija el frame actual como `t=0` de telemetría. |
| **Drift** | Desfase manual (`driftOffset_ms`, hoy siempre 0 en la app); se miden `averageDrift`/`maxDrift`. |
| **viewTimestamp_ms** | Timestamp de telemetría mapeado desde el frame de vídeo (lo consumen los widgets). |
| **LTTB** | Largest-Triangle-Three-Buckets: downsample que conserva picos; se aplica por encima de `maxPoints` (2000). |
| **ComparisonManager** | Valida widgets idénticos (posición a posición) y carga el dataset de comparación. |
| **Layout** | Disposición del dashboard (widgets en rejilla de 12 columnas + paneles + board de export). |
| **Board (export)** | Composición del vídeo de exportación: ítems `widget`/`video`/`section` en rejilla. |
| **Supersampling** | Renderizar los widgets a 2× y reducirlos al componer (mejor antialiasing, más lento). |
| **CRF / Preset** | Parámetros de calidad/velocidad de libx264. |
| **Sidecar** | Binario FFmpeg empaquetado junto a la app (o del PATH como fallback). |
| **SessionFile** | `session.json` compacto: video + sync + telemetry + layout + `export?`. Ver [14](14-SESSION-FORMAT.md). |
| **PoC** | Prueba de concepto en `pocs/` que valida una parte del stack. |

## Puesta en marcha y verificación

```bash
npm install
npm run dev          # Electron + HMR
npm run build        # Build de producción
npm run test         # Vitest
npm run verify       # lint + typecheck + tests + build + smoke + e2e (gate completo)
```

Otros: `npm run smoke`, `npm run e2e` (12 pruebas), `npm run e2e:perf` (standalone),
`npm run screenshots`, `npm run lint`, `npm run typecheck`, `npm run poc:1`…`poc:4`.
Requiere Node 20+ (probado con Node 20) y FFmpeg como sidecar para exportar/transcodificar.

## Persistencia

- **Layouts** (solo los guardados por el usuario): `app.getPath('userData')/layouts/`.
- **Ajustes** (p. ej. config Serial): `userData/settings.json`.
- **Sesiones**: carpeta con `session.json` + copia del vídeo donde el usuario las guarde.
