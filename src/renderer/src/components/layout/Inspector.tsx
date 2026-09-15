import { useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { useEventListener } from '../../hooks/useEventListener';
import { videoSynchronizer } from '@core/video-synchronizer';

/**
 * Panel lateral izquierdo: sincronización y campos descubiertos.
 * No contiene acciones (esas viven en el menú nativo).
 */
export function Inspector(): React.ReactElement {
  const schema = useAppStore((s) => s.schema);
  const dataset = useAppStore((s) => s.dataset);
  const syncOffsetMs = useAppStore((s) => s.syncOffsetMs);
  const setSyncOffset = useAppStore((s) => s.setSyncOffset);
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
      className="flex w-64 flex-col overflow-y-auto px-4 py-4"
      style={{ backgroundColor: 'var(--bg-panel)', borderRight: '1px solid var(--bg-border)' }}
    >
      <section className="inspector-section">
        <span className="section-label">Sincronización</span>

        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Offset
          </span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              className="dialog-input mono"
              style={{ width: 78, height: 26, padding: '0 6px', textAlign: 'right' }}
              value={syncOffsetMs}
              onChange={(e) => applyOffset(Number(e.target.value))}
            />
            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              ms
            </span>
          </div>
        </div>

        <input
          type="range"
          min={-3000}
          max={3000}
          step={10}
          value={syncOffsetMs}
          onChange={(e) => applyOffset(Number(e.target.value))}
          className="timeline-slider"
        />

        <div className="mt-2 flex gap-1.5">
          <button className="toolbar-button toolbar-button--compact flex-1" onClick={alignToStart}>
            Alinear al inicio
          </button>
          <button className="toolbar-button toolbar-button--compact" onClick={() => applyOffset(0)}>
            Reset
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            t telemetría
          </span>
          <span className="mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {telemetryTime.toFixed(0)} ms
          </span>
        </div>
      </section>

      <section className="inspector-section min-h-0 flex-1">
        <span className="section-label">Campos · {schema.length}</span>

        {schema.length === 0 ? (
          <p className="hint">
            Sin datos todavía. Conecta el robot por <strong>Datos → Conectar Serial</strong> o abre
            una sesión.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {schema.map((f) => (
              <div key={f.name} className="field-row">
                <span className="field-name">{f.name}</span>
                <span className={`badge badge--${f.type}`}>{f.type}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}
