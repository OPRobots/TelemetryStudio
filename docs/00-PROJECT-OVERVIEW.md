# OPRobots Telemetry Studio — Visión General del Proyecto

## ¿Qué es Telemetry Studio?

**OPRobots Telemetry Studio** es una aplicación de escritorio multiplataforma (Windows, macOS, Linux) diseñada para el análisis de telemetría y reproducción de vídeo sincronizada de robots de competición del equipo OPRobots.

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

1. Cargar vídeo `.mp4` pregrabado (drag-and-drop o diálogo de archivos)
2. Conectar serial al robot (USB-UART, 115200 / 460800 / 921600 baud)
3. Streaming de telemetría en vivo desde el microcontrolador
4. Esperar a que termine el stream → campos disponibles con sus nombres
5. Configurar widgets (agrupar parámetros en gráficas, ej: `target_linear_speed`, `ideal_linear_speed`, `measured_linear_speed` en una misma gráfica)
6. Calibrar sincronización vídeo-telemetría (anchor point: frame del vídeo = timestamp del serial)
7. Análisis frame-a-frame con barra vertical sincronizada al milisegundo
8. Guardar sesión → exportar carpeta (`session.json` + copia del `.mp4`)
9. **Opcional**: exportar vídeo con gráficos superpuestos para redes sociales

### Flujo B — Revisión de Sesión Guardada

1. Cargar sesión (carpeta con `session.json` + `.mp4`)
2. Se restaura todo automáticamente: telemetría, widgets, sincronización
3. Revisar datos, ajustar drift si es necesario
4. Analizar frame-a-frame como en el Flujo A

### Flujo C — Comparación Side-by-Side (máx. 2 sesiones)

1. Cargar sesión A como referencia (desde Flujo A o B)
2. Cargar sesión B (nueva sesión serial o另一sesión guardada)
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

La funcionalidad de exportación de vídeo genera archivos MP4/WebM con los gráficos de telemetría superpuestos sobre el vídeo base. Está diseñada para crear contenido para redes sociales del equipo, no es parte del flujo de análisis principal.

## Restricciones Técnicas Clave

- **OFFLINE absoluto**: Cero conexiones de red. Todo empaquetado.
- **Portable**: Ejecutables sin necesidad de permisos de instalación admin.
- **Alta frecuencia**: Soporte para datos de 100 Hz a 1 kHz.
- **Sesiones portables**: Formato `.json` compacto + `.mp4` para intercambio y reanálisis
- **Sincronización frame-a-frame**: `requestVideoFrameCallback` con drift < 1 frame.
- **Comparación**: Máximo 2 sesiones simultáneas, interfaz en paralelo (A izquierda / B derecha) con divisor vertical.
- **Exportación para redes**: MP4/WebM con gráficos superpuestos (WebCodecs + Worker).

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
│  (máx. 2 datasets: primario +  │
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
```

## Equipo Objetivo

Ingenieros de software y control de OPRobots que necesitan:
- Diagnosticar comportamiento del robot a pie de pista
- Comparar runs de entrenamiento/competición (side-by-side)
- Generar vídeos para redes sociales con telemetría superpuesta
- Ajustar parámetros PID observando la respuesta temporal
- Compartir sesiones completas (vídeo + datos + config) con el equipo
