import { widgetRegistry } from '@widgets/widget-registry';
import type { WidgetConfig } from '@core/types/layout';
import type { FieldSchema } from '@core/types/telemetry';
import { useAppStore } from '../../stores/app-store';
import { useLayoutStore } from '../../stores/layout-store';

let addCounter = 0;

function pickFields(widgetType: string, schema: FieldSchema[]): string[] {
  if (widgetType === 'Minimap2D') {
    const x = schema.find((s) => /(position[_-]?x|pos[_-]?x|^x$)/i.test(s.name))?.name;
    const y = schema.find((s) => /(position[_-]?y|pos[_-]?y|^y$)/i.test(s.name))?.name;
    const theta = schema.find((s) => /(heading|theta|yaw|angle[_-]?z)/i.test(s.name))?.name;
    return [x, y, theta].filter(Boolean) as string[];
  }
  if (widgetType === 'StateTimeline') {
    const state = schema.find((s) => /^(state|state[_-]?id|mode|status)$/i.test(s.name))?.name;
    return state ? [state] : schema.filter((s) => s.type === 'number').slice(0, 1).map((s) => s.name);
  }
  if (widgetType === 'DigitalBitmask') {
    const bits = schema.filter((s) => s.type === 'bitmask' || s.type === 'array').map((s) => s.name);
    return bits.length > 0 ? bits : schema.filter((s) => s.type === 'number').slice(0, 1).map((s) => s.name);
  }
  // TimeSeriesChart por defecto: todos los numéricos
  return schema.filter((s) => s.type === 'number').map((s) => s.name);
}

interface WidgetToolbarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WidgetToolbar({ open, onOpenChange }: WidgetToolbarProps): React.ReactElement {
  const schema = useAppStore((s) => s.schema);
  const widgets = useLayoutStore((s) => s.widgets);
  const addWidget = useLayoutStore((s) => s.addWidget);

  const add = (type: string): void => {
    const definition = widgetRegistry.get(type);
    if (!definition) return;
    const { metadata } = definition;

    addCounter += 1;
    const nextY = widgets.reduce((max, w) => Math.max(max, w.y + w.height), 0);

    const widget: WidgetConfig = {
      id: `widget-${Date.now().toString(36)}-${addCounter}`,
      type: metadata.name,
      label: metadata.displayName,
      x: 0,
      y: nextY,
      width: metadata.defaultSize.width,
      height: metadata.defaultSize.height,
      dataFields: pickFields(metadata.name, schema),
      config: { ...metadata.defaultConfig },
      visible: true,
      zIndex: widgets.length,
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
        + Añadir widget
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
