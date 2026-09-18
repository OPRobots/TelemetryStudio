# Telemetry Studio

Aplicación de escritorio multiplataforma para **análisis de telemetría de robots
de competición con vídeo sincronizado**. 100 % offline y portable.

![Análisis de telemetría con vídeo sincronizado](docs/assets/analysis.png)

## Características

- **Vídeo + telemetría sincronizados**: abre un `.mp4`, reproduce el robot y
  visualiza la telemetría en el instante exacto del vídeo.
- **Serial en vivo**: conéctate a un robot por UART y captura todos los frames
  durante la reproducción. Volver a empezar la transmisión (tras unos segundos
  en reposo o con `t=0`) reinicia la captura desde cero automáticamente.
- **Graficado por tipo de dato**: los campos numéricos van a gráficas, los
  bitmasks a matrices de LEDs (todos los bits en una fila), las posiciones a un
  minimapa y los estados a una línea temporal. Los estados pueden ser números o
  **texto**.
- **Widgets sincronizados**: al pasar el ratón por encima de una gráfica o de
  una línea temporal, el resto de indicadores se desplazan a ese instante; el
  **zoom** (rango seleccionado) se comparte entre todos ellos.
- **Layout configurable**: elige qué campos mostrar, varios valores en una misma
  gráfica, colores, tamaño y posición. Los widgets se redimensionan y reordenan
  arrastrando; guarda y reutiliza layouts.
- **Sesiones**: guarda una sesión (`session.json` + copia del vídeo) y reábrela
  después con todo restaurado (datos, sincronización y layout).
- **Comparación**: analiza dos sesiones en paralelo (panel actual a la izquierda,
  sesión comparada a la derecha, con divisor vertical), con widgets idénticos y
  reproducción, scroll, cursor y zoom sincronizados.
- **Exportación**: genera un `.mp4` con el vídeo y los widgets superpuestos para
  compartir en redes (FFmpeg empaquetado como sidecar).

## Requisitos

- Node.js 20+ y npm.
- Linux, macOS o Windows.
- FFmpeg _(se empaqueta como sidecar para la exportación de vídeo y la conversión
  de códecs)_.
gen
## Puesta en marcha

```bash
npm install
npm run dev        # desarrollo con HMR
```

## Uso

1. **Abrir vídeo**: carga el `.mp4` de la ejecución. Se recomienda **H.264**;
   si el vídeo usa un códec no soportado por Chromium (p. ej. **HEVC/H.265**,
   habitual en móviles) se **convierte automáticamente a H.264** con FFmpeg.
2. **Conectar Serial**: elige el puerto y el baud rate. Si el robot envía CSV
   posicional (`timestamp,accX,...`), ajusta los nombres de columna en el
   diálogo; también se aceptan formatos `T:ms,campo:valor`.
3. **Analizar**: los widgets se auto-configuran según los campos descubiertos.
   Reproduce el vídeo y las gráficas siguen la reproducción.
4. **Sincronizar**: con el vídeo cargado, pausa en el frame que marca el inicio y
   pulsa **«Alinear aquí»** (ese frame pasa a ser `t=0` de la telemetría). El
   timeline pasa a mostrar tiempo relativo. Usa **Reset** para deshacer.
5. **Comparar**: abre la sesión de referencia para verla junto a la actual.
6. **Cerrar vídeo**: el botón `✕` del header de vídeo (o **Archivo → Cerrar
   vídeo**) lo oculta y vuelve al **modo sin vídeo** (la telemetría ocupa todo).
7. **Guardar sesión**: crea una carpeta con el JSON y el vídeo.

### Atajos de teclado

| Tecla | Acción |
|---|---|
| `Espacio` | Reproducir / pausar |
| `←` / `→` | Frame anterior / siguiente |
| `+` / `−` | Aumentar / reducir velocidad |
| `Home` / `End` | Ir al inicio / final |

## Probar sin hardware

Consulta [`examples/README.md`](examples/README.md). Con `socat` + el simulador
incluido puedes generar telemetría en un puerto virtual. El PoC 5
(`pocs/05-telemetry-sender/`) es un firmware STM32 que envía telemetría de prueba.

## Comandos

```bash
npm run dev          # Desarrollo (Electron + HMR)
npm run build        # Build de producción
npm run typecheck    # Verificación de tipos
npm run test         # Tests unitarios e integración (Vitest)
npm run lint         # ESLint
npm run smoke        # Smoke test del renderer
npm run e2e          # 12 pruebas e2e (serial, vídeo, comparación, export, widgets, layouts...)
npm run e2e:perf     # Medición de rendimiento (standalone; stream y vídeo)
npm run screenshots  # Regenera las capturas de docs/assets
npm run verify       # Gate completo (lint + typecheck + tests + build + smoke + e2e)
```

## Capturas

**Modo sin vídeo** — la telemetría ocupa toda la ventana.

![Modo sin vídeo](docs/assets/no-video.png)

**Comparación de dos sesiones** en paralelo, con reproducción, scroll, cursor y zoom
sincronizados.

![Comparación A/B](docs/assets/comparison.png)

**Exportación** a `.mp4` con los widgets superpuestos.

![Exportar vídeo con overlays](docs/assets/export.png)

## Permisos de Serial (Linux)

```bash
sudo usermod -a -G dialout $USER   # cerrar sesión y volver a entrar
```

## Documentación

La documentación técnica completa está en [`docs/`](docs/):

- [Visión general](docs/00-PROJECT-OVERVIEW.md)
- [Arquitectura](docs/01-ARCHITECTURE.md)
- [Modelo de datos](docs/04-DATA-MODEL.md)
- [Sincronización vídeo](docs/06-VIDEO-SYNC.md)
- [Sistema de widgets](docs/08-WIDGET-SYSTEM.md)
- [Formato de sesión](docs/14-SESSION-FORMAT.md)
- [Roadmap](ROADMAP.md)

## Créditos

Desarrollado por **[@robotaleh](https://robotaleh.dev)** ([GitHub](https://github.com/robotaleh))
con la ayuda de [DeepSeek](https://deepseek.com), para uso personal en
[OPRobots](https://oprobots.org) ([GitHub](https://github.com/OPRobots)).

## Licencia

[PolyForm Noncommercial License 1.0.0](LICENSE) — autoría de robotaleh. Se permite el uso
**personal y no comercial**; queda **prohibido el uso comercial**. Texto completo en
[`LICENSE`](LICENSE).
