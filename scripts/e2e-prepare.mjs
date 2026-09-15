/**
 * E2E del diálogo de "Preparando vídeo" (transcode) con progreso y cancelación.
 *
 * Simula una conversión lenta mediante IPC mockeado y verifica:
 *   1. Aparece el diálogo con barra de progreso y porcentaje.
 *   2. "Cancelar" aborta y no carga el vídeo.
 *   3. Si se deja terminar, el diálogo se cierra y se carga el vídeo.
 *
 * Uso: npm run e2e:prepare
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = join(currentDir, '..');
const mockVideo = join(root, 'pocs/02-video-sync/examples/mock_video.mp4');

let prepareTimer = null;
let pendingResolve = null;

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

function registerMocks() {
  ipcMain.handle('layout:loadAll', () => []);
  ipcMain.handle('dialog:openVideo', () => ({ canceled: false, filePath: mockVideo }));

  ipcMain.handle('video:prepare', (event, path) => {
    event.sender.send('video:prepare-status', { state: 'start', filename: 'video_hevc.mp4' });
    let percent = 0;
    return new Promise((resolve) => {
      pendingResolve = resolve;
      prepareTimer = setInterval(() => {
        percent += 10;
        if (percent >= 90) {
          clearInterval(prepareTimer);
          prepareTimer = null;
          pendingResolve = null;
          resolve({ success: true, path, transcoded: true });
          return;
        }
        event.sender.send('video:prepare-status', { state: 'progress', percent });
      }, 150);
    });
  });

  ipcMain.handle('video:cancel-prepare', () => {
    if (prepareTimer) {
      clearInterval(prepareTimer);
      prepareTimer = null;
    }
    if (pendingResolve) {
      pendingResolve({ success: true, path: '', transcoded: false, cancelled: true });
      pendingResolve = null;
    }
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

  registerMocks();

  const clickByText = (text) => `(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === ${JSON.stringify(text)});
    if (btn) { btn.click(); return true; }
    return false;
  })()`;

  const state = () =>
    win.webContents.executeJavaScript(`(() => ({
      dialogOpen: !!document.querySelector('.progress-track'),
      dialogText: document.querySelector('.dialog-panel') ? document.querySelector('.dialog-panel').innerText : '',
      videos: document.querySelectorAll('video').length,
      footer: document.querySelector('footer') ? document.querySelector('footer').innerText : '',
    }))()`);

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await new Promise((r) => setTimeout(r, 1000));

    // 1. Abrir vídeo → aparece el diálogo de preparación con progreso
    win.webContents.send('menu:action', 'open-video');
    await new Promise((r) => setTimeout(r, 700));
    const during = await state();
    if (process.env.SCREENSHOT) {
      const image = await win.webContents.capturePage();
      writeFileSync('/tmp/opencode/oprobots-prepare.png', image.toPNG());
    }

    // 2. Cancelar
    await win.webContents.executeJavaScript(clickByText('Cancelar'));
    await new Promise((r) => setTimeout(r, 500));
    const afterCancel = await state();

    // 3. Volver a abrir y dejar terminar
    win.webContents.send('menu:action', 'open-video');
    await new Promise((r) => setTimeout(r, 2200));
    const afterFinish = await state();

    console.log('E2E_PREPARE ' + JSON.stringify({ during, afterCancel, afterFinish }));

    const progressShown = during.dialogOpen && /%/.test(during.dialogText);
    const cancelled = !afterCancel.dialogOpen && afterCancel.videos === 0;
    const finished = !afterFinish.dialogOpen && afterFinish.videos === 1;

    const ok = progressShown && cancelled && finished;
    console.log(ok ? 'E2E_PREPARE_OK' : 'E2E_PREPARE_FAIL');

    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('E2E_PREPARE_EXCEPTION', err);
    app.exit(1);
  }
});
