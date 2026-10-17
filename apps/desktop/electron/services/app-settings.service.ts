import {
  readFile,
} from 'node:fs/promises';

import {
  join,
} from 'node:path';

import type {
  AppSettings,
} from '../../src/types/electron-api.js';

import {
  DesktopApplicationError,
} from '../errors.js';

import {
  atomicWriteFile,
} from './file-system.service.js';

const SETTINGS_FORMAT_VERSION = 1;

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  autoSaveEnabled: true,
  autoSaveIntervalSeconds: 60,
  reopenLastProject: true,
};

const ALLOWED_INTERVALS = new Set([
  15,
  30,
  60,
  120,
]);

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isMissingFile(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function parseSettings(
  input: unknown,
): AppSettings {
  if (!isRecord(input)) {
    throw new DesktopApplicationError(
      'SETTINGS_INVALID',
      'Application settings must be an object.',
    );
  }

  const allowedKeys = new Set([
    'theme',
    'autoSaveEnabled',
    'autoSaveIntervalSeconds',
    'reopenLastProject',
  ]);

  if (
    Object.keys(input).some(
      (key) => !allowedKeys.has(key),
    )
  ) {
    throw new DesktopApplicationError(
      'SETTINGS_INVALID',
      'Application settings contain unknown fields.',
    );
  }

  const theme = input.theme;

  if (
    theme !== 'light' &&
    theme !== 'dark' &&
    theme !== 'system'
  ) {
    throw new DesktopApplicationError(
      'SETTINGS_INVALID',
      'The selected application theme is invalid.',
    );
  }

  if (
    typeof input.autoSaveEnabled !== 'boolean' ||
    typeof input.reopenLastProject !== 'boolean' ||
    typeof input.autoSaveIntervalSeconds !== 'number' ||
    !Number.isInteger(input.autoSaveIntervalSeconds) ||
    !ALLOWED_INTERVALS.has(
      input.autoSaveIntervalSeconds,
    )
  ) {
    throw new DesktopApplicationError(
      'SETTINGS_INVALID',
      'One or more application setting values are invalid.',
    );
  }

  return {
    theme,
    autoSaveEnabled: input.autoSaveEnabled,
    autoSaveIntervalSeconds:
      input.autoSaveIntervalSeconds,
    reopenLastProject:
      input.reopenLastProject,
  };
}

export class AppSettingsService {
  private readonly settingsPath: string;

  public constructor(
    userDataDirectory: string,
  ) {
    this.settingsPath = join(
      userDataDirectory,
      'settings.json',
    );
  }

  public async load(): Promise<AppSettings> {
    let raw: string;

    try {
      raw = await readFile(
        this.settingsPath,
        'utf8',
      );
    } catch (error) {
      if (isMissingFile(error)) {
        return { ...DEFAULT_SETTINGS };
      }

      throw new DesktopApplicationError(
        'SETTINGS_READ_FAILED',
        'Application settings could not be read.',
      );
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new DesktopApplicationError(
        'SETTINGS_FILE_INVALID',
        'The settings file contains invalid JSON. It has been left unchanged.',
      );
    }

    if (
      !isRecord(parsed) ||
      parsed.version !== SETTINGS_FORMAT_VERSION ||
      !('settings' in parsed)
    ) {
      throw new DesktopApplicationError(
        'SETTINGS_FILE_INVALID',
        'The settings file has an unsupported format. It has been left unchanged.',
      );
    }

    return parseSettings(parsed.settings);
  }

  public async save(
    input: unknown,
  ): Promise<AppSettings> {
    const settings = parseSettings(input);

    const serialized = JSON.stringify(
      {
        version: SETTINGS_FORMAT_VERSION,
        settings,
      },
      null,
      2,
    );

    await atomicWriteFile(
      this.settingsPath,
      serialized,
    );

    return settings;
  }
}