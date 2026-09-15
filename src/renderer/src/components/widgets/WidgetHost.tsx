import { useMemo, useState } from 'react';
import { widgetRegistry } from '@widgets/widget-registry';
import { telemetryStore } from '@core/telemetry-store';
import type { TelemetryFrame } from '@core/types/telemetry';
import type { VideoFrameContext } from '@core/types/video';
import { useEventListener } from '../../hooks/useEventListener';
import { useLayoutStore } from '../../stores/layout-store';
import { useAppStore } from '../../stores/app-store';
import { WidgetWrapper } from './WidgetWrapper';
import { WidgetConfigDialog } from './WidgetConfigDialog';

interface WidgetHostProps {
  /** Evento de sincronización del que se leen los frames. */
  eventName?: 'sync:frame' | 'comparison:frame';
  /** Dataset de telemetría a visualizar. */
  dataset?: 'primary' | 'comparison';
  /** Si el panel es el primario (recibe también frames de streaming). */
  primary?: boolean;
}

export function WidgetHost({
  eventName = 'sync:frame',
  dataset = 'primary',
  primary = true,
}: WidgetHostProps): React.ReactElement {
  const widgets = useLayoutStore((s) => s.widgets);
  const removeWidget = useLayoutStore((s) => s.removeWidget);
  const [frame, setFrame] = useState<TelemetryFrame | null>(null);
  const [context, setContext] = useState<VideoFrameContext | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEventListener(eventName, ({ frame: f, context: c }) => {
    setFrame(f);
    setContext(c);
  });

  useEventListener('data:streaming-frame', ({ frame: f }) => {
    const hasVideo = primary && !useAppStore.getState().videoSrc;
    if (hasVideo) setFrame(f);
  });

  const frames = dataset === 'comparison' ? telemetryStore.getComparisonFrames() : telemetryStore.getAllFrames();

  const editingWidget = useMemo(
    () => widgets.find((w) => w.id === editingId) ?? null,
    [widgets, editingId]
  );

  if (widgets.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Añade widgets para visualizar la telemetría
      </div>
    );
  }

  return (
    <>
      <div
        className="h-full w-full overflow-auto p-2"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
          gridAutoRows: '42px',
          gap: '8px',
        }}
      >
        {widgets
          .filter((w) => w.visible)
          .map((widget) => {
            const definition = widgetRegistry.get(widget.type);
            const style: React.CSSProperties = {
              gridColumn: `${widget.x + 1} / span ${Math.max(widget.width, 1)}`,
              gridRow: `${widget.y + 1} / span ${Math.max(widget.height, 1)}`,
            };

            return (
              <div key={widget.id} style={style} className="min-h-0 min-w-0">
                <WidgetWrapper
                  title={widget.label}
                  type={widget.type}
                  onConfigure={primary ? () => setEditingId(widget.id) : undefined}
                  onRemove={primary ? () => removeWidget(widget.id) : undefined}
                >
                  {definition ? (
                    <definition.component
                      widgetId={widget.id}
                      config={widget.config}
                      dataFields={widget.dataFields}
                      frame={frame}
                      context={context}
                      frames={frames}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs" style={{ color: '#f87171' }}>
                      Widget desconocido: {widget.type}
                    </div>
                  )}
                </WidgetWrapper>
              </div>
            );
          })}
      </div>

      {editingWidget && (
        <WidgetConfigDialog
          widget={editingWidget}
          onClose={() => setEditingId(null)}
        />
      )}
    </>
  );
}
