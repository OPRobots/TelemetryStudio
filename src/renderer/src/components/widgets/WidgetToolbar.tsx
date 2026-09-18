import { widgetRegistry } from '@widgets/widget-registry';
import type { WidgetConfig } from '@core/types/layout';
import { useLayoutStore } from '../../stores/layout-store';

let addCounter = 0;

interface WidgetToolbarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WidgetToolbar({ open, onOpenChange }: WidgetToolbarProps): React.ReactElement {
  const addWidget = useLayoutStore((s) => s.addWidget);

  const add = (type: string): void => {
    const definition = widgetRegistry.get(type);
    if (!definition) return;
    const { metadata } = definition;

    addCounter += 1;

    // Widget "limpio": sin campos seleccionados y con su tamaño por defecto.
    const widget: WidgetConfig = {
      id: `widget-${Date.now().toString(36)}-${addCounter}`,
      type: metadata.name,
      label: metadata.displayName,
      width: Math.min(metadata.defaultSize.width, 12),
      height: metadata.defaultSize.height,
      dataFields: [],
      config: { ...metadata.defaultConfig },
      visible: true,
    };

    addWidget(widget);
    onOpenChange(false);
  };

  return (
    <div className="relative">
      <button
        className="toolbar-button toolbar-button--compact"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
      >
        + Añadir gráfica
      </button>
      {open && (
        <div className="widget-menu" onMouseLeave={() => onOpenChange(false)}>
          {widgetRegistry.getAll().map((def) => (
            <button
              key={def.metadata.name}
              className="widget-menu-item"
              onClick={() => add(def.metadata.name)}
            >
              <span className="text-xs font-medium">{def.metadata.displayName}</span>
              <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                {def.metadata.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
