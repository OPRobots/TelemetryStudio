import { useState, useEffect, useRef, useCallback } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

interface TelemetryFrame {
  timestamp: number;
  accX: number;
  accY: number;
  accZ: number;
  gyroX: number;
  gyroY: number;
  gyroZ: number;
  battery: number;
}

interface SerialPortInfo {
  path: string;
  manufacturer?: string;
}

const MAX_POINTS = 300;
const MAX_LOG_LINES = 50;

function App(): React.ReactElement {
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [connected, setConnected] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [fps, setFps] = useState(0);
  const [error, setError] = useState<string>('');
  const [logLines, setLogLines] = useState<string[]>([]);

  const chartRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);
  const dataRef = useRef<(number | null)[][]>([
    [],
    [], [], [], []
  ]);
  const frameCountRef = useRef(0);
  const fpsTimerRef = useRef<NodeJS.Timeout | null>(null);

  const addLog = useCallback((msg: string) => {
    setLogLines(prev => {
      const next = [...prev, msg];
      return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
    });
  }, []);

  // Initialize uPlot
  useEffect(() => {
    if (!chartRef.current) return;

    const opts: uPlot.Options = {
      width: chartRef.current.clientWidth - 20,
      height: 500,
      series: [
        {},
        { label: 'Acc X', stroke: '#3b82f6', width: 1.5 },
        { label: 'Acc Y', stroke: '#22c55e', width: 1.5 },
        { label: 'Acc Z', stroke: '#ef4444', width: 1.5 },
        { label: 'Battery', stroke: '#F2BE22', width: 1.5, axis: 1 }
      ],
      axes: [
        { stroke: '#64748b', grid: { stroke: '#1e293b' } },
        { stroke: '#64748b', grid: { stroke: '#1e293b' }, side: 1 }
      ],
      cursor: { drag: { x: true, y: true } }
    };

    uplotRef.current = new uPlot(opts, [[], [], [], [], []], chartRef.current);

    return () => {
      uplotRef.current?.destroy();
    };
  }, []);

  // FPS counter
  useEffect(() => {
    fpsTimerRef.current = setInterval(() => {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);

    return () => {
      if (fpsTimerRef.current) clearInterval(fpsTimerRef.current);
    };
  }, []);

  // Auto-load ports on mount
  useEffect(() => {
    loadPorts();
  }, []);

  // Handle new frame
  const handleFrame = useCallback((frame: TelemetryFrame) => {
    const data = dataRef.current;
    data[0].push(frame.timestamp);
    data[1].push(frame.accX);
    data[2].push(frame.accY);
    data[3].push(frame.accZ);
    data[4].push(frame.battery);

    if (data[0].length > MAX_POINTS) {
      for (let i = 0; i < data.length; i++) {
        data[i] = data[i].slice(-MAX_POINTS);
      }
    }

    frameCountRef.current++;
    setFrameCount(prev => prev + 1);

    uplotRef.current?.setData(data as uPlot.AlignedData);
  }, []);

  // Handle raw data for log
  const handleRawLine = useCallback((line: string) => {
    addLog(`→ ${line}`);
  }, [addLog]);

  // Connect to serial listeners
  useEffect(() => {
    if (!connected) return;

    const unsubscribeFrame = window.serialAPI.onFrame(handleFrame);
    const unsubscribeRaw = window.serialAPI.onRaw(handleRawLine);
    const unsubscribeDisconnect = window.serialAPI.onDisconnected(() => {
      setConnected(false);
      addLog('⚠ Desconectado');
    });
    const unsubscribeError = window.serialAPI.onError((err) => {
      setError(err);
      setConnected(false);
      addLog(`✗ Error: ${err}`);
    });

    return () => {
      unsubscribeFrame();
      unsubscribeRaw();
      unsubscribeDisconnect();
      unsubscribeError();
    };
  }, [connected, handleFrame, handleRawLine, addLog]);

  const loadPorts = async () => {
    setError('');
    try {
      const availablePorts = await window.serialAPI.listPorts();
      setPorts(availablePorts);
      addLog(`Puertos encontrados: ${availablePorts.length}`);
      if (availablePorts.length > 0 && !selectedPort) {
        setSelectedPort(availablePorts[0].path);
      }
    } catch (err) {
      setError(`Error listando puertos: ${(err as Error).message}`);
    }
  };

  const connect = async () => {
    if (!selectedPort) return;
    setError('');
    addLog(`Conectando a ${selectedPort} @ ${baudRate} baud...`);

    const result = await window.serialAPI.open(selectedPort, baudRate);
    if (result.success) {
      setConnected(true);
      dataRef.current = [[], [], [], [], []];
      setFrameCount(0);
      addLog(`✓ Conectado a ${selectedPort}`);
    } else {
      setError(result.error || 'Error desconocido');
      addLog(`✗ Error: ${result.error}`);
    }
  };

  const disconnect = async () => {
    await window.serialAPI.close();
    setConnected(false);
    addLog('Desconectado');
  };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', backgroundColor: '#0a0e17', color: '#e2e8f0', minHeight: '100vh', padding: '20px' }}>
      <h1 style={{ marginBottom: '20px', color: '#3b82f6' }}>PoC 1: Serial → Widget</h1>

      {error && (
        <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#F2051920', border: '1px solid #F20519', borderRadius: '6px', color: '#ef4444', fontSize: '13px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={loadPorts} style={buttonStyle}>
          ⟳ Refrescar
        </button>

        <select
          value={selectedPort}
          onChange={(e) => setSelectedPort(e.target.value)}
          style={{ ...selectStyle, minWidth: '250px' }}
        >
          <option value="">Seleccionar puerto...</option>
          {ports.map(p => (
            <option key={p.path} value={p.path}>
              {p.path} {p.manufacturer ? `(${p.manufacturer})` : ''}
            </option>
          ))}
        </select>

        <select
          value={baudRate}
          onChange={(e) => setBaudRate(Number(e.target.value))}
          style={selectStyle}
        >
          <option value={9600}>9600</option>
          <option value={19200}>19200</option>
          <option value={38400}>38400</option>
          <option value={57600}>57600</option>
          <option value={115200}>115200</option>
          <option value={230400}>230400</option>
          <option value={460800}>460800</option>
          <option value={921600}>921600</option>
        </select>

        {!connected ? (
          <button onClick={connect} style={{ ...buttonStyle, backgroundColor: '#22c55e' }}>
            Conectar
          </button>
        ) : (
          <button onClick={disconnect} style={{ ...buttonStyle, backgroundColor: '#ef4444' }}>
            Desconectar
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', fontSize: '14px' }}>
        <span>Estado: <strong style={{ color: connected ? '#22c55e' : '#ef4444' }}>
          {connected ? 'Conectado' : 'Desconectado'}
        </strong></span>
        <span>FPS: <strong style={{ color: '#3b82f6' }}>{fps}</strong></span>
        <span>Frames: <strong style={{ color: '#F2BE22' }}>{frameCount}</strong></span>
        <span>Puertos: <strong style={{ color: '#94a3b8' }}>{ports.length}</strong></span>
      </div>

      <div style={{ display: 'flex', gap: '15px' }}>
        <div ref={chartRef} style={{ flex: 1, backgroundColor: '#111827', borderRadius: '8px', padding: '10px', minWidth: 0 }} />

        <div style={{ width: '320px', backgroundColor: '#111827', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginBottom: '8px', fontSize: '13px', color: '#94a3b8' }}>Log (últimas líneas)</h3>
          <div style={{ flex: 1, overflow: 'auto', fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>
            {logLines.length === 0 && (
              <div style={{ color: '#475569' }}>Esperando datos...</div>
            )}
            {logLines.map((line, i) => (
              <div key={i} style={{ padding: '1px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: '#193773',
  color: '#e2e8f0',
  cursor: 'pointer',
  fontSize: '14px'
};

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #1e293b',
  borderRadius: '6px',
  backgroundColor: '#1a1f2e',
  color: '#e2e8f0',
  fontSize: '14px'
};

export default App;
