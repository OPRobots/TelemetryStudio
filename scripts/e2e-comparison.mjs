/**
 * E2E de comparación side-by-side en Electron.
 *
 * Carga la sesión A, activa la comparación con la sesión B (widgets idénticos)
 * y verifica que aparece la vista dividida con dos vídeos y dos grupos de widgets.
 *
 * Uso: npm run e2e:comparison
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
    video: { file: 'mock_video.mp4', fps: 30, duration_s: 10, resolution: [1920, 1080] },
    sync: { offset_ms: 0, anchor: null, rate: 1 },
    telemetry: {
      schema: [['value', 'number']],
      frames: Array.from({ length: 200 }, (_, i) => [i * 20, Number((Math.sin(i / 10) * 10).toFixed(3))]),
    },
    layout: {
      widgets: [
        { t: 'TimeSeriesChart', pos: [0, 0], size: [12, 7], fields: ['value'] },
      ],
    },
  };
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

function prepareFixtures() {
  mkdirSync(sessionsDir, { recursive: true });
  const a = join(sessionsDir, 'A.json');
  const b = join(sessionsDir, 'B.json');
  writeFileSync(a, JSON.stringify(makeSession('Sesión A')));
  writeFileSync(b, JSON.stringify(makeSession('Sesión B')));
  return { a, b };
}

function registerMocks(win, fixtures) {
  let sessionDialogCount = 0;
  ipcMain.handle('layout:loadAll', () => []);
  ipcMain.handle('session:getVideoPath', (_e, jsonPath, file) => join(dirname(jsonPath), file));
  ipcMain.handle('file:read', (_e, jsonPath) => ({
    success: true,
    content: readFileSync(jsonPath, 'utf-8'),
  }));
  ipcMain.handle('dialog:openSession', () => {
    sessionDialogCount += 1;
    return { canceled: false, filePath: sessionDialogCount === 1 ? fixtures.a : fixtures.b };
  });
}

app.whenReady().then(async () => {
  const fixtures = prepareFixtures();

  const win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
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

  registerMocks(win, fixtures);

  const clickByText = (text) => `(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === ${JSON.stringify(text)});
    if (btn) { btn.click(); return true; }
    return false;
  })()`;

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await new Promise((r) => setTimeout(r, 1000));

    // Cargar sesión A
    const openedA = await win.webContents.executeJavaScript(clickByText('Abrir sesión'));
    await new Promise((r) => setTimeout(r, 800));

    // Abrir diálogo de comparación y elegir sesión B
    const openedDialog = await win.webContents.executeJavaScript(clickByText('Comparar con otra sesión'));
    await new Promise((r) => setTimeout(r, 300));
    await win.webContents.executeJavaScript(clickByText('Elegir sesión…'));
    await new Promise((r) => setTimeout(r, 1200));

    const state = await win.webContents.executeJavaScript(`(() => {
      const text = document.body.innerText;
      return {
        videos: document.querySelectorAll('video').length,
        widgetCards: document.querySelectorAll('.widget-card').length,
        hasComparisonHeading: text.includes('Comparación'),
        hasSharedBar: text.includes('Barra compartida'),
      };
    })()`);

    console.log('E2E_COMPARISON ' + JSON.stringify({ openedA, openedDialog, ...state }));
    if (errors.length > 0) console.log('E2E_COMPARISON_ERRORS ' + JSON.stringify(errors.slice(0, 10)));

    const ok =
      openedA &&
      openedDialog &&
      state.videos === 2 &&
      state.widgetCards >= 2 &&
      state.hasComparisonHeading &&
      state.hasSharedBar &&
      errors.length === 0;

    console.log(ok ? 'E2E_COMPARISON_OK' : 'E2E_COMPARISON_FAIL');
    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('E2E_COMPARISON_EXCEPTION', err);
    app.exit(1);
  }
});
