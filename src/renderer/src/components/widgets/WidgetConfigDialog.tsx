import { useMemo, useState } from 'react';
import type { WidgetConfig } from '@core/types/layout';
import { ROW_UNIT, WIDTH_PRESETS } from '@core/types/layout';
import { telemetryStore } from '@core/telemetry-store';
import { useLayoutStore } from '../../stores/layout-store';
import { useAppStore } from '../../stores/app-store';
import { clampHeight } from '../../lib/widget-layout';
import { seriesPalette, statePalette } from '@widgets/color-palette';
import {
  collectStateKeys,
  resolveStateEntry,
  sortStateKeys,
} from '@widgets/state-timeline/state-entry';
import type { StateEntry, StateValue } from '@widgets/state-timeline/state-entry';

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
              const colors = [...((config['colors'] as string[]) ?? seriesPalette(fields.length))];
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
                value={(config['rows'] as number) ?? 1}
                onChange={(e) => setConfigValue('rows', Number(e.target.value))}
              />
            </div>
          </div>
        )}

        {widget.type === 'StateTimeline' && (
          <StateTimelineOptions field={fields[0]} config={config} onChange={setConfigValue} />
        )}

        {widget.type === 'Minimap2D' && (
          <MinimapOptions config={config} onChange={setConfigValue} />
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
  const palette = seriesPalette(Math.max(fields.length, 1));
  const colors = (config['colors'] as string[]) ?? palette;

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
                  value={colors[i] ?? palette[i] ?? '#5b8dd9'}
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

interface MinimapOptionsProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

function MinimapOptions({ config, onChange }: MinimapOptionsProps): React.ReactElement {
  return (
    <div className="mt-3">
      <label className="dialog-checkbox mt-2">
        <input
          type="checkbox"
          checked={(config['showGrid'] as boolean) ?? true}
          onChange={(e) => onChange('showGrid', e.target.checked)}
        />
        <span className="text-xs">Mostrar rejilla</span>
      </label>

      <div className="dialog-row mt-2">
        <div>
          <label className="dialog-label">Tamaño de rejilla</label>
          <input
            type="number"
            step={0.1}
            className="dialog-input"
            value={(config['gridSize'] as number) ?? 0.5}
            onChange={(e) => onChange('gridSize', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="dialog-row mt-2">
        <div>
          <label className="dialog-label">Largo del robot</label>
          <input
            type="number"
            className="dialog-input"
            value={(config['robotLength'] as number) ?? 18}
            onChange={(e) => onChange('robotLength', Number(e.target.value))}
          />
        </div>
        <div>
          <label className="dialog-label">Ancho del robot</label>
          <input
            type="number"
            className="dialog-input"
            value={(config['robotWidth'] as number) ?? 11}
            onChange={(e) => onChange('robotWidth', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="dialog-row mt-2">
        <div>
          <label className="dialog-label">Color de trayectoria</label>
          <input
            type="color"
            value={(config['trailColor'] as string) ?? '#3b82f6'}
            onChange={(e) => onChange('trailColor', e.target.value)}
          />
        </div>
        <div>
          <label className="dialog-label">Color del robot</label>
          <input
            type="color"
            value={(config['robotColor'] as string) ?? '#F2BE22'}
            onChange={(e) => onChange('robotColor', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

/** Interpreta una clave del stateMap como número si lo parece, si no texto. */
function parseStateKey(key: string): StateValue {
  return /^-?\d+(?:\.\d+)?$/.test(key.trim()) ? Number(key) : key;
}

interface StateTimelineOptionsProps {
  field: string | undefined;
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

function StateTimelineOptions({ field, config, onChange }: StateTimelineOptionsProps): React.ReactElement {
  const [refresh, setRefresh] = useState(0);
  const [newKey, setNewKey] = useState('');
  const stateMap = (config['stateMap'] as Record<string, StateEntry>) ?? {};

  const colorKeys = useMemo(
    () => collectStateKeys(telemetryStore.getAllFrames(), field, stateMap),
    // `refresh` fuerza redetección con datos recién llegados.
    [field, stateMap, refresh]
  );
  // Misma paleta que el widget → los colores por defecto coinciden. El color se
  // asigna por orden de aparición (estable); la lista se muestra ordenada.
  const palette = statePalette(colorKeys.length);
  const colorByKey: Record<string, string> = {};
  colorKeys.forEach((key, i) => {
    colorByKey[key] = palette[i] ?? palette[0] ?? '#5b8dd9';
  });
  const displayKeys = useMemo(() => sortStateKeys(colorKeys), [colorKeys]);

  const updateEntry = (key: string, base: StateEntry, patch: Partial<StateEntry>): void => {
    onChange('stateMap', { ...stateMap, [key]: { ...base, ...patch } });
  };

  const resetEntry = (key: string): void => {
    const next = { ...stateMap };
    delete next[key];
    onChange('stateMap', next);
  };

  const addEntry = (): void => {
    const key = newKey.trim();
    if (key.length === 0) return;
    const base = resolveStateEntry(parseStateKey(key), stateMap);
    onChange('stateMap', { ...stateMap, [key]: base });
    setNewKey('');
  };

  return (
    <div className="mt-3">
      <label className="dialog-label">Estados ({displayKeys.length})</label>
      {displayKeys.length === 0 && (
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Sin estados detectados. Carga datos o añade un valor manualmente.
        </span>
      )}
      <div className="flex flex-col gap-1">
        {displayKeys.map((key) => {
          const entry = resolveStateEntry(parseStateKey(key), stateMap, colorByKey[key]);
          const customized = key in stateMap;
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="w-20 truncate font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                {key}
              </span>
              <input
                className="dialog-input"
                style={{ flex: 1 }}
                value={entry.label}
                onChange={(e) => updateEntry(key, entry, { label: e.target.value })}
              />
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(entry.color) ? entry.color : '#64748b'}
                onChange={(e) => updateEntry(key, entry, { color: e.target.value })}
              />
              <button
                type="button"
                className="toolbar-button toolbar-button--compact"
                disabled={!customized}
                title="Restablecer"
                onClick={() => resetEntry(key)}
              >
                ↺
              </button>
            </div>
          );
        })}
      </div>
      <div className="dialog-row mt-2">
        <input
          className="dialog-input"
          placeholder="valor (p. ej. RUNNING)"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
        />
        <button type="button" className="toolbar-button toolbar-button--compact" onClick={addEntry}>
          Añadir
        </button>
        <button
          type="button"
          className="toolbar-button toolbar-button--compact"
          onClick={() => setRefresh((n) => n + 1)}
        >
          Detectar
        </button>
      </div>
    </div>
  );
}
