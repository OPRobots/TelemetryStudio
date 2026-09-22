import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';

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
  | 'layouts'
  | 'new-layout'
  | 'about';

/** Enlaces externos usados por el menú Ayuda y el diálogo About. */
export const LINKS = {
  oprobotsWeb: 'https://oprobots.org',
  oprobotsGithub: 'https://github.com/OPRobots',
  robotalehWeb: 'https://robotaleh.dev',
  robotalehGithub: 'https://github.com/robotaleh',
  deepseek: 'https://deepseek.com',
} as const;

/** Estado que el renderer sincroniza para habilitar/deshabilitar ítems del menú. */
export interface MenuState {
  inspectorVisible: boolean;
  serialConnected: boolean;
  comparisonActive: boolean;
  hasVideo: boolean;
  hasData: boolean;
}

let stateWired = false;

/** Ventana activa (o la primera abierta) en el momento de la acción. */
function activeWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

/**
 * Construye y establece el menú nativo de la aplicación.
 * Las acciones se envían al renderer por el canal `menu:action`.
 */
export function buildAppMenu(): void {
  const send =
    (action: MenuAction) =>
    (): void => {
      const win = activeWindow();
      if (win && !win.isDestroyed()) win.webContents.send('menu:action', action);
    };

  const openLink =
    (url: string) =>
    (): void => {
      void shell.openExternal(url);
    };

  const confirmNewLayout = (): void => {
    const win = activeWindow();
    if (!win) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'Nuevo layout',
      message: '¿Crear un layout nuevo?',
      detail: 'Se vaciará el lienzo actual sin guardar.',
      buttons: ['Cancelar', 'Nuevo layout'],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1 && !win.isDestroyed()) win.webContents.send('menu:action', 'new-layout');
  };

  // macOS: el primer submenú es el menú de la app (About/Ocultar/Salir).
  const appMenu: Electron.MenuItemConstructorOptions[] =
    process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { label: 'Acerca de…', click: send('about') },
              { type: 'separator' },
              { role: 'services', label: 'Servicios' },
              { type: 'separator' },
              { role: 'hide', label: `Ocultar ${app.name}` },
              { role: 'hideOthers', label: 'Ocultar otros' },
              { role: 'unhide', label: 'Mostrar todo' },
              { type: 'separator' },
              { role: 'quit', label: `Salir de ${app.name}` },
            ],
          },
        ]
      : [];

  const quitItem: Electron.MenuItemConstructorOptions[] =
    process.platform === 'darwin'
      ? []
      : [{ type: 'separator' }, { role: 'quit', label: 'Salir' }];

  // Ítems de desarrollo solo fuera del empaquetado.
  const devMenu: Electron.MenuItemConstructorOptions[] = app.isPackaged
    ? []
    : [
        {
          label: 'Desarrollo',
          submenu: [
            { role: 'reload', label: 'Recargar' },
            { role: 'forceReload', label: 'Forzar recarga' },
            { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
          ],
        },
      ];

  const template: Electron.MenuItemConstructorOptions[] = [
    ...appMenu,
    {
      label: 'Archivo',
      submenu: [
        { label: 'Abrir vídeo…', accelerator: 'CmdOrCtrl+O', click: send('open-video') },
        { id: 'close-video', label: 'Cerrar vídeo', enabled: false, click: send('close-video') },
        { type: 'separator' },
        { label: 'Abrir sesión…', accelerator: 'CmdOrCtrl+Shift+O', click: send('open-session') },
        {
          id: 'save-session',
          label: 'Guardar sesión…',
          accelerator: 'CmdOrCtrl+S',
          enabled: false,
          click: send('save-session'),
        },
        { label: 'Explorar sesiones…', click: send('browse-sessions') },
        { type: 'separator' },
        {
          // Siempre habilitado: la acción avisa si aún no hay vídeo/datos.
          id: 'export-video',
          label: 'Exportar vídeo…',
          accelerator: 'CmdOrCtrl+E',
          click: send('export-video'),
        },
        ...quitItem,
      ],
    },
    {
      label: 'Datos',
      submenu: [
        { label: 'Conectar Serial…', accelerator: 'CmdOrCtrl+K', click: send('connect-serial') },
        {
          id: 'disconnect-serial',
          label: 'Desconectar Serial',
          enabled: false,
          click: send('disconnect-serial'),
        },
        { type: 'separator' },
        {
          id: 'compare',
          label: 'Comparar con otra sesión…',
          enabled: false,
          click: send('compare'),
        },
        {
          id: 'stop-comparison',
          label: 'Salir de comparación',
          enabled: false,
          click: send('stop-comparison'),
        },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        {
          id: 'inspector',
          label: 'Inspector',
          type: 'checkbox',
          checked: true,
          accelerator: 'CmdOrCtrl+B',
          click: send('toggle-inspector'),
        },
        { type: 'separator' },
        { label: 'Nuevo layout…', click: confirmNewLayout },
        { label: 'Layouts…', click: send('layouts') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },
    ...devMenu,
    {
      label: 'Ayuda',
      submenu: [
        { label: 'OPRobots', click: openLink(LINKS.oprobotsWeb) },
        { label: '@robotaleh', click: openLink(LINKS.robotalehWeb) },
        { type: 'separator' },
        { label: 'Acerca de…', click: send('about') },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  if (!stateWired) {
    stateWired = true;
    ipcMain.on('menu:set-state', (_event, state: Partial<MenuState>) => {
      if (state && typeof state === 'object') applyMenuState(state);
    });
  }
}

/** Aplica el estado recibido del renderer a los ítems del menú. */
function applyMenuState(state: Partial<MenuState>): void {
  const menu = Menu.getApplicationMenu();
  if (!menu) return;

  const set = (id: string, patch: { checked?: boolean; enabled?: boolean }): void => {
    const item = menu.getMenuItemById(id);
    if (!item) return;
    if (patch.checked !== undefined) item.checked = patch.checked;
    if (patch.enabled !== undefined) item.enabled = patch.enabled;
  };

  if (state.inspectorVisible !== undefined) set('inspector', { checked: state.inspectorVisible });
  if (state.serialConnected !== undefined)
    set('disconnect-serial', { enabled: state.serialConnected });
  if (state.comparisonActive !== undefined)
    set('stop-comparison', { enabled: state.comparisonActive });
  if (state.hasVideo !== undefined) {
    set('close-video', { enabled: state.hasVideo });
  }
  if (state.hasData !== undefined) {
    set('save-session', { enabled: state.hasData });
    set('compare', { enabled: state.hasData });
  }
}
