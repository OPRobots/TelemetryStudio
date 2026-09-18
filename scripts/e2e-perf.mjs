/**
 * Medición de rendimiento del renderer (para comparar antes/después de
 * optimizaciones).
 *
 * Uso: npm run e2e:perf
 * Variables:
 *   PERF_MODE    'stream' (def.) | 'video'
 *   PERF_HZ      eventos/s del stream (def. 100, solo modo stream)
 *   PERF_SECONDS duración de la medición (def. 6)
 *   PERF_WIDGETS nº de widgets del layout de estrés (def. 20, solo stream)
 *   PERF_FRAMES  nº de frames del dataset (def. 50000, solo modo video)
 *
 * Salida: E2E_PERF {fps, avgGapMs, p95GapMs, maxGapMs, cpuAvg, cpuMax, memMB, ...}
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync } from 'fs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = join(currentDir, '..');
const mockVideo = join(root, 'pocs/02-video-sync/examples/mock_video.mp4');

const MODE = process.env.PERF_MODE === 'video' ? 'video' : 'stream';
const HZ = Number(process.env.PERF_HZ ?? 100);
const SECONDS = Number(process.env.PERF_SECONDS ?? 6);

const errors = [];
let sendTimer = null;

app.commandLine.appendSwitch('no-sandbox');
ipcMain.handle('settings:getSerial', () => null);
ipcMain.handle('settings:setSerial', () => {});

/** Genera el stream de telemetría (formato genérico `T:ms,campo:valor`). */
function makeLine(t) {
  const s = t / 1000;
  const parts = [`T:${Math.round(t)}`];
  for (let i = 0; i < 10; i++) {
    parts.push(`v${i}:${(Math.sin(s * (1 + i * 0.3)) * (i + 1)).toFixed(3)}`);
  }
  for (let i = 0; i < 6; i++) {
    parts.push(`s${i}:${Math.floor(s * (0.5 + i * 0.2)) % 2 === 0 ? 'RUNNING' : 'IDLE'}`);
  }
  parts.push(`x:${(Math.sin(s * 0.9) * 2).toFixed(3)}`);
  parts.push(`y:${(Math.cos(s * 0.9) * 2).toFixed(3)}`);
  parts.push(`heading:${((s * 90) % 360).toFixed(1)}`);
  parts.push(`ir:0x${(Math.round(0x00a5b3) ^ (Math.round(t) & 0xfff)).toString(16).padStart(6, '0')}`);
  return parts.join(',');
}

/** Layout de `n` widgets que referencia los campos del stream. */
function makePerfLayout(n) {
  const widgets = [];
  const push = (type, fields, height) =>
    widgets.push({
      id: `perf-${widgets.length}`,
      type,
      label: `${type} ${widgets.length}`,
      width: 6,
      height,
      dataFields: fields,
      config: {},
      visible: true,
    });

  while (widgets.length < n) {
    const i = widgets.length;
    const kind = i % 5;
    if (kind === 3 && widgets.filter((w) => w.type === 'StateTimeline').length < 6) {
      const sIdx = widgets.filter((w) => w.type === 'StateTimeline').length;
      push('StateTimeline', [`s${sIdx}`], 3);
    } else if (kind === 4 && !widgets.some((w) => w.type === 'Minimap2D')) {
      push('Minimap2D', ['x', 'y', 'heading'], 6);
    } else if (kind === 1 && !widgets.some((w) => w.type === 'DigitalBitmask')) {
      push('DigitalBitmask', ['ir'], 3);
    } else {
      push('TimeSeriesChart', [`v${widgets.filter((w) => w.type === 'TimeSeriesChart').length % 10}`], 4);
    }
  }
  return {
    version: 1,
    name: 'Perf 20',
    description: 'Layout de estrés',
    createdAt: '2026-01-01T00:00:00Z',
    modifiedAt: '2026-01-01T00:00:00Z',
    videoPanel: { x: 0, y: 0, width: 12, height: 8, showOverlays: false, overlays: [] },
    widgets,
    panels: { inspectorWidth: 288, inspectorVisible: true, videoRatio: 0.42, comparisonRatio: 0.5 },
    global: {
      theme: 'dark',
      units: { speed: 'rpm', distance: 'm', angle: 'deg' },
      showGrid: true,
      snapToGrid: false,
      gridSize: 40,
    },
  };
}

/** Sesión con dataset grande (para el modo video, datos estáticos). */
function makeVideoSession(frameCount) {
  const schema = [
    ['velocidad', 'number'],
    ['error', 'number'],
    ['state', 'string'],
    ['x', 'number'],
    ['y', 'number'],
    ['heading', 'number'],
  ];
  const frames = Array.from({ length: frameCount }, (_, i) => {
    const s = i / 50;
    return [
      i * 20,
      Number((2 + Math.sin(s)).toFixed(3)),
      Number((Math.cos(s / 2) * 0.5).toFixed(3)),
      Math.floor(s / 3) % 2 === 0 ? 'RUNNING' : 'IDLE',
      Number((Math.sin(s * 0.2) * 2).toFixed(3)),
      Number((Math.cos(s * 0.2) * 2).toFixed(3)),
      Number(((s * 20) % 360).toFixed(1)),
    ];
  });
  const w = (t, fields, size) => ({ t, size, fields, config: {} });
  return {
    v: 1,
    name: 'Perf video',
    created: '2026-01-01T00:00:00Z',
    video: { file: 'mock_video.mp4', fps: 30, duration_s: 10, resolution: [640, 480] },
    sync: { offset_ms: 0, anchor: null, rate: 1 },
    telemetry: { schema, frames },
    layout: {
      widgets: [
        w('StateTimeline', ['state'], [12, 3]),
        w('StateTimeline', ['state'], [12, 3]),
        w('Minimap2D', ['x', 'y', 'heading'], [12, 6]),
        w('TimeSeriesChart', ['velocidad'], [12, 5]),
        w('TimeSeriesChart', ['error'], [12, 5]),
      ],
    },
  };
}

const PERF_WIDGETS = Number(process.env.PERF_WIDGETS ?? 20);
const PERF_FRAMES = Number(process.env.PERF_FRAMES ?? 50000);
const perfLayout = makePerfLayout(PERF_WIDGETS);

let sessionJsonPath = '';
const sessionPaths = [];

function registerMocks(win) {
  ipcMain.handle('layout:loadAll', () => [perfLayout]);
  ipcMain.handle('layout:save', () => {});
  ipcMain.handle('layout:delete', () => {});
  ipcMain.handle('video:prepare', (_e, p) => ({ success: true, path: p, transcoded: false, fps: 30 }));
  ipcMain.handle('dialog:openVideo', () => ({ canceled: false, filePath: mockVideo }));
  ipcMain.handle('serial:list', () => [{ path: '/dev/ttyPERF', manufacturer: 'Perf' }]);
  ipcMain.handle('serial:open', () => {
    if (sendTimer) clearInterval(sendTimer);
    let t = 0;
    const step = 1000 / HZ;
    sendTimer = setInterval(() => {
      if (!win.isDestroyed()) win.webContents.send('serial:data', makeLine(t));
      t += step;
    }, step);
    return { success: true };
  });
  ipcMain.handle('serial:close', () => {
    if (sendTimer) clearInterval(sendTimer);
    sendTimer = null;
    return { success: true };
  });
  // Modo video: abrir una sesión con dataset grande
  ipcMain.handle('dialog:openSession', () => {
    if (!sessionJsonPath) {
      sessionJsonPath = join('/tmp', 'opencode', 'perf-video-session.json');
      mkdirSync(dirname(sessionJsonPath), { recursive: true });
      writeFileSync(sessionJsonPath, JSON.stringify(makeVideoSession(PERF_FRAMES)));
    }
    sessionPaths.push(sessionJsonPath);
    return { canceled: false, filePath: sessionJsonPath };
  });
  ipcMain.handle('file:read', () => ({
    success: true,
    content: JSON.stringify(makeVideoSession(PERF_FRAMES)),
  }));
  ipcMain.handle('session:getVideoPath', () => mockVideo);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: true,
    width: 1440,
    height: 900,
    backgroundColor: '#0b0e14',
    webPreferences: {
      preload: join(root, 'out/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  });

  win.webContents.on('console-message', (...args) => {
    const level = args[1] && typeof args[1] === 'object' ? args[1].level : args[1];
    const message = args[1] && typeof args[1] === 'object' ? args[1].message : args[2];
    if (level === 3 || level === 'error') errors.push(String(message));
  });

  registerMocks(win);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = (js) => win.webContents.executeJavaScript(js);
  const clickByText = (text) => `(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === ${JSON.stringify(text)});
    if (btn) { btn.click(); return true; }
    return false;
  })()`;

  const chooseSerialParser = (label) => `(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.trim() === ${JSON.stringify(label)});
    if (b) b.click();
    return !!b;
  })()`;
  const setSerialCsvLabels = (labels) => `(() => {
    const input = document.getElementById('serial-csv-labels');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(labels)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`;
  const widgetCount = () => run(`document.querySelectorAll('.widget-card').length`);
  const poll = async (fn, timeout = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await fn()) return true;
      await wait(100);
    }
    return false;
  };

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await wait(1200);

    let readyWidgets;
    let videoDiag = null;

    if (MODE === 'stream') {
      // Stream de alta frecuencia → auto-layout inicial
      win.webContents.send('menu:action', 'connect-serial');
      await wait(400);
    await win.webContents.executeJavaScript(chooseSerialParser("Default"));
    await new Promise((r) => setTimeout(r, 150));
      await run(clickByText('Conectar'));
      await poll(async () => (await widgetCount()) > 0, 8000);

      // Cargar el layout de estrés
      win.webContents.send('menu:action', 'layouts');
      await wait(400);
      await run(`(() => {
        const rows = Array.from(document.querySelectorAll('.dialog-panel div.mb-1'));
        const row = rows.find((r) => r.textContent && r.textContent.includes('Perf 20'));
        const btn = row && Array.from(row.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Cargar');
        if (btn) { btn.click(); return true; }
        return false;
      })()`);
      await poll(async () => (await widgetCount()) >= PERF_WIDGETS, 10000);
      readyWidgets = await widgetCount();
      await wait(600);
    } else {
      // Modo video: sesión con dataset grande + reproducción
      win.webContents.send('menu:action', 'open-session');
      await poll(async () => (await widgetCount()) >= 5, 15000);
      readyWidgets = await widgetCount();
      await poll(async () => run(`!!document.querySelector('video')`), 8000);
      await wait(800);
      // Reproducir (barra compartida): botón Play
      await run(clickByText('Play'));
      await wait(1200);
      videoDiag = await run(
        `(() => { const v = document.querySelector('video'); return v ? { paused: v.paused, t: Number(v.currentTime.toFixed(2)), rs: v.readyState } : { none: true }; })()`
      );
    }

    // Sampler de frames del renderer (rAF)
    await run(`(() => {
      window.__perf = { times: [] };
      const loop = (t) => { window.__perf.times.push(t); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      return true;
    })()`);

    const cpuSamples = [];
    const memSamples = [];
    const cpuTimer = setInterval(() => {
      const m = app.getAppMetrics().find((p) => p.type === 'Tab' || p.type === 'renderer');
      if (m) {
        cpuSamples.push(m.cpu.percentCPUUsage);
        memSamples.push(m.memory.workingSetSize);
      }
    }, 200);

    await wait(SECONDS * 1000);
    clearInterval(cpuTimer);

    const times = await run(`(() => { const t = window.__perf.times; window.__perf = null; return t; })()`);
    const gaps = [];
    for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    gaps.sort((a, b) => a - b);
    const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    const p95 = gaps.length ? gaps[Math.min(Math.floor(gaps.length * 0.95), gaps.length - 1)] : 0;
    const maxGap = gaps.length ? gaps[gaps.length - 1] : 0;
    const fps = avgGap > 0 ? 1000 / avgGap : 0;

    const cpuAvg = cpuSamples.length ? cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length : 0;
    const cpuMax = cpuSamples.length ? Math.max(...cpuSamples) : 0;
    const memKb = memSamples.length ? Math.max(...memSamples) : 0;

    const result = {
      mode: MODE,
      widgets: readyWidgets,
      hz: MODE === 'stream' ? HZ : undefined,
      frames: MODE === 'video' ? PERF_FRAMES : undefined,
      video: videoDiag ?? undefined,
      seconds: SECONDS,
      rafFrames: times.length,
      fps: Number(fps.toFixed(1)),
      avgGapMs: Number(avgGap.toFixed(2)),
      p95GapMs: Number(p95.toFixed(2)),
      maxGapMs: Number(maxGap.toFixed(2)),
      cpuAvg: Number(cpuAvg.toFixed(1)),
      cpuMax: Number(cpuMax.toFixed(1)),
      memMB: Number((memKb / 1024).toFixed(1)),
    };
    console.log('E2E_PERF ' + JSON.stringify(result));
    if (errors.length > 0) console.log('E2E_PERF_ERRORS ' + JSON.stringify(errors.slice(0, 10)));

    const ok = readyWidgets > 0 && times.length > 0 && errors.length === 0;
    console.log(ok ? 'E2E_PERF_OK' : 'E2E_PERF_FAIL');
    if (sendTimer) clearInterval(sendTimer);
    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('E2E_PERF_EXCEPTION', err);
    if (sendTimer) clearInterval(sendTimer);
    app.exit(1);
  }
});
