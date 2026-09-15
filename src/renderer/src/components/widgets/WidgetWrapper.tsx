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
    <div className="widget-card flex h-full w-full flex-col overflow-hidden">
      <div
        className="flex items-center justify-between gap-2 px-2.5 py-1.5"
        style={{ borderBottom: '1px solid var(--bg-border)' }}
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {title}
          </span>
          <span className="truncate text-[10px]" style={{ color: 'var(--text-disabled)' }}>
            {type}
          </span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-0.5">
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
