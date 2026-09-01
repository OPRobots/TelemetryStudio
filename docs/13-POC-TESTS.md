# Pruebas de Concepto (PoCs) Obligatorias

Antes de iniciar la programación completa de la aplicación, se deben realizar 4 PoCs rápidas para validar que todo el stack funciona sin bloqueos. Cada PoC tiene criterios de éxito medibles.

---

## PoC 1: Serial UART → Widget en Tiempo Real

### Objetivo
Leer datos de telemetría de un STM32 vía UART y renderizarlos en un gráfico uPlot en tiempo real sin drops de FPS.

### Setup
- STM32 ejecutando firmware con `printf` de telemetría a 115200 baud
- Cable USB-UART conectado al PC
- Electron app mínima con serialport + uPlot

### Implementación
```
1. SerialPort.open() a 115200 baud
2. Pipe through ReadlineParser
3. Cada línea → parsear → emitir al EventBus
4. uPlot se suscribe al EventBus y redibuja
```

### Criterios de Éxito
- [ ] Detecta y abre el puerto serie correctamente
- [ ] Parsea las líneas de telemetría sin errores
- [ ] El gráfico uPlot se actualiza en vivo
- [ ] **60 FPS sostenidos** durante 60 segundos de streaming continuo
- [ ] La UI de Electron no se congela (botones responden, seek funciona)
- [ ] Memory leak test: 5 minutos de streaming sin incremento de RAM > 10 MB

### Comandos
```bash
# STM32 firmware (pseudo-código)
printf("T:%lu,S:%d,M:%d,%d,G:%d\n", millis(), speed, motorL, motorR, gyro);

# Electron
npx electron-vite dev
# Abrir consola del devtools → pestaña Performance → grabar 30s
```

### Riesgos identificados
- `serialport` puede fallar al abrir si el usuario no tiene permisos (Linux/macOS)
- `highWaterMark` puede necesitar tuning para baud rates altos

---

## PoC 2: Video-Telemetry Sync con requestVideoFrameCallback

### Objetivo
Sincronizar un vídeo MP4 de 30fps con telemetría temporal usando `requestVideoFrameCallback`, validando que el drift es < 1 frame.

### Setup
- Vídeo MP4 de 10 segundos a 30fps (300 frames)
- Archivo `session.json` de telemetría con timestamps alineados al vídeo
- El JSON debe tener un "pico" de datos en el frame exacto 150 (para validación visual)

### Implementación
```
1. Cargar MP4 en HTMLVideoElement
2. Cargar session.json → TelemetryDataset
3. Iniciar requestVideoFrameCallback loop
4. En cada callback: mediaTime → buscar TelemetryFrame más cercano
5. Renderizar: vídeo a la izquierda, gráfico uPlot a la derecha
6. Observar que el pico del gráfico coincide con el frame 150 del vídeo
```

### Criterios de Éxito
- [ ] `requestVideoFrameCallback` funciona nativamente en Electron (sin polyfill)
- [ ] El mediaTime (PTS) se obtiene correctamente del callback
- [ ] La búsqueda binaria O(log N) encuentra el frame correcto en < 0.1ms
- [ ] **Drift < 1 frame** (< 33ms a 30fps) durante reproducción continua de 10s
- [ ] Seek manual (adelante/atrás 1 frame) funciona correctamente
- [ ] Speed change (0.5x, 1x, 2x) mantiene la sincronización
- [ ] El polyfill se detecta y usa solo si RVFC no está disponible

### Medición de drift
```typescript
// En el callback:
const expectedTelemetryTime = mediaTime_s * 1000 + driftOffset_ms;
const actualTelemetryTime = closestFrame.timestamp_ms;
const drift = Math.abs(expectedTelemetryTime - actualTelemetryTime);
console.log(`Drift: ${drift.toFixed(1)}ms`);
// Debe ser < 33ms (1 frame a 30fps)
```

---

## PoC 3: Widget Canvas Export con WebCodecs

### Objetivo
Capturar el canvas de un widget (uPlot o Canvas custom) y composar frame-a-frame en un WebM de 30fps usando WebCodecs API + Mediabunny.

### Setup
- Widget uPlot con datos de telemetría renderizados
- 60 segundos de datos (1800 frames a 30fps)
- WebCodecs `VideoEncoder` + Mediabunny muxer

### Implementación
```
1. Crear OffscreenCanvas del tamaño de salida (1920x1080)
2. Para cada frame (0 a 1799):
   a. Renderizar widget actual en el OffscreenCanvas
   b. Crear VideoFrame del canvas
   c. Verificar encoder.encodeQueueSize < 2
   d. encoder.encode(frame, { keyFrame: every 60 frames })
   e. frame.close()
3. encoder.flush()
4. muxer.finalize()
5. Descargar WebM resultante
```

### Criterios de Éxito
- [ ] `VideoEncoder.isConfigSupported()` retorna `true` para H.264 y VP9
- [ ] Se generan los 1800 frames sin drops
- [ ] El WebM resultante se reproduce correctamente en VLC y Chrome
- [ ] Tiempo de exportación < 30 segundos para 60s de vídeo (real-time o más rápido)
- [ ] `encodeQueueSize` se mantiene < 5 durante la exportación
- [ ] El vídeo exportado tiene audio sincronizado (si hay audio)
- [ ] Memory usage no excede 500 MB durante la exportación

### Codecs a probar
```typescript
const configs = [
  { codec: 'avc1.42001f', label: 'H.264' },
  { codec: 'vp09.00.10.08.00', label: 'VP9' },
];

for (const config of configs) {
  const support = await VideoEncoder.isConfigSupported({
    ...config,
    width: 1920,
    height: 1080,
    bitrate: 5_000_000,
  });
  console.log(`${config.label}: ${support.supported ? 'SUPPORTED' : 'NOT SUPPORTED'}`);
}
```

---

## PoC 4: Native Module Packaging en 3 Plataformas

### Objetivo
Empaquetar la app con electron-builder y `serialport` funcionando en Windows, macOS y Linux desde un solo pipeline de CI/CD.

### Setup
- App Electron mínima con serialport que liste puertos disponibles
- electron-builder configurado
- CI/CD con runners para las 3 plataformas

### Implementación
```
1. Configurar electron-builder.yml con asarUnpack para serialport
2. Configurar electron-rebuild en postinstall
3. Build en cada plataforma:
   - Windows: .exe (NSIS) + portable
   - macOS: .dmg (universal binary)
   - Linux: .AppImage + .deb
4. Ejecutar la app empaquetada en cada plataforma
5. Verificar que serialport detecta puertos USB-UART
```

### Criterios de Éxito
- [ ] Build exitoso en las 3 plataformas sin errores
- [ ] La app empaquetada abre correctamente en cada plataforma
- [ ] `SerialPort.list()` retorna puertos disponibles en las 3 plataformas
- [ ] El puerto se abre y lee datos correctamente en las 3 plataformas
- [ ] Windows: NSIS installer + portable ambos funcionan
- [ ] macOS: DMG abre, app pasa notarization, serial funciona con CP210x
- [ ] Linux: AppImage ejecuta sin instalación, serial funciona con FTDI/CP210x
- [ ] Tamaño del paquete < 200 MB en cada plataforma
- [ ] La app se ejecuta sin permisos de administrador (excepto primer uso de serial en Linux)

### CI/CD
```yaml
# Build en paralelo para las 3 plataformas
jobs:
  build-windows: { runs-on: windows-latest }
  build-macos: { runs-on: macos-latest }
  build-linux: { runs-on: ubuntu-latest }
```

---

## Orden de Ejecución Recomendado

```
PoC 4 (Packaging)          ← Primero: validar que el stack empaqueta
    ↓
PoC 1 (Serial → Widget)    ← Segundo: validar pipeline de datos
    ↓
PoC 2 (Video Sync)         ← Tercero: validar sincronización
    ↓
PoC 3 (Video Export)       ← Cuarto: validar exportación (depende de todo lo anterior)
```

**Justificación**: Si el packaging falla (PoC 4), todo lo demás es inútil. Si el serial falla (PoC 1), el data engine no tiene datos. Si la sync falla (PoC 2), los widgets no se redibujan. Si la export falla (PoC 3), es el último feature en implementarse.

---

## Prueba de Estrés Adicional: 100Hz Telemetry Streaming

Para validar el rendimiento bajo carga real:

```
1. STM32 enviar telemetría a 100 Hz (10ms entre frames)
2. Cada frame contiene: timestamp, 8 sensores IR, 4 motores, IMU 6-DOF
3. Mantener streaming durante 10 minutos
4. Medir:
   - FPS del widget uPlot: debe mantener > 30 FPS
   - Memory delta: < 50 MB en 10 minutos
   - CPU usage: < 30% promedio
   - Dropped frames del serial: 0
   - UI responsiveness: < 16ms para clics
```
