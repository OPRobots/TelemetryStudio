/**
 * Captura una pantalla de la app con datos simulados (para revisión visual).
 * Uso: node scripts/run-electron.mjs scripts/screenshot.mjs
 * Salida: /tmp/opencode/oprobots-ui.png
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = join(currentDir, '..');
const mockVideo = join(root, 'pocs/02-video-sync/examples/mock_video.mp4');
const out = '/tmp/opencode/oprobots-ui.png';

let sendTimer = null;

app.commandLine.appendSwitch('no-sandbox');

function makeLine(t) {
  const s = t / 1000;
  return (
    `${Math.round(t)},${(Math.sin(s * 6.28) * 9.8).toFixed(2)},${(Math.cos(s * 6.28) * 9.8).toFixed(2)},` +
    `${(9.8 + Math.sin(s * 3.14) * 0.5).toFixed(2)},${(Math.sin(s * 9.42) * 180).toFixed(2)},` +
    `${(Math.cos(s * 9.42) * 180).toFixed(2)},0.00,${(100 - t * 0.001).toFixed(2)}`
  );
}

function registerMocks(win) {
  ipcMain.handle('layout:loadAll', () => []);
  ipcMain.handle('dialog:openVideo', () => ({ canceled: false, filePath: mockVideo }));
  ipcMain.handle('serial:list', () => [{ path: '/dev/ttyACM0', manufacturer: 'STMicroelectronics' }]);
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

  registerMocks(win);

  const clickByText = (text) => `(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === ${JSON.stringify(text)});
    if (btn) { btn.click(); return true; }
    return false;
  })()`;

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await new Promise((r) => setTimeout(r, 1200));

    const emptyImage = await win.webContents.capturePage();
    writeFileSync('/tmp/opencode/oprobots-ui-empty.png', emptyImage.toPNG());

    win.webContents.send('menu:action', 'connect-serial');
    await new Promise((r) => setTimeout(r, 500));
    await win.webContents.executeJavaScript(clickByText('Conectar'));
    await new Promise((r) => setTimeout(r, 900));

    win.webContents.send('menu:action', 'open-video');
    await new Promise((r) => setTimeout(r, 2500));

    const image = await win.webContents.capturePage();
    writeFileSync(out, image.toPNG());

    const meta = await win.webContents.executeJavaScript(`(() => {
      const rect = (el) => el ? { x: Math.round(el.getBoundingClientRect().x), w: Math.round(el.getBoundingClientRect().width) } : null;
      const card = document.querySelector('.widget-card');
      const header = card ? card.firstElementChild : null;
      const title = header ? header.querySelector('span') : null;
      const widgetsCard = document.querySelectorAll('.card')[document.querySelectorAll('.card').length - 1];
      return {
        widgetsCard: rect(widgetsCard),
        widgetCard: rect(card),
        headerPadding: header ? getComputedStyle(header).padding : null,
        title: rect(title),
        widgetsHeaderPadding: widgetsCard && widgetsCard.firstElementChild ? getComputedStyle(widgetsCard.firstElementChild).padding : null,
      };
    })()`);
    console.log('SCREENSHOT_META ' + JSON.stringify(meta));
    console.log('SCREENSHOT_OK ' + out);
    if (sendTimer) clearInterval(sendTimer);
    app.exit(0);
  } catch (err) {
    console.error('SCREENSHOT_ERROR', err);
    if (sendTimer) clearInterval(sendTimer);
    app.exit(1);
  }
});
