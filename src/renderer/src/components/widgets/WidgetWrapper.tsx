import type { ReactNode } from 'react';

interface WidgetWrapperProps {
  title: string;
  type: string;
  onConfigure?: () => void;
  onRemove?: () => void;
  /** Inicia el arrastre para reordenar (desde la cabecera). */
  onHeaderPointerDown?: (e: React.PointerEvent) => void;
  /** Inicia el redimensionado de ancho (asa derecha). */
  onResizeWidthStart?: (e: React.PointerEvent) => void;
  /** Inicia el redimensionado de alto (asa inferior). */
  onResizeHeightStart?: (e: React.PointerEvent) => void;
  /** Resalta el widget como destino de la inserción. */
  dropTarget?: boolean;
  children: ReactNode;
}

export function WidgetWrapper({
  title,
  type,
  onConfigure,
  onRemove,
  onHeaderPointerDown,
  onResizeWidthStart,
  onResizeHeightStart,
  dropTarget = false,
  children,
}: WidgetWrapperProps): React.ReactElement {
  const onHeaderDown = (e: React.PointerEvent): void => {
    if (!onHeaderPointerDown) return;
    // No iniciar arrastre al pulsar botones de la cabecera
    if ((e.target as HTMLElement).closest('button')) return;
    onHeaderPointerDown(e);
  };

  return (
    <div
      className="widget-card flex h-full w-full flex-col overflow-hidden"
      style={{
        position: 'relative',
        ...(dropTarget
          ? { outline: '1px solid var(--accent-border)', outlineOffset: -1 }
          : {}),
      }}
    >
      <div
        className="flex items-center justify-between gap-2.5 px-3.5 py-2"
        style={{
          borderBottom: '1px solid var(--bg-border)',
          cursor: onHeaderPointerDown ? 'grab' : 'default',
        }}
        onPointerDown={onHeaderDown}
      >
        <div className="flex min-w-0 items-baseline gap-2.5">
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

      <div className="min-h-0 flex-1" style={{ padding: 8 }}>
        {children}
      </div>

      {onResizeWidthStart && (
        <div
          className="widget-resize widget-resize--right"
          onPointerDown={onResizeWidthStart}
          title="Redimensionar ancho"
        />
      )}
      {onResizeHeightStart && (
        <div
          className="widget-resize widget-resize--bottom"
          onPointerDown={onResizeHeightStart}
          title="Redimensionar alto"
        />
      )}
    </div>
  );
}
