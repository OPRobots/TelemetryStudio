import { app, shell, BrowserWindow, nativeImage } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';

// En Linux el gestor de ventanas (KDE) muestra el nombre del proceso en la
// barra de tareas/dock; en dev, el ejecutable es "electron". Lo fijamos al
// nombre real de la aplicación.
if (process.platform === 'linux') {
  process.title = 'Telemetry Studio';
}
import { registerIpcHandlers } from './ipc-handlers';
import { registerExportHandlers } from './export-service';
import { registerVideoHandlers } from './video-service';
import { buildAppMenu } from './app-menu';

/**
 * Icono de la app accesible en runtime.
 * - Dev: `build/icon.png` en la raíz del repo.
 * - Empaquetado: copiado por `extraResources` a `<resources>/icon.png`.
 */
function resolveIconPath(): string {
  return is.dev
    ? join(__dirname, '../../build/icon.png')
    : join(process.resourcesPath, 'icon.png');
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: false,
    backgroundColor: '#0b0e14',
    // Icono de ventana/barra de tareas (Windows/Linux). En macOS se ignora.
    icon: resolveIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  registerIpcHandlers(mainWindow);
  registerExportHandlers(mainWindow);
  registerVideoHandlers();
  buildAppMenu(mainWindow);

  // macOS: en desarrollo el Dock usa el icono de Electron; en el paquete lo
  // pone el .icns del bundle, así que solo lo forzamos en dev.
  if (is.dev && process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(resolveIconPath()));
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Evita navegar fuera de la app; los enlaces externos se abren en el navegador.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (url.startsWith('file://') || (devUrl && url.startsWith(devUrl))) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // En Linux, el WM_CLASS/app id deriva de `app.name` (en dev, "Electron").
  // Lo fijamos al nombre real y conservamos la carpeta de datos.
  if (process.platform === 'linux') {
    app.setName('Telemetry Studio');
    try {
      app.setPath('userData', join(app.getPath('appData'), 'Telemetry Studio'));
    } catch {
      // Si no se puede resolver, se deja el userData por defecto.
    }
  }

  electronApp.setAppUserModelId('org.oprobots.telemetry-studio');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
