import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompositionWidget, ExportLayout } from '@shared/export-composition';
import { telemetryStore } from '@core/telemetry-store';
import { videoSynchronizer } from '@core/video-synchronizer';
import { createExportStage, type ExportStage } from '../../lib/export-stage';
import { seekVideo } from '../../lib/video-seek';

interface ExportFramePreviewProps {
  layout: ExportLayout;
  widgets: CompositionWidget[];
  mediaTime_s: number;
  live: boolean;
  liveWindowMs: number;
  sessionLabel: string;
}

/**
 * Previsualización de un frame de la exportación (paso 2). Compone con el mismo
 * `ExportStage` (refleja resolución, modo, grosor y supersampling).
 */
export function ExportFramePreview({
  layout,
  widgets,
  mediaTime_s,
  live,
  liveWindowMs,
  sessionLabel,
}: ExportFramePreviewProps): React.ReactElement {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<ExportStage | null>(null);
  const [ready, setReady] = useState(false);
  const [containerWidth, setContainerWidth] = useState(900);
  const timeRef = useRef(mediaTime_s);
  timeRef.current = mediaTime_s;
  const labelRef = useRef(sessionLabel);
  labelRef.current = sessionLabel;
  const widgetsKey = widgets.map((w) => w.id).join('|');

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(async (): Promise<void> => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const time = timeRef.current;
    const video = document.querySelector<HTMLVideoElement>('video');
    if (video && video.videoWidth > 0) {
      await seekVideo(video, Math.min(time, video.duration || time));
    }
    const viewMs = videoSynchronizer.mapTime(time * 1000);
    await stage.renderFrame(video, viewMs, { label: labelRef.current });
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(stage.getCanvas(), 0, 0);
  }, []);

  useEffect(() => {
    let disposed = false;
    setReady(false);
    createExportStage({
      layout,
      widgets,
      getFrames: () => telemetryStore.getAllFrames(),
      live,
      liveWindowMs,
    })
      .then((stage) => {
        stageRef.current?.dispose();
        if (disposed) {
          stage.dispose();
          return;
        }
        stageRef.current = stage;
        setReady(true);
        void draw();
      })
      .catch(() => setReady(false));
    return () => {
      disposed = true;
      stageRef.current?.dispose();
      stageRef.current = null;
    };
    // `widgets` se usa por valor; `widgetsKey` captura cambios relevantes.
  }, [layout, widgetsKey, live, liveWindowMs, draw]);

  useEffect(() => {
    if (!ready) return;
    const handle = window.setTimeout(() => void draw(), 60);
    return () => window.clearTimeout(handle);
  }, [ready, mediaTime_s, sessionLabel, draw]);

  const k = Math.min(1, containerWidth / layout.width);

  return (
    <div ref={viewportRef} style={{ width: '100%' }}>
      <canvas
        ref={canvasRef}
        width={layout.width}
        height={layout.height}
        style={{
          display: 'block',
          margin: '0 auto',
          width: 'auto',
          height: 'auto',
          maxWidth: '100%',
          maxHeight: '46vh',
          borderRadius: 8,
          border: '1px solid var(--bg-border)',
        }}
      />
      <div className="mt-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
        {layout.width}×{layout.height} · frame a {mediaTime_s.toFixed(1)} s (k≈{k.toFixed(2)})
      </div>
    </div>
  );
}
