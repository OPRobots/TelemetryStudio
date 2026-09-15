import { useAppStore } from '../../stores/app-store';

/**
 * Diálogo modal mientras se prepara (transcodea) un vídeo no reproducible.
 * Muestra progreso y permite cancelar.
 */
export function PrepareVideoDialog(): React.ReactElement | null {
  const active = useAppStore((s) => s.videoPrepareActive);
  const percent = useAppStore((s) => s.videoPreparePercent);
  const filename = useAppStore((s) => s.videoPrepareFilename);

  if (!active) return null;

  const indeterminate = percent <= 0;

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel" style={{ width: 400 }}>
        <h3 className="dialog-title">Preparando vídeo</h3>
        <p className="hint" style={{ marginTop: 8 }}>
          Convirtiendo {filename ? <strong>{filename}</strong> : 'el vídeo'} a un formato
          reproducible (H.264). Puede tardar unos segundos.
        </p>

        <div className="progress-track" style={{ marginTop: 16 }}>
          <div
            className={indeterminate ? 'progress-fill progress-fill--indeterminate' : 'progress-fill'}
            style={indeterminate ? undefined : { width: `${percent}%` }}
          />
        </div>

        <div
          className="mono mt-2 text-right text-[11px]"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {indeterminate ? 'Procesando…' : `${percent}%`}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            className="toolbar-button"
            onClick={() => void window.api?.videoCancelPrepare()}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
