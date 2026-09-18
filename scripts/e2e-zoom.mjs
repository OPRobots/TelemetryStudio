/**
 * E2E del zoom compartido entre timelines:
 *   1. Conectar Serial → TimeSeriesChart + StateTimeline + Minimap2D.
 *   2. Arrastrar para seleccionar rango en la StateTimeline.
 *   3. Verificar que el canvas del TimeSeriesChart y del Minimap2D cambian
 *      (se aplica el mismo rango).
 *   4. Doble clic en la StateTimeline → resetea (los canvas vuelven a cambiar).
 *
 * Uso: npm run e2e:zoom
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = join(currentDir, '..');

const errors = [];
let sendTimer = null;

app.commandLine.appendSwitch('no-sandbox');
ipcMain.handle('settings:getSerial', () => null);
ipcMain.handle('settings:setSerial', () => {});
app.commandLine.appendSwitch('disable-gpu');

const RUN = ['IDLE', 'RUNNING', 'TURNING', 'SEARCHING'];

function registerMocks(win) {
  ipcMain.handle('layout:loadAll', () => []);
  ipcMain.handle('video:prepare', (_e, p) => ({ success: true, path: p, transcoded: false, fps: 30 }));
  ipcMain.handle('serial:list', () => [{ path: '/dev/ttyMOCK', manufacturer: 'Simulador' }]);
  ipcMain.handle('serial:open', () => {
    if (sendTimer) clearInterval(sendTimer);
    let t = 0;
    sendTimer = setInterval(() => {
      const s = t / 1000;
      const run = RUN[Math.floor(t / 1500) % RUN.length];
      const line =
        `T:${Math.round(t)},adc1:${(Math.sin(s) * 100).toFixed(1)},` +
        `pos_x:${(100 * Math.cos(s)).toFixed(2)},pos_y:${(100 * Math.sin(s)).toFixed(2)},` +
        `state_run:${run}`;
      if (!win.isDestroyed()) win.webContents.send('serial:data', line);
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

  registerMocks(win);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = (js) => win.webContents.executeJavaScript(js);
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

  const snap = () =>
    run(`(() => {
      const cells = Array.from(document.querySelectorAll('[data-widget-id]'));
      const find = (t) => cells.find((c) => c.textContent.includes(t));
      const chart = find('TimeSeriesChart');
      const state = find('StateTimeline');
      const mini = find('Minimap2D');
      window.__state = state && state.querySelector('canvas');
      return {
        chart: chart && chart.querySelector('canvas') ? chart.querySelector('canvas').toDataURL() : '',
        mini: mini && mini.querySelector('canvas') ? mini.querySelector('canvas').toDataURL() : '',
        state: window.__state ? window.__state.toDataURL() : '',
        ok: !!(chart && state && mini),
      };
    })()`);

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await wait(1000);

    win.webContents.send('menu:action', 'connect-serial');
    await wait(400);
    await win.webContents.executeJavaScript(chooseSerialParser("Default"));
    await new Promise((r) => setTimeout(r, 150));
    await run(clickByText('Conectar'));
    await wait(2500);
    await run(`window.api.serialClose()`);
    await wait(500);

    const before = await snap();

    // Arrastrar para seleccionar el rango ~30%–70% en la StateTimeline.
    await run(`(() => {
      const c = window.__state;
      const r = c.getBoundingClientRect();
      const x0 = r.left + r.width * 0.3;
      const x1 = r.left + r.width * 0.7;
      const y = r.top + r.height * 0.8;
      const ev = (type, x) => new PointerEvent(type, {
        bubbles: true, cancelable: true, clientX: x, clientY: y,
        pointerId: 1, pointerType: 'mouse', buttons: type === 'pointerup' ? 0 : 1,
      });
      c.dispatchEvent(ev('pointerdown', x0));
      c.dispatchEvent(ev('pointermove', x1));
      c.dispatchEvent(ev('pointerup', x1));
      return true;
    })()`);
    await wait(400);

    const zoomed = await snap();

    if (process.env.SCREENSHOT) {
      const image = await win.webContents.capturePage();
      writeFileSync('/tmp/opencode/oprobots-zoom.png', image.toPNG());
    }

    // Doble clic → reset del zoom.
    await run(`(() => {
      const c = window.__state;
      const r = c.getBoundingClientRect();
      c.dispatchEvent(new MouseEvent('dblclick', {
        bubbles: true, clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.8,
      }));
      return true;
    })()`);
    await wait(400);

    const reset = await snap();

    // Arrastrar en el TimeSeriesChart: el zoom debe propagarse ya al soltar
    // (sin necesidad de un clic posterior).
    await run(`(() => {
      const cells = Array.from(document.querySelectorAll('[data-widget-id]'));
      const chart = cells.find((c) => c.textContent.includes('TimeSeriesChart'));
      const over = chart.querySelector('.u-over');
      const r = over.getBoundingClientRect();
      const x0 = r.left + r.width * 0.25;
      const x1 = r.left + r.width * 0.65;
      const y = r.top + r.height * 0.5;
      over.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x0, clientY: y, button: 0, buttons: 1 }));
      over.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x1, clientY: y, button: 0, buttons: 1, movementX: x1 - x0, movementY: 0 }));
      over.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x1, clientY: y, button: 0, buttons: 0 }));
      return true;
    })()`);
    await wait(400);

    const chartDriven = await snap();

    // Minimap2D: zoom con rueda, pan arrastrando y doble clic para reset local.
    const miniSnap = () =>
      run(`(() => {
        const cells = Array.from(document.querySelectorAll('[data-widget-id]'));
        const mini = cells.find((c) => c.textContent.includes('Minimap2D'));
        const c = mini && mini.querySelector('canvas');
        return c ? c.toDataURL() : '';
      })()`);
    const miniCanvas = `(() => {
      const cells = Array.from(document.querySelectorAll('[data-widget-id]'));
      const mini = cells.find((c) => c.textContent.includes('Minimap2D'));
      return mini ? mini.querySelector('canvas') : null;
    })()`;

    const miniBefore = await miniSnap();
    await run(`(() => {
      const c = ${miniCanvas};
      const r = c.getBoundingClientRect();
      c.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true, deltaY: -120,
        clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.5,
      }));
      return true;
    })()`);
    await wait(300);
    const miniWheel = await miniSnap();

    await run(`(() => {
      const c = ${miniCanvas};
      const r = c.getBoundingClientRect();
      const y = r.top + r.height * 0.5;
      const ev = (type, x) => new PointerEvent(type, {
        bubbles: true, cancelable: true, clientX: x, clientY: y,
        pointerId: 1, pointerType: 'mouse', buttons: type === 'pointerup' ? 0 : 1,
      });
      c.dispatchEvent(ev('pointerdown', r.left + r.width * 0.4));
      c.dispatchEvent(ev('pointermove', r.left + r.width * 0.6));
      c.dispatchEvent(ev('pointerup', r.left + r.width * 0.6));
      return true;
    })()`);
    await wait(300);
    const miniPan = await miniSnap();

    await run(`(() => {
      const c = ${miniCanvas};
      c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      return true;
    })()`);
    await wait(300);
    const miniReset = await miniSnap();

    // Readout X/Y/θ del minimapa (pos_x/pos_y existen; θ puede faltar).
    const miniReadout = await run(
      `(() => Array.from(document.querySelectorAll('.minimap-readout__value')).map((v) => v.textContent.trim()))()`
    );

    const result = {
      ok: before.ok && zoomed.ok && reset.ok && chartDriven.ok,
      chartZoomed: before.chart !== zoomed.chart,
      minimapZoomed: before.mini !== zoomed.mini,
      stateZoomed: before.state !== zoomed.state,
      chartReset: zoomed.chart !== reset.chart,
      minimapReset: zoomed.mini !== reset.mini,
      // Zoom iniciado en el TimeSeries: debe propagarse al soltar.
      chartDragChart: reset.chart !== chartDriven.chart,
      chartDragState: reset.state !== chartDriven.state,
      chartDragMinimap: reset.mini !== chartDriven.mini,
      // Pan/zoom manual del Minimap2D.
      miniWheelZoomed: miniBefore !== miniWheel,
      miniPanned: miniWheel !== miniPan,
      miniViewReset: miniPan !== miniReset,
      miniReadout,
    };
    console.log('E2E_ZOOM ' + JSON.stringify(result));
    if (errors.length > 0) console.log('E2E_ZOOM_ERRORS ' + JSON.stringify(errors.slice(0, 10)));

    const ok =
      result.ok &&
      result.chartZoomed &&
      result.minimapZoomed &&
      result.stateZoomed &&
      result.chartReset &&
      result.minimapReset &&
      result.chartDragState &&
      result.chartDragMinimap &&
      result.miniWheelZoomed &&
      result.miniPanned &&
      result.miniViewReset &&
      result.miniReadout.length === 3 &&
      result.miniReadout[0] !== '--' &&
      result.miniReadout[1] !== '--' &&
      errors.length === 0;
    console.log(ok ? 'E2E_ZOOM_OK' : 'E2E_ZOOM_FAIL');

    if (sendTimer) clearInterval(sendTimer);
    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('E2E_ZOOM_EXCEPTION', err);
    if (sendTimer) clearInterval(sendTimer);
    app.exit(1);
  }
});
