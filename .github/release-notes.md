# Telemetry Studio v1.0.0

Primera versión pública de **Telemetry Studio**: análisis de telemetría de robots de
competición con **vídeo sincronizado**. Funciona **100 % offline** y es **portable**.

## Capacidades

- **Vídeo + telemetría sincronizados** por timestamp (`requestVideoFrameCallback`), con
  conversión automática de códecs no soportados por Chromium (p. ej. HEVC/H.265 → H.264).
- **Serial en vivo** por UART — formatos **Default**, **CSV** y **Macroarray**, con reinicio
  automático de la captura y auto-layout de widgets según los campos descubiertos.
- **Widgets por tipo de dato**: gráficas temporales (uPlot + LTTB), matrices de LEDs,
  minimapa 2D y línea de estados (números o texto).
- **Cursor y zoom compartidos** entre todos los widgets.
- **Layouts** configurables, redimensionables por arrastre y guardables con **título y descripción**.
- **Sesiones** (`session.json` + vídeo) reabribles con todo restaurado, y **comparación A/B**
  en paralelo con reproducción, scroll, cursor y zoom sincronizados.
- **Exportación** a MP4 (FFmpeg sidecar) con el board de vídeo + widgets, resolución
  (`720p`–`2160p`), FPS (`30`/`60`), calidad, supersampling y **rango start–end** ajustables.

## Descargas

| Sistema | Instalador recomendado | Alternativa |
|---|---|---|
| **Windows** (x64) | `telemetry-studio-1.0.0-windows-setup.exe` | `telemetry-studio-1.0.0-windows-portable.exe` |
| **macOS** (Apple Silicon) | `telemetry-studio-1.0.0-macos-arm64.dmg` | — |
| **macOS** (Intel) | `telemetry-studio-1.0.0-macos-x64.dmg` | — |
| **Linux** (x64) | `telemetry-studio-1.0.0-linux.AppImage` | `telemetry-studio-1.0.0-linux.deb` |

## Notas

- La aplicación **todavía no está firmada**: Windows (SmartScreen) y macOS (Gatekeeper)
  mostrarán un aviso al abrirla. En macOS puedes abrirla con **clic derecho → Abrir**.
- **100 % offline** y **portable**: no requiere permisos de administrador ni conexión a red.
- Licencia **PolyForm Noncommercial 1.0.0**: se permite el uso personal y no comercial;
  queda prohibido el uso comercial.

## Documentación

- [README](https://github.com/OPRobots/TelemetryStudio#readme)
- [Documentación técnica](https://github.com/OPRobots/TelemetryStudio/tree/main/docs)
