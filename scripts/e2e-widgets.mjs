/**
 * E2E de la rejilla fluida de widgets:
 *   1. Ancho completo por defecto.
 *   2. Redimensionado de ALTO con el ratón (saltos de fila).
 *   3. Redimensionado de ANCHO a 1/2 (snap a preset) en dos widgets.
 *   4. Colocación fluida: dos widgets al 50% comparten fila (lado a lado).
 *   5. Reordenación arrastrando la cabecera.
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
ipcMain.handle('settings:getSerial', () => null);
ipcMain.handle('settings:setSerial', () => {});
app.commandLine.appendSwitch('disable-gpu');

function makeLine(t) {
  const s = t / 1000;
  return `${Math.round(t)},${(Math.sin(s) * 9.8).toFixed(2)},0.0,9.8,0.0,0.0,0.0,99.0`;
}

function registerMocks(win) {
  ipcMain.handle('layout:loadAll', () => []);
  ipcMain.handle('app:version', () => '1.0.0');
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

const FIRE = `
  const fire = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1
  }));
`;

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

  const drag = async (setup, move) => {
    await run(setup);
    await wait(120);
    await run(`(() => { ${FIRE} ${move} return true; })()`);
    await wait(120);
    await run(`(() => { ${FIRE} fire(window, 'pointerup', 0, 0); return true; })()`);
    await wait(200);
  };

  const resizeWidthToHalf = (index) =>
    drag(
      `(() => {
        ${FIRE}
        const cell = document.querySelectorAll('[data-widget-id]')[${index}];
        const handle = cell.querySelector('.widget-resize--right');
        const r = cell.getBoundingClientRect();
        window.__mx = r.left + r.width / 2;
        window.__my = r.top + 10;
        fire(handle, 'pointerdown', r.right - 3, window.__my);
        return true;
      })()`,
      `fire(window, 'pointermove', window.__mx, window.__my);`
    );

  const resizeHeightBy = (index, px) =>
    drag(
      `(() => {
        ${FIRE}
        const cell = document.querySelectorAll('[data-widget-id]')[${index}];
        const handle = cell.querySelector('.widget-resize--bottom');
        const r = cell.getBoundingClientRect();
        window.__hx = r.left + r.width / 2;
        window.__hy = r.bottom - 3;
        fire(handle, 'pointerdown', window.__hx, window.__hy);
        return true;
      })()`,
      `fire(window, 'pointermove', window.__hx, window.__hy + ${px});`
    );

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await wait(1000);

    // 1. Conectar Serial → auto-layout crea el primer widget (ancho completo)
    win.webContents.send('menu:action', 'connect-serial');
    await wait(400);
    await win.webContents.executeJavaScript(chooseSerialParser("CSV"));
    await new Promise((r) => setTimeout(r, 150));
    await win.webContents.executeJavaScript(setSerialCsvLabels("accX, accY, accZ, gyroX, gyroY, gyroZ, battery"));
    await new Promise((r) => setTimeout(r, 150));
    await run(clickByText('Conectar'));
    await wait(900);

    const initial = await run(`(() => {
      const cells = Array.from(document.querySelectorAll('[data-widget-id]'));
      const cols = cells.map((c) => c.dataset.cols);
      return {
        count: cells.length,
        firstCols: cols[0] ?? null,
        allHalf: cols.length >= 2 && cols.every((c) => c === '6'),
      };
    })()`);

    // 2. Añadir un segundo widget
    await run(clickByText('+ Añadir gráfica'));
    await wait(300);
    await run(`(() => { const item = document.querySelector('.widget-menu-item'); if (item) item.click(); })()`);
    await wait(500);

    const beforeOrder = await run(
      `Array.from(document.querySelectorAll('[data-widget-id]')).map((c) => c.dataset.widgetId)`
    );

    // 3. Redimensionar ALTO del primer widget (+2 filas)
    await resizeHeightBy(0, 104);
    const resizedRows = await run(`document.querySelectorAll('[data-widget-id]')[0].dataset.rows`);

    // 4. Redimensionar ANCHO de ambos a 1/2
    await resizeWidthToHalf(0);
    await resizeWidthToHalf(1);
    const columns = await run(
      `Array.from(document.querySelectorAll('[data-widget-id]')).map((c) => c.dataset.cols)`
    );
    await wait(900);
    const rects = await run(`(() => {
      const cells = Array.from(document.querySelectorAll('[data-widget-id]'));
      return {
        cells: cells.map((x) => ({
          top: Math.round(x.getBoundingClientRect().top),
          left: Math.round(x.getBoundingClientRect().left),
          cols: x.dataset.cols,
        })),
      };
    })()`);

    // 5. Reordenar: arrastrar la cabecera del segundo encima del primero
    await run(`(() => {
      ${FIRE}
      const cells = document.querySelectorAll('[data-widget-id]');
      const header = cells[1].querySelector('.widget-card > div');
      const r0 = cells[0].getBoundingClientRect();
      const r1 = cells[1].getBoundingClientRect();
      window.__tx = r1.left + 40; window.__ty = r1.top + 10; window.__destY = r0.top + 2;
      fire(header, 'pointerdown', window.__tx, window.__ty);
      return true;
    })()`);
    await wait(120);
    await run(`(() => { ${FIRE} fire(window, 'pointermove', window.__tx, window.__destY); return true; })()`);
    await wait(120);
    await run(`(() => { ${FIRE} fire(window, 'pointerup', 0, 0); return true; })()`);
    await wait(300);
    const order = await run(
      `Array.from(document.querySelectorAll('[data-widget-id]')).map((c) => c.dataset.widgetId)`
    );

    // 6. About: abrir desde el menú y comprobar contenido/enlaces
    win.webContents.send('menu:action', 'about');
    await wait(400);
    const about = await run(`(() => {
      const dlg = document.querySelector('.about-dialog');
      if (!dlg) return { open: false, title: '', version: '', links: [] };
      return {
        open: true,
        title: (dlg.querySelector('.about-title') || {}).textContent || '',
        version: (dlg.querySelector('.about-version') || {}).textContent || '',
        links: Array.from(dlg.querySelectorAll('a')).map((a) => a.getAttribute('href')),
      };
    })()`);
    await run(clickByText('Cerrar'));
    await wait(200);

    if (process.env.SCREENSHOT) {
      await wait(2000);
      const image = await win.webContents.capturePage();
      writeFileSync('/tmp/opencode/oprobots-widgets.png', image.toPNG());
    }

    console.log(
      'E2E_WIDGETS ' +
        JSON.stringify({ initial, beforeOrder, resizedRows, columns, rects, order, about })
    );
    if (errors.length > 0) console.log('E2E_WIDGETS_ERRORS ' + JSON.stringify(errors.slice(0, 10)));

    const defaultHalfWidth = initial.count >= 2 && initial.allHalf;
    const heightGrew = Number(resizedRows) > 6;
    const widthChanged =
      columns.length >= 2 && Number(columns[0]) < 6 && Number(columns[1]) < 6;
    const sideBySide =
      rects.cells.length >= 2 &&
      Math.abs(rects.cells[0].top - rects.cells[1].top) < 4 &&
      rects.cells[0].left !== rects.cells[1].left;
    const reordered = order.length >= 2 && order[0] === beforeOrder[1];

    const aboutOk =
      about.open &&
      about.title.includes('Telemetry Studio') &&
      about.version.includes('Versión') &&
      ['https://robotaleh.dev', 'https://github.com/robotaleh', 'https://oprobots.org', 'https://github.com/OPRobots', 'https://deepseek.com'].every(
        (u) => about.links.includes(u)
      );

    const ok =
      defaultHalfWidth &&
      heightGrew &&
      widthChanged &&
      sideBySide &&
      reordered &&
      aboutOk &&
      errors.length === 0;
    console.log(ok ? 'E2E_WIDGETS_OK' : 'E2E_WIDGETS_FAIL');

    if (sendTimer) clearInterval(sendTimer);
    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('E2E_WIDGETS_EXCEPTION', err);
    if (sendTimer) clearInterval(sendTimer);
    app.exit(1);
  }
});
