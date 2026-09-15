import { useState } from 'react';
import { comparisonManager } from '@core/comparison-manager';
import { sessionManager } from '@services/session-manager';
import type { SessionWidget } from '@core/types/session';
import { useLayoutStore } from '../../stores/layout-store';
import { useComparisonStore } from '../../stores/comparison-store';

interface ComparisonDialogProps {
  onClose: () => void;
}

export function ComparisonDialog({ onClose }: ComparisonDialogProps): React.ReactElement {
  const widgets = useLayoutStore((s) => s.widgets);
  const comparisonStart = useComparisonStore((s) => s.start);
  const [differences, setDifferences] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activate = async (): Promise<void> => {
    const api = window.api;
    if (!api) return;

    const res = await api.dialogOpenSession();
    if (res.canceled || !res.filePath) return;

    setBusy(true);
    setError(null);
    setDifferences([]);

    try {
      const reference = await sessionManager.readSession(res.filePath);
      const currentWidgets: SessionWidget[] = widgets.map((w) => ({
        t: w.type,
        pos: [w.x, w.y],
        size: [w.width, w.height],
        fields: w.dataFields,
        config: w.config,
      }));

      const result = comparisonManager.startComparison(reference, currentWidgets);
      if (!result.compatible) {
        setDifferences(result.differences);
        setBusy(false);
        return;
      }

      let videoSrc = '';
      if (reference.video.file) {
        videoSrc = await sessionManager.resolveVideoPath(res.filePath, reference.video.file);
      }
      comparisonStart(reference.name, videoSrc || null);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-panel" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Comparar con otra sesión
        </h3>

        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Se cargará la segunda sesión en un panel inferior. Los widgets deben ser idénticos
          (tipo, campos, posición, tamaño y configuración).
        </p>

        {differences.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-medium" style={{ color: '#f87171' }}>
              Los widgets no coinciden:
            </div>
            <ul className="mt-1 list-disc pl-5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {differences.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="mt-3 text-xs" style={{ color: '#f87171' }}>
            {error}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button className="toolbar-button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="toolbar-button toolbar-button-primary"
            onClick={() => void activate()}
            disabled={busy}
          >
            Elegir sesión…
          </button>
        </div>
      </div>
    </div>
  );
}
