# PoC 05 — STM32 Telemetry Sender

Firmware de prueba para STM32F401CC (WeAct Black Pill) que envía telemetría simulada a 100 Hz durante 10 segundos por UART (115200 baud). Sirve para validar los 4 tipos de gráficos de OPRobots Telemetry Studio.

## Gráficos probados

| Widget | Campo(s) | Simulación |
|---|---|---|
| TimeSeriesChart | `adc1`, `adc2`, `adc3`, `adc4` | 4 ondas seno a diferentes frecuencias (0–4095) |
| DigitalBitmask | `ir_sensors` | Array de 24 sensores de siguelíneas (bitmask hex 24-bit) |
| Minimap2D | `pos_x`, `pos_y` | Trayectoria de ocho (lemniscata) simulando robotracer |
| StateTimeline | `state` | FSM numérico con 6 estados (0–5) |
| StateTimeline | `state_run` (texto) | Los mismos estados como texto: IDLE → RUNNING → TURNING → SEARCHING → LOST → FINISHED (valida el parseo de strings) |
| StateTimeline | `state_debug` | Sub-estado numérico 0–3 (cambia cada 600 ms) |

## Formato de salida

Una línea por frame, formato generic keyed:

```
T:100,adc1:3071,adc2:1024,adc3:4095,adc4:0,ir_sensors:0x001FFE,pos_x:45.20,pos_y:89.10,state:1,state_run:RUNNING,state_debug:2
```

## Requisitos

- [PlatformIO CLI](https://docs.platformio.org/en/latest/core/installation.html) o extensión VSCode
- `arm-none-eabi-gcc` (instalado por PlatformIO automáticamente)
- `libopencm3` (instalado por PlatformIO automáticamente)
- `st-flash` / OpenOCD (para flashear vía STLink)

## Build

```bash
cd pocs/05-telemetry-sender

pio run                        # compilar
pio run -t upload              # compilar + flashear
pio device monitor             # monitor serial (115200 baud)
```

## Uso con OPRobots Telemetry Studio

1. Flashear el firmware (`pio run -t upload`)
2. Conectar la placa por USB (puerto serie)
3. Abrir OPRobots Telemetry Studio → pestaña Serial
4. Seleccionar puerto COM, baud rate **115200**
5. Conectar → automáticamente aparecerán los datos de prueba durante 10 segundos

## Estructura del proyecto

```
├── platformio.ini          Configuración PlatformIO (Black Pill STM32F401CC + libopencm3)
├── openocd_reset.cfg       Reset config para STLink sin NRST
├── include/
│   ├── config.h            Constantes de clock (84 MHz, 1 kHz SysTick)
│   ├── setup.h             Declaración de setup()
│   ├── delay.h             API de timing (ms + µs)
│   ├── usart.h             Redirección de printf
│   └── telemetry.h         Generadores de datos de prueba
├── src/
│   ├── main.c              Entry point, main loop 100 Hz
│   ├── setup.c             Init clock, GPIO, USART1, SysTick, DWT
│   ├── delay.c             SysTick ms + DWT µs timing
│   ├── usart.c             _write() → USART1 blocking
│   └── telemetry.c         4 generadores: sine, IR bitmask, figure-8, FSM
└── README.md
```

## Configuración de la placa

Editar en `src/setup.c`:

```c
/* LED heartbeat — cambiar según tu placa */
gpio_mode_setup(GPIOB, GPIO_MODE_OUTPUT, GPIO_PUPD_NONE, GPIO12);

/* USART1 TX/RX — cambiar según tu placa */
gpio_mode_setup(GPIOA, GPIO_MODE_AF, GPIO_PUPD_NONE, GPIO9 | GPIO10);
gpio_set_af(GPIOA, GPIO_AF7, GPIO9 | GPIO10);
```

### Pinout por placa común

| Placa | USART1 TX/RX | LED |
|---|---|---|
| WeAct Black Pill F401CC | PA9/PA10 | PB12 (firmware) — el LED onboard es PC13 |
| Generic STM32F401 board | PA9/PA10 | PB12 o PC13 |

### Clock

El firmware usa **25 MHz HSE** (cristal de la Black Pill) → PLL a **84 MHz**. `include/config.h` define `SYSCLK_FREQUENCY_HZ 84000000`, que es lo que usan SysTick (`delay()` en ms) y el contador µs de DWT (`delay_us()`); si cambias el PLL hay que actualizar ambos.

```c
// src/setup.c — actual
rcc_clock_setup_pll(&rcc_hse_25mhz_3v3[RCC_CLOCK_3V3_84MHZ]);
```

## Board en PlatformIO

El `platformio.ini` usa `board = blackpill_f401cc` (WeAct Black Pill F401CCU6, HSE 25 MHz). Si tu placa es otra, cambia el board:

```ini
; El usado por este PoC:
board = blackpill_f401cc

; Alternativa (Nucleo F401RE, placa de evaluación):
board = nucleo_f401re
```
