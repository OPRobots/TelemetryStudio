import { useState, useEffect, useRef, useCallback } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

interface TelemetryFrame {
  timestamp_ms: number;
  accX: number;
  accY: number;
  accZ: number;
  gyroX: number;
  gyroY: number;
  gyroZ: number;
  battery: number;
}

interface TelemetryData {
  fps: number;
  duration_ms: number;
  num_frames: number;
  fields: string[];
  frames: TelemetryFrame[];
}

interface RvfcMetadata {
  mediaTime: number;
  presentedFrames: number;
  width: number;
  height: number;
}

const MAX_LOG_LINES = 30;

function App(): React.ReactElement {
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [drift, setDrift] = useState(0);
  const [driftMax, setDriftMax] = useState(0);
  const [driftAvg, setDriftAvg] = useState(0);
  const [searchTime, setSearchTime] = useState(0);
  const [rvfcSupported, setRvfcSupported] = useState<boolean | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [logLines, setLogLines] = useState<string[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);
  const callbackIdRef = useRef<number | null>(null);
  const driftSumRef = useRef(0);
  const driftCountRef = useRef(0);
  const dataRef = useRef<(number | null)[][]>([[], [], [], []]);
  const cursorIdxRef = useRef(0);

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
      height: 400,
      series: [
        {},
        { label: 'Acc X', stroke: '#3b82f6', width: 1.5 },
        { label: 'Acc Y', stroke: '#22c55e', width: 1.5 },
        { label: 'Acc Z', stroke: '#ef4444', width: 1.5 },
      ],
      axes: [
        { stroke: '#64748b', grid: { stroke: '#1e293b' } },
        { stroke: '#64748b', grid: { stroke: '#1e293b' } }
      ],
      cursor: { drag: { x: true, y: true } }
    };

    uplotRef.current = new uPlot(opts, [[], [], [], []], chartRef.current);

    return () => {
      uplotRef.current?.destroy();
    };
  }, []);

  // Check RVFC support
  useEffect(() => {
    const supported = typeof HTMLVideoElement !== 'undefined' &&
      'requestVideoFrameCallback' in HTMLVideoElement.prototype;
    setRvfcSupported(supported);
    addLog(`requestVideoFrameCallback: ${supported ? 'SOPORTADO' : 'NO SOPORTADO'}`);
  }, [addLog]);

  // Binary search for closest frame
  const findClosestFrame = useCallback((targetMs: number, frames: TelemetryFrame[]): number => {
    if (frames.length === 0) return 0;

    let low = 0;
    let high = frames.length - 1;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      if (frames[mid].timestamp_ms < targetMs) {
        low = mid + 1;
      } else if (frames[mid].timestamp_ms > targetMs) {
        high = mid - 1;
      } else {
        return mid;
      }
    }

    if (low >= frames.length) return frames.length - 1;
    if (high < 0) return 0;

    const diffLow = Math.abs(frames[low].timestamp_ms - targetMs);
    const diffHigh = Math.abs(frames[high].timestamp_ms - targetMs);

    return diffLow <= diffHigh ? low : high;
  }, []);

  // RVFC loop
  const startRvfcLoop = useCallback(() => {
    const video = videoRef.current;
    if (!video || !telemetry) return;

    const loop = (_now: DOMHighResTimeStamp, metadata: RvfcMetadata) => {
      const mediaTimeMs = metadata.mediaTime * 1000;

      const t0 = performance.now();
      const frameIdx = findClosestFrame(mediaTimeMs, telemetry.frames);
      const elapsed = performance.now() - t0;

      const frame = telemetry.frames[frameIdx];
      if (frame) {
        const expectedMs = mediaTimeMs;
        const actualMs = frame.timestamp_ms;
        const driftMs = Math.abs(expectedMs - actualMs);

        setDrift(driftMs);
        setCurrentFrameIdx(frameIdx);
        setSearchTime(elapsed);

        driftSumRef.current += driftMs;
        driftCountRef.current++;
        setDriftAvg(driftSumRef.current / driftCountRef.current);
        setDriftMax(prev => Math.max(prev, driftMs));

        // Update chart data with up to 300 points around current position
        const start = Math.max(0, frameIdx - 150);
        const end = Math.min(telemetry.frames.length, frameIdx + 150);
        const slice = telemetry.frames.slice(start, end);

        dataRef.current[0] = slice.map(f => f.timestamp_ms);
        dataRef.current[1] = slice.map(f => f.accX);
        dataRef.current[2] = slice.map(f => f.accY);
        dataRef.current[3] = slice.map(f => f.accZ);

        uplotRef.current?.setData(dataRef.current as uPlot.AlignedData);

        // Move cursor to current position in the chart
        const cursorIdx = frameIdx - start;
        if (cursorIdx >= 0 && cursorIdx < slice.length) {
          uplotRef.current?.setCursor({ idx: cursorIdx });
        }

        // Log every 30 frames (~1s)
        if (frameIdx % 30 === 0) {
          addLog(`t=${mediaTimeMs.toFixed(0)}ms frame=${frameIdx} drift=${driftMs.toFixed(1)}ms search=${elapsed.toFixed(3)}ms`);
        }
      }

      callbackIdRef.current = video.requestVideoFrameCallback(loop);
    };

    callbackIdRef.current = video.requestVideoFrameCallback(loop);
  }, [telemetry, findClosestFrame, addLog]);

  // Stop RVFC loop
  const stopRvfcLoop = useCallback(() => {
    const video = videoRef.current;
    if (video && callbackIdRef.current !== null) {
      video.cancelVideoFrameCallback(callbackIdRef.current);
      callbackIdRef.current = null;
    }
  }, []);

  // Handle play/pause
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play();
      startRvfcLoop();
    } else {
      video.pause();
      stopRvfcLoop();
    }
  }, [isPlaying, startRvfcLoop, stopRvfcLoop]);

  // Handle playback rate change
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRvfcLoop();
    };
  }, [stopRvfcLoop]);

  // Load video file
  const loadVideo = async () => {
    const result = await window.syncAPI.openVideo();
    if (!result.canceled && result.filePath) {
      setVideoSrc(result.filePath);
      addLog(`Vídeo cargado: ${result.filePath}`);
    }
  };

  // Load telemetry file
  const loadTelemetry = async () => {
    const result = await window.syncAPI.openTelemetry();
    if (!result.canceled && result.filePath) {
      const fileResult = await window.syncAPI.readFile(result.filePath);
      if (fileResult.success && fileResult.content) {
        try {
          const data = JSON.parse(fileResult.content) as TelemetryData;
          setTelemetry(data);
          addLog(`Telemetría cargada: ${data.num_frames} frames, ${data.duration_ms}ms`);
          addLog(`Spike configurado en frame ${data.spike?.frame ?? 'N/A'}`);
        } catch (err) {
          addLog(`Error parseando JSON: ${(err as Error).message}`);
        }
      }
    }
  };

  // Step forward 1 frame
  const stepForward = () => {
    const video = videoRef.current;
    if (video) {
      video.currentTime += 1 / 30;
    }
  };

  // Step backward 1 frame
  const stepBackward = () => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = Math.max(0, video.currentTime - 1 / 30);
    }
  };

  // Toggle play
  const togglePlay = () => {
    setIsPlaying(prev => !prev);
  };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', backgroundColor: '#0a0e17', color: '#e2e8f0', minHeight: '100vh', padding: '20px' }}>
      <h1 style={{ marginBottom: '15px', color: '#3b82f6' }}>PoC 2: Video-Telemetry Sync</h1>

      {/* Status bar */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '15px', fontSize: '13px', alignItems: 'center' }}>
        <span>RVFC: <strong style={{ color: rvfcSupported ? '#22c55e' : '#ef4444' }}>
          {rvfcSupported === null ? '...' : rvfcSupported ? 'SÍ' : 'NO'}
        </strong></span>
        <span>Frame: <strong style={{ color: '#F2BE22' }}>{currentFrameIdx}</strong></span>
        <span>Drift: <strong style={{ color: drift < 33 ? '#22c55e' : '#ef4444' }}>{drift.toFixed(1)}ms</strong></span>
        <span>Drift avg: <strong style={{ color: '#94a3b8' }}>{driftAvg.toFixed(1)}ms</strong></span>
        <span>Drift max: <strong style={{ color: driftMax < 33 ? '#22c55e' : '#ef4444' }}>{driftMax.toFixed(1)}ms</strong></span>
        <span>Search: <strong style={{ color: '#94a3b8' }}>{searchTime.toFixed(3)}ms</strong></span>
        <span>Telemetry: <strong style={{ color: telemetry ? '#22c55e' : '#ef4444' }}>
          {telemetry ? `${telemetry.num_frames} frames` : 'No cargada'}
        </strong></span>
      </div>

      {/* Load buttons */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
        <button onClick={loadVideo} style={buttonStyle}>Cargar Vídeo</button>
        <button onClick={loadTelemetry} style={buttonStyle}>Cargar Telemetría</button>
      </div>

      {/* Main content: video + chart */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
        {/* Video */}
        <div style={{ flex: '0 0 640px', backgroundColor: '#111827', borderRadius: '8px', padding: '10px' }}>
          <video
            ref={videoRef}
            width={640}
            height={480}
            style={{ width: '100%', borderRadius: '4px', backgroundColor: '#000' }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => { setIsPlaying(false); stopRvfcLoop(); }}
          >
            {videoSrc && <source src={videoSrc} />}
          </video>
        </div>

        {/* Chart + log */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
          <div ref={chartRef} style={{ backgroundColor: '#111827', borderRadius: '8px', padding: '10px', flex: 1, minHeight: 0 }} />

          <div style={{ height: '150px', backgroundColor: '#111827', borderRadius: '8px', padding: '10px', overflow: 'hidden' }}>
            <h3 style={{ marginBottom: '5px', fontSize: '12px', color: '#94a3b8' }}>Sync Log</h3>
            <div style={{ overflow: 'auto', height: 'calc(100% - 20px)', fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>
              {logLines.length === 0 && <div style={{ color: '#475569' }}>Esperando datos...</div>}
              {logLines.map((line, i) => (
                <div key={i} style={{ padding: '1px 0', whiteSpace: 'nowrap' }}>{line}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button onClick={togglePlay} style={{ ...buttonStyle, backgroundColor: isPlaying ? '#ef4444' : '#22c55e', minWidth: '80px' }}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button onClick={stepBackward} style={buttonStyle}>◀ Step</button>
        <button onClick={stepForward} style={buttonStyle}>Step ▶</button>

        <span style={{ marginLeft: '15px', fontSize: '13px', color: '#94a3b8' }}>Speed:</span>
        {[0.5, 1, 2].map(rate => (
          <button
            key={rate}
            onClick={() => setPlaybackRate(rate)}
            style={{
              ...buttonStyle,
              backgroundColor: playbackRate === rate ? '#3b82f6' : '#193773'
            }}
          >
            {rate}x
          </button>
        ))}
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
  fontSize: '13px'
};

export default App;
