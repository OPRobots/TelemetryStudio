/**
 * E2E de exportación de vídeo (con IPC de exportación mockeado).
 *
 * Verifica que el renderer compone y envía los frames a FFmpeg:
 * conecta un Serial simulado (para tener widgets), abre un vídeo, configura
 * el diálogo de exportación y comprueba que se envían los frames esperados.
 *
 * La validez real del MP4 la cubre `tests/integration/export-ffmpeg.test.ts`.
 *
 * Uso: npm run e2e:export
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = join(currentDir, '..');
const mockVideo = join(root, 'pocs/02-video-sync/examples/mock_video.mp4');

const errors = [];
let sendTimer = null;
let sentFrames = 0;
let aborted = 0;
let slowWrite = false;

app.commandLine.appendSwitch('no-sandbox');
ipcMain.handle('settings:getSerial', () => null);
ipcMain.handle('settings:setSerial', () => {});
app.commandLine.appendSwitch('disable-gpu');

function makeLine(t) {
  return `${Math.round(t)},${Math.sin(t / 1000).toFixed(2)},0.0,9.80,0.0,0.0,0.0,99.0`;
}

function registerMocks(win) {
  ipcMain.handle('layout:loadAll', () => []);
  ipcMain.handle('video:prepare', (_e, p) => ({ success: true, path: p, transcoded: false }));
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
    return { success: true };
  });
  ipcMain.handle('export:start', () => {
    sentFrames = 0;
    return { success: true };
  });
  ipcMain.handle('export:writeFrame', async () => {
    if (slowWrite) await new Promise((r) => setTimeout(r, 15));
    sentFrames += 1;
    return { success: true };
  });
  ipcMain.handle('export:finalize', () => ({
    success: true,
    outputPath: '/tmp/opencode/export-e2e.mp4',
  }));
  ipcMain.handle('export:abort', () => {
    aborted += 1;
    return { success: true };
  });
  ipcMain.handle('export:choose-destination', () => ({
    canceled: false,
    filePath: '/tmp/opencode/export-e2e.mp4',
  }));
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
      // Sin throttling: el window está oculto y el compositor de export
      // necesita requestAnimationFrame/ResizeObserver a ritmo normal.
      backgroundThrottling: false,
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

  const setInput = (id, value) => `(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(${JSON.stringify(value)}));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`;

  const setSelect = (id, value) => `(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(el, String(${JSON.stringify(value)}));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`;

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await new Promise((r) => setTimeout(r, 1000));

    // Serial para disponer de widgets (vía menú nativo)
    win.webContents.send('menu:action', 'connect-serial');
    await new Promise((r) => setTimeout(r, 400));
    await win.webContents.executeJavaScript(chooseSerialParser("CSV"));
    await new Promise((r) => setTimeout(r, 150));
    await win.webContents.executeJavaScript(setSerialCsvLabels("accX, accY, accZ, gyroX, gyroY, gyroZ, battery"));
    await new Promise((r) => setTimeout(r, 150));
    await win.webContents.executeJavaScript(clickByText('Conectar'));
    await new Promise((r) => setTimeout(r, 900));

    // Vídeo (vía menú nativo)
    win.webContents.send('menu:action', 'open-video');
    await new Promise((r) => setTimeout(r, 1500));

    // Abrir diálogo de exportación (vía menú nativo)
    win.webContents.send('menu:action', 'export-video');
    await new Promise((r) => setTimeout(r, 400));
    const opened = await win.webContents.executeJavaScript(
      `document.body.innerText.includes('Exportar vídeo')`
    );

    // Paso 2 (salida) y configuración: 10 frames a 720p
    await win.webContents.executeJavaScript(clickByText('Siguiente'));
    await new Promise((r) => setTimeout(r, 250));
    await win.webContents.executeJavaScript(setSelect('export-resolution', '720p'));
    await win.webContents.executeJavaScript(setInput('export-fps', 10));
    await win.webContents.executeJavaScript(setInput('export-start', 0));
    await win.webContents.executeJavaScript(setInput('export-end', 9));
    await new Promise((r) => setTimeout(r, 200));

    // Exportar (elige destino con el diálogo nativo y escribe directo)
    await win.webContents.executeJavaScript(clickByText('Exportar…'));

    // Esperar a que aparezca "Exportado en"
    let done = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      done = await win.webContents.executeJavaScript(
        `document.body.innerText.includes('Exportado en')`
      );
      if (done) break;
    }

    const firstExportFrames = sentFrames;

    // Segundo escenario: cancelar a mitad de una exportación larga
    slowWrite = true;
    await win.webContents.executeJavaScript(setInput('export-fps', 30));
    await win.webContents.executeJavaScript(setInput('export-start', 0));
    await win.webContents.executeJavaScript(setInput('export-end', 299));
    await new Promise((r) => setTimeout(r, 200));
    await win.webContents.executeJavaScript(clickByText('Exportar…'));
    await new Promise((r) => setTimeout(r, 600));
    await win.webContents.executeJavaScript(clickByText('Cancelar'));
    const framesAtCancel = sentFrames;
    let cancelText = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      cancelText = await win.webContents.executeJavaScript(
        `document.body.innerText.includes('Exportación cancelada')`
      );
      if (cancelText) break;
    }
    const framesAfterCancel = sentFrames;

    console.log(
      'E2E_EXPORT ' +
        JSON.stringify({ opened, firstExportFrames, done, aborted, framesAtCancel, framesAfterCancel, cancelText })
    );
    if (errors.length > 0) console.log('E2E_EXPORT_ERRORS ' + JSON.stringify(errors.slice(0, 10)));

    const cancelOk =
      aborted >= 1 && cancelText && framesAtCancel < 300 && framesAfterCancel - framesAtCancel <= 1;
    const ok = opened && done && firstExportFrames === 10 && cancelOk && errors.length === 0;
    console.log(ok ? 'E2E_EXPORT_OK' : 'E2E_EXPORT_FAIL');

    if (sendTimer) clearInterval(sendTimer);
    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('E2E_EXPORT_EXCEPTION', err);
    if (sendTimer) clearInterval(sendTimer);
    app.exit(1);
  }
});
