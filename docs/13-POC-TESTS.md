# Pruebas de Concepto (PoCs)

Los PoCs validan que el stack funciona antes de construir la app completa. Viven en
`pocs/` como referencia de funcionamiento. Hay **5 PoCs**.

---

## PoC 1: Serial UART → Widget en Tiempo Real — ✅ Validado (hardware real)

**Objetivo**: leer telemetría de un STM32 vía UART y renderizarla en uPlot sin drops.

**Criterios**
- [x] Detecta y abre el puerto serie correctamente
- [x] Parsea las líneas de telemetría sin errores
- [x] El gráfico uPlot se actualiza en vivo
- [x] UI de Electron fluida (botones y seek responden)
- [x] Stream sostenido sin incremento apreciable de RAM

**Firmware de referencia**: `pocs/05-telemetry-sender/` (emisor STM32).

---

## PoC 2: Video-Telemetry Sync con requestVideoFrameCallback — ✅ Funcional

**Objetivo**: sincronizar un MP4 con telemetría temporal, con drift < 1 frame.

**Criterios**
- [x] `requestVideoFrameCallback` funciona nativamente en Electron (con polyfill de respaldo)
- [x] Se usa el `mediaTime` (PTS) del callback
- [x] Búsqueda binaria O(log N) del frame más cercano
- [x] Drift < 1 frame durante reproducción continua
- [x] Seek manual (adelante/atrás 1 frame) correcto
- [x] Cambio de velocidad (0.5x, 1x, 2x) mantiene la sincronización
- [x] El polyfill solo se usa si RVFC no está disponible

**Medición**: `drift = |mediaTime_s·1000 + offset − frame.timestamp_ms|` (el e2e
`e2e:video` valida el sync 1 s de vídeo → 1000 ms de telemetría).

---

## PoC 3: Widget Canvas Export — ✅ Completado

**Objetivo**: capturar la composición (vídeo + widgets) y codificarla en MP4.

**Implementación final (real)**: el renderer compone cada frame en un **canvas** y
lo envía como **raw RGBA** por IPC al Main Process, que ejecuta **FFmpeg**
(`libx264 -crf 18 -preset fast`) leyendo de `stdin`. Se descartó WebCodecs/Muxer
JS por su fragilidad en entornos sin GPU.

**Criterios**
- [x] Se generan los frames del rango sin drops relevantes
- [x] El MP4 resultante se reproduce correctamente (validado con ffprobe)
- [x] Exportación más rápida que tiempo real
- [x] Memory usage contenido (streaming a `stdin` con backpressure)
- [x] El progreso se reporta en el renderer

---

## PoC 4: Native Module Packaging — 🟡 Linux OK; Windows/macOS manual

**Objetivo**: empaquetar con electron-builder y `serialport` funcionando.

**Criterios**
- [x] Build Linux (AppImage + deb) sin errores y app abre
- [x] `SerialPort.list()` funciona en la app empaquetada (Linux)
- [x] Tamaño de paquete < 200 MB (AppImage ~109 MB, deb ~75 MB)
- [ ] Windows: `.exe` (NSIS) + portable — build manual pendiente
- [ ] macOS: `.dmg` (universal) — build manual pendiente
- [ ] Serial en las 3 plataformas empaquetadas (Windows pendiente)

---

## PoC 5: Emisor de telemetría de prueba (STM32) — ✅ Firmware de prueba

Firmware PlatformIO (STM32F401CC + libopencm3) que envía telemetría simulada a
100 Hz durante 10 s por UART a 115200 baud, con los 4 tipos de datos que la app sabe
graficar:

- `adc1..adc4` (numérico multi-serie)
- `ir_sensors` (bitmask IR de 24 bits en hex)
- `pos_x`, `pos_y` (trayectoria figure-8)
- `state` (número 0–5), `state_run` (**texto**) y `state_debug` (número 0–3) → valida
  el parseo de strings y **un `StateTimeline` por cada `state_*`**.

- Directorio: `pocs/05-telemetry-sender/`
- Formato: genérico con claves `T:<ms>,campo:valor,...`
- Uso: `pio run -t upload` y conectar por Serial a 115200 en la app.
- Pinout y configuración de placa: ver su `README.md`.

> `ir_sensors` se envía en hexadecimal (`0x...`): el parser lo infiere como `bitmask`
> y el auto-layout crea el `DigitalBitmask` con los 24 bits en una sola fila.

---

## Orden de Ejecución Recomendado

```
PoC 4 (Packaging)          ← Primero: validar que el stack empaqueta
    ↓
PoC 1 (Serial → Widget)    ← Segundo: validar el pipeline de datos
    ↓
PoC 2 (Video Sync)         ← Tercero: validar la sincronización
    ↓
PoC 3 (Video Export)       ← Cuarto: validar la exportación
    ↓
PoC 5 (Emisor STM32)       ← Fuente de datos de prueba para validar los 4 widgets
```

**Justificación**: si el packaging falla (PoC 4), lo demás es inútil; si el serial
falla (PoC 1), el data engine no tiene datos; si la sync falla (PoC 2), los widgets
no se redibujan; la export (PoC 3) es el último feature. El PoC 5 aporta un emisor
de datos reproducible para probar todos los widgets sin hardware del robot.

---

## Prueba de Estrés Adicional: 100 Hz Telemetry Streaming (pendiente)

1. STM32 enviando telemetría a 100 Hz (10 ms entre frames).
2. Mantener durante varios minutos.
3. Medir: FPS del widget (uPlot > 30), memory delta contenido, CPU < 30 %,
   sin drops del serial y UI responsiva (< 16 ms para clics).
