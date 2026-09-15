import { useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { saveSession } from '../../lib/session-actions';

interface SaveSessionDialogProps {
  onClose: () => void;
}

export function SaveSessionDialog({ onClose }: SaveSessionDialogProps): React.ReactElement {
  const dataset = useAppStore((s) => s.dataset);
  const [name, setName] = useState(dataset?.name ?? 'Sesión');
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<void> => {
    const api = window.api;
    if (!api) return;
    const dir = await api.dialogOpenDirectory();
    if (dir.canceled || !dir.filePath) return;
    setBusy(true);
    await saveSession(name.trim() || 'Sesión', dir.filePath);
    setBusy(false);
    onClose();
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-panel" onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
        <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Guardar sesión
        </h3>

        <label className="dialog-label">Nombre de la sesión</label>
        <input className="dialog-input" value={name} onChange={(e) => setName(e.target.value)} />

        <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Se creará una carpeta con el nombre indicado que contendrá `session.json` y una copia
          del vídeo.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button className="toolbar-button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="toolbar-button toolbar-button-primary"
            onClick={() => void save()}
            disabled={busy || !dataset}
          >
            Elegir carpeta y guardar
          </button>
        </div>
      </div>
    </div>
  );
}
