import {
  app,
  ipcMain,
} from 'electron';

import type {
  BrowserWindow,
  IpcMainInvokeEvent,
} from 'electron';

import {
  resolve,
  join,
} from 'node:path';

import {
  fileURLToPath,
} from 'node:url';

import {
  ZeroBotForgeError,
} from '@zerobotforge/shared/errors';

import type {
  DesktopApiError,
  DesktopApiResult,
} from '../../src/types/electron-api.js';

import {
  DesktopApplicationError,
} from '../errors.js';

export type MainWindowProvider =
  () => BrowserWindow | null;

export type SecureIpcHandler<T> = (
  event: IpcMainInvokeEvent,
  ...args: unknown[]
) => T | Promise<T>;

function normalisePathForComparison(
  value: string,
): string {
  const normalized = resolve(value);

  return process.platform === 'win32'
    ? normalized.toLowerCase()
    : normalized;
}

/**
 * The development renderer must be served from the fixed Vite origin.
 * In production, IPC is accepted only from the packaged index.html.
 */
export function isAllowedRendererUrl(
  rawUrl: string,
): boolean {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (!app.isPackaged) {
    return (
      parsed.protocol === 'http:' &&
      parsed.hostname === '127.0.0.1' &&
      parsed.port === '5173' &&
      parsed.username === '' &&
      parsed.password === ''
    );
  }

  if (parsed.protocol !== 'file:') {
    return false;
  }

  try {
    const actualPath = fileURLToPath(parsed);

    const expectedPath = join(
      app.getAppPath(),
      'dist',
      'index.html',
    );

    return (
      normalisePathForComparison(actualPath) ===
      normalisePathForComparison(expectedPath)
    );
  } catch {
    return false;
  }
}

export function assertTrustedIpcSender(
  event: IpcMainInvokeEvent,
  getMainWindow: MainWindowProvider,
): void {
  const mainWindow = getMainWindow();

  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    event.sender !== mainWindow.webContents
  ) {
    throw new DesktopApplicationError(
      'IPC_UNTRUSTED_SENDER',
      'This request is not allowed from the current window.',
    );
  }

  const frame = event.senderFrame;

  if (
    !frame ||
    frame !== event.sender.mainFrame ||
    !isAllowedRendererUrl(frame.url)
  ) {
    throw new DesktopApplicationError(
      'IPC_UNTRUSTED_FRAME',
      'This request did not originate from the trusted application frame.',
    );
  }
}

function toPublicIpcError(
  error: unknown,
): DesktopApiError {
  if (error instanceof DesktopApplicationError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof ZeroBotForgeError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message:
      'The operation could not be completed. Check the input and try again.',
  };
}

/**
 * All IPC calls return a typed result instead of exposing arbitrary
 * exceptions, operating-system paths, or stack traces to the renderer.
 */
export function registerSecureHandler<T>(
  channel: string,
  getMainWindow: MainWindowProvider,
  handler: SecureIpcHandler<T>,
): void {
  ipcMain.handle(
    channel,
    async (
      event,
      ...args: unknown[]
    ): Promise<DesktopApiResult<T>> => {
      try {
        assertTrustedIpcSender(
          event,
          getMainWindow,
        );

        const data = await handler(
          event,
          ...args,
        );

        return {
          ok: true,
          data,
        };
      } catch (error) {
        return {
          ok: false,
          error: toPublicIpcError(error),
        };
      }
    },
  );
}