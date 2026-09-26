# Telemetry Studio — Visión General del Proyecto

## ¿Qué es Telemetry Studio?

**Telemetry Studio** es una aplicación de escritorio multiplataforma (Windows, macOS, Linux) diseñada para el análisis de telemetría y reproducción de vídeo sincronizada de robots de competición del equipo OPRobots.

La aplicación está diseñada para funcionar **100% offline**, sin dependencias de CDNs, APIs externas o conexión a internet. Todos los assets están empaquetados dentro de la app o son locales.

## Casos de Uso Principales

| Disciplina | Datos típicos | Widgets necesarios |
|---|---|---|
| **Siguelíneas** | Sensores IR (8-16 bits), PWM motores, PID | DigitalBitmask, TimeSeriesChart, StateTimeline |
| **Robotracer** | Velocidad, orientación IMU, distancia | TimeSeriesChart, Minimap2D |
| **Micromouse** | Odometría (X,Y,Theta), mapa de laberinto | Minimap2D, TimeSeriesChart |
| **MiniSumo** | Sensores distancia, estado de combate | DigitalBitmask, StateTimeline |
| **Combat** | Energía, impactos, estado de motores | TimeSeriesChart, DigitalBitmask |

## Flujo de Trabajo

### Flujo A — Telemetría en Vivo (Serial + Vídeo)

El vídeo **siempre** es pregrabado. La telemetría llega por serial en vivo y se sincroniza con el vídeo.

1. Cargar un vídeo pregrabado (`.mp4`, `.webm`, `.mov`, `.mkv`; se recomienda
   `.mp4` H.264)
2. Conectar serial al robot (USB-UART, 115200 baud por defecto; el baud se elige de una lista de velocidades estándar)
3. Streaming de telemetría en vivo desde el microcontrolador (los widgets se
   auto-configuran según los campos descubiertos)
4. Calibrar la sincronización vídeo-telemetría (anchor point: frame del vídeo = `t=0` de la telemetría)
5. Análisis frame-a-frame con cursor temporal compartido entre widgets
6. Guardar sesión → exportar carpeta (`session.json` + copia del `.mp4`)
7. **Opcional**: exportar vídeo con gráficos superpuestos para redes sociales

> También se puede analizar telemetría **sin vídeo** (modo sin vídeo): la zona de
> telemetría ocupa toda la ventana.

### Flujo B — Revisión de Sesión Guardada

1. Cargar el `session.json` (el vídeo se resuelve en la misma carpeta)
2. Se restaura todo automáticamente: telemetría, widgets, sincronización, layout y
   (si existe) el board de exportación. El vídeo se **coloca en el anchor**, de modo
   que la reproducción empieza en `00:00` relativo.
3. Revisar datos, ajustar drift si es necesario
4. Analizar frame-a-frame como en el Flujo A

### Flujo C — Comparación Side-by-Side (máx. 2 sesiones)

1. Cargar sesión A como referencia (desde Flujo A o B)
2. Cargar sesión B (nueva sesión serial u otra sesión guardada)
3. La interfaz se duplica en paralelo, con un divisor vertical:

```
┌──────────────────┬──────────────────┐
│ Sesión A (actual)│ Sesión B (comp.) │
│  Vídeo + Widgets │  Vídeo + Widgets │
└──────────────────┴──────────────────┘
```

4. Ambos vídeos y gráficas sincronizados al mismo tiempo (reproducción y
   navegación **siempre simétricas**)
5. Scroll de widgets sincronizado entre A y B; el cursor (hover) y el **zoom**
   (rango de timestamps) también son compartidos
6. Los widgets deben ser idénticos en ambas sesiones; si difieren → error explicativo
7. Ideal para comparar runs con diferentes configuraciones de parámetros

### Exportación de Contenido para Redes Sociales

La funcionalidad de exportación de vídeo genera un archivo **MP4 (H.264)** con los gráficos de telemetría superpuestos sobre el vídeo base. El renderer compone los frames en un canvas offscreen (`ExportStage`) y los envía como **raw RGBA a FFmpeg** (sidecar empaquetado o del PATH). Es un asistente de 2 pasos (layout del board + salida). **Requiere telemetría cargada** (el vídeo es opcional). Está diseñada para crear contenido para redes sociales del equipo, no es parte del flujo de análisis principal.

## Restricciones Técnicas Clave

- **OFFLINE absoluto**: Cero conexiones de red. Todo empaquetado.
- **Portable**: Ejecutables sin necesidad de permisos de instalación admin.
- **Alta frecuencia**: Pensado para datos de 100 Hz a 1 kHz (objetivo; sin garantía de caudal).
- **Sesiones portables**: Formato `.json` compacto + `.mp4` para intercambio y reanálisis
- **Sincronización frame-a-frame**: `requestVideoFrameCallback`; se miden
  `averageDrift`/`maxDrift` (objetivo ≈ 1 frame, no garantizado).
- **Comparación**: dos sesiones en paralelo (A izquierda / B derecha). El
  `ComparisonManager` impone **una sola comparación activa** a la vez.
- **Exportación para redes**: MP4 H.264 con gráficos superpuestos (composición en canvas
  + FFmpeg sidecar). Requiere telemetría cargada (el vídeo es opcional).

## Arquitectura Modular (4 Pilares)

```
┌─────────────────────────────────┐
│    ENTRADA DE DATOS             │
│  UART Serial │ JSON Sesión      │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│   DATA ENGINE & EVENT BUS       │
│  TelemetryFrame │ LTTB │ Bus   │
│  FrameBus (por panel)           │
│  (máx. 2 datasets: primario +   │
│   comparación)                  │
└───┬───────────────────────┬─────┘
    │                       │
┌───▼───────────┐  ┌────────▼──────────┐
│ WIDGETS (UI)  │  │ VIDEO SYNC        │
│ Charts, LEDs, │  │ MP4 Player, RVFC  │
│ Minimap, State│  │ Anchor, Drift     │
│ (duplicados   │  │ (2 synchronizers  │
│ en comparación)│  │  en comparación)  │
└───────────────┘  └───────────────────┘

        El mismo `ExportStage` reutiliza widgets + sync para componer
        la exportación (canvas offscreen → FFmpeg).
```

## Menú nativo

Estructura agrupada por tareas (en macOS se añade además el menú de app estándar):

- **Archivo**: Abrir/Cerrar vídeo, Abrir/Guardar/Explorar sesión, Exportar vídeo y
  (en Windows/Linux) Salir; en macOS, Salir va en el menú de la app.
- **Datos**: Conectar/Desconectar Serial, Comparar / Salir de comparación.
- **Ver**: Inspector (`Ctrl+B`, con estado), Nuevo layout…, Layouts…, Pantalla completa.
- **Desarrollo** (solo en desarrollo): Recargar, Forzar recarga, Herramientas de desarrollo.
- **Ayuda**: enlaces a **OPRobots** y **@robotaleh**, y **Acerca de…**.

Los ítems sensibles se habilitan/desactivan según el estado (Serial conectado, vídeo cargado,
datos disponibles, comparación activa) y el inspector es un **checkbox** que refleja su
visibilidad. El renderer sincroniza ese estado al menú por IPC (`menu:set-state`).

## Acerca de

El diálogo **Acerca de…** muestra el **logo de la app**, la versión y créditos con enlaces
(usando los favicons de cada web): **robotaleh** ([robotaleh.dev](https://robotaleh.dev),
[github.com/robotaleh](https://github.com/robotaleh)) y **OPRobots**
([OPRobots.org](https://oprobots.org), [github.com/OPRobots](https://github.com/OPRobots)).
Indica que ha sido desarrollado por **@robotaleh** con la ayuda de **DeepSeek**, para uso
personal en OPRobots, bajo la **PolyForm Noncommercial License 1.0.0** (uso no comercial;
queda prohibido el uso comercial).

## Equipo Objetivo

Ingenieros de software y control de OPRobots que necesitan:
- Diagnosticar comportamiento del robot a pie de pista
- Comparar runs de entrenamiento/competición (side-by-side)
- Generar vídeos para redes sociales con telemetría superpuesta
- Ajustar parámetros PID observando la respuesta temporal
- Compartir sesiones completas (vídeo + datos + config) con el equipo
