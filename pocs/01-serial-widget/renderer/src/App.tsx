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

const SERIES_CONFIG: { key: keyof TelemetryFrame; label: string; color: string }[] = [
  { key: 'accX', label: 'Acc X', color: '#3b82f6' },
  { key: 'accY', label: 'Acc Y', color: '#22c55e' },
  { key: 'accZ', label: 'Acc Z', color: '#ef4444' },
  { key: 'battery', label: 'Battery', color: '#F2BE22' }
];

function App(): React.ReactElement {
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [connected, setConnected] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [fps, setFps] = useState(0);

  const chartRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);
  const dataRef = useRef<(number | null)[][]>([
    [], // timestamp
    [], [], [], [] // accX, accY, accZ, battery
  ]);
  const frameCountRef = useRef(0);
  const fpsTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize uPlot
  useEffect(() => {
    if (!chartRef.current) return;

    const opts: uPlot.Options = {
      width: 1100,
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

  // Handle new frame
  const handleFrame = useCallback((frame: TelemetryFrame) => {
    const data = dataRef.current;
    data[0].push(frame.timestamp);
    data[1].push(frame.accX);
    data[2].push(frame.accY);
    data[3].push(frame.accZ);
    data[4].push(frame.battery);

    // Keep only last MAX_POINTS
    if (data[0].length > MAX_POINTS) {
      for (let i = 0; i < data.length; i++) {
        data[i] = data[i].slice(-MAX_POINTS);
      }
    }

    frameCountRef.current++;
    setFrameCount(prev => prev + 1);

    uplotRef.current?.setData(data as uPlot.AlignedData);
  }, []);

  // Connect to serial
  useEffect(() => {
    if (!connected) return;

    const unsubscribeFrame = window.serialAPI.onFrame(handleFrame);
    const unsubscribeDisconnect = window.serialAPI.onDisconnected(() => {
      setConnected(false);
    });
    const unsubscribeError = window.serialAPI.onError((err) => {
      console.error('Serial error:', err);
      setConnected(false);
    });

    return () => {
      unsubscribeFrame();
      unsubscribeDisconnect();
      unsubscribeError();
    };
  }, [connected, handleFrame]);

  const loadPorts = async () => {
    const availablePorts = await window.serialAPI.listPorts();
    setPorts(availablePorts);
    if (availablePorts.length > 0 && !selectedPort) {
      setSelectedPort(availablePorts[0].path);
    }
  };

  const connect = async () => {
    if (!selectedPort) return;
    const result = await window.serialAPI.open(selectedPort, baudRate);
    if (result.success) {
      setConnected(true);
      dataRef.current = [[], [], [], [], []];
      setFrameCount(0);
    } else {
      alert(`Error: ${result.error}`);
    }
  };

  const disconnect = async () => {
    await window.serialAPI.close();
    setConnected(false);
  };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', backgroundColor: '#0a0e17', color: '#e2e8f0', minHeight: '100vh', padding: '20px' }}>
      <h1 style={{ marginBottom: '20px', color: '#3b82f6' }}>PoC 1: Serial → Widget</h1>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center' }}>
        <button onClick={loadPorts} style={buttonStyle}>
          Listar Puertos
        </button>

        <select
          value={selectedPort}
          onChange={(e) => setSelectedPort(e.target.value)}
          style={selectStyle}
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
      </div>

      <div ref={chartRef} style={{ backgroundColor: '#111827', borderRadius: '8px', padding: '10px' }} />
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
