import { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { videoSynchronizer } from '@core/video-synchronizer';

export function StatusBar(): React.ReactElement {
  const serialConnected = useAppStore((s) => s.serialConnected);
  const serialPort = useAppStore((s) => s.serialPort);
  const frameCount = useAppStore((s) => s.frameCount);
  const schema = useAppStore((s) => s.schema);
  const videoInfo = useAppStore((s) => s.videoInfo);
  const streamState = useAppStore((s) => s.streamState);
  const statusMessage = useAppStore((s) => s.statusMessage);
  const [drift, setDrift] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setDrift(videoSynchronizer.averageDrift);
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const streamLabel =
    streamState === 'streaming' ? 'Grabando' : streamState === 'stopped' ? 'Detenido' : 'Inactivo';

  return (
    <footer
      className="flex items-center justify-between px-3 py-1 text-xs"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--bg-border)',
        color: 'var(--text-tertiary)',
      }}
    >
      <div className="flex items-center gap-4">
        <span>
          <span
            className="mr-1 inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: serialConnected ? '#4ade80' : '#64748b' }}
          />
          {serialConnected ? `Serial: ${serialPort ?? 'conectado'} (${streamLabel})` : 'Serial: desconectado'}
        </span>
        <span>{videoInfo ? `Vídeo: ${videoInfo.filename}` : 'Sin vídeo'}</span>
      </div>

      <div className="flex items-center gap-4">
        <span style={{ color: statusMessage ? 'var(--text-secondary)' : undefined }}>{statusMessage}</span>
        <span>Campos: {schema.length}</span>
        <span>Frames: {frameCount}</span>
        <span style={{ color: drift < 33 ? '#4ade80' : '#F2BE22' }}>Drift: {drift.toFixed(1)} ms</span>
      </div>
    </footer>
  );
}
