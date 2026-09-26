import { useCallback, useEffect, useState } from 'react';
import type { DashboardLayout } from '@core/types/layout';
import { layoutManager } from '@services/layout-manager';
import { useLayoutStore, toDashboardLayout } from '../../stores/layout-store';

interface LayoutDialogProps {
  onClose: () => void;
}

export function LayoutDialog({ onClose }: LayoutDialogProps): React.ReactElement {
  const [layouts, setLayouts] = useState<DashboardLayout[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const widgets = useLayoutStore((s) => s.widgets);
  const panels = useLayoutStore((s) => s.panels);
  const currentName = useLayoutStore((s) => s.layoutName);
  const currentDescription = useLayoutStore((s) => s.layoutDescription);
  const setLayout = useLayoutStore((s) => s.setLayout);

  const refresh = useCallback(async () => {
    await layoutManager.refreshSavedLayouts();
    setLayouts(layoutManager.getAllLayouts());
  }, []);

  useEffect(() => {
    void refresh();
    const unnamed = currentName === 'Sin guardar';
    setName(unnamed ? '' : currentName);
    setDescription(unnamed ? '' : currentDescription);
  }, [refresh, currentName, currentDescription]);

  const load = (layout: DashboardLayout): void => {
    setLayout(layout);
    layoutManager.loadLayout(layout);
    onClose();
  };

  const save = async (): Promise<void> => {
    const layoutName = name.trim() || 'Layout sin nombre';
    const layout = toDashboardLayout(
      layoutName,
      description.trim(),
      widgets,
      panels,
      useLayoutStore.getState().exportBoard
    );
    layoutManager.loadLayout(layout);
    await layoutManager.saveLayout(layoutName);
    setLayout(layout);
    await refresh();
  };

  const remove = async (layoutName: string): Promise<void> => {
    await layoutManager.deleteLayout(layoutName);
    await refresh();
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-panel" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Layouts
        </h3>

        <div className="mb-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              className="dialog-input flex-1"
              placeholder="Nombre del layout"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="toolbar-button toolbar-button-primary" onClick={() => void save()}>
              Guardar
            </button>
          </div>
          <input
            className="dialog-input"
            placeholder="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="max-h-64 overflow-auto">
          {layouts.map((layout) => (
            <div
              key={layout.name}
              className="mb-1 flex items-center justify-between rounded px-2 py-2"
              style={{ backgroundColor: 'var(--bg-elevated)' }}
            >
              <div className="min-w-0">
                <div className="truncate text-xs" style={{ color: 'var(--text-primary)' }}>
                  {layout.name}
                </div>
                <div className="truncate text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  {layout.description || `${layout.widgets.length} widgets`}
                </div>
              </div>
              <div className="flex gap-1">
                <button className="toolbar-button text-xs" onClick={() => load(layout)}>
                  Cargar
                </button>
                <button
                  className="toolbar-button text-xs"
                  style={{ backgroundColor: '#7f1d1d' }}
                  onClick={() => void remove(layout.name)}
                >
                  ✕
                </button>
              </div>
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
