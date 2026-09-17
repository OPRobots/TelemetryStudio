/**
 * E2E de comparación en paralelo (A izquierda / B derecha):
 *   1. Cargar sesión A, comparar con B (widgets idénticos).
 *   2. Verificar divisor VERTICAL y paneles lado a lado.
 *   3. Verificar scroll sincronizado entre los dos paneles.
 *   4. Verificar zoom (rango) sincronizado: arrastrar en A cambia B.
 *   5. Comparar con una sesión SIN vídeo: placeholder alineado.
 *
 * Uso: npm run e2e:comparison
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = join(currentDir, '..');
const sessionsDir = join('/tmp', 'opencode', 'oprobots-sessions');

const errors = [];

function makeSession(name, withVideo) {
  return {
    v: 1,
    name,
    created: '2026-01-01T00:00:00Z',
    video: withVideo
      ? { file: 'mock_video.mp4', fps: 30, duration_s: 10, resolution: [1920, 1080] }
      : { file: '', fps: 0, duration_s: 0, resolution: [0, 0] },
    sync: { offset_ms: 0, anchor: null, rate: 1 },
    telemetry: {
      schema: [['value', 'number']],
      frames: Array.from({ length: 200 }, (_, i) => [i * 20, Number((Math.sin(i / 10) * 10).toFixed(3))]),
    },
    layout: {
      widgets: Array.from({ length: 5 }, (_, i) => ({
        t: 'TimeSeriesChart',
        size: [12, 7],
        fields: ['value'],
        config: { yLabel: `Serie ${i + 1}` },
      })),
    },
  };
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

function prepareFixtures() {
  mkdirSync(sessionsDir, { recursive: true });
  const a = join(sessionsDir, 'A.json');
  const b = join(sessionsDir, 'B.json');
  const bn = join(sessionsDir, 'Bn.json');
  writeFileSync(a, JSON.stringify(makeSession('Sesión A', true)));
  writeFileSync(b, JSON.stringify(makeSession('Sesión B', true)));
  writeFileSync(bn, JSON.stringify(makeSession('Sesión B (sin vídeo)', false)));
  return { a, b, bn };
}

function registerMocks(win, fixtures) {
  // Orden de aperturas: A (sesión actual) → B (comparar) → Bn (comparar sin vídeo).
  const sessionPaths = [fixtures.a, fixtures.b, fixtures.bn];
  let sessionDialogCount = 0;
  ipcMain.handle('layout:loadAll', () => []);
  ipcMain.handle('video:prepare', (_e, p) => ({ success: true, path: p, transcoded: false, fps: 30 }));
  ipcMain.handle('session:getVideoPath', (_e, jsonPath, file) => join(dirname(jsonPath), file));
  ipcMain.handle('file:read', (_e, jsonPath) => ({
    success: true,
    content: readFileSync(jsonPath, 'utf-8'),
  }));
  ipcMain.handle('dialog:openSession', () => {
    const filePath = sessionPaths[Math.min(sessionDialogCount, sessionPaths.length - 1)];
    sessionDialogCount += 1;
    return { canceled: false, filePath };
  });
}

app.whenReady().then(async () => {
  const fixtures = prepareFixtures();

  const win = new BrowserWindow({
    show: true,
    width: 1400,
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

  registerMocks(win, fixtures);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = (js) => win.webContents.executeJavaScript(js);
  const clickByText = (text) => `(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === ${JSON.stringify(text)});
    if (btn) { btn.click(); return true; }
    return false;
  })()`;

  const openComparison = async () => {
    win.webContents.send('menu:action', 'compare');
    await wait(400);
    await run(clickByText('Elegir sesión…'));
    await wait(1400);
  };

  const layoutInfo = () =>
    run(`(() => {
      const grids = Array.from(document.querySelectorAll('.widget-grid'));
      const rects = grids.map((g) => {
        const r = g.getBoundingClientRect();
        return { top: Math.round(r.top), left: Math.round(r.left), scrollH: g.scrollHeight, clientH: g.clientHeight };
      });
      return {
        videos: document.querySelectorAll('video').length,
        widgetCards: document.querySelectorAll('.widget-card').length,
        gridCount: grids.length,
        verticalSplitter: !!document.querySelector('.splitter--vertical'),
        rects,
        hasPlayback: document.body.innerText.includes('Reproducción'),
        hasPlaceholder: document.body.innerText.includes('Sin vídeo'),
      };
    })()`);

  try {
    await win.loadFile(join(root, 'out/renderer/index.html'));
    await wait(1000);

    // 1) Cargar sesión A
    win.webContents.send('menu:action', 'open-session');
    await wait(1000);
    const openedA = await run(`document.querySelectorAll('.widget-card').length >= 1`);

    // 2) Comparar con B (con vídeo)
    await openComparison();
    const main = await layoutInfo();

    // 3) Scroll sincronizado
    await run(`(() => {
      const grids = document.querySelectorAll('.widget-grid');
      grids[0].scrollTop = 150;
      return true;
    })()`);
    await wait(200);
    const scroll = await run(`(() => {
      const grids = document.querySelectorAll('.widget-grid');
      return { a: Math.round(grids[0].scrollTop), b: Math.round(grids[1].scrollTop) };
    })()`);

    // 4) Zoom sincronizado: arrastrar en el primer chart de A → cambia el de B
    const bCanvasBefore = await run(
      `document.querySelectorAll('.widget-grid')[1].querySelector('canvas').toDataURL()`
    );
    await run(`(() => {
      const over = document.querySelectorAll('.widget-grid')[0].querySelector('.u-over');
      const r = over.getBoundingClientRect();
      const y = r.top + r.height * 0.5;
      const x0 = r.left + r.width * 0.25;
      const x1 = r.left + r.width * 0.6;
      over.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x0, clientY: y, button: 0, buttons: 1 }));
      over.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x1, clientY: y, button: 0, buttons: 1, movementX: x1 - x0, movementY: 0 }));
      over.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x1, clientY: y, button: 0, buttons: 0 }));
      return true;
    })()`);
    await wait(400);
    const bCanvasAfter = await run(
      `document.querySelectorAll('.widget-grid')[1].querySelector('canvas').toDataURL()`
    );

    // 5) Salir y comparar con B sin vídeo
    await run(clickByText('Salir'));
    await wait(600);
    await openComparison();
    const noVideo = await layoutInfo();

    if (process.env.SCREENSHOT) {
      await wait(800);
      const image = await win.webContents.capturePage();
      writeFileSync('/tmp/opencode/oprobots-comparison.png', image.toPNG());
    }

    const sideBySide =
      main.rects.length === 2 &&
      Math.abs(main.rects[0].top - main.rects[1].top) < 4 &&
      main.rects[0].left !== main.rects[1].left;
    const canScroll = main.rects.length === 2 && main.rects[0].scrollH > main.rects[0].clientH;
    const scrollSynced = scroll.a > 100 && Math.abs(scroll.a - scroll.b) <= 2;
    const zoomSynced = bCanvasBefore !== bCanvasAfter;
    const noVideoOk =
      noVideo.videos === 1 &&
      noVideo.hasPlaceholder &&
      noVideo.rects.length === 2 &&
      Math.abs(noVideo.rects[0].top - noVideo.rects[1].top) < 4;

    const result = {
      openedA,
      videos: main.videos,
      widgetCards: main.widgetCards,
      gridCount: main.gridCount,
      verticalSplitter: main.verticalSplitter,
      sideBySide,
      canScroll,
      scroll,
      scrollSynced,
      zoomSynced,
      noVideoOk,
    };
    console.log('E2E_COMPARISON ' + JSON.stringify(result));
    if (errors.length > 0) console.log('E2E_COMPARISON_ERRORS ' + JSON.stringify(errors.slice(0, 10)));

    const ok =
      openedA &&
      main.videos === 2 &&
      main.widgetCards >= 10 &&
      main.gridCount === 2 &&
      main.verticalSplitter &&
      sideBySide &&
      canScroll &&
      scrollSynced &&
      zoomSynced &&
      noVideoOk &&
      errors.length === 0;

    console.log(ok ? 'E2E_COMPARISON_OK' : 'E2E_COMPARISON_FAIL');
    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('E2E_COMPARISON_EXCEPTION', err);
    app.exit(1);
  }
});
