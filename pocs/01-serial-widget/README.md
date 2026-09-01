# PoC 1: Serial UART → Widget

## Objetivo
Validar el pipeline completo: **Serial UART → parse → uPlot widget** en tiempo real con hardware real.

## Criterios de Éxito
- [ ] `SerialPort.list()` detecta el puerto conectado
- [ ] Se puede abrir el puerto a cualquier baud rate seleccionado
- [ ] Las líneas CSV se parsean correctamente a `TelemetryFrame`
- [ ] uPlot renderiza 4 series en vivo (accX/Y/Z, battery)
- [ ] **60 FPS sostenidos** durante 60 segundos de streaming
- [ ] La UI no se congela (botones responden, log se actualiza)
- [ ] Memory estable durante 5 minutos (sin incremento > 10 MB)

## Requisitos
- STM32 con UART habilitado (Nucleo-F4xx con ST-Link VCP recomendado)
- Cable USB (ST-Link integrado en Nucleo)
- `arm-none-eabi-gcc` + `libopencm3` (para compilar el firmware)

## 1. Compilar y flashear el firmware

```bash
cd pocs/01-serial-widget/examples

# Ajustar OPENCM3_TARGET en Makefile si es necesario:
#   OPENCM3_TARGET=stm32f401re  (Nucleo-F401RE)
#   OPENCM3_TARGET=stm32f446re  (Nucleo-F446RE)
#   OPENCM3_TARGET=stm32f103c8  (Blue Pill)

make
make flash
```

El firmware envía por UART2 (PA2 TX) a 115200 baud:
```
timestamp_ms,accX,accY,accZ,gyroX,gyroY,gyroZ,battery
```
A ~1 kHz (una línea cada ~1 ms).

## 2. Ejecutar la app Electron

```bash
# Desde la raíz del proyecto:
npm run poc:1
```

## 3. Conectar

1. Al abrir, la app **auto-lista** los puertos disponibles
2. Seleccionar el puerto del STM32 (típicamente `/dev/ttyACM0` en Linux)
3. Seleccionar baud rate (debe coincidir con el firmware: 115200 por defecto)
4. Pulsar **⟳ Refrescar** si el puerto no aparece
5. Pulsar **Conectar**
6. Observar: gráfica uPlot en vivo + FPS counter + log de líneas raw

## Archivos
| Archivo | Descripción |
|---|---|
| `main/index.ts` | Proceso principal: serialport + IPC + parseo CSV |
| `preload/index.ts` | API segura (listPorts, open, close, onFrame, onRaw) |
| `src/App.tsx` | UI: selectors, uPlot chart, FPS counter, log panel |
| `src/types.d.ts` | Declaraciones TypeScript para window.serialAPI |
| `index.html` | Entry HTML |
| `examples/stm32_telemetry.c` | Firmware STM32 (libopencm3) — datos de prueba |
| `examples/Makefile` | Build del firmware |
| `examples/telemetry.ino` | Sketch Arduino alternativo |
| `electron.vite.config.ts` | Config electron-vite |

## Formato de datos (CSV)

```
timestamp_ms,accX,accY,accZ,gyroX,gyroY,gyroZ,battery
```

- `timestamp_ms`: milisegundos desde boot del MCU
- `accX/Y/Z`: aceleración en m/s² (simulada con sin/cos)
- `gyroX/Y/Z`: velocidad angular en °/s
- `battery`: porcentaje de batería (decrementa linealmente)
