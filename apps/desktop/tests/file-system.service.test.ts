import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';

import {
  mkdtemp,
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
  createEmptyProject,
} from '@zerobotforge/project-format';

import {
  projectIdSchema,
} from '@zerobotforge/shared/validators';

import {
  ERROR_CODES,
} from '@zerobotforge/shared/constants';

import {
  ProjectFileSystemService,
  MAX_PROJECT_FILE_BYTES,
} from '../electron/services/file-system.service.js';

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(
    join(tmpdir(), 'zerobotforge-files-'),
  );

  temporaryDirectories.push(directory);

  return directory;
}

function makeProject() {
  return createEmptyProject({
    id: projectIdSchema.parse(
      'project-file-test',
    ),
    name: 'File Service Test',
    now: '2026-01-01T00:00:00.000Z',
  });
}

const service = new ProjectFileSystemService();

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

describe('ProjectFileSystemService', () => {
  it('writes and reads a valid project without changing its data', async () => {
    const directory =
      await createTemporaryDirectory();

    const filePath = join(
      directory,
      'project.zbf',
    );

    const project = makeProject();

    const written =
      await service.writeProject(
        filePath,
        project,
      );

    const restored =
      await service.readProject(
        filePath,
      );

    expect(written).toEqual(project);
    expect(restored).toEqual(project);
  });

  it('rejects unsupported file extensions', async () => {
    const directory =
      await createTemporaryDirectory();

    await expect(
      service.writeProject(
        join(directory, 'project.exe'),
        makeProject(),
      ),
    ).rejects.toMatchObject({
      code: 'PROJECT_FILE_EXTENSION_INVALID',
    });
  });

  it('rejects malformed JSON without repairing it', async () => {
    const directory =
      await createTemporaryDirectory();

    const filePath = join(
      directory,
      'malformed.json',
    );

    const malformed = '{not-valid-json';

    await writeFile(
      filePath,
      malformed,
      'utf8',
    );

    await expect(
      service.readProject(filePath),
    ).rejects.toMatchObject({
      code: ERROR_CODES.PROJECT_JSON_INVALID,
    });

    const unchanged = await (
      await import('node:fs/promises')
    ).readFile(filePath, 'utf8');

    expect(unchanged).toBe(malformed);
  });

  it('rejects a file larger than the project size limit', async () => {
    const directory =
      await createTemporaryDirectory();

    const filePath = join(
      directory,
      'oversized.zbf',
    );

    await writeFile(
      filePath,
      Buffer.alloc(
        MAX_PROJECT_FILE_BYTES + 1,
        0x20,
      ),
    );

    await expect(
      service.readProject(filePath),
    ).rejects.toMatchObject({
      code: 'PROJECT_FILE_TOO_LARGE',
    });
  });

  it('rejects invalid project data before writing', async () => {
    const directory =
      await createTemporaryDirectory();

    const invalidProject = {
      ...makeProject(),
      name: '',
    };

    await expect(
      service.writeProject(
        join(directory, 'invalid.zbf'),
        invalidProject,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.PROJECT_SERIALIZATION_FAILED,
    });
  });
});