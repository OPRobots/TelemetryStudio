import React, { useState, useEffect, useCallback } from 'react';

interface PortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}

interface SystemInfo {
  platform: string;
  arch: string;
  electron: string;
  node: string;
  chrome: string;
  appVersion: string;
}

export default function App() {
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshPorts = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await window.serialAPI.list();
    if (result.success) {
      setPorts(result.ports);
    } else {
      setError(result.error || 'Error desconocido');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    window.serialAPI.getSystemInfo().then(setSysInfo);
    refreshPorts();
  }, [refreshPorts]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#0a0e17',
        color: '#e2e8f0',
        fontFamily: 'JetBrains Mono, monospace',
        padding: 16,
        gap: 12,
      }}
    >
      <h1 style={{ margin: 0, fontSize: 18, color: '#60a5fa' }}>
        PoC 4: Packaging — serialport test
      </h1>

      {/* Refresh button */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={refreshPorts}
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: '#193773',
            color: '#e2e8f0',
            border: 'none',
            borderRadius: 4,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? 'Buscando...' : 'Refresh Ports'}
        </button>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          {ports.length} puerto{ports.length !== 1 ? 's' : ''} detectado{ports.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Port list */}
      <div
        style={{
          flex: 1,
          backgroundColor: '#111827',
          borderRadius: 8,
          padding: 12,
          overflowY: 'auto',
        }}
      >
        {error && (
          <div style={{ color: '#F20519', marginBottom: 8, fontSize: 13 }}>
            Error: {error}
          </div>
        )}

        {ports.length === 0 && !error && (
          <div style={{ color: '#64748b', fontSize: 13 }}>
            No se detectaron puertos serie
          </div>
        )}

        {ports.map((port, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
              marginBottom: 6,
              backgroundColor: '#1a1f2e',
              borderRadius: 6,
              borderLeft: '3px solid #3b82f6',
            }}
          >
            <div>
              <div style={{ fontSize: 14, color: '#e2e8f0' }}>{port.path}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {port.manufacturer || 'Desconocido'}
                {port.serialNumber ? ` | SN: ${port.serialNumber}` : ''}
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {port.vendorId ? `VID:${port.vendorId}` : ''}
              {port.productId ? ` PID:${port.productId}` : ''}
            </div>
          </div>
        ))}
      </div>

      {/* System info footer */}
      {sysInfo && (
        <div
          style={{
            display: 'flex',
            gap: 16,
            fontSize: 11,
            color: '#64748b',
            padding: '6px 0',
            borderTop: '1px solid #1e293b',
          }}
        >
          <span>Platform: {sysInfo.platform}</span>
          <span>Arch: {sysInfo.arch}</span>
          <span>Electron: {sysInfo.electron}</span>
          <span>Node: {sysInfo.node}</span>
          <span>Chrome: {sysInfo.chrome}</span>
          <span>v{sysInfo.appVersion}</span>
        </div>
      )}
    </div>
  );
}
