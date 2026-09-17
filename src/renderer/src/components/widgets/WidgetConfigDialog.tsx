import { useMemo, useState } from 'react';
import type { WidgetConfig } from '@core/types/layout';
import { ROW_UNIT, WIDTH_PRESETS } from '@core/types/layout';
import { useLayoutStore } from '../../stores/layout-store';
import { useAppStore } from '../../stores/app-store';
import { clampHeight } from '../../lib/widget-layout';
import { DEFAULT_SERIES_COLORS } from '@widgets/time-series-chart';

interface WidgetConfigDialogProps {
  widget: WidgetConfig;
  onClose: () => void;
}

export function WidgetConfigDialog({ widget, onClose }: WidgetConfigDialogProps): React.ReactElement {
  const updateWidget = useLayoutStore((s) => s.updateWidget);
  const schema = useAppStore((s) => s.schema);

  const [label, setLabel] = useState(widget.label);
  const [fields, setFields] = useState<string[]>(widget.dataFields);
  const [config, setConfig] = useState<Record<string, unknown>>({ ...widget.config });
  const [width, setWidth] = useState(widget.width);
  const [height, setHeight] = useState(widget.height);

  const availableFields = useMemo(
    () => schema.map((s) => ({ name: s.name, type: s.type })),
    [schema]
  );

  const toggleField = (name: string): void => {
    setFields((prev) =>
      prev.includes(name) ? prev.filter((f) => f !== name) : [...prev, name]
    );
  };

  const setConfigValue = (key: string, value: unknown): void => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const apply = (): void => {
    updateWidget(widget.id, {
      label,
      dataFields: fields,
      config,
      width,
      height,
    });
    onClose();
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-panel" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Configurar {widget.type}
        </h3>

        <label className="dialog-label">Etiqueta</label>
        <input className="dialog-input" value={label} onChange={(e) => setLabel(e.target.value)} />

        <label className="dialog-label">Campos de datos ({fields.length} seleccionados)</label>
        <div className="dialog-fields">
          {availableFields.length === 0 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              No hay campos disponibles. Carga datos primero.
            </span>
          )}
          {availableFields.map((f) => (
            <label key={f.name} className="dialog-checkbox">
              <input
                type="checkbox"
                checked={fields.includes(f.name)}
                onChange={() => toggleField(f.name)}
              />
              <span className="font-mono text-xs">{f.name}</span>
              <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                {f.type}
              </span>
            </label>
          ))}
        </div>

        {widget.type === 'TimeSeriesChart' && (
          <TimeSeriesOptions
            fields={fields}
            config={config}
            onColorChange={(idx, color) => {
              const colors = [...((config['colors'] as string[]) ?? DEFAULT_SERIES_COLORS)];
              colors[idx] = color;
              setConfigValue('colors', colors);
            }}
            onChange={setConfigValue}
          />
        )}

        {widget.type === 'DigitalBitmask' && (
          <div className="dialog-row">
            <div>
              <label className="dialog-label">LEDs por fila</label>
              <input
                type="number"
                className="dialog-input"
                value={(config['ledsPerRow'] as number) ?? 8}
                onChange={(e) => setConfigValue('ledsPerRow', Number(e.target.value))}
              />
            </div>
            <div>
              <label className="dialog-label">Filas</label>
              <input
                type="number"
                className="dialog-input"
                value={(config['rows'] as number) ?? 2}
                onChange={(e) => setConfigValue('rows', Number(e.target.value))}
              />
            </div>
          </div>
        )}

        {widget.type === 'Minimap2D' && (
          <div className="dialog-row">
            <div>
              <label className="dialog-label">Escala (px/unidad)</label>
              <input
                type="number"
                className="dialog-input"
                value={(config['scale'] as number) ?? 60}
                onChange={(e) => setConfigValue('scale', Number(e.target.value))}
              />
            </div>
            <div>
              <label className="dialog-label">Estela (s)</label>
              <input
                type="number"
                className="dialog-input"
                value={(config['trailSeconds'] as number) ?? 15}
                onChange={(e) => setConfigValue('trailSeconds', Number(e.target.value))}
              />
            </div>
          </div>
        )}

        <label className="dialog-label">Ancho</label>
        <div className="dialog-row" style={{ flexWrap: 'wrap' }}>
          {WIDTH_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="toolbar-button toolbar-button--compact"
              style={
                width === preset
                  ? {
                      background: 'var(--accent-soft)',
                      borderColor: 'var(--accent-border)',
                      color: 'var(--accent)',
                    }
                  : undefined
              }
              onClick={() => setWidth(preset)}
            >
              {preset === 12 ? 'Completo' : `${preset}/12`}
            </button>
          ))}
        </div>

        <label className="dialog-label">Alto · {height} filas ({height * ROW_UNIT}px)</label>
        <div className="dialog-row" style={{ alignItems: 'center' }}>
          <button
            type="button"
            className="toolbar-button toolbar-button--compact"
            onClick={() => setHeight((h) => clampHeight(h - 1))}
          >
            −
          </button>
          <span className="mono text-xs" style={{ flex: 1, textAlign: 'center', color: 'var(--text-secondary)' }}>
            {height} filas
          </span>
          <button
            type="button"
            className="toolbar-button toolbar-button--compact"
            onClick={() => setHeight((h) => clampHeight(h + 1))}
          >
            +
          </button>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="toolbar-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="toolbar-button toolbar-button-primary" onClick={apply}>
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

interface TimeSeriesOptionsProps {
  fields: string[];
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onColorChange: (index: number, color: string) => void;
}

function TimeSeriesOptions({ fields, config, onChange, onColorChange }: TimeSeriesOptionsProps): React.ReactElement {
  const colors = (config['colors'] as string[]) ?? DEFAULT_SERIES_COLORS;

  return (
    <div className="mt-3">
      <label className="dialog-checkbox mt-2">
        <input
          type="checkbox"
          checked={((config['smoothing'] as number) ?? 1) > 0}
          onChange={(e) => onChange('smoothing', e.target.checked ? 1 : 0)}
        />
        <span className="text-xs">Suavizar líneas (preserva los picos)</span>
      </label>

      <label className="dialog-checkbox mt-2">
        <input
          type="checkbox"
          checked={(config['autoFollow'] as boolean) ?? true}
          onChange={(e) => onChange('autoFollow', e.target.checked)}
        />
        <span className="text-xs">Seguir reproducción automáticamente</span>
      </label>

      <label className="dialog-label mt-2">Etiqueta del eje Y</label>
      <input
        className="dialog-input"
        value={(config['yLabel'] as string) ?? ''}
        onChange={(e) => onChange('yLabel', e.target.value)}
      />

      {fields.length > 0 && (
        <>
          <label className="dialog-label mt-2">Colores por serie</label>
          <div className="flex flex-col gap-1">
            {fields.map((f, i) => (
              <div key={f} className="flex items-center gap-2">
                <span className="w-32 truncate font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {f}
                </span>
                <input
                  type="color"
                  value={colors[i % colors.length] ?? DEFAULT_SERIES_COLORS[i % DEFAULT_SERIES_COLORS.length]}
                  onChange={(e) => onColorChange(i, e.target.value)}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
