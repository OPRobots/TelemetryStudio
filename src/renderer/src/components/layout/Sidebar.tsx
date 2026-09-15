import { useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { useEventListener } from '../../hooks/useEventListener';
import { videoSynchronizer } from '@core/video-synchronizer';
import { openVideoDialog, openSessionDialog } from '../../lib/session-actions';

interface SidebarProps {
  onOpenSerial: () => void;
  onSaveSession: () => void;
  onOpenLayouts: () => void;
}

export function Sidebar({ onOpenSerial, onSaveSession, onOpenLayouts }: SidebarProps): React.ReactElement {
  const schema = useAppStore((s) => s.schema);
  const dataset = useAppStore((s) => s.dataset);
  const syncOffsetMs = useAppStore((s) => s.syncOffsetMs);
  const setSyncOffset = useAppStore((s) => s.setSyncOffset);
  const serialConnected = useAppStore((s) => s.serialConnected);
  const [telemetryTime, setTelemetryTime] = useState(0);

  useEventListener('sync:frame', ({ context }) => {
    setTelemetryTime(context.viewTimestamp_ms);
  });

  const applyOffset = (value: number): void => {
    setSyncOffset(value);
    videoSynchronizer.setDriftOffset(value);
  };

  const alignToStart = (): void => {
    const start = dataset?.startTime_ms ?? 0;
    applyOffset(-start);
  };

  return (
    <aside
      className="flex w-72 flex-col gap-3 overflow-auto p-3"
      style={{ backgroundColor: 'var(--bg-elevated)', borderRight: '1px solid var(--bg-border)' }}
    >
      <section>
        <h2 className="sidebar-title">Fuentes de datos</h2>
        <div className="flex flex-col gap-1">
          <button className="sidebar-button" onClick={() => void openVideoDialog()}>
            Abrir vídeo
          </button>
          <button className="sidebar-button" onClick={() => void openSessionDialog()}>
            Abrir sesión
          </button>
          <button className="sidebar-button" onClick={onSaveSession} disabled={!dataset}>
            Guardar sesión
          </button>
          <button
            className="sidebar-button"
            onClick={onOpenSerial}
            style={{ color: serialConnected ? '#4ade80' : undefined }}
          >
            {serialConnected ? 'Serial conectado' : 'Conectar Serial'}
          </button>
          <button className="sidebar-button" onClick={onOpenLayouts}>
            Layouts
          </button>
        </div>
      </section>

      <section>
        <h2 className="sidebar-title">Sincronización</h2>
        <div className="mb-1 flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span>Offset</span>
          <input
            type="number"
            className="dialog-input"
            style={{ width: 90, padding: '2px 6px' }}
            value={syncOffsetMs}
            onChange={(e) => applyOffset(Number(e.target.value))}
          />
          <span style={{ color: 'var(--text-tertiary)' }}>ms</span>
        </div>
        <input
          type="range"
          min={-3000}
          max={3000}
          step={10}
          value={syncOffsetMs}
          onChange={(e) => applyOffset(Number(e.target.value))}
          className="w-full"
          style={{ accentColor: '#3b82f6' }}
        />
        <div className="mt-1 flex gap-1">
          <button className="toolbar-button flex-1 text-xs" onClick={alignToStart}>
            Alinear al inicio
          </button>
          <button className="toolbar-button text-xs" onClick={() => applyOffset(0)}>
            Reset
          </button>
        </div>
        <div className="mt-2 font-mono text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          t telemetría: {telemetryTime.toFixed(0)} ms
        </div>
      </section>

      <section className="min-h-0 flex-1">
        <h2 className="sidebar-title">Campos ({schema.length})</h2>
        <div className="flex flex-col gap-1">
          {schema.length === 0 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Sin datos. Conecta el Serial o abre una sesión.
            </span>
          )}
          {schema.map((f) => (
            <div
              key={f.name}
              className="flex items-center justify-between rounded px-2 py-1"
              style={{ backgroundColor: 'var(--bg-panel)' }}
            >
              <span className="truncate font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                {f.name}
              </span>
              <span className="badge">{f.type}</span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
