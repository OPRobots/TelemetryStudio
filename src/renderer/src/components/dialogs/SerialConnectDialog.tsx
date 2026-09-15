import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../../stores/app-store';
import { serialIngest } from '../../lib/serial-ingest';
import { DEFAULT_CSV_FIELDS } from '@parsers/serial-uart-parser';

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

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
  const [csvFieldsText, setCsvFieldsText] = useState<string>(DEFAULT_CSV_FIELDS.join(', '));
  const [busy, setBusy] = useState(false);

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

  const connect = async (): Promise<void> => {
    if (!selectedPort) return;
    const csvFields = csvFieldsText
      .split(',')
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
    setBusy(true);
    await serialIngest.connect(selectedPort, baudRate, csvFields);
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
      <div className="dialog-panel" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
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

            <label className="dialog-label mt-2">Campos CSV (sin encabezado)</label>
            <input
              className="dialog-input"
              value={csvFieldsText}
              onChange={(e) => setCsvFieldsText(e.target.value)}
            />
            <p className="mt-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
              Para datos posicionales `timestamp,campo1,campo2,...`. También se aceptan formatos
              con claves `T:ms,campo:valor`.
            </p>
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
              disabled={busy || !selectedPort}
            >
              Conectar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
