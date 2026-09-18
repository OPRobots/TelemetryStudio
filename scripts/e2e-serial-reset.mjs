/**
 * E2E del estado "en reposo" y del reinicio de transmisión:
 *   1. Enviar frames → el Serial se muestra "recibiendo".
 *   2. Dejar de enviar ~2,5 s → pasa a "en reposo" (umbral 2 s).
 *   3. Volver a enviar con t=0 → se resetean los frames y las gráficas.
 *
 * Uso: npm run e2e:serial-reset
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = join(currentDir, '..');

const errors = [];
app.commandLine.appendSwitch('no-sandbox');
ipcMain.handle('settings:getSerial', () => null);
ipcMain.handle('settings:setSerial', () => {});
app.commandLine.appendSwitch('disable-gpu');

const RUN = ['IDLE', 'RUNNING', 'TURNING', 'SEARCHING'];

function makeLine(t) {
  const s = t / 1000;
  const run = RUN[Math.floor(t / 500) % RUN.length];
  return `T:${Math.round(t)},adc1:${(Math.sin(s) * 100).toFixed(1)},state_run:${run}`;
}

function registerMocks() {
  ipcMain.handle('layout:loadAll', () => []);
  ipcMain.handle('video:prepare', (_e, p) => ({ success: true, path: p, transcoded: false, fps: 30 }));
  ipcMain.handle('serial:list', () => [{ path: '/dev/ttyMOCK', manufacturer: 'Simulador' }]);
  // No auto-envía: el propio test controla cuándo llegan datos.
  ipcMain.handle('serial:open', () => ({ success: true }));
  ipcMain.handle('serial:close', () => ({ success: true }));
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: true,
    width: 1280,
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

  registerMocks();

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = (js) => win.webContents.executeJavaScript(js);
  const send = (line) => win.webContents.send('serial:data', line);
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

  const footer = () => run(`(document.querySelector('footer') || {}).textContent || ''`);
  const framesFromFooter = async () => {
    const text = await footer();
    const m = /Muestras\s+(\d+)/.exec(text);
    return m ? Number(m[1]) : -1;
  };
  const chartCanvas = () =>
    run(`(() => {
      const cells = Array.from(document.querySelectorAll('[data-widget-id]'));
      const chart = cells.find((c) => c.textContent.includes('TimeSeriesChart'));
      const canvas = chart && chart.querySelector('canvas');
      return canvas ? canvas.toDataURL() : '';
    })()`);

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await wait(1000);
    win.webContents.send('menu:action', 'connect-serial');
    await wait(400);
    await win.webContents.executeJavaScript(chooseSerialParser("Default"));
    await new Promise((r) => setTimeout(r, 150));
    await run(clickByText('Conectar'));
    await wait(300);

    // 1) Enviar frames en ráfaga → "recibiendo".
    for (let i = 1; i <= 30; i++) {
      send(makeLine(i * 20));
      await wait(12);
    }
    await wait(200);
    const whileSending = await footer();
    const framesBefore = await framesFromFooter();

    // 2) Silencio > umbral (2 s) → "en reposo".
    await wait(2800);
    const whileIdle = await footer();

    // 3a) Reanudar tras reposo con t≠0 → reinicio por hueco.
    const chartBeforeGap = await chartCanvas();
    for (let i = 0; i < 8; i++) {
      send(makeLine(1000 + i * 20));
      await wait(15);
    }
    await wait(300);
    const labelAfterResume = await footer();
    const chartAfterGap = await chartCanvas();
    const framesAfterGap = await framesFromFooter();

    // 3b) Flujo continuo y luego t=0 → reinicio por timestamp.
    const framesBeforeZero = await framesFromFooter();
    const chartBeforeZero = await chartCanvas();
    for (let i = 0; i < 12; i++) {
      send(makeLine(2000 + i * 20));
      await wait(12);
    }
    send(makeLine(0));
    for (let i = 1; i <= 2; i++) {
      send(makeLine(i * 20));
      await wait(12);
    }
    await wait(300);
    const chartAfterZero = await chartCanvas();
    const framesAfterZero = await framesFromFooter();

    if (process.env.SCREENSHOT) {
      const image = await win.webContents.capturePage();
      writeFileSync('/tmp/opencode/oprobots-serial-reset.png', image.toPNG());
    }

    const result = {
      sendingLabel: /recibiendo/.test(whileSending),
      idleLabel: /en reposo/.test(whileIdle),
      resumeLabel: /recibiendo/.test(labelAfterResume),
      framesBefore,
      framesAfterGap,
      framesBeforeZero,
      framesAfterZero,
      // 3a: el hueco > 2 s reinicia (había 30 frames → quedan pocos).
      gapReset: framesAfterGap >= 1 && framesAfterGap <= 10 && framesAfterGap < framesBefore,
      gapChartReset: chartBeforeGap !== chartAfterGap,
      // 3b: t=0 reinicia aunque no haya hueco.
      zeroReset: framesAfterZero >= 1 && framesAfterZero <= 5 && framesAfterZero < framesBeforeZero,
      zeroChartReset: chartBeforeZero !== chartAfterZero,
    };
    console.log('E2E_SERIAL_RESET ' + JSON.stringify(result));
    if (errors.length > 0) console.log('E2E_SERIAL_RESET_ERRORS ' + JSON.stringify(errors.slice(0, 10)));

    const ok =
      result.sendingLabel &&
      result.idleLabel &&
      result.resumeLabel &&
      result.gapReset &&
      result.gapChartReset &&
      result.zeroReset &&
      result.zeroChartReset &&
      errors.length === 0;
    console.log(ok ? 'E2E_SERIAL_RESET_OK' : 'E2E_SERIAL_RESET_FAIL');

    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('E2E_SERIAL_RESET_EXCEPTION', err);
    app.exit(1);
  }
});
