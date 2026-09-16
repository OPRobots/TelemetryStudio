/**
 * E2E de la rejilla fluida de widgets: ancho por defecto, redimensionado con el
 * ratón (snap a presets) y reordenación arrastrando la cabecera.
 *
 * Uso: npm run e2e:widgets
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

const FIRED = `
  const fire = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1
  }));
`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1440,
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

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await wait(1000);

    // 1. Conectar Serial → auto-layout crea el primer widget (ancho completo)
    win.webContents.send('menu:action', 'connect-serial');
    await wait(400);
    await win.webContents.executeJavaScript(clickByText('Conectar'));
    await wait(900);

    const initial = await win.webContents.executeJavaScript(`(() => {
      const cells = Array.from(document.querySelectorAll('[data-widget-id]'));
      return { count: cells.length, firstColumn: cells[0] ? cells[0].style.gridColumn : null };
    })()`);

    // 2. Añadir un segundo widget desde la barra
    await win.webContents.executeJavaScript(clickByText('+ Añadir gráfica'));
    await wait(300);
    await win.webContents.executeJavaScript(`(() => {
      const item = document.querySelector('.widget-menu-item');
      if (item) { item.click(); return true; } return false;
    })()`);
    await wait(500);

    const afterAdd = await win.webContents.executeJavaScript(
      `document.querySelectorAll('[data-widget-id]').length`
    );
    const beforeOrder = await win.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('[data-widget-id]')).map((c) => c.dataset.widgetId)`
    );

    // 3. Redimensionar el primer widget a ~1/2 arrastrando el asa derecha
    await win.webContents.executeJavaScript(`(() => {
      ${FIRED}
      const cell = document.querySelectorAll('[data-widget-id]')[0];
      const handle = cell.querySelector('.widget-resize--right');
      const r = cell.getBoundingClientRect();
      window.__startX = r.right - 3;
      window.__startY = r.top + 10;
      window.__width = r.width;
      fire(handle, 'pointerdown', window.__startX, window.__startY);
      return true;
    })()`);
    await wait(120);
    await win.webContents.executeJavaScript(`(() => {
      ${FIRED}
      fire(window, 'pointermove', window.__startX - window.__width * 0.45, window.__startY);
      return true;
    })()`);
    await wait(120);
    await win.webContents.executeJavaScript(`(() => {
      ${FIRED}
      fire(window, 'pointerup', 0, 0);
      return true;
    })()`);
    await wait(200);

    const resizedColumn = await win.webContents.executeJavaScript(
      `document.querySelectorAll('[data-widget-id]')[0].style.gridColumn`
    );

    // 4. Reordenar: arrastrar la cabecera del segundo widget encima del primero
    await win.webContents.executeJavaScript(`(() => {
      ${FIRED}
      const cells = document.querySelectorAll('[data-widget-id]');
      const header = cells[1].querySelector('.widget-card > div');
      const r0 = cells[0].getBoundingClientRect();
      const r1 = cells[1].getBoundingClientRect();
      window.__tx = r1.left + 40;
      window.__ty = r1.top + 10;
      window.__destY = r0.top + 2;
      fire(header, 'pointerdown', window.__tx, window.__ty);
      return true;
    })()`);
    await wait(120);
    await win.webContents.executeJavaScript(`(() => {
      ${FIRED}
      fire(window, 'pointermove', window.__tx, window.__destY);
      return true;
    })()`);
    await wait(120);
    await win.webContents.executeJavaScript(`(() => {
      ${FIRED}
      fire(window, 'pointerup', 0, 0);
      return true;
    })()`);
    await wait(300);

    const order = await win.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('[data-widget-id]')).map((c) => c.dataset.widgetId)`
    );

    if (process.env.SCREENSHOT) {
      await wait(2000);
      const image = await win.webContents.capturePage();
      writeFileSync('/tmp/opencode/oprobots-widgets.png', image.toPNG());
    }

    console.log(
      'E2E_WIDGETS ' + JSON.stringify({ initial, afterAdd, beforeOrder, resizedColumn, order })
    );
    if (errors.length > 0) console.log('E2E_WIDGETS_ERRORS ' + JSON.stringify(errors.slice(0, 10)));

    const defaultFullWidth = initial.count === 1 && initial.firstColumn === 'span 12';
    const added = afterAdd === 2;
    const resized = resizedColumn === 'span 6' || resizedColumn === 'span 4' || resizedColumn === 'span 3';
    const reordered =
      order.length === 2 && beforeOrder.length === 2 && order[0] === beforeOrder[1];

    const ok = defaultFullWidth && added && resized && reordered && errors.length === 0;
    console.log(ok ? 'E2E_WIDGETS_OK' : 'E2E_WIDGETS_FAIL');

    if (sendTimer) clearInterval(sendTimer);
    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('E2E_WIDGETS_EXCEPTION', err);
    if (sendTimer) clearInterval(sendTimer);
    app.exit(1);
  }
});
