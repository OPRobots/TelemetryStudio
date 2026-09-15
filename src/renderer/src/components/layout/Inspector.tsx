import { useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { useEventListener } from '../../hooks/useEventListener';
import { videoSynchronizer } from '@core/video-synchronizer';

interface InspectorProps {
  width: number;
}

/**
 * Panel lateral izquierdo: sincronización y campos descubiertos.
 * No contiene acciones (esas viven en el menú nativo).
 */
export function Inspector({ width }: InspectorProps): React.ReactElement {
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
    <aside className="flex flex-col gap-3 p-3" style={{ width, flexShrink: 0 }}>
      <div className="card" style={{ flexShrink: 0 }}>
        <div className="card__header">
          <span className="card__title">Sincronización</span>
        </div>
        <div className="card__body" style={{ padding: '14px' }}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Offset
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="dialog-input mono"
                style={{ width: 84, height: 30, padding: '0 8px', textAlign: 'right' }}
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

          <div className="mt-4 flex gap-2">
            <button className="toolbar-button toolbar-button--compact flex-1" onClick={alignToStart}>
              Alinear al inicio
            </button>
            <button
              className="toolbar-button toolbar-button--compact"
              onClick={() => applyOffset(0)}
            >
              Reset
            </button>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              t telemetría
            </span>
            <span className="mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {telemetryTime.toFixed(0)} ms
            </span>
          </div>
        </div>
      </div>

      <div className="card" style={{ flex: '1 1 auto', minHeight: 0 }}>
        <div className="card__header">
          <span className="card__title">Campos · {schema.length}</span>
        </div>
        <div className="card__body" style={{ overflowY: 'auto', padding: '8px' }}>
          {schema.length === 0 ? (
            <p className="hint" style={{ padding: '6px 6px 0' }}>
              Sin datos todavía. Conecta el robot por <strong>Datos → Conectar Serial</strong> o
              abre una sesión.
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
        </div>
      </div>
    </aside>
  );
}
