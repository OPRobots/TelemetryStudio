import { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { useComparisonStore } from '../../stores/comparison-store';
import { videoSynchronizer } from '@core/video-synchronizer';
import { serialStatusLabel } from '../../lib/session-save-status';

interface StatusBarProps {
  onOpenSerial: () => void;
  onOpenVideo: () => void;
}

export function StatusBar({ onOpenSerial, onOpenVideo }: StatusBarProps): React.ReactElement {
  const serialConnected = useAppStore((s) => s.serialConnected);
  const serialPort = useAppStore((s) => s.serialPort);
  const lastDataAt = useAppStore((s) => s.lastDataAt);
  const frameCount = useAppStore((s) => s.frameCount);
  const schema = useAppStore((s) => s.schema);
  const videoInfo = useAppStore((s) => s.videoInfo);
  const statusMessage = useAppStore((s) => s.statusMessage);
  const comparisonActive = useComparisonStore((s) => s.active);
  const [drift, setDrift] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setDrift(videoSynchronizer.averageDrift);
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const serialLabel = serialStatusLabel({ serialConnected, lastDataAt, now });

  return (
    <footer
      className="flex h-9 items-center justify-between px-4 text-xs"
      style={{
        backgroundColor: 'var(--bg-panel)',
        borderTop: '1px solid var(--bg-border)',
        color: 'var(--text-tertiary)',
      }}
    >
      <div className="flex items-center gap-1">
        <button className="chip chip--button" onClick={onOpenSerial} title="Configurar Serial">
          <span
            className="chip__dot"
            style={{ backgroundColor: serialConnected ? 'var(--ok)' : 'var(--text-disabled)' }}
          />
          <span>Serial</span>
          <span className="chip__value">
            {serialConnected ? `${serialPort ?? 'conectado'} · ${serialLabel}` : 'desconectado'}
          </span>
        </button>

        <button className="chip chip--button" onClick={onOpenVideo} title="Abrir vídeo">
          <span>Vídeo</span>
          <span className="chip__value">{videoInfo?.filename ?? 'sin cargar'}</span>
        </button>

        {comparisonActive && (
          <span className="chip">
            <span className="chip__dot" style={{ backgroundColor: 'var(--accent)' }} />
            Comparando
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <span style={{ color: 'var(--text-secondary)' }}>{statusMessage}</span>
        <span>
          Campos <span className="chip__value mono">{schema.length}</span>
        </span>
        <span>
          Frames <span className="chip__value mono">{frameCount}</span>
        </span>
        <span>
          Drift{' '}
          <span
            className="mono"
            style={{ color: drift < 33 ? 'var(--ok)' : 'var(--warn)' }}
          >
            {drift.toFixed(1)} ms
          </span>
        </span>
      </div>
    </footer>
  );
}
