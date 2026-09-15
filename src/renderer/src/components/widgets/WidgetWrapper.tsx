import type { ReactNode } from 'react';

interface WidgetWrapperProps {
  title: string;
  type: string;
  onConfigure?: () => void;
  onRemove?: () => void;
  children: ReactNode;
}

export function WidgetWrapper({
  title,
  type,
  onConfigure,
  onRemove,
  children,
}: WidgetWrapperProps): React.ReactElement {
  return (
    <div
      className="widget-card flex h-full w-full flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--bg-border)' }}
    >
      <div
        className="flex items-center justify-between px-2 py-1"
        style={{ borderBottom: '1px solid var(--bg-border)', backgroundColor: 'var(--bg-elevated)' }}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {title}
          </span>
          <span className="truncate text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            {type}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onConfigure && (
            <button onClick={onConfigure} className="icon-button" title="Configurar">
              ⚙
            </button>
          )}
          {onRemove && (
            <button onClick={onRemove} className="icon-button" title="Eliminar">
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
