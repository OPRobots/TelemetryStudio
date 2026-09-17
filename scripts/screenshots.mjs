/**
 * Genera las capturas del README en `docs/assets/` con datos simulados.
 * Requiere un build previo (`npm run build`).
 *
 * Uso: npm run screenshots
 * Salida: docs/assets/{analysis,export,no-video,comparison}.png
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync } from 'fs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = join(currentDir, '..');
const mockVideo = join(root, 'pocs/02-video-sync/examples/mock_video.mp4');
const assetsDir = join(root, 'docs', 'assets');

let sendTimer = null;

app.commandLine.appendSwitch('no-sandbox');

function makeLine(t) {
  const s = t / 1000;
  const x = (Math.sin(s * 0.9) * 2.5).toFixed(2);
  const y = (Math.cos(s * 0.9) * 2.5).toFixed(2);
  const heading = ((s * 90) % 360).toFixed(1);
  const speed = (1.5 + Math.sin(s * 3) * 0.8).toFixed(2);
  const ir = Math.round(0x00a5b3 ^ ((t / 20) & 0xfff))
    .toString(16)
    .padStart(6, '0');
  const state = Math.floor(s / 3) % 2 === 0 ? 'RUNNING' : 'IDLE';
  return (
    `T:${Math.round(t)},position_x:${x},position_y:${y},heading:${heading},` +
    `speed:${speed},state:${state},ir_sensors:0x${ir}`
  );
}

function makeSession(name) {
  return {
    v: 1,
    name,
    created: '2026-01-01T00:00:00Z',
    video: { file: 'mock_video.mp4', fps: 30, duration_s: 10, resolution: [1920, 1080] },
    sync: { offset_ms: 0, anchor: null, rate: 1 },
    telemetry: {
      schema: [
        ['velocidad', 'number'],
        ['error', 'number'],
      ],
      frames: Array.from({ length: 200 }, (_, i) => [
        i * 20,
        Number((2 + Math.sin(i / 10)).toFixed(3)),
        Number((Math.cos(i / 8) * 0.5).toFixed(3)),
      ]),
    },
    layout: {
      widgets: [
        {
          t: 'TimeSeriesChart',
          size: [12, 7],
          fields: ['velocidad'],
          config: { yLabel: 'Velocidad (m/s)' },
        },
        {
          t: 'TimeSeriesChart',
          size: [12, 6],
          fields: ['error'],
          config: { yLabel: 'Error de línea (m)' },
        },
      ],
    },
  };
}

function registerMocks(win) {
  const sessionA = makeSession('Sesión A');
  const sessionB = makeSession('Sesión B');
  const jsonPath = join('/tmp', 'opencode', 'screenshots-session.json');
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(sessionA));

  let sessionDialogCount = 0;

  ipcMain.handle('layout:loadAll', () => []);
  ipcMain.handle('video:prepare', (_e, p) => ({ success: true, path: p, transcoded: false, fps: 30 }));
  ipcMain.handle('dialog:openVideo', () => ({ canceled: false, filePath: mockVideo }));
  ipcMain.handle('serial:list', () => [{ path: '/dev/ttyMOCK', manufacturer: 'Simulador' }]);
  ipcMain.handle('serial:open', () => {
    if (sendTimer) clearInterval(sendTimer);
    let t = 0;
    sendTimer = setInterval(() => {
      if (!win.isDestroyed()) win.webContents.send('serial:data', makeLine(t));
      t += 20;
    }, 20);
    return { success: true };
  });
  ipcMain.handle('serial:close', () => {
    if (sendTimer) clearInterval(sendTimer);
    sendTimer = null;
    if (!win.isDestroyed()) win.webContents.send('serial:status', { connected: false });
    return { success: true };
  });
  ipcMain.handle('export:start', () => ({ success: true }));
  ipcMain.handle('export:writeFrame', () => ({ success: true }));
  ipcMain.handle('export:finalize', () => ({ success: true, outputPath: '/tmp/opencode/screenshot.mp4' }));
  ipcMain.handle('export:save', () => ({ canceled: true }));
  ipcMain.handle('session:getVideoPath', () => mockVideo);
  ipcMain.handle('file:read', () => ({ success: true, content: JSON.stringify(sessionB) }));
  ipcMain.handle('dialog:openSession', () => {
    const filePath = join('/tmp', 'opencode', `screenshot-session-${sessionDialogCount}.json`);
    writeFileSync(filePath, JSON.stringify(sessionDialogCount === 0 ? sessionA : sessionB));
    sessionDialogCount += 1;
    return { canceled: false, filePath };
  });
}

app.whenReady().then(async () => {
  mkdirSync(assetsDir, { recursive: true });

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

  registerMocks(win);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = (js) => win.webContents.executeJavaScript(js);
  const clickByText = (text) => `(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === ${JSON.stringify(text)});
    if (btn) { btn.click(); return true; }
    return false;
  })()`;
  const capture = async (name) => {
    const image = await win.webContents.capturePage();
    writeFileSync(join(assetsDir, name), image.toPNG());
    console.log('SCREENSHOT ' + name);
  };

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await wait(1200);

    // Serial en vivo (menú nativo) + vídeo
    win.webContents.send('menu:action', 'connect-serial');
    await wait(400);
    await run(clickByText('Conectar'));
    await wait(1200);
    win.webContents.send('menu:action', 'open-video');
    await wait(2000);
    await capture('analysis.png');

    // Diálogo de exportación
    win.webContents.send('menu:action', 'export-video');
    await wait(600);
    await capture('export.png');
    await run(clickByText('Cerrar'));
    await wait(300);

    // Modo sin vídeo
    win.webContents.send('menu:action', 'close-video');
    await wait(600);
    await capture('no-video.png');

    // Comparación A/B
    win.webContents.send('menu:action', 'disconnect-serial');
    await wait(400);
    win.webContents.send('menu:action', 'open-session');
    await wait(1200);
    win.webContents.send('menu:action', 'compare');
    await wait(500);
    await run(clickByText('Elegir sesión…'));
    await wait(1500);
    await capture('comparison.png');

    console.log('SCREENSHOTS_OK ' + assetsDir);
    if (sendTimer) clearInterval(sendTimer);
    app.exit(0);
  } catch (err) {
    console.error('SCREENSHOTS_ERROR', err);
    if (sendTimer) clearInterval(sendTimer);
    app.exit(1);
  }
});
