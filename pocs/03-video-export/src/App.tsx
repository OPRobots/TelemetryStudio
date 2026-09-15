import React, { useState, useRef, useCallback, useEffect } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

interface TelemetryData {
  fps: number;
  duration_ms: number;
  num_frames: number;
  fields: string[];
  frames: Array<{
    timestamp_ms: number;
    accX: number;
    accY: number;
    accZ: number;
    gyroX: number;
    gyroY: number;
    gyroZ: number;
    battery: number;
  }>;
}

interface ExportProgress {
  currentFrame: number;
  totalFrames: number;
  percent: number;
  speed: number;
  memoryMB: number;
}

export default function App() {
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [saved, setSaved] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uPlotRef = useRef<uPlot | null>(null);
  const offscreenRef = useRef<OffscreenCanvas | null>(null);
  const abortRef = useRef(false);

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const loadTelemetry = async () => {
    const result = await window.exportAPI.openTelemetry();
    if (result.canceled || !result.filePath) return;

    const fileResult = await window.exportAPI.readFile(result.filePath);
    if (!fileResult.success || !fileResult.content) {
      addLog(`Error: ${fileResult.error}`);
      return;
    }

    const data: TelemetryData = JSON.parse(fileResult.content);
    setTelemetry(data);
    setSaved(false);
    addLog(`Telemetría cargada: ${data.num_frames} frames, ${data.duration_ms.toFixed(0)}ms`);
  };

  // Initialize uPlot when telemetry loads
  useEffect(() => {
    if (!telemetry || !canvasRef.current) return;

    const canvas = canvasRef.current;

    const timestamps = telemetry.frames.map((f) => f.timestamp_ms / 1000);
    const accXData = telemetry.frames.map((f) => f.accX);
    const accYData = telemetry.frames.map((f) => f.accY);
    const accZData = telemetry.frames.map((f) => f.accZ);

    const data: uPlot.AlignedData = [timestamps, accXData, accYData, accZData];

    const opts: uPlot.Options = {
      width: canvas.width,
      height: canvas.height,
      scales: {
        x: { time: false },
        y: { auto: true },
      },
      axes: [
        {
          stroke: '#64748b',
          grid: { stroke: '#1e293b' },
          values: (_u, vals) => vals.map((v) => `${v.toFixed(1)}s`),
        },
        {
          stroke: '#64748b',
          grid: { stroke: '#1e293b' },
        },
      ],
      series: [
        {},
        { label: 'accX', stroke: '#3b82f6', width: 2 },
        { label: 'accY', stroke: '#22c55e', width: 2 },
        { label: 'accZ', stroke: '#ef4444', width: 2 },
      ],
      cursor: { drag: { x: false, y: false } },
    };

    if (uPlotRef.current) {
      uPlotRef.current.destroy();
    }

    uPlotRef.current = new uPlot(opts, data, canvas);
    offscreenRef.current = new OffscreenCanvas(1920, 1080);

    return () => {
      uPlotRef.current?.destroy();
      uPlotRef.current = null;
    };
  }, [telemetry]);

  // Render a specific frame to the canvas
  const renderFrame = useCallback(
    (frameIndex: number) => {
      if (!uPlotRef.current || !telemetry) return;

      const u = uPlotRef.current;
      const numFrames = telemetry.num_frames;
      const viewSize = Math.min(60, numFrames);
      const start = Math.max(0, frameIndex - Math.floor(viewSize / 2));
      const end = Math.min(numFrames - 1, start + viewSize);

      u.setData([
        telemetry.frames.slice(start, end + 1).map((f) => f.timestamp_ms / 1000),
        telemetry.frames.slice(start, end + 1).map((f) => f.accX),
        telemetry.frames.slice(start, end + 1).map((f) => f.accY),
        telemetry.frames.slice(start, end + 1).map((f) => f.accZ),
      ]);

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'rgba(10, 14, 23, 0.8)';
        ctx.fillRect(0, 0, 140, 30);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '16px monospace';
        ctx.fillText(`Frame ${frameIndex + 1}/${numFrames}`, 10, 20);
      }
    },
    [telemetry]
  );

  // Export loop — raw RGBA → FFmpeg
  const startExport = useCallback(async () => {
    if (!telemetry || !canvasRef.current || !offscreenRef.current) return;

    setIsExporting(true);
    setSaved(false);
    abortRef.current = false;

    const totalFrames = telemetry.num_frames;
    const fps = 30;
    const width = 1920;
    const height = 1080;

    addLog(`Iniciando exportación: ${totalFrames} frames, ${fps}fps, ${width}x${height}`);

    // Start FFmpeg in main process
    const startResult = await window.exportAPI.startExport({ width, height, fps });
    if (!startResult.success) {
      addLog(`Error starting FFmpeg`);
      setIsExporting(false);
      return;
    }

    const startTime = performance.now();
    const offscreen = offscreenRef.current;
    const offCtx = offscreen.getContext('2d')!;
    let framesSent = 0;

    for (let i = 0; i < totalFrames; i++) {
      if (abortRef.current) {
        addLog('Exportación cancelada');
        break;
      }

      // Render this frame to the visible canvas
      renderFrame(i);

      // Copy visible canvas to offscreen at export resolution
      offCtx.drawImage(canvasRef.current!, 0, 0, width, height);

      // Draw frame overlay on offscreen
      offCtx.fillStyle = 'rgba(10, 14, 23, 0.9)';
      offCtx.fillRect(0, 0, 320, 40);
      offCtx.fillStyle = '#e2e8f0';
      offCtx.font = '24px monospace';
      offCtx.fillText(`Frame ${i + 1}/${totalFrames} | ${(i / fps).toFixed(1)}s`, 10, 28);

      // Get raw RGBA pixels from offscreen canvas
      const imageData = offCtx.getImageData(0, 0, width, height);

      // Send raw RGBA to main process → FFmpeg
      await window.exportAPI.writeFrame(imageData.data.buffer);
      framesSent++;

      // Report progress every 10 frames
      if (i % 10 === 0) {
        const elapsed = performance.now() - startTime;
        const speed = (i / elapsed) * 1000;
        const mem = (performance as any).memory?.usedJSHeapSize ?? 0;

        setProgress({
          currentFrame: i + 1,
          totalFrames,
          percent: Math.round(((i + 1) / totalFrames) * 100),
          speed: Math.round(speed),
          memoryMB: Math.round(mem / 1024 / 1024),
        });

        // Yield to keep UI responsive
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // Finalize FFmpeg
    addLog(`Enviados ${framesSent} frames. Finalizando FFmpeg...`);
    const finalizeResult = await window.exportAPI.finalize();

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

    if (finalizeResult.success) {
      addLog(`Exportación completada en ${elapsed}s — ${framesSent} frames → ${finalizeResult.outputPath}`);
      setSaved(true);
    } else {
      addLog(`Error: ${finalizeResult.error}`);
    }

    setIsExporting(false);
  }, [telemetry, renderFrame, addLog]);

  const saveFile = async () => {
    const result = await window.exportAPI.save();
    if (!result.canceled && result.savedPath) {
      addLog(`Guardado en: ${result.savedPath}`);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#0a0e17',
        color: '#e2e8f0',
        fontFamily: 'JetBrains Mono, monospace',
        padding: 16,
        gap: 12,
      }}
    >
      <h1 style={{ margin: 0, fontSize: 18, color: '#60a5fa' }}>
        PoC 3: Video Export — Canvas Capture + FFmpeg
      </h1>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={loadTelemetry}
          disabled={isExporting}
          style={{
            padding: '8px 16px',
            backgroundColor: '#193773',
            color: '#e2e8f0',
            border: 'none',
            borderRadius: 4,
            cursor: isExporting ? 'default' : 'pointer',
            opacity: isExporting ? 0.5 : 1,
          }}
        >
          Cargar Telemetría
        </button>

        <button
          onClick={startExport}
          disabled={!telemetry || isExporting}
          style={{
            padding: '8px 16px',
            backgroundColor: isExporting ? '#475569' : '#22c55e',
            color: '#e2e8f0',
            border: 'none',
            borderRadius: 4,
            cursor: !telemetry || isExporting ? 'default' : 'pointer',
            opacity: !telemetry || isExporting ? 0.5 : 1,
          }}
        >
          {isExporting ? 'Exportando...' : 'Start Export'}
        </button>

        <button
          onClick={() => { abortRef.current = true; }}
          disabled={!isExporting}
          style={{
            padding: '8px 16px',
            backgroundColor: '#dc2626',
            color: '#e2e8f0',
            border: 'none',
            borderRadius: 4,
            cursor: isExporting ? 'pointer' : 'default',
            opacity: isExporting ? 1 : 0.5,
          }}
        >
          Cancel
        </button>

        <button
          onClick={saveFile}
          disabled={!saved}
          style={{
            padding: '8px 16px',
            backgroundColor: '#193773',
            color: '#e2e8f0',
            border: 'none',
            borderRadius: 4,
            cursor: saved ? 'pointer' : 'default',
            opacity: saved ? 1 : 0.5,
          }}
        >
          Save
        </button>

        {telemetry && (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            {telemetry.num_frames} frames | {telemetry.duration_ms.toFixed(0)}ms | {telemetry.fps}fps
          </span>
        )}
      </div>

      {/* Preview canvas */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#111827',
          borderRadius: 8,
          overflow: 'hidden',
          minHeight: 300,
        }}
      >
        <canvas
          ref={canvasRef}
          width={960}
          height={400}
          style={{ maxWidth: '100%', maxHeight: '100%' }}
        />
      </div>

      {/* Progress bar */}
      {progress && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              height: 8,
              backgroundColor: '#1e293b',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress.percent}%`,
                backgroundColor: '#3b82f6',
                transition: 'width 0.1s',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#94a3b8' }}>
            <span>
              {progress.currentFrame}/{progress.totalFrames} ({progress.percent}%)
            </span>
            <span>Speed: {progress.speed}fps</span>
            <span>Memory: {progress.memoryMB}MB</span>
          </div>
        </div>
      )}

      {/* Log */}
      <div
        style={{
          height: 120,
          overflowY: 'auto',
          backgroundColor: '#111827',
          borderRadius: 8,
          padding: 8,
          fontSize: 11,
          color: '#94a3b8',
        }}
      >
        {log.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
