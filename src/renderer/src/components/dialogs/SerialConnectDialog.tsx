import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { serialIngest } from '../../lib/serial-ingest';
import { DEFAULT_CSV_FIELDS, type SerialParserKind, type CsvSeparator } from '@parsers/serial';

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

const PARSERS: Array<{ kind: SerialParserKind; label: string; description: string; example: string }> = [
  {
    kind: 'keyvalue',
    label: 'Default',
    description: 'Clave:valor con timestamp',
    example: 'T:1234,speed:1500,battery:85.5,armed:true',
  },
  {
    kind: 'csv',
    label: 'CSV',
    description: 'Valores separados por un separador',
    example: '1000,1.20,2.30,9.80',
  },
  {
    kind: 'macroarray',
    label: 'Macroarray',
    description: 'Un campo por línea con prefijo >',
    example: '>speed:1500',
  },
];

const SEPARATORS: Array<{ value: CsvSeparator; label: string }> = [
  { value: ',', label: 'Coma ( , )' },
  { value: ';', label: 'Punto y coma ( ; )' },
  { value: ' ', label: 'Espacio' },
];

interface SerialConnectDialogProps {
  onClose: () => void;
}

export function SerialConnectDialog({ onClose }: SerialConnectDialogProps): React.ReactElement {
  const ports = useAppStore((s) => s.serialPorts);
  const setSerialPorts = useAppStore((s) => s.setSerialPorts);
  const connected = useAppStore((s) => s.serialConnected);
  const serialPort = useAppStore((s) => s.serialPort);
  const serialError = useAppStore((s) => s.serialError);

  const [selectedPort, setSelectedPort] = useState<string>('');
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [parserKind, setParserKind] = useState<SerialParserKind>('keyvalue');
  const [hasTimestamp, setHasTimestamp] = useState<boolean>(true);
  const [csvSeparator, setCsvSeparator] = useState<CsvSeparator>(',');
  const [csvLabelsText, setCsvLabelsText] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const csvLabels = useMemo(
    () => csvLabelsText.split(',').map((l) => l.trim()).filter((l) => l.length > 0),
    [csvLabelsText]
  );

  const csvLabelsValid = useMemo(() => {
    if (parserKind !== 'csv') return true;
    // Vacío = se usan los nombres por defecto (placeholder).
    return csvLabels.length === 0 || new Set(csvLabels).size === csvLabels.length;
  }, [parserKind, csvLabels]);

  const refresh = useCallback(async () => {
    setBusy(true);
    const list = await serialIngest.listPorts();
    setSerialPorts(list);
    if (list.length > 0 && !selectedPort) {
      setSelectedPort(list[0]!.path);
    }
    setBusy(false);
  }, [setSerialPorts, selectedPort]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Configuración recordada.
  useEffect(() => {
    void (async () => {
      const saved = await window.api?.settingsGetSerial().catch(() => null);
      if (!saved) return;
      setParserKind(saved.kind);
      setHasTimestamp(saved.hasTimestamp);
      setCsvSeparator(saved.csvSeparator);
      setCsvLabelsText(saved.csvLabels.length > 0 ? saved.csvLabels.join(', ') : '');
    })();
  }, []);

  const selectParser = (kind: SerialParserKind): void => {
    setParserKind(kind);
    setHasTimestamp(kind !== 'macroarray');
  };

  const connect = async (): Promise<void> => {
    if (!selectedPort) return;
    if (!csvLabelsValid) return;
    setBusy(true);
    const labels = csvLabels.length > 0 ? csvLabels : DEFAULT_CSV_FIELDS;
    await serialIngest.connect(selectedPort, baudRate, {
      kind: parserKind,
      hasTimestamp,
      csv: { separator: csvSeparator, labels },
    });
    void window.api
      ?.settingsSetSerial({
        kind: parserKind,
        hasTimestamp,
        csvSeparator,
        csvLabels: labels,
      })
      .catch(() => undefined);
    setBusy(false);
    onClose();
  };

  const disconnect = async (): Promise<void> => {
    setBusy(true);
    await serialIngest.disconnect();
    setBusy(false);
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-panel" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Conexión Serial
        </h3>

        {connected ? (
          <div className="mb-3 text-xs" style={{ color: '#4ade80' }}>
            Conectado a {serialPort}
          </div>
        ) : (
          <>
            <label className="dialog-label">Puerto</label>
            <div className="flex gap-2">
              <select
                className="dialog-input flex-1"
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
              >
                {ports.length === 0 && <option value="">Sin puertos detectados</option>}
                {ports.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.path} {p.manufacturer ? `— ${p.manufacturer}` : ''}
                  </option>
                ))}
              </select>
              <button className="toolbar-button" onClick={() => void refresh()} disabled={busy}>
                ↻
              </button>
            </div>

            <label className="dialog-label mt-2">Baud rate</label>
            <select
              className="dialog-input"
              value={baudRate}
              onChange={(e) => setBaudRate(Number(e.target.value))}
            >
              {BAUD_RATES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <label className="dialog-label mt-3">Formato de los datos</label>
            <div className="flex gap-1">
              {PARSERS.map((p) => {
                const active = parserKind === p.kind;
                return (
                  <button
                    key={p.kind}
                    type="button"
                    className="toolbar-button toolbar-button--compact flex-1"
                    style={
                      active
                        ? {
                            background: 'var(--accent-soft)',
                            borderColor: 'var(--accent-border)',
                            color: 'var(--accent)',
                          }
                        : undefined
                    }
                    onClick={() => selectParser(p.kind)}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
              {PARSERS.find((p) => p.kind === parserKind)?.description}. Ej.:{' '}
              <code>{PARSERS.find((p) => p.kind === parserKind)?.example}</code>
            </p>

            <label className="dialog-checkbox mt-2">
              <input
                type="checkbox"
                checked={hasTimestamp}
                onChange={(e) => setHasTimestamp(e.target.checked)}
              />
              <span className="text-xs">La telemetría incluye timestamp (1ª columna/campo)</span>
            </label>

            {parserKind === 'csv' && (
              <div className="mt-2">
                <label className="dialog-label">Separador</label>
                <div className="flex gap-1">
                  {SEPARATORS.map((s) => {
                    const active = csvSeparator === s.value;
                    return (
                      <button
                        key={s.label}
                        type="button"
                        className="toolbar-button toolbar-button--compact flex-1"
                        style={
                          active
                            ? {
                                background: 'var(--accent-soft)',
                                borderColor: 'var(--accent-border)',
                                color: 'var(--accent)',
                              }
                            : undefined
                        }
                        onClick={() => setCsvSeparator(s.value)}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>

                <label className="dialog-label mt-2">Etiquetas (separadas por comas)</label>
                <input
                  id="serial-csv-labels"
                  className="dialog-input"
                  value={csvLabelsText}
                  placeholder={DEFAULT_CSV_FIELDS.join(', ')}
                  onChange={(e) => setCsvLabelsText(e.target.value)}
                />
                {!csvLabelsValid && (
                  <p className="mt-1 text-[10px]" style={{ color: '#f87171' }}>
                    Define al menos una etiqueta y sin duplicados.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {serialError && (
          <div className="mt-3 text-xs" style={{ color: '#f87171' }}>
            {serialError}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button className="toolbar-button" onClick={onClose}>
            Cerrar
          </button>
          {connected ? (
            <button
              className="toolbar-button"
              style={{ backgroundColor: '#dc2626' }}
              onClick={() => void disconnect()}
              disabled={busy}
            >
              Desconectar
            </button>
          ) : (
            <button
              className="toolbar-button toolbar-button-primary"
              onClick={() => void connect()}
              disabled={busy || !selectedPort || !csvLabelsValid}
            >
              Conectar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
