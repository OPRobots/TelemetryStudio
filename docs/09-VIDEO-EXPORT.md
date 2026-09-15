# Exportación de Contenido para Redes Sociales

> **Estado**: implementado (Fase 7). `src/services/video-exporter.ts` compone el
> vídeo base + widgets + overlay en un canvas y envía frames raw RGBA a
> `src/main/export-service.ts`, que ejecuta **FFmpeg** (sidecar empaquetado o
> del PATH). El diseño con WebCodecs + Mediabunny de este documento no se siguió;
> se conserva como referencia. La sección "Alternativa: FFmpeg" es el enfoque real.

## Visión General

Esta funcionalidad genera vídeos MP4/WebM con los gráficos de telemetría superpuestos sobre el vídeo base. Está diseñada para crear contenido para redes sociales del equipo OPRobots (Instagram, TikTok, YouTube Shorts, etc.), **no** es parte del flujo de análisis principal.

```
Renderer Process                    Export Worker
┌────────────────────┐             ┌─────────────────────┐
│ Widget Canvas #1   │──capture──→ │ OffscreenCanvas     │
│ Widget Canvas #2   │──capture──→ │   (composite)       │
│ Video Player       │──capture──→ │                     │
│                    │             │   ↓                 │
│ Progress IPC ←─────│←──────────  │ VideoEncoder        │
│                    │             │   (WebCodecs)       │
│ File Write ←───────│←──────────  │   ↓                 │
│                    │             │ Mediabunny Muxer    │
└────────────────────┘             │   ↓                 │
                                   │ .mp4 / .webm file   │
                                   └─────────────────────┘
```

## Orquestador de Exportación

```typescript
// src/services/video-exporter.ts

import { ipcRenderer } from 'electron';
import type { ExportConfig, VideoFrameContext } from '@core/types/video';
import type { TelemetryFrame } from '@core/types/telemetry';

interface ExportProgress {
  percent: number;
  currentFrame: number;
  totalFrames: number;
  elapsedTime_ms: number;
  estimatedRemaining_ms: number;
}

class VideoExporterService {
  private isExporting: boolean = false;
  private abortController: AbortController | null = null;

  /**
   * Inicia el proceso de exportación.
   *
   * @param config - Configuración de exportación
   * @param getFrameAt - Función para obtener un frame de telemetría por índice
   * @param getTotalFrames - Función para obtener el total de frames
   * @param onProgress - Callback de progreso
   * @returns Promesa que resuelve con la ruta del archivo exportado
   */
  async export(
    config: ExportConfig,
    getFrameAt: (index: number) => TelemetryFrame | null,
    getTotalFrames: () => number,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<string> {
    if (this.isExporting) {
      throw new Error('Export already in progress');
    }

    this.isExporting = true;
    this.abortController = new AbortController();
    const startTime = performance.now();

    try {
      const totalFrames = config.endFrame - config.startFrame + 1;

      // Enviar configuración al Main Process para crear el writer
      await ipcRenderer.invoke('export:init', config);

      // Capturar frames del canvas de cada widget
      for (let i = config.startFrame; i <= config.endFrame; i++) {
        if (this.abortController.signal.aborted) {
          throw new Error('Export cancelled');
        }

        const frameIndex = i - config.startFrame;

        // Obtener frame de telemetría
        const frame = getFrameAt(i);
        if (!frame) continue;

        // Capturar composición del canvas actual
        const imageData = await this.captureComposition(config, frame);

        // Enviar chunk de vídeo al Main Process
        await ipcRenderer.invoke('export:writeFrame', frameIndex, imageData);

        // Reportar progreso
        if (onProgress && frameIndex % 10 === 0) {
          const elapsed = performance.now() - startTime;
          const progress = (frameIndex + 1) / totalFrames;
          onProgress({
            percent: Math.round(progress * 100),
            currentFrame: frameIndex + 1,
            totalFrames,
            elapsedTime_ms: elapsed,
            estimatedRemaining_ms: (elapsed / progress) * (1 - progress),
          });
        }
      }

      // Finalizar y guardar archivo
      const outputPath = await ipcRenderer.invoke('export:finalize');

      this.isExporting = false;
      return outputPath;

    } catch (error) {
      this.isExporting = false;
      await ipcRenderer.invoke('export:abort').catch(() => {});
      throw error;
    }
  }

  /**
   * Captura la composición actual de todos los widgets + vídeo base.
   */
  private async captureComposition(
    config: ExportConfig,
    _frame: TelemetryFrame
  ): Promise<ImageData> {
    // Crear OffscreenCanvas del tamaño de salida
    const canvas = new OffscreenCanvas(config.width, config.height);
    const ctx = canvas.getContext('2d')!;

    // 1. Dibujar fondo negro
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, config.width, config.height);

    // 2. Dibujar vídeo base (si está habilitado)
    if (config.includeBaseVideo) {
      const video = document.querySelector('video');
      if (video) {
        ctx.drawImage(video, 0, 0, config.width, config.height);
      }
    }

    // 3. Dibujar widgets activos
    for (const widgetId of config.includedWidgets) {
      const widgetCanvas = document.querySelector(
        `[data-widget-id="${widgetId}"] canvas`
      ) as HTMLCanvasElement | null;

      if (widgetCanvas) {
        // Calcular posición y tamaño del widget en la composición
        const rect = widgetCanvas.getBoundingClientRect();
        const scaleX = config.width / rect.width;
        const scaleY = config.height / rect.height;

        ctx.drawImage(
          widgetCanvas,
          rect.left * scaleX,
          rect.top * scaleY,
          rect.width * scaleX,
          rect.height * scaleY
        );
      }
    }

    // 4. Dibujar overlays (si están habilitados)
    if (config.includeOverlays) {
      this.renderOverlays(ctx, config);
    }

    return ctx.getImageData(0, 0, config.width, config.height);
  }

  /**
   * Renderiza los overlays de texto sobre el vídeo.
   * Incluye nombre de sesión si está configurado.
   */
  private renderOverlays(
    ctx: OffscreenCanvasRenderingContext2D,
    config: ExportConfig
  ): void {
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Mostrar nombre de sesión si está configurado
    const label = config.sessionLabel ?? 'OPRobots Telemetry Studio';
    ctx.fillText(label, 20, 20);
  }

  /**
   * Cancela la exportación en curso.
   */
  cancel(): void {
    this.abortController?.abort();
  }

  /**
   * Verifica si hay una exportación en curso.
   */
  get isRunning(): boolean {
    return this.isExporting;
  }
}

export const videoExporter = new VideoExporterService();
```

## Worker de Exportación (en Main Process)

```typescript
// src/main/export-service.ts

import { ipcMain, BrowserWindow } from 'electron';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';

/**
 * Servicio de exportación que corre en el Main Process.
 * Recibe frames del Renderer y los escribe a disco.
 */
class ExportService {
  private frames: Map<number, ImageData> = new Map();
  private outputPath: string = '';
  private config: ExportConfig | null = null;

  register(): void {
    ipcMain.handle('export:init', async (_event, config: ExportConfig) => {
      this.config = config;
      this.frames.clear();

      // Crear directorio de salida
      const outputDir = join(app.getPath('temp'), 'oprobots-export');
      await mkdir(outputDir, { recursive: true });

      const ext = config.format === 'mp4' ? '.mp4' : '.webm';
      this.outputPath = join(outputDir, `export_${Date.now()}${ext}`);
    });

    ipcMain.handle('export:writeFrame', async (_event, frameIndex: number, imageData: ImageData) => {
      this.frames.set(frameIndex, imageData);

      // Para archivos grandes, escribir incrementalmente
      // Por ahora, acumulamos en memoria y escribimos al final
    });

    ipcMain.handle('export:finalize', async () => {
      // TODO: Aquí se usaría Mediabunny o FFmpeg para
      // convertir los ImageData frames en un vídeo codificado

      // Por ahora, escribir como secuencia de PNGs (placeholder)
      if (this.config) {
        await this.writeAsPNGSequence();
      }

      const resultPath = this.outputPath;
      this.frames.clear();
      this.config = null;
      return resultPath;
    });

    ipcMain.handle('export:abort', async () => {
      this.frames.clear();
      this.config = null;
    });
  }

  private async writeAsPNGSequence(): Promise<void> {
    // Placeholder: en producción esto usaría Mediabunny para MP4/WebM
    const dir = join(this.outputPath, '..');
    await mkdir(dir, { recursive: true });

    for (const [index, imageData] of this.frames) {
      // Convertir ImageData a PNG y escribir
      // Esto es un placeholder para demostrar el flujo
      const filename = `frame_${String(index).padStart(6, '0')}.png`;
      console.log(`Would write: ${join(dir, filename)}`);
    }
  }
}

export const exportService = new ExportService();
```

## Preload Bridge para Exportación

```typescript
// src/preload/index.ts (añadido al contexto existente)

contextBridge.exposeInMainWorld('exportAPI', {
  startExport: (config: ExportConfig) =>
    ipcRenderer.invoke('export:init', config),

  writeFrame: (index: number, imageData: ImageData) =>
    ipcRenderer.invoke('export:writeFrame', index, imageData),

  finalize: () =>
    ipcRenderer.invoke('export:finalize'),

  abort: () =>
    ipcRenderer.invoke('export:abort'),

  onProgress: (cb: (progress: ExportProgress) => void) => {
    const handler = (_event: any, progress: ExportProgress) => cb(progress);
    ipcRenderer.on('export:progress', handler);
    return () => ipcRenderer.removeListener('export:progress', handler);
  },
});
```

## Codecs Soportados por Plataforma

| Codec | Chrome (Electron) | Safari | Firefox | Notas |
|---|---|---|---|---|
| **H.264 (AVC)** | HW + SW | HW + SW | HW + SW | Más compatible; usar `avc1.42001f` |
| **VP9** | HW + SW | No | HW + SW | Sin soporte Safari; usar `vp09.00.10.08.00` |
| **AV1** | HW (Chrome 110+) | HW (Safari 17+) | SW | Reciente; soporte creciente |
| **HEVC** | Parcial | HW | No | Evitar por compatibilidad |

**Recomendación**: H.264 (`avc1.42001f`) para máxima compatibilidad. VP9 si se necesita mejor compresión y no se requiere Safari.

## Manejo de `encodeQueueSize`

```typescript
// Dentro del loop de codificación
const MAX_QUEUE_SIZE = 2;

if (encoder.encodeQueueSize > MAX_QUEUE_SIZE) {
  // El encoder está sobrecargado — drop este frame
  frame.close();
  droppedFrames++;
  continue;
}

encoder.encode(frame, {
  keyFrame: frameCounter % (fps * keyframeInterval) === 0,
});
frame.close(); // SIEMPRE liberar después de encode
```

## Alternativa: FFmpeg via Child Process

Para casos que requieran codecs no soportados por WebCodecs (ej: alpha channel en VP9, ProRes para edición):

```typescript
// src/workers/video-export-ff.worker.ts

import { spawn, ChildProcess } from 'child_process';

class FFmpegExporter {
  private process: ChildProcess | null = null;

  async start(
    width: number,
    height: number,
    fps: number,
    outputPath: string
  ): Promise<void> {
    this.process = spawn('ffmpeg', [
      '-y',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${width}x${height}`,
      '-r', String(fps),
      '-i', '-',                     // stdin para frames raw
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-crf', '18',                  // calidad alta
      '-preset', 'fast',
      outputPath,
    ]);
  }

  writeFrame(imageData: ImageData): void {
    if (!this.process?.stdin?.writable) return;
    // Convertir ImageData.data (Uint8ClampedArray) a Buffer
    const buffer = Buffer.from(imageData.data.buffer);
    this.process.stdin.write(buffer);
  }

  async finish(): Promise<void> {
    return new Promise((resolve) => {
      this.process?.stdin?.end();
      this.process?.on('close', () => resolve());
    });
  }
}
```

**Nota**: FFmpeg debe estar empaquetado como sidecar o disponible en el PATH del sistema. Para distribución portable, incluir el binario de FFmpeg en `resources/bin/`.
