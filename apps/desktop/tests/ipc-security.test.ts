import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  join,
} from 'node:path';

import {
  pathToFileURL,
} from 'node:url';

const electronMocks = vi.hoisted(() => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn(() => process.cwd()),
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock('electron', () => electronMocks);

import type {
  BrowserWindow,
  IpcMainInvokeEvent,
} from 'electron';

import {
  assertTrustedIpcSender,
  isAllowedRendererUrl,
} from '../electron/ipc/secure-handler.js';

import {
  DesktopApplicationError,
} from '../electron/errors.js';

describe('Electron IPC sender security', () => {
  it('accepts the configured local development origin', () => {
    electronMocks.app.isPackaged = false;

    expect(
      isAllowedRendererUrl(
        'http://127.0.0.1:5173/',
      ),
    ).toBe(true);
  });

  it('rejects external and look-alike origins', () => {
    electronMocks.app.isPackaged = false;

    expect(
      isAllowedRendererUrl(
        'https://example.com/',
      ),
    ).toBe(false);

    expect(
      isAllowedRendererUrl(
        'http://localhost:5173/',
      ),
    ).toBe(false);

    expect(
      isAllowedRendererUrl(
        'http://127.0.0.1:5174/',
      ),
    ).toBe(false);
  });

  it('accepts the packaged application entry point only', () => {
    electronMocks.app.isPackaged = true;

    const expectedIndex = join(
      process.cwd(),
      'dist',
      'index.html',
    );

    expect(
      isAllowedRendererUrl(
        pathToFileURL(expectedIndex).toString(),
      ),
    ).toBe(true);

    expect(
      isAllowedRendererUrl(
        pathToFileURL(
          join(
            process.cwd(),
            'another.html',
          ),
        ).toString(),
      ),
    ).toBe(false);
  });

  it('accepts IPC from the trusted main frame', () => {
    electronMocks.app.isPackaged = false;

    const mainFrame = {
      url: 'http://127.0.0.1:5173/',
    };

    const webContents = {
      mainFrame,
    };

    const fakeWindow = {
      isDestroyed: () => false,
      webContents,
    } as unknown as BrowserWindow;

    const event = {
      sender: webContents,
      senderFrame: mainFrame,
    } as unknown as IpcMainInvokeEvent;

    expect(() =>
      assertTrustedIpcSender(
        event,
        () => fakeWindow,
      ),
    ).not.toThrow();
  });

  it('rejects IPC from another frame', () => {
    electronMocks.app.isPackaged = false;

    const mainFrame = {
      url: 'http://127.0.0.1:5173/',
    };

    const iframe = {
      url: 'http://127.0.0.1:5173/embedded',
    };

    const webContents = {
      mainFrame,
    };

    const fakeWindow = {
      isDestroyed: () => false,
      webContents,
    } as unknown as BrowserWindow;

    const event = {
      sender: webContents,
      senderFrame: iframe,
    } as unknown as IpcMainInvokeEvent;

    expect(() =>
      assertTrustedIpcSender(
        event,
        () => fakeWindow,
      ),
    ).toThrow(DesktopApplicationError);
  });
});