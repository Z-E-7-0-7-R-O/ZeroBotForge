import {
  app,
} from 'electron';

import type {
  AppSettings,
} from '../../src/types/electron-api.js';

import {
  DesktopApplicationError,
} from '../errors.js';

import {
  AppSettingsService,
} from '../services/app-settings.service.js';

import {
  IPC_CHANNELS,
} from './channels.js';

import {
  registerSecureHandler,
} from './secure-handler.js';

import type {
  MainWindowProvider,
} from './secure-handler.js';

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function registerSystemIpc(
  getMainWindow: MainWindowProvider,
  settingsService: AppSettingsService,
): void {
  registerSecureHandler(
    IPC_CHANNELS.systemGetVersion,
    getMainWindow,
    () => ({
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      architecture: process.arch,
      isPackaged: app.isPackaged,
    }),
  );

  registerSecureHandler(
    IPC_CHANNELS.settingsGet,
    getMainWindow,
    () => settingsService.load(),
  );

  registerSecureHandler(
    IPC_CHANNELS.settingsSave,
    getMainWindow,
    async (_event, input) => {
      if (
        !isRecord(input) ||
        !Object.prototype.hasOwnProperty.call(
          input,
          'settings',
        )
      ) {
        throw new DesktopApplicationError(
          'SETTINGS_INPUT_INVALID',
          'Application settings must be provided.',
        );
      }

      const settings: AppSettings =
        await settingsService.save(
          input.settings,
        );

      return settings;
    },
  );
}