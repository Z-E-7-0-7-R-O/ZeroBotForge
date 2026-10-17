import {
  IPC_CHANNELS,
} from './channels.js';

import {
  registerSecureHandler,
} from './secure-handler.js';

import type {
  MainWindowProvider,
} from './secure-handler.js';

import {
  SecureStorageService,
} from '../services/secure-storage.service.js';

import type {
  BotRuntimeService,
} from '../services/bot-runtime.service.js';

import {
  DesktopApplicationError,
} from '../errors.js';

import type {
  TelegramConnectionStatus,
} from '../../src/types/electron-api.js';

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseTokenInput(
  input: unknown,
): string {
  if (
    !isRecord(input) ||
    typeof input.token !== 'string'
  ) {
    throw new DesktopApplicationError(
      'TELEGRAM_TOKEN_INVALID',
      'A bot token must be provided.',
    );
  }

  const token = input.token.trim();

  // Telegram Bot API tokens have a numeric bot ID followed by a colon.
  if (
    token.length > 200 ||
    !/^[0-9]{5,}:[A-Za-z0-9_-]{20,}$/.test(token)
  ) {
    throw new DesktopApplicationError(
      'TELEGRAM_TOKEN_INVALID',
      'The supplied bot token format is invalid.',
    );
  }

  return token;
}

export function registerTelegramIpc(
  getMainWindow: MainWindowProvider,
  secureStorage: SecureStorageService,
  runtimeService?: BotRuntimeService,
): void {
  registerSecureHandler(
    IPC_CHANNELS.telegramGetStatus,
    getMainWindow,
    async (): Promise<TelegramConnectionStatus> => ({
      configured:
        await secureStorage.hasTelegramToken(),
      connected: null,
    }),
  );

  registerSecureHandler(
    IPC_CHANNELS.telegramSetToken,
    getMainWindow,
    async (
      _event,
      input,
    ): Promise<TelegramConnectionStatus> => {
      const token = parseTokenInput(input);

      await secureStorage.saveTelegramToken(token);
      if (runtimeService) {
        await runtimeService.syncTokenToActiveDirectory(token).catch(() => false);
      }

      return {
        configured: true,
        connected: null,
      };
    },
  );

  registerSecureHandler(
    IPC_CHANNELS.telegramClearToken,
    getMainWindow,
    async (): Promise<TelegramConnectionStatus> => {
      await secureStorage.clearTelegramToken();
      if (runtimeService) {
        await runtimeService.syncTokenToActiveDirectory("").catch(() => false);
      }

      return {
        configured: false,
        connected: null,
      };
    },
  );

  registerSecureHandler(
    IPC_CHANNELS.telegramTestConnection,
    getMainWindow,
    async (): Promise<TelegramConnectionStatus> => {
      const token =
        await secureStorage.getTelegramToken();

      if (!token) {
        throw new DesktopApplicationError(
          'TELEGRAM_TOKEN_NOT_CONFIGURED',
          'No bot token has been saved.',
        );
      }

      let response: Response;

      try {
        response = await fetch(
          `https://api.telegram.org/bot${token}/getMe`,
          {
            method: 'GET',
            headers: {
              accept: 'application/json',
            },
            signal: AbortSignal.timeout(10_000),
          },
        );
      } catch {
        throw new DesktopApplicationError(
          'TELEGRAM_CONNECTION_FAILED',
          'Could not contact the Telegram Bot API. Check the network connection and try again.',
        );
      }

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (
        !response.ok ||
        !isRecord(payload) ||
        payload.ok !== true ||
        !isRecord(payload.result) ||
        typeof payload.result.id !== 'number'
      ) {
        throw new DesktopApplicationError(
          response.status === 401
            ? 'TELEGRAM_TOKEN_REJECTED'
            : 'TELEGRAM_API_RESPONSE_INVALID',
          response.status === 401
            ? 'Telegram rejected the saved bot token.'
            : 'Telegram returned an unsuccessful or invalid response.',
        );
      }

      const username =
        typeof payload.result.username === 'string'
          ? payload.result.username
          : undefined;

      return {
        configured: true,
        connected: true,
        ...(username === undefined
          ? {}
          : { botUsername: username }),
      };
    },
  );
}