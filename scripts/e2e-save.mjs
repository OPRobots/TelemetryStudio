/**
 * E2E del guardado de sesión con captura Serial en curso.
 *
 * Verifica:
 *   1. Con datos llegando, el botón está deshabilitado y explica el motivo.
 *   2. Al cesar los datos y pasar el umbral (2 s), la barra muestra "en reposo"
 *      y el botón se habilita.
 *   3. Guardar invoca `session:export`.
 *
 * Uso: npm run e2e:save
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = join(currentDir, '..');

const errors = [];
let sendTimer = null;
let sessionExportCalls = 0;

app.commandLine.appendSwitch('no-sandbox');
ipcMain.handle('settings:getSerial', () => null);
ipcMain.handle('settings:setSerial', () => {});
app.commandLine.appendSwitch('disable-gpu');

function makeLine(t) {
  const s = t / 1000;
  return `${Math.round(t)},${(Math.sin(s) * 9.8).toFixed(2)},0.0,9.8,0.0,0.0,0.0,99.0`;
}

function registerMocks(win) {
  ipcMain.handle('layout:loadAll', () => []);
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
    return { success: true };
  });
  ipcMain.handle('dialog:openDirectory', () => ({ canceled: false, filePath: '/tmp/opencode/sessions' }));
  ipcMain.handle(
    'session:export',
    () => {
      sessionExportCalls += 1;
      return '/tmp/opencode/sessions/Captura';
    }
  );
}

app.whenReady().then(async () => {
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

  registerMocks(win);

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

  const inspect = () =>
    win.webContents.executeJavaScript(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Elegir carpeta y guardar');
      const panel = document.querySelector('.dialog-panel');
      return {
        dialogOpen: !!panel,
        buttonDisabled: btn ? btn.disabled : null,
        dialogText: panel ? panel.innerText : '',
        footer: document.querySelector('footer') ? document.querySelector('footer').innerText : '',
      };
    })()`);

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await new Promise((r) => setTimeout(r, 1000));

    // Conectar Serial y capturar durante un momento
    win.webContents.send('menu:action', 'connect-serial');
    await new Promise((r) => setTimeout(r, 400));
    await win.webContents.executeJavaScript(chooseSerialParser("CSV"));
    await new Promise((r) => setTimeout(r, 150));
    await win.webContents.executeJavaScript(setSerialCsvLabels("accX, accY, accZ, gyroX, gyroY, gyroZ, battery"));
    await new Promise((r) => setTimeout(r, 150));
    await win.webContents.executeJavaScript(clickByText('Conectar'));
    await new Promise((r) => setTimeout(r, 800));

    // Abrir Guardar sesión mientras llegan datos
    win.webContents.send('menu:action', 'save-session');
    await new Promise((r) => setTimeout(r, 500));
    const during = await inspect();

    // Detener la transmisión y esperar el umbral (10 s)
    if (sendTimer) clearInterval(sendTimer);
    sendTimer = null;
    await new Promise((r) => setTimeout(r, 11500));
    const after = await inspect();

    // Guardar
    await win.webContents.executeJavaScript(clickByText('Elegir carpeta y guardar'));
    await new Promise((r) => setTimeout(r, 800));

    console.log(
      'E2E_SAVE ' + JSON.stringify({ during, after, sessionExportCalls })
    );
    if (errors.length > 0) console.log('E2E_SAVE_ERRORS ' + JSON.stringify(errors.slice(0, 10)));

    const blockedWhileReceiving =
      during.dialogOpen &&
      during.buttonDisabled === true &&
      during.dialogText.includes('se siguen recibiendo datos');
    const enabledAfterIdle =
      after.buttonDisabled === false && after.footer.includes('en reposo');
    const exportCalled = sessionExportCalls >= 1;

    const ok = blockedWhileReceiving && enabledAfterIdle && exportCalled && errors.length === 0;
    console.log(ok ? 'E2E_SAVE_OK' : 'E2E_SAVE_FAIL');

    if (sendTimer) clearInterval(sendTimer);
    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('E2E_SAVE_EXCEPTION', err);
    if (sendTimer) clearInterval(sendTimer);
    app.exit(1);
  }
});
