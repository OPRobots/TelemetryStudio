# PoC 2: Video-Telemetry Sync

## Objetivo
Validar sincronización vídeo-telemetría usando `requestVideoFrameCallback` en Electron, con drift < 1 frame.

## Criterios de Éxito
- [ ] `requestVideoFrameCallback` funciona nativamente en Electron (sin polyfill)
- [ ] El mediaTime (PTS) se obtiene correctamente del callback
- [ ] La búsqueda binaria O(log N) encuentra el frame correcto en < 0.1ms
- [ ] **Drift < 33ms** durante reproducción continua de 10s
- [ ] Seek manual (step forward/backward) funciona correctamente
- [ ] Speed change (0.5x, 1x, 2x) mantiene la sincronización
- [ ] Spike en frame 150 visible en la gráfica al llegar a ese momento

## Datos Mock

El directorio `examples/` contiene datos generados para testing:
- `mock_video.mp4` — 10s, 30fps, 640x480, números de frame visibles
- `mock_telemetry.json` — 300 frames, spike en frame 150 (accX = 500)

Para regenerar:
```bash
cd pocs/02-video-sync/examples
bash generate-mock.sh
```

## Ejecución

Desde la raíz del proyecto:
```bash
npm run poc:2
```

1. Pulsar **Cargar Vídeo** → seleccionar `examples/mock_video.mp4`
2. Pulsar **Cargar Telemetría** → seleccionar `examples/mock_telemetry.json`
3. Pulsar **Play**
4. Observar: vídeo a la izquierda, gráfica uPlot a la derecha
5. Al llegar a frame ~150 (5s), la gráfica debe mostrar el spike de accX
6. Drift counter debe mantenerse < 33ms

## Controles
- **Play/Pause** — Iniciar/pausar reproducción
- **Step ◀/▶** — Avanzar/retroceder 1 frame
- **Speed 0.5x/1x/2x** — Cambiar velocidad de reproducción
- **Load Vídeo/Telemetría** — Cargar archivos via file dialog

## Métricas en pantalla
- **RVFC**: SOPORTADO / NO SOPORTADO
- **Frame**: índice del frame actual de telemetría
- **Drift**: drift actual (verde < 33ms, rojo > 33ms)
- **Drift avg**: drift promedio
- **Drift max**: drift máximo alcanzado
- **Search**: tiempo de búsqueda binaria en ms

## Archivos
| Archivo | Descripción |
|---|---|
| `main/index.ts` | Proceso principal: file dialogs + readFile IPC |
| `preload/index.ts` | API segura (openVideo, openTelemetry, readFile) |
| `src/App.tsx` | UI: video + uPlot + drift counter + controls |
| `src/types.d.ts` | Declaraciones TypeScript |
| `electron.vite.config.ts` | Config electron-vite |
| `examples/generate-mock.sh` | Generador de datos mock |
| `examples/mock_video.mp4` | Vídeo de prueba |
| `examples/mock_telemetry.json` | Telemetría de prueba |
