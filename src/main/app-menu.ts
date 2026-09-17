import { app, BrowserWindow, dialog, Menu } from 'electron';

export type MenuAction =
  | 'open-video'
  | 'close-video'
  | 'open-session'
  | 'browse-sessions'
  | 'save-session'
  | 'export-video'
  | 'connect-serial'
  | 'disconnect-serial'
  | 'compare'
  | 'stop-comparison'
  | 'toggle-inspector'
  | 'layouts';

/**
 * Construye y establece el menú nativo de la aplicación.
 * Las acciones se envían al renderer por el canal `menu:action`.
 */
export function buildAppMenu(win: BrowserWindow): void {
  const send =
    (action: MenuAction) =>
    (): void => {
      if (!win.isDestroyed()) win.webContents.send('menu:action', action);
    };

  const showAbout = (): void => {
    void dialog.showMessageBox(win, {
      type: 'info',
      title: 'Acerca de OPRobots Telemetry Studio',
      message: 'OPRobots Telemetry Studio',
      detail: `Versión ${app.getVersion()}\n\nAnálisis de telemetría de robots con vídeo sincronizado.\n100% offline y portable.`,
      buttons: ['Cerrar'],
    });
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Archivo',
      submenu: [
        { label: 'Abrir vídeo…', accelerator: 'CmdOrCtrl+O', click: send('open-video') },
        { label: 'Cerrar vídeo', click: send('close-video') },
        { label: 'Abrir sesión…', accelerator: 'CmdOrCtrl+Shift+O', click: send('open-session') },
        { label: 'Explorar sesiones…', click: send('browse-sessions') },
        { type: 'separator' },
        { label: 'Guardar sesión…', accelerator: 'CmdOrCtrl+S', click: send('save-session') },
        { type: 'separator' },
        { label: 'Exportar vídeo…', accelerator: 'CmdOrCtrl+E', click: send('export-video') },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Datos',
      submenu: [
        { label: 'Conectar Serial…', accelerator: 'CmdOrCtrl+K', click: send('connect-serial') },
        { label: 'Desconectar Serial', click: send('disconnect-serial') },
        { type: 'separator' },
        { label: 'Comparar con otra sesión…', click: send('compare') },
        { label: 'Salir de comparación', click: send('stop-comparison') },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Mostrar/ocultar inspector', accelerator: 'CmdOrCtrl+B', click: send('toggle-inspector') },
        { label: 'Layouts…', click: send('layouts') },
        { type: 'separator' },
        { role: 'reload', label: 'Recargar' },
        { role: 'forceReload', label: 'Forzar recarga' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [{ label: 'Acerca de OPRobots Telemetry Studio', click: showAbout }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
