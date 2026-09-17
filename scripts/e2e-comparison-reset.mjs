/**
 * E2E: en modo comparación, reenviar telemetría a la sesión actual (reinicio
 * con t=0) debe resetear SOLO el panel actual, manteniendo intacta la sesión
 * guardada comparada.
 *
 * Uso: npm run e2e:comparison-reset
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = join(currentDir, '..');
const sessionsDir = join('/tmp', 'opencode', 'oprobots-sessions');

const errors = [];

function makeSession(name) {
  return {
    v: 1,
    name,
    created: '2026-01-01T00:00:00Z',
    video: { file: '', fps: 0, duration_s: 0, resolution: [0, 0] },
    sync: { offset_ms: 0, anchor: null, rate: 1 },
    telemetry: {
      schema: [['value', 'number']],
      frames: Array.from({ length: 200 }, (_, i) => [i * 20, Number((Math.sin(i / 10) * 10).toFixed(3))]),
    },
    layout: {
      widgets: Array.from({ length: 3 }, () => ({ t: 'TimeSeriesChart', size: [12, 7], fields: ['value'] })),
    },
  };
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

function prepareFixtures() {
  mkdirSync(sessionsDir, { recursive: true });
  const a = join(sessionsDir, 'RA.json');
  const b = join(sessionsDir, 'RB.json');
  writeFileSync(a, JSON.stringify(makeSession('Sesión A')));
  writeFileSync(b, JSON.stringify(makeSession('Sesión B')));
  return { a, b };
}

function registerMocks(fixtures) {
  let sessionDialogCount = 0;
  ipcMain.handle('layout:loadAll', () => []);
  ipcMain.handle('video:prepare', (_e, p) => ({ success: true, path: p, transcoded: false, fps: 30 }));
  ipcMain.handle('session:getVideoPath', (_e, jsonPath, file) => join(dirname(jsonPath), file));
  ipcMain.handle('file:read', (_e, jsonPath) => ({
    success: true,
    content: readFileSync(jsonPath, 'utf-8'),
  }));
  ipcMain.handle('dialog:openSession', () => {
    const filePath = sessionDialogCount === 0 ? fixtures.a : fixtures.b;
    sessionDialogCount += 1;
    return { canceled: false, filePath };
  });
  ipcMain.handle('serial:list', () => [{ path: '/dev/ttyMOCK', manufacturer: 'Simulador' }]);
  ipcMain.handle('serial:open', () => ({ success: true }));
  ipcMain.handle('serial:close', () => ({ success: true }));
}

app.whenReady().then(async () => {
  const fixtures = prepareFixtures();

  const win = new BrowserWindow({
    show: true,
    width: 1400,
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

  registerMocks(fixtures);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = (js) => win.webContents.executeJavaScript(js);
  const send = (t) => win.webContents.send('serial:data', `T:${Math.round(t)},value:${(Math.sin(t / 500) * 10).toFixed(3)}`);
  const clickByText = (text) => `(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === ${JSON.stringify(text)});
    if (btn) { btn.click(); return true; }
    return false;
  })()`;

  const canvases = () =>
    run(`(() => {
      const grids = document.querySelectorAll('.widget-grid');
      if (grids.length < 2) return null;
      const a = grids[0].querySelector('canvas');
      const b = grids[1].querySelector('canvas');
      return { a: a ? a.toDataURL() : '', b: b ? b.toDataURL() : '' };
    })()`);

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await wait(1000);

    // Sesión A + comparación con B (ambas sin vídeo)
    win.webContents.send('menu:action', 'open-session');
    await wait(1000);
    win.webContents.send('menu:action', 'compare');
    await wait(400);
    await run(clickByText('Elegir sesión…'));
    await wait(1400);

    // Conectar Serial y enviar datos
    win.webContents.send('menu:action', 'connect-serial');
    await wait(400);
    await run(clickByText('Conectar'));
    await wait(400);
    for (let i = 1; i <= 12; i++) {
      send(i * 20);
      await wait(15);
    }
    await wait(300);
    const before = await canvases();

    // Nueva transmisión: silencio > umbral y reanudar con t≠0.
    await wait(2800);
    for (let i = 0; i < 8; i++) {
      send(1000 + i * 20);
      await wait(15);
    }
    await wait(300);
    const after = await canvases();

    if (process.env.SCREENSHOT) {
      const image = await win.webContents.capturePage();
      writeFileSync('/tmp/opencode/oprobots-comparison-reset.png', image.toPNG());
    }

    const result = {
      gotCanvases: !!before && !!after,
      currentChanged: !!before && !!after && before.a !== after.a,
      comparisonUnchanged: !!before && !!after && before.b === after.b,
    };
    console.log('E2E_COMPARISON_RESET ' + JSON.stringify(result));
    if (errors.length > 0) console.log('E2E_COMPARISON_RESET_ERRORS ' + JSON.stringify(errors.slice(0, 10)));

    const ok =
      result.gotCanvases &&
      result.currentChanged &&
      result.comparisonUnchanged &&
      errors.length === 0;
    console.log(ok ? 'E2E_COMPARISON_RESET_OK' : 'E2E_COMPARISON_RESET_FAIL');
    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('E2E_COMPARISON_RESET_EXCEPTION', err);
    app.exit(1);
  }
});
