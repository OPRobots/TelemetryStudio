# OPRobots Telemetry Studio

Aplicación de escritorio multiplataforma para **análisis de telemetría de robots
de competición con vídeo sincronizado**. 100 % offline y portable.

> _Capturas de pantalla pendientes._

## Características

- **Vídeo + telemetría sincronizados**: abre un `.mp4`, reproduce el robot y
  visualiza la telemetría en el instante exacto del vídeo.
- **Serial en vivo**: conéctate a un robot por UART y captura todos los frames
  durante la reproducción.
- **Graficado por tipo de dato**: los campos numéricos van a gráficas, los
  bitmasks a matrices de LEDs, las posiciones a un minimapa y los estados a una
  línea temporal.
- **Layout configurable**: elige qué campos mostrar, varios valores en una misma
  gráfica, colores, tamaño y posición. Guarda y reutiliza layouts.
- **Sesiones**: guarda una sesión (`session.json` + copia del vídeo) y reábrela
  después con todo restaurado (datos, sincronización y layout).

## Requisitos

- Node.js 20+ y npm.
- Linux, macOS o Windows.
- FFmpeg _(se empaqueta como sidecar para la exportación de vídeo)_.

## Puesta en marcha

```bash
npm install
npm run dev        # desarrollo con HMR
```

## Uso

1. **Abrir vídeo**: carga el `.mp4` de la ejecución.
2. **Conectar Serial**: elige el puerto y el baud rate. Si el robot envía CSV
   posicional (`timestamp,accX,...`), ajusta los nombres de columna en el
   diálogo; también se aceptan formatos `T:ms,campo:valor`.
3. **Analizar**: los widgets se auto-configuran según los campos descubiertos.
   Reproduce el vídeo y las gráficas siguen la reproducción.
4. **Sincronizar**: ajusta el offset de drift en la barra lateral o pulsa
   "Alinear al inicio". El panel muestra el tiempo de telemetría actual.
5. **Guardar sesión**: crea una carpeta con el JSON y el vídeo.

### Atajos de teclado

| Tecla | Acción |
|---|---|
| `Espacio` | Reproducir / pausar |
| `←` / `→` | Frame anterior / siguiente |
| `+` / `−` | Aumentar / reducir velocidad |

## Probar sin hardware

Consulta [`examples/README.md`](examples/README.md). Con `socat` + el simulador
incluido puedes generar telemetría en un puerto virtual.

## Comandos

```bash
npm run dev          # Desarrollo (Electron + HMR)
npm run build        # Build de producción
npm run typecheck    # Verificación de tipos
npm run test         # Tests unitarios e integración (Vitest)
npm run smoke        # Smoke test del renderer
npm run e2e          # E2E: Serial→widgets y Vídeo→sync
npm run verify       # Gate completo (typecheck + tests + build + smoke + e2e)
```

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

## Licencia

MIT — autoría de robotaleh.
