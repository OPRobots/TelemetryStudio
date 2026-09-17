/**
 * E2E del flujo Vídeo + Serial + sincronización en Electron.
 *
 * Verifica:
 *   1. Abrir un vídeo y leer su metadata (duración)  [requisito 1]
 *   2. Reproducir/seek y sincronizar con la telemetría por timestamp [requisito 5]
 *
 * Uso: npm run e2e:video
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = join(currentDir, '..');
const mockVideo = join(root, 'pocs/02-video-sync/examples/mock_video.mp4');

const errors = [];
let sendTimer = null;
let prepareCalls = 0;

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

function makeLine(t) {
  const s = t / 1000;
  return (
    `${Math.round(t)},${(Math.sin(s) * 9.8).toFixed(2)},${(Math.cos(s) * 9.8).toFixed(2)},9.80,` +
    `${(Math.sin(s) * 180).toFixed(2)},0.00,0.00,${(100 - t * 0.001).toFixed(2)}`
  );
}

function registerMocks(win) {
  ipcMain.handle('layout:loadAll', () => []);
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
    return { success: true };
  });
  ipcMain.handle('dialog:openVideo', () => ({ canceled: false, filePath: mockVideo }));
  ipcMain.handle('video:prepare', () => {
    prepareCalls += 1;
    return { success: true, path: mockVideo, transcoded: false, fps: 60 };
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

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await new Promise((r) => setTimeout(r, 1000));

    // Conectar Serial (vía menú nativo)
    win.webContents.send('menu:action', 'connect-serial');
    await new Promise((r) => setTimeout(r, 400));
    await win.webContents.executeJavaScript(clickByText('Conectar'));
    await new Promise((r) => setTimeout(r, 800));

    // Abrir vídeo (diálogo mockeado, vía menú nativo)
    win.webContents.send('menu:action', 'open-video');
    await new Promise((r) => setTimeout(r, 2500));

    const videoInfo = await win.webContents.executeJavaScript(`(() => {
      const v = document.querySelector('video');
      return {
        hasVideo: !!v,
        duration: v ? v.duration : 0,
        readyState: v ? v.readyState : 0,
        hasVideoCard: Array.from(document.querySelectorAll('.card__title')).some((e) =>
          e.textContent.toLowerCase().includes('vídeo')
        ),
      };
    })()`);

    // Paso de 1 frame: con fps=60 el avance debe ser ~16.7 ms (no 1 s)
    const beforeStep = await win.webContents.executeJavaScript(
      `document.querySelector('video').currentTime`
    );
    await win.webContents.executeJavaScript(clickByText('▶'));
    await new Promise((r) => setTimeout(r, 400));
    const afterStep = await win.webContents.executeJavaScript(
      `document.querySelector('video').currentTime`
    );
    const stepDelta = afterStep - beforeStep;

    // Scrub con el slider del timeline: debe mover el vídeo a ese tiempo
    await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector('.timeline-slider');
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, '2.5');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 600));
    const scrubTime = await win.webContents.executeJavaScript(
      `document.querySelector('video').currentTime`
    );

    // Seek a 1.0s y esperar el evento seeked nativo
    await win.webContents.executeJavaScript(`(() => {
      const v = document.querySelector('video');
      if (v) { v.currentTime = 1.0; }
    })()`);
    await new Promise((r) => setTimeout(r, 1200));

    const syncState = await win.webContents.executeJavaScript(`(() => {
      const text = document.body.innerText;
      const el = document.querySelector('.sync-time');
      const m = el ? el.textContent.match(/([\\d.]+)/) : null;
      const footer = document.querySelector('footer');
      return {
        telemetryTimeMs: m ? Number(m[1]) : -1,
        footerText: footer ? footer.innerText : '',
      };
    })()`);

    // Alinear aquí: el frame actual (1.0s) pasa a ser t=0 de la telemetría
    await win.webContents.executeJavaScript(clickByText('Alinear aquí'));
    await new Promise((r) => setTimeout(r, 800));
    const aligned = await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector('.sync-time');
      const m = el ? el.textContent.match(/([\\d.]+)/) : null;
      return { telemetryTimeMs: m ? Number(m[1]) : -1 };
    })()`);

    // Cerrar el vídeo desde el botón del header
    await win.webContents.executeJavaScript(`(() => {
      const b = document.querySelector('button[title="Cerrar vídeo"]');
      if (b) b.click();
      return !!b;
    })()`);
    await new Promise((r) => setTimeout(r, 500));
    const closed = await win.webContents.executeJavaScript(`(() => {
      const footer = document.querySelector('footer');
      return {
        videos: document.querySelectorAll('video').length,
        footerText: footer ? footer.innerText : '',
      };
    })()`);

    console.log(
      'E2E_VIDEO_RESULT ' +
        JSON.stringify({
          ...videoInfo,
          ...syncState,
          aligned,
          scrubTime,
          prepareCalls,
          stepDelta,
          closed,
        })
    );
    if (errors.length > 0) console.log('E2E_VIDEO_ERRORS ' + JSON.stringify(errors.slice(0, 20)));

    const durationOk = videoInfo.duration > 0;
    const videoCardOk = videoInfo.hasVideoCard === true;
    const scrubbedOk = Math.abs(scrubTime - 2.5) < 0.4;
    const stepOk = Math.abs(stepDelta - 1 / 60) < 0.01;
    const syncedOk = syncState.telemetryTimeMs >= 900 && syncState.telemetryTimeMs <= 1200;
    const alignedOk = aligned.telemetryTimeMs >= -50 && aligned.telemetryTimeMs <= 50;
    const footerOk = syncState.footerText.includes('mock_video.mp4');
    const prepareOk = prepareCalls >= 1;
    const closedOk = closed.videos === 0 && closed.footerText.includes('sin cargar');

    const ok =
      durationOk &&
      videoCardOk &&
      scrubbedOk &&
      stepOk &&
      syncedOk &&
      alignedOk &&
      footerOk &&
      prepareOk &&
      closedOk &&
      errors.length === 0;
    console.log(ok ? 'E2E_VIDEO_OK' : 'E2E_VIDEO_FAIL');

    if (sendTimer) clearInterval(sendTimer);
    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('E2E_VIDEO_EXCEPTION', err);
    if (sendTimer) clearInterval(sendTimer);
    app.exit(1);
  }
});
