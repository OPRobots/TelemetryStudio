# PoC 3: Video Export — WebCodecs + FFmpeg

## Objetivo
Capturar un widget uPlot como vídeo frame-a-frame usando WebCodecs API y generar un MP4 con FFmpeg.

## Arquitectura
```
Renderer Process                     Main Process
┌────────────────────────┐          ┌──────────────────────┐
│ OffscreenCanvas (1920x1080)      │ FFmpeg child process  │
│   → uPlot render       │          │   stdin ← h264 AnnexB│
│   → VideoFrame         │──IPC──→  │   ↓                  │
│   → VideoEncoder (H264)│          │ output.mp4           │
└────────────────────────┘          └──────────────────────┘
```

## Ejecutar
```bash
npm run poc:3
```

## Uso
1. Cargar Telemetría → seleccionar `examples/mock_telemetry.json`
2. Start Export → codifica 1800 frames (60s) a H.264
3. Save → guardar MP4 resultante

## Datos mock
- 1800 frames a 30fps (60 segundos)
- Señales: accX/Y/Z con sin/cos
- Spikes en frames 450, 900, 1350
- Regenerar: `bash examples/generate-mock.sh`

## Métricas de éxito
- [ ] `VideoEncoder.isConfigSupported()` = true (H.264)
- [ ] 1800 frames sin drops
- [ ] MP4 se reproduce en VLC/Chrome
- [ ] Export < 30s
- [ ] `encodeQueueSize` < 5
- [ ] Memory < 500MB
