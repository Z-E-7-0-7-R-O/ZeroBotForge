import {
  app,
  BrowserWindow,
  session,
  shell,
} from 'electron';

import {
  join,
} from 'node:path';

import {
  registerProjectIpc,
  resetActiveProjectPath,
} from './ipc/project.ipc.js';

import {
  registerExportIpc,
} from './ipc/export.ipc.js';

import {
  registerSystemIpc,
} from './ipc/system.ipc.js';

import {
  registerTelegramIpc,
} from './ipc/telegram.ipc.js';

import {
  isAllowedRendererUrl,
} from './ipc/secure-handler.js';

import {
  AppSettingsService,
} from './services/app-settings.service.js';

import {
  SecureStorageService,
} from './services/secure-storage.service.js';

import {
  BotRuntimeService,
} from './services/bot-runtime.service.js';

import {
  registerRuntimeIpc,
} from './ipc/runtime.ipc.js';

let mainWindow: BrowserWindow | null = null;

let handlersRegistered = false;

let activeRuntimeService: BotRuntimeService | null = null;

function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function attachWindowSecurity(
  window: BrowserWindow,
): void {
  window.webContents.setWindowOpenHandler(
    ({ url }) => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          void shell.openExternal(parsed.toString());
        }
      } catch {
        // Ignore malformed external URLs.
      }
      return {
        action: 'deny',
      };
    },
  );

  window.webContents.on(
    'will-navigate',
    (event, navigationUrl) => {
      if (
        !isAllowedRendererUrl(navigationUrl)
      ) {
        event.preventDefault();
      }
    },
  );

  // Electron permissions are not needed by the current renderer.
  // Deny permission requests by default.
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );
}

function registerApplicationIpc(): void {
  if (handlersRegistered) {
    return;
  }

  handlersRegistered = true;

  const userDataDirectory =
    app.getPath('userData');

  const settingsService =
    new AppSettingsService(
      userDataDirectory,
    );

  const secureStorage =
    new SecureStorageService(
      userDataDirectory,
    );

  const runtimeService =
    new BotRuntimeService(
      secureStorage,
    );

  activeRuntimeService = runtimeService;

  registerProjectIpc(
    getMainWindow,
  );

  registerExportIpc(
    getMainWindow,
    secureStorage,
    runtimeService,
  );

  registerSystemIpc(
    getMainWindow,
    settingsService,
  );

  registerTelegramIpc(
    getMainWindow,
    secureStorage,
    runtimeService,
  );

  registerRuntimeIpc(
    getMainWindow,
    runtimeService,
  );
}

async function createMainWindow(): Promise<void> {
  if (
    mainWindow &&
    !mainWindow.isDestroyed()
  ) {
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    title: 'ZeroBotForge',
    backgroundColor: '#10131a',
    autoHideMenuBar: true,

    webPreferences: {
      preload: join(
        __dirname,
        'preload.cjs',
      ),

      // Explicit security boundary.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,

      // Keep developer tools available during development.
      devTools: !app.isPackaged,
    },
  });

  // Hide the native Win32/Linux menu bar while keeping default keyboard shortcuts active.
  mainWindow.setMenuBarVisibility(false);

  attachWindowSecurity(
    mainWindow,
  );

  mainWindow.once(
    'ready-to-show',
    () => {
      mainWindow?.show();
    },
  );

  mainWindow.on(
    'closed',
    () => {
      mainWindow = null;
      resetActiveProjectPath();
    },
  );

  try {
    if (app.isPackaged) {
      await mainWindow.loadFile(
        join(
          app.getAppPath(),
          'dist',
          'index.html',
        ),
      );
    } else {
      await mainWindow.loadURL(
        'http://127.0.0.1:5173/',
      );
    }
  } catch {
    // Do not log the URL or any IPC payloads.
    if (
      mainWindow &&
      !mainWindow.isDestroyed()
    ) {
      mainWindow.destroy();
    }
  }
}

app.on(
  'window-all-closed',
  () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  },
);

app.on(
  'activate',
  () => {
    if (
      BrowserWindow.getAllWindows().length === 0
    ) {
      void createMainWindow();
    }
  },
);

app.on(
  'before-quit',
  () => {
    resetActiveProjectPath();
    if (activeRuntimeService) {
      void activeRuntimeService.stop();
    }
  },
);

void app.whenReady().then(async () => {
  // Electron's renderer sandbox is also explicitly set per window.
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );

  registerApplicationIpc();

  await createMainWindow();
});