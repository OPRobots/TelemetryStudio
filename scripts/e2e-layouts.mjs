/**
 * E2E de layouts:
 *   1. La acción de menú "Nuevo layout" (menu:action 'new-layout') vacía el lienzo.
 *   2. Guardar un layout con nombre lo persiste y aparece en la lista.
 *
 * La confirmación nativa del menú no es automatizable aquí; se cubre el handler
 * del renderer enviando la acción directamente.
 *
 * Uso: npm run e2e:layouts
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = join(currentDir, '..');

const errors = [];
let sendTimer = null;
const savedLayouts = [];

app.commandLine.appendSwitch('no-sandbox');
ipcMain.handle('settings:getSerial', () => null);
ipcMain.handle('settings:setSerial', () => {});
app.commandLine.appendSwitch('disable-gpu');

function makeLine(t) {
  const s = t / 1000;
  return (
    `T:${Math.round(t)},position_x:${(Math.sin(s) * 2).toFixed(2)},` +
    `position_y:${(Math.cos(s) * 2).toFixed(2)},speed:${(1 + Math.sin(s * 3)).toFixed(2)},` +
    `state:${Math.floor(s / 3) % 2 === 0 ? 'RUNNING' : 'IDLE'}`
  );
}

function registerMocks(win) {
  ipcMain.handle('layout:loadAll', () => savedLayouts);
  ipcMain.handle('layout:save', (_e, layout) => {
    const idx = savedLayouts.findIndex((l) => l.name === layout.name);
    if (idx >= 0) savedLayouts[idx] = layout;
    else savedLayouts.push(layout);
  });
  ipcMain.handle('layout:delete', (_e, name) => {
    const idx = savedLayouts.findIndex((l) => l.name === name);
    if (idx >= 0) savedLayouts.splice(idx, 1);
  });
  ipcMain.handle('video:prepare', (_e, p) => ({ success: true, path: p, transcoded: false }));
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
  const widgetCount = () => run(`document.querySelectorAll('.widget-card').length`);
  const bodyText = () => run(`document.body.innerText`);
  const layoutDialogOpen = () =>
    run(`!!document.querySelector('input[placeholder="Nombre del layout"]')`);
  const setLayoutName = (value) => `(() => {
    const el = document.querySelector('input[placeholder="Nombre del layout"]');
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`;
  const setLayoutDescription = (value) => `(() => {
    const el = document.querySelector('input[placeholder="Descripción (opcional)"]');
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`;

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await wait(1000);

    // Widgets vía Serial simulado
    win.webContents.send('menu:action', 'connect-serial');
    await wait(400);
    await win.webContents.executeJavaScript(chooseSerialParser("Default"));
    await new Promise((r) => setTimeout(r, 150));
    await run(clickByText('Conectar'));
    await wait(1200);
    const widgetsBefore = await widgetCount();

    // "Nuevo layout" (menú) → vacía el lienzo sin abrir el diálogo
    win.webContents.send('menu:action', 'new-layout');
    await wait(500);
    const widgetsAfter = await widgetCount();
    const dialogForNew = await layoutDialogOpen();

    // Guardar un layout con nombre
    win.webContents.send('menu:action', 'layouts');
    await wait(400);
    const dialogOpen = await layoutDialogOpen();
    await run(setLayoutName('Prueba de layout'));
    await run(setLayoutDescription('Layout de prueba e2e'));
    await run(clickByText('Guardar'));
    await wait(600);
    const text = await bodyText();
    const savedVisible = text.includes('Prueba de layout');
    const descriptionVisible = text.includes('Layout de prueba e2e');
    const persistedCount = savedLayouts.length;

    const result = {
      widgetsBefore,
      widgetsAfter,
      dialogForNew,
      dialogOpen,
      savedVisible,
      descriptionVisible,
      persistedCount,
    };
    console.log('E2E_LAYOUTS ' + JSON.stringify(result));
    if (errors.length > 0) console.log('E2E_LAYOUTS_ERRORS ' + JSON.stringify(errors.slice(0, 10)));

    const ok =
      widgetsBefore > 0 &&
      widgetsAfter === 0 &&
      !dialogForNew &&
      dialogOpen &&
      savedVisible &&
      descriptionVisible &&
      persistedCount >= 1 &&
      errors.length === 0;

    console.log(ok ? 'E2E_LAYOUTS_OK' : 'E2E_LAYOUTS_FAIL');
    if (sendTimer) clearInterval(sendTimer);
    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('E2E_LAYOUTS_EXCEPTION', err);
    if (sendTimer) clearInterval(sendTimer);
    app.exit(1);
  }
});
