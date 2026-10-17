import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';

import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';

import {
  tmpdir,
} from 'node:os';

import {
  join,
} from 'node:path';

import {
  AppSettingsService,
} from '../electron/services/app-settings.service.js';

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(
    join(tmpdir(), 'zerobotforge-settings-'),
  );

  temporaryDirectories.push(directory);

  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(
      (directory) =>
        rm(directory, {
          recursive: true,
          force: true,
        }),
    ),
  );
});

describe('AppSettingsService', () => {
  it('returns defaults when no settings file exists', async () => {
    const directory =
      await createTemporaryDirectory();

    const service =
      new AppSettingsService(directory);

    await expect(
      service.load(),
    ).resolves.toEqual({
      theme: 'system',
      autoSaveEnabled: true,
      autoSaveIntervalSeconds: 60,
      reopenLastProject: true,
    });
  });

  it('persists settings and restores them in a new service instance', async () => {
    const directory =
      await createTemporaryDirectory();

    const service =
      new AppSettingsService(directory);

    const settings = {
      theme: 'dark' as const,
      autoSaveEnabled: false,
      autoSaveIntervalSeconds: 30,
      reopenLastProject: false,
    };

    await expect(
      service.save(settings),
    ).resolves.toEqual(settings);

    const newService =
      new AppSettingsService(directory);

    await expect(
      newService.load(),
    ).resolves.toEqual(settings);
  });

  it('rejects unsupported auto-save intervals', async () => {
    const directory =
      await createTemporaryDirectory();

    const service =
      new AppSettingsService(directory);

    await expect(
      service.save({
        theme: 'system',
        autoSaveEnabled: true,
        autoSaveIntervalSeconds: 7,
        reopenLastProject: true,
      }),
    ).rejects.toMatchObject({
      code: 'SETTINGS_INVALID',
    });
  });

  it('leaves malformed settings unchanged', async () => {
    const directory =
      await createTemporaryDirectory();

    const path = join(
      directory,
      'settings.json',
    );

    const original = '{malformed';

    await writeFile(
      path,
      original,
      'utf8',
    );

    const service =
      new AppSettingsService(directory);

    await expect(
      service.load(),
    ).rejects.toMatchObject({
      code: 'SETTINGS_FILE_INVALID',
    });

    await expect(
      readFile(path, 'utf8'),
    ).resolves.toBe(original);
  });
});