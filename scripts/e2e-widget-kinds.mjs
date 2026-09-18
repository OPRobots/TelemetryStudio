/**
 * E2E de renderizado de los 4 tipos de widget:
 *   1. Conectar Serial → auto-layout crea una gráfica temporal.
 *   2. Añadir DigitalBitmask, Minimap2D y StateTimeline desde el menú.
 *   3. Verificar que cada canvas pinta píxeles (no queda en blanco).
 *   4. Sin errores de consola.
 *
 * Uso: npm run e2e:widget-kinds
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

function makeLine(t) {
  const s = t / 1000;
  return `${Math.round(t)},${(Math.sin(s) * 9.8).toFixed(2)},0.0,9.8,0.0,0.0,0.0,99.0`;
}

function registerMocks(win) {
  ipcMain.handle('layout:loadAll', () => []);
  ipcMain.handle('video:prepare', (_e, p) => ({ success: true, path: p, transcoded: false, fps: 30 }));
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

  const addWidgetAt = async (menuIndex) => {
    await run(clickByText('+ Añadir gráfica'));
    await wait(150);
    await run(`(() => {
      const items = document.querySelectorAll('.widget-menu-item');
      const item = items[${menuIndex}];
      if (item) item.click();
      return !!item;
    })()`);
    await wait(400);
  };

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await wait(1000);

    // Auto-layout: gráfica temporal
    win.webContents.send('menu:action', 'connect-serial');
    await wait(400);
    await win.webContents.executeJavaScript(chooseSerialParser("CSV"));
    await new Promise((r) => setTimeout(r, 150));
    await win.webContents.executeJavaScript(setSerialCsvLabels("accX, accY, accZ, gyroX, gyroY, gyroZ, battery"));
    await new Promise((r) => setTimeout(r, 150));
    await run(clickByText('Conectar'));
    await wait(900);

    // Añadir los otros 3 tipos (el menú está ordenado por prioridad).
    const empty = await run(`(() => document.querySelectorAll('[data-widget-id]').length)()`);
    if (empty > 0) {
      await addWidgetAt(1); // DigitalBitmask
      await addWidgetAt(2); // Minimap2D
      await addWidgetAt(3); // StateTimeline
    }
    await wait(800);

    const result = await run(`(() => {
      const canvases = Array.from(document.querySelectorAll('canvas'));
      const stats = canvases.map((c) => {
        const ctx = c.getContext('2d');
        const w = c.width, h = c.height;
        if (!ctx || w === 0 || h === 0) return { w, h, drawn: 0 };
        const data = ctx.getImageData(0, 0, w, h).data;
        let drawn = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] !== 0 && !(data[i] === 10 && data[i + 1] === 14 && data[i + 2] === 23)) drawn++;
        }
        return { w, h, drawn };
      });
      const legendItems = Array.from(document.querySelectorAll('.chart-legend__item'));
      const readoutItems = Array.from(document.querySelectorAll('.minimap-readout__value'));
      return {
        widgets: document.querySelectorAll('[data-widget-id]').length,
        canvases: stats.length,
        stats,
        legendCount: legendItems.length,
        legendValues: legendItems.map((it) => {
          const v = it.querySelector('.chart-legend__value');
          return v ? v.textContent.trim() : '';
        }),
        readoutCount: readoutItems.length,
      };
    })()`);

    if (process.env.SCREENSHOT) {
      await wait(1000);
      const image = await win.webContents.capturePage();
      writeFileSync('/tmp/opencode/oprobots-widget-kinds.png', image.toPNG());
    }

    console.log('E2E_WIDGET_KINDS ' + JSON.stringify(result));
    if (errors.length > 0) console.log('E2E_WIDGET_KINDS_ERRORS ' + JSON.stringify(errors.slice(0, 10)));

    const blank = result.stats.filter((s) => s.w > 10 && s.h > 10 && s.drawn === 0);
    const legendOk =
      result.legendCount >= 1 &&
      result.legendValues.every((v) => v !== '' && v !== '--');
    const readoutOk = result.readoutCount === 3;
    const ok =
      result.widgets >= 4 &&
      result.canvases >= 4 &&
      blank.length === 0 &&
      legendOk &&
      readoutOk &&
      errors.length === 0;
    console.log(ok ? 'E2E_WIDGET_KINDS_OK' : 'E2E_WIDGET_KINDS_FAIL');

    if (sendTimer) clearInterval(sendTimer);
    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('E2E_WIDGET_KINDS_EXCEPTION', err);
    if (sendTimer) clearInterval(sendTimer);
    app.exit(1);
  }
});
