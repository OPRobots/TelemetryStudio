import { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { useComparisonStore } from '../../stores/comparison-store';
import { serialStatusLabel } from '../../lib/session-save-status';

interface StatusBarProps {
  onOpenSerial: () => void;
  onOpenVideo: () => void;
}

export function StatusBar({ onOpenSerial, onOpenVideo }: StatusBarProps): React.ReactElement {
  const serialConnected = useAppStore((s) => s.serialConnected);
  const serialPort = useAppStore((s) => s.serialPort);
  const baudRate = useAppStore((s) => s.baudRate);
  const lastDataAt = useAppStore((s) => s.lastDataAt);
  const frameCount = useAppStore((s) => s.frameCount);
  const videoInfo = useAppStore((s) => s.videoInfo);
  const statusMessage = useAppStore((s) => s.statusMessage);
  const comparisonActive = useComparisonStore((s) => s.active);
  const [now, setNow] = useState(() => Date.now());

  // Tick para reevaluar el estado del Serial (recibiendo / en reposo).
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const serialLabel = serialStatusLabel({ serialConnected, lastDataAt, now });
  const serialValue = serialConnected
    ? `${serialPort ?? 'conectado'} @ ${baudRate} · ${serialLabel}`
    : 'desconectado';

  const videoBits: string[] = [];
  if (videoInfo) {
    if (videoInfo.fps > 0) videoBits.push(`${videoInfo.fps} fps`);
    if (videoInfo.width > 0 && videoInfo.height > 0) {
      videoBits.push(`${videoInfo.width}×${videoInfo.height}`);
    }
  }
  const videoValue = [videoInfo?.filename ?? 'sin cargar', ...videoBits].join(' · ');

  const message = statusMessage && statusMessage !== 'Listo' ? statusMessage : '';

  return (
    <footer
      className="flex h-9 items-center justify-between gap-4 px-4 text-xs"
      style={{
        backgroundColor: 'var(--bg-panel)',
        borderTop: '1px solid var(--bg-border)',
        color: 'var(--text-tertiary)',
      }}
    >
      <div className="flex min-w-0 items-center gap-1">
        <button className="chip chip--button" onClick={onOpenSerial} title="Configurar Serial">
          <span
            className="chip__dot"
            style={{ backgroundColor: serialConnected ? 'var(--ok)' : 'var(--text-disabled)' }}
          />
          <span>Serial</span>
          <span className="chip__value">{serialValue}</span>
        </button>

        <button className="chip chip--button" onClick={onOpenVideo} title="Abrir vídeo">
          <span
            className="chip__dot"
            style={{ backgroundColor: videoInfo ? 'var(--ok)' : 'var(--text-disabled)' }}
          />
          <span>Vídeo</span>
          <span className="chip__value">{videoValue}</span>
        </button>

        {comparisonActive && (
          <span className="chip">
            <span className="chip__dot" style={{ backgroundColor: 'var(--accent)' }} />
            Comparando
          </span>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-4">
        {message && <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{message}</span>}
        {frameCount > 0 && (
          <span className="whitespace-nowrap">
            Muestras <span className="chip__value mono">{frameCount}</span>
          </span>
        )}
      </div>
    </footer>
  );
}
