import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from 'node:fs/promises';

import {
  basename,
  dirname,
  extname,
  join,
  resolve,
} from 'node:path';

import {
  randomUUID,
} from 'node:crypto';

import {
  deserializeProject,
  serializeProject,
} from '@zerobotforge/project-format/serialization';

import type {
  ProjectDocument,
} from '@zerobotforge/project-format';

import {
  DesktopApplicationError,
} from '../errors.js';

export const MAX_PROJECT_FILE_BYTES =
  10 * 1024 * 1024;

const ALLOWED_PROJECT_EXTENSIONS = new Set([
  '.zbf',
  '.json',
]);

function isNodeError(
  error: unknown,
): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    'code' in error
  );
}

function assertAllowedExtension(
  filePath: string,
): void {
  const extension = extname(filePath).toLowerCase();

  if (!ALLOWED_PROJECT_EXTENSIONS.has(extension)) {
    throw new DesktopApplicationError(
      'PROJECT_FILE_EXTENSION_INVALID',
      'Project files must use the .zbf or .json extension.',
    );
  }
}

async function assertRegularNonSymlinkFile(
  filePath: string,
): Promise<void> {
  let information;

  try {
    information = await lstat(filePath);
  } catch (error) {
    if (
      isNodeError(error) &&
      error.code === 'ENOENT'
    ) {
      return;
    }

    throw new DesktopApplicationError(
      'PROJECT_FILE_ACCESS_FAILED',
      'The selected project file could not be accessed.',
    );
  }

  if (
    information.isSymbolicLink() ||
    !information.isFile()
  ) {
    throw new DesktopApplicationError(
      'PROJECT_FILE_TYPE_INVALID',
      'The selected project path must refer to a regular file, not a symbolic link or directory.',
    );
  }
}

/**
 * Writes a file through a temporary sibling file before replacing the target.
 * The temporary name is unpredictable and opened with wx to avoid collisions.
 */
export async function atomicWriteFile(
  targetPath: string,
  contents: string,
  mode = 0o600,
): Promise<void> {
  const absolutePath = resolve(targetPath);
  const targetDirectory = dirname(absolutePath);

  await mkdir(targetDirectory, {
    recursive: true,
  });

  await assertRegularNonSymlinkFile(
    absolutePath,
  );

  const temporaryPath = join(
    targetDirectory,
    `.${basename(absolutePath)}.${randomUUID()}.tmp`,
  );

  let handle:
    | Awaited<ReturnType<typeof open>>
    | undefined;

  try {
    handle = await open(
      temporaryPath,
      'wx',
      mode,
    );

    await handle.writeFile(
      contents,
      'utf8',
    );

    await handle.sync();
    await handle.close();
    handle = undefined;

    await rename(
      temporaryPath,
      absolutePath,
    );
  } catch {
    if (handle) {
      await handle.close().catch(() => undefined);
    }

    await rm(temporaryPath, {
      force: true,
    }).catch(() => undefined);

    throw new DesktopApplicationError(
      'FILE_WRITE_FAILED',
      'The file could not be written. Check folder permissions and available disk space.',
    );
  }
}

export class ProjectFileSystemService {
  /**
   * Validates and normalizes a project document before saving.
   *
   * Serialization applies the project format's validation rules.
   * Deserialization returns the canonical domain model.
   */
  public async validateForSave(
    document: unknown,
  ): Promise<ProjectDocument> {
    const serialized = serializeProject(
      document,
      { indentation: 2 },
    );

    return deserializeProject(serialized);
  }

  public async readProject(
    filePath: string,
  ): Promise<ProjectDocument> {
    const absolutePath = resolve(filePath);

    assertAllowedExtension(absolutePath);

    await assertRegularNonSymlinkFile(
      absolutePath,
    );

    let contents: string;

    try {
      const information = await lstat(
        absolutePath,
      );

      if (
        information.size >
        MAX_PROJECT_FILE_BYTES
      ) {
        throw new DesktopApplicationError(
          'PROJECT_FILE_TOO_LARGE',
          'The selected project file exceeds the 10 MB size limit.',
        );
      }

      contents = await readFile(
        absolutePath,
        'utf8',
      );
    } catch (error) {
      if (
        error instanceof DesktopApplicationError
      ) {
        throw error;
      }

      throw new DesktopApplicationError(
        'PROJECT_FILE_READ_FAILED',
        'The selected project file could not be read.',
      );
    }

    return deserializeProject(contents);
  }

  public async writeProject(
    filePath: string,
    document: unknown,
  ): Promise<ProjectDocument> {
    const absolutePath = resolve(filePath);

    assertAllowedExtension(absolutePath);

    // Serialization performs structural validation before writing.
    const serialized = serializeProject(
      document,
      { indentation: 2 },
    );

    if (
      Buffer.byteLength(serialized, 'utf8') >
      MAX_PROJECT_FILE_BYTES
    ) {
      throw new DesktopApplicationError(
        'PROJECT_FILE_TOO_LARGE',
        'The serialized project exceeds the 10 MB size limit.',
      );
    }

    await atomicWriteFile(
      absolutePath,
      serialized,
    );

    // Return the same canonical domain model used by subsequent loads.
    return deserializeProject(serialized);
  }
}