import { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { saveSession } from '../../lib/session-actions';
import { sessionSaveStatus } from '../../lib/session-save-status';

interface SaveSessionDialogProps {
  onClose: () => void;
}

export function SaveSessionDialog({ onClose }: SaveSessionDialogProps): React.ReactElement {
  const dataset = useAppStore((s) => s.dataset);
  const frameCount = useAppStore((s) => s.frameCount);
  const serialConnected = useAppStore((s) => s.serialConnected);
  const lastDataAt = useAppStore((s) => s.lastDataAt);

  const [name, setName] = useState(dataset?.name ?? 'Sesión');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Tick para que el estado se actualice solo al cumplirse el umbral de inactividad
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const status = sessionSaveStatus({ frameCount, serialConnected, lastDataAt, now });

  const save = async (): Promise<void> => {
    const api = window.api;
    if (!api) return;
    const dir = await api.dialogOpenDirectory();
    if (dir.canceled || !dir.filePath) return;
    setBusy(true);
    try {
      await saveSession(name.trim() || 'Sesión', dir.filePath);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-panel" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <h3 className="dialog-title">Guardar sesión</h3>

        <label className="dialog-label">Nombre de la sesión</label>
        <input className="dialog-input" value={name} onChange={(e) => setName(e.target.value)} />

        <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Se creará una carpeta con el nombre indicado que contendrá `session.json` y una copia
          del vídeo.
        </p>

        {status.reason && (
          <p className="mt-3 text-xs" style={{ color: 'var(--warn)' }}>
            {status.reason}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button className="toolbar-button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="toolbar-button toolbar-button-primary"
            onClick={() => void save()}
            disabled={busy || !status.canSave}
            title={status.reason ?? undefined}
          >
            Elegir carpeta y guardar
          </button>
        </div>
      </div>
    </div>
  );
}
