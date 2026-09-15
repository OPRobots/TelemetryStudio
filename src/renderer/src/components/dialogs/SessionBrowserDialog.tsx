import { useState } from 'react';
import { sessionManager, type SessionInfo } from '@services/session-manager';
import { loadSession } from '../../lib/session-actions';

interface SessionBrowserDialogProps {
  onClose: () => void;
}

export function SessionBrowserDialog({ onClose }: SessionBrowserDialogProps): React.ReactElement {
  const [directory, setDirectory] = useState<string>('');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (dir: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setSessions(await sessionManager.listSessions(dir));
    } catch (err) {
      setError((err as Error).message);
      setSessions([]);
    } finally {
      setBusy(false);
    }
  };

  const chooseDirectory = async (): Promise<void> => {
    const api = window.api;
    if (!api) return;
    const res = await api.dialogOpenDirectory();
    if (res.canceled || !res.filePath) return;
    setDirectory(res.filePath);
    await refresh(res.filePath);
  };

  const open = async (info: SessionInfo): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await loadSession(info.path);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-panel" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
        <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Sesiones guardadas
        </h3>

        <div className="flex items-center gap-2">
          <button className="toolbar-button" onClick={() => void chooseDirectory()} disabled={busy}>
            Elegir carpeta
          </button>
          <span className="truncate text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {directory || 'Ninguna carpeta seleccionada'}
          </span>
        </div>

        {error && (
          <div className="mt-2 text-xs" style={{ color: '#f87171' }}>
            {error}
          </div>
        )}

        <div className="mt-3 max-h-72 overflow-auto">
          {sessions.length === 0 && (
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {directory ? 'No hay sesiones en esta carpeta.' : 'Selecciona una carpeta para listar sesiones.'}
            </div>
          )}
          {sessions.map((s) => (
            <div
              key={s.path}
              className="mb-1 flex items-center justify-between rounded px-2 py-2"
              style={{ backgroundColor: 'var(--bg-elevated)' }}
            >
              <div className="min-w-0">
                <div className="truncate text-xs" style={{ color: 'var(--text-primary)' }}>
                  {s.name}
                </div>
                <div className="truncate text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  {s.createdAt}
                </div>
              </div>
              <button
                className="toolbar-button text-xs"
                onClick={() => void open(s)}
                disabled={busy}
              >
                Abrir
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button className="toolbar-button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
