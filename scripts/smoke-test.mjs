/**
 * Smoke test del renderer en Electron.
 *
 * Carga el bundle de producción (out/renderer/index.html) con el preload real,
 * comprueba que React monta la app y que no hay errores en consola ni páginas
 * caídas. Sale con código 0 (OK) o 1 (fallo).
 *
 * Uso: npm run smoke
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = join(currentDir, '..');

const errors = [];
const logs = [];

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

app.whenReady().then(async () => {
  // Stubs mínimos para el IPC que el renderer invoca al arrancar.
  ipcMain.handle('layout:loadAll', () => []);

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
    let level;
    let message;
    if (args[1] && typeof args[1] === 'object') {
      level = args[1].level;
      message = args[1].message;
    } else {
      level = args[1];
      message = args[2];
    }
    logs.push(`[${level}] ${message}`);
    const isError = level === 3 || level === 'error';
    if (isError) errors.push(String(message));
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    errors.push(`render-process-gone: ${JSON.stringify(details)}`);
  });

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const result = await win.webContents.executeJavaScript(`(() => {
      const header = document.querySelector('header');
      const root = document.getElementById('root');
      return {
        hasHeader: !!header,
        headerText: (header && header.textContent) || '',
        rootChildren: root ? root.children.length : 0,
        buttons: Array.from(document.querySelectorAll('button')).map((b) => b.textContent.trim()).slice(0, 20),
        hasStatusBar: !!document.querySelector('footer'),
      };
    })()`);

    console.log('SMOKE_RESULT ' + JSON.stringify(result));
    if (errors.length > 0) console.log('SMOKE_ERRORS ' + JSON.stringify(errors));
    if (logs.length > 0) console.log('SMOKE_LOGS ' + JSON.stringify(logs.slice(0, 40)));

    const ok =
      result.hasHeader &&
      result.rootChildren > 0 &&
      result.hasStatusBar &&
      result.headerText.includes('OPRobots') &&
      errors.length === 0;

    console.log(ok ? 'SMOKE_OK' : 'SMOKE_FAIL');
    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('SMOKE_EXCEPTION', err);
    app.exit(1);
  }
});
