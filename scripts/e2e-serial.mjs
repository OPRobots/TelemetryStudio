/**
 * E2E del flujo Serial → widgets en Electron.
 *
 * Simula el hardware conectado por Serial (IPC mock), conduce la UI real
 * (abrir diálogo, conectar) y verifica que:
 *   1. Los campos descubiertos aparecen en la barra lateral
 *   2. Se auto-configura un layout con widgets
 *   3. La gráfica (canvas) dibuja datos
 *   4. El contador de frames avanza en la barra de estado
 *
 * Uso: npm run e2e:serial
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = join(currentDir, '..');

const errors = [];
let sendTimer = null;

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

function makeLine(t) {
  const s = t / 1000;
  return (
    `${Math.round(t)},${(Math.sin(s) * 9.8).toFixed(2)},${(Math.cos(s) * 9.8).toFixed(2)},9.80,` +
    `${(Math.sin(s) * 180).toFixed(2)},0.00,0.00,${(100 - t * 0.001).toFixed(2)}`
  );
}

function registerMockSerial(win) {
  ipcMain.handle('serial:list', () => [
    { path: '/dev/ttyMOCK', manufacturer: 'Simulador', vendorId: '0000' },
  ]);
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
    let level;
    let message;
    if (args[1] && typeof args[1] === 'object') {
      level = args[1].level;
      message = args[1].message;
    } else {
      level = args[1];
      message = args[2];
    }
    if (level === 3 || level === 'error') errors.push(String(message));
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    errors.push(`render-process-gone: ${JSON.stringify(details)}`);
  });

  registerMockSerial(win);

  const clickByText = (text) => `(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === ${JSON.stringify(text)});
    if (btn) { btn.click(); return true; }
    return false;
  })()`;

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await new Promise((r) => setTimeout(r, 1200));

    const opened = await win.webContents.executeJavaScript(clickByText('Conectar Serial'));
    await new Promise((r) => setTimeout(r, 500));
    const connected = await win.webContents.executeJavaScript(clickByText('Conectar'));

    // Dejar fluir telemetría ~2 s
    await new Promise((r) => setTimeout(r, 2000));

    const state = await win.webContents.executeJavaScript(`(() => {
      const sidebarText = document.body.innerText;
      const widgetCards = document.querySelectorAll('.widget-card').length;
      const canvases = Array.from(document.querySelectorAll('canvas'));
      let drawnPixels = 0;
      let canvasSizes = [];
      for (const c of canvases) {
        const ctx = c.getContext('2d');
        if (!ctx || c.width === 0 || c.height === 0) continue;
        canvasSizes.push({ w: c.width, h: c.height });
        try {
          const img = ctx.getImageData(0, 0, Math.min(c.width, 200), Math.min(c.height, 200)).data;
          for (let i = 0; i < img.length; i += 4) {
            if (img[i] > 30 || img[i + 1] > 30 || img[i + 2] > 45) drawnPixels++;
          }
        } catch (e) { /* canvas sin contexto */ }
      }
      const footer = document.querySelector('footer');
      return {
        hasAccX: sidebarText.includes('accX'),
        hasBattery: sidebarText.includes('battery'),
        widgetCards,
        canvasCount: canvases.length,
        canvasSizes,
        drawnPixels,
        footerText: footer ? footer.innerText : '',
      };
    })()`);

    console.log('E2E_RESULT ' + JSON.stringify({ opened, connected, ...state }));

    // Verificar el editor de layout: abrir config del widget y comprobar los campos
    await win.webContents.executeJavaScript(`(() => {
      const btn = document.querySelector('.widget-card .icon-button');
      if (btn) btn.click();
      return !!btn;
    })()`);
    await new Promise((r) => setTimeout(r, 400));
    const dialogState = await win.webContents.executeJavaScript(`(() => {
      const panel = document.querySelector('.dialog-panel');
      const fieldBoxes = panel ? panel.querySelectorAll('.dialog-fields input[type=checkbox]').length : 0;
      const text = panel ? panel.innerText : '';
      const cancelBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Cancelar');
      if (cancelBtn) cancelBtn.click();
      return { dialogOpen: !!panel, fieldBoxes, hasFieldsLabel: text.includes('Campos de datos') };
    })()`);
    console.log('E2E_DIALOG ' + JSON.stringify(dialogState));

    if (errors.length > 0) console.log('E2E_ERRORS ' + JSON.stringify(errors.slice(0, 20)));

    const framesMatch = /Frames:\s*(\d+)/.exec(state.footerText);
    const frameCount = framesMatch ? Number(framesMatch[1]) : 0;

    const ok =
      opened &&
      connected &&
      state.hasAccX &&
      state.hasBattery &&
      state.widgetCards >= 1 &&
      state.canvasCount >= 1 &&
      state.drawnPixels > 100 &&
      dialogState.dialogOpen &&
      dialogState.fieldBoxes === 7 &&
      dialogState.hasFieldsLabel &&
      frameCount > 10 &&
      errors.length === 0;

    console.log('E2E_FRAMES ' + frameCount);
    console.log(ok ? 'E2E_OK' : 'E2E_FAIL');

    if (sendTimer) clearInterval(sendTimer);
    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('E2E_EXCEPTION', err);
    if (sendTimer) clearInterval(sendTimer);
    app.exit(1);
  }
});
