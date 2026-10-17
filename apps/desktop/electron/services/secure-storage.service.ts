import {
  safeStorage,
} from 'electron';

import {
  readFile,
  rm,
} from 'node:fs/promises';

import {
  join,
} from 'node:path';

import {
  atomicWriteFile,
} from './file-system.service.js';

import {
  DesktopApplicationError,
} from '../errors.js';

const SECRET_FORMAT_VERSION = 1;

interface EncryptedSecretsFile {
  version: typeof SECRET_FORMAT_VERSION;
  tokenCiphertext: string;
}

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

function parseEncryptedFile(
  input: unknown,
): EncryptedSecretsFile {
  if (
    !isRecord(input) ||
    input.version !== SECRET_FORMAT_VERSION ||
    typeof input.tokenCiphertext !== 'string' ||
    input.tokenCiphertext.length === 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(
      input.tokenCiphertext,
    )
  ) {
    throw new DesktopApplicationError(
      'SECURE_STORAGE_FILE_INVALID',
      'The encrypted credentials file is invalid. The stored token was not used.',
    );
  }

  return {
    version: SECRET_FORMAT_VERSION,
    tokenCiphertext: input.tokenCiphertext,
  };
}

export class SecureStorageService {
  private readonly secretsPath: string;

  public constructor(
    userDataDirectory: string,
  ) {
    this.secretsPath = join(
      userDataDirectory,
      'secrets.json',
    );
  }

  private async assertEncryptionAvailable(): Promise<void> {
    let available = false;

    try {
      available =
        await safeStorage.isAsyncEncryptionAvailable();
    } catch {
      available = false;
    }

    if (!available) {
      throw new DesktopApplicationError(
        'SECURE_STORAGE_UNAVAILABLE',
        'Secure credential storage is unavailable on this system. The token has not been saved.',
      );
    }

    if (process.platform === 'linux') {
      let backend = 'unknown';

      try {
        backend = safeStorage.getSelectedStorageBackend();
      } catch {
        backend = 'unknown';
      }

      if (
        backend === 'basic_text' ||
        backend === 'unknown'
      ) {
        throw new DesktopApplicationError(
          'SECURE_STORAGE_BACKEND_UNSAFE',
          'A supported system credential-storage backend could not be confirmed. The token has not been saved.',
        );
      }
    }
  }

  private async readEncryptedFile():
    Promise<EncryptedSecretsFile | null> {
    let raw: string;

    try {
      raw = await readFile(
        this.secretsPath,
        'utf8',
      );
    } catch (error) {
      if (isMissingFile(error)) {
        return null;
      }

      throw new DesktopApplicationError(
        'SECURE_STORAGE_READ_FAILED',
        'The encrypted credentials file could not be read.',
      );
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new DesktopApplicationError(
        'SECURE_STORAGE_FILE_INVALID',
        'The encrypted credentials file contains invalid JSON.',
      );
    }

    return parseEncryptedFile(parsed);
  }

  public async hasTelegramToken(): Promise<boolean> {
    const file = await this.readEncryptedFile();

    return file !== null;
  }

  public async saveTelegramToken(
    token: string,
  ): Promise<void> {
    await this.assertEncryptionAvailable();

    let encrypted: Buffer;

    try {
      encrypted =
        await safeStorage.encryptStringAsync(token);
    } catch {
      throw new DesktopApplicationError(
        'TOKEN_ENCRYPTION_FAILED',
        'The bot token could not be encrypted and was not saved.',
      );
    }

    const file: EncryptedSecretsFile = {
      version: SECRET_FORMAT_VERSION,
      tokenCiphertext: encrypted.toString('base64'),
    };

    await atomicWriteFile(
      this.secretsPath,
      JSON.stringify(file, null, 2),
    );
  }

  public async getTelegramToken():
    Promise<string | null> {
    await this.assertEncryptionAvailable();

    const file = await this.readEncryptedFile();

    if (!file) {
      return null;
    }

    let decrypted: unknown;

    try {
      decrypted =
        await safeStorage.decryptStringAsync(
          Buffer.from(
            file.tokenCiphertext,
            'base64',
          ),
        );
    } catch {
      throw new DesktopApplicationError(
        'TOKEN_DECRYPTION_FAILED',
        'The saved bot token could not be decrypted.',
      );
    }

    /*
     * Electron's asynchronous safeStorage API returns an object
     * containing `result` and `shouldReEncrypt`.
     * Runtime checks prevent assumptions about corrupted data.
     */
    if (
      !isRecord(decrypted) ||
      typeof decrypted.result !== 'string' ||
      typeof decrypted.shouldReEncrypt !== 'boolean'
    ) {
      throw new DesktopApplicationError(
        'TOKEN_DECRYPTION_FAILED',
        'The saved bot token could not be decoded.',
      );
    }

    const token = decrypted.result;

    if (decrypted.shouldReEncrypt) {
      // Re-encrypt using the current platform key/provider.
      await this.saveTelegramToken(token);
    }

    return token;
  }

  public async clearTelegramToken(): Promise<void> {
    try {
      await rm(this.secretsPath, {
        force: true,
      });
    } catch {
      throw new DesktopApplicationError(
        'SECURE_STORAGE_DELETE_FAILED',
        'The saved bot token could not be removed.',
      );
    }
  }
}