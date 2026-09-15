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
  const widgets = useLayoutStore((s) => s.widgets);
  const currentName = useLayoutStore((s) => s.layoutName);
  const setLayout = useLayoutStore((s) => s.setLayout);

  const refresh = useCallback(async () => {
    await layoutManager.refreshSavedLayouts();
    setLayouts(layoutManager.getAllLayouts());
  }, []);

  useEffect(() => {
    void refresh();
    setName(currentName === 'Sin guardar' ? '' : currentName);
  }, [refresh, currentName]);

  const load = (layout: DashboardLayout): void => {
    setLayout(layout);
    layoutManager.loadLayout(layout);
    onClose();
  };

  const save = async (): Promise<void> => {
    const layoutName = name.trim() || 'Layout sin nombre';
    const layout = toDashboardLayout(layoutName, '', widgets);
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

        <div className="mb-3 flex gap-2">
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

        <div className="max-h-64 overflow-auto">
          {layouts.map((layout) => {
            const isBuiltIn = layoutManager.getBuiltInLayouts().some((l) => l.name === layout.name);
            return (
              <div
                key={layout.name}
                className="mb-1 flex items-center justify-between rounded px-2 py-2"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <div className="min-w-0">
                  <div className="truncate text-xs" style={{ color: 'var(--text-primary)' }}>
                    {layout.name}
                    {isBuiltIn && (
                      <span className="ml-2 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                        predefinido
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                    {layout.description ?? `${layout.widgets.length} widgets`}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="toolbar-button text-xs" onClick={() => load(layout)}>
                    Cargar
                  </button>
                  {!isBuiltIn && (
                    <button
                      className="toolbar-button text-xs"
                      style={{ backgroundColor: '#7f1d1d' }}
                      onClick={() => void remove(layout.name)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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
