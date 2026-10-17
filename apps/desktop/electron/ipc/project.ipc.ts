import {
  dialog,
} from 'electron';

import type {
  BrowserWindow,
} from 'electron';

import {
  randomUUID,
} from 'node:crypto';

import {
  basename,
  resolve,
} from 'node:path';

import {
  createEmptyProject,
} from '@zerobotforge/project-format';

import type {
  ProjectDocument,
} from '@zerobotforge/project-format';

import {
  DesktopApplicationError,
} from '../errors.js';

import {
  ProjectFileSystemService,
} from '../services/file-system.service.js';

import {
  IPC_CHANNELS,
} from './channels.js';

import {
  registerSecureHandler,
} from './secure-handler.js';

import type {
  MainWindowProvider,
} from './secure-handler.js';

const projectFileSystem =
  new ProjectFileSystemService();

/**
 * The app currently has one primary project window.
 * This path is controlled by Main Process and only updated by native dialogs.
 */
let activeProjectPath: string | null = null;

export function resetActiveProjectPath(): void {
  activeProjectPath = null;
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

function parseProjectDocumentInput(
  input: unknown,
): unknown {
  if (
    !isRecord(input) ||
    !Object.prototype.hasOwnProperty.call(
      input,
      'document',
    )
  ) {
    throw new DesktopApplicationError(
      'PROJECT_INPUT_INVALID',
      'A project document must be provided.',
    );
  }

  return input.document;
}

function parseCreateName(
  input: unknown,
): string {
  if (input === undefined) {
    return 'Untitled Project';
  }

  if (
    !isRecord(input) ||
    Object.keys(input).some(
      (key) => key !== 'name',
    )
  ) {
    throw new DesktopApplicationError(
      'PROJECT_INPUT_INVALID',
      'Project creation input is invalid.',
    );
  }

  const name = input.name;

  if (name === undefined) {
    return 'Untitled Project';
  }

  if (
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    name.length > 100
  ) {
    throw new DesktopApplicationError(
      'PROJECT_NAME_INVALID',
      'Project name must contain 1–100 characters.',
    );
  }

  return name.trim();
}

function requireWindow(
  getMainWindow: MainWindowProvider,
): BrowserWindow {
  const window = getMainWindow();

  if (!window || window.isDestroyed()) {
    throw new DesktopApplicationError(
      'WINDOW_UNAVAILABLE',
      'The main application window is not available.',
    );
  }

  return window;
}

function safeFileName(
  projectName: string,
): string {
  const cleaned = projectName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 80);

  return cleaned || 'Untitled Project';
}

async function chooseProjectSavePath(
  window: BrowserWindow,
  projectName: string,
  defaultPath?: string,
): Promise<string | null> {
  const result = await dialog.showSaveDialog(
    window,
    {
      title: 'Save ZeroBotForge Project',
      defaultPath:
        defaultPath ??
        `${safeFileName(projectName)}.zbf`,
      filters: [
        {
          name: 'ZeroBotForge Project',
          extensions: ['zbf'],
        },
        {
          name: 'JSON Project',
          extensions: ['json'],
        },
      ],
      properties: [
        'createDirectory',
        'showOverwriteConfirmation',
      ],
    },
  );

  if (result.canceled || !result.filePath) {
    return null;
  }

  return resolve(result.filePath);
}

function makeProjectSession(
  document: ProjectDocument,
  filePath: string | null,
) {
  return {
    document,
    filePath,
    fileName:
      filePath === null
        ? null
        : basename(filePath),
  };
}

export function registerProjectIpc(
  getMainWindow: MainWindowProvider,
): void {
  registerSecureHandler(
    IPC_CHANNELS.projectsCreate,
    getMainWindow,
    async (_event, input) => {
      const name = parseCreateName(input);

      // UUIDs are generated inside Main Process, never trusted from Renderer.
      const document = createEmptyProject({
        id: randomUUID() as ProjectDocument['id'],
        name,
        now: new Date().toISOString(),
      });

      activeProjectPath = null;

      return makeProjectSession(
        document,
        null,
      );
    },
  );

  registerSecureHandler(
    IPC_CHANNELS.projectsOpen,
    getMainWindow,
    async () => {
      const window = requireWindow(
        getMainWindow,
      );

      const result = await dialog.showOpenDialog(
        window,
        {
          title: 'Open ZeroBotForge Project',
          properties: ['openFile'],
          filters: [
            {
              name: 'ZeroBotForge Project',
              extensions: ['zbf', 'json'],
            },
          ],
        },
      );

      if (
        result.canceled ||
        result.filePaths.length === 0
      ) {
        return null;
      }

      const filePath = resolve(
        result.filePaths[0]!,
      );

      // The active path is changed only after a successful read and validation.
      const document =
        await projectFileSystem.readProject(
          filePath,
        );

      activeProjectPath = filePath;

      return makeProjectSession(
        document,
        filePath,
      );
    },
  );

  registerSecureHandler(
    IPC_CHANNELS.projectsSave,
    getMainWindow,
    async (_event, input) => {
      const window = requireWindow(
        getMainWindow,
      );

      const document =
        parseProjectDocumentInput(input);

      const normalizedDocument =
        // Validate before deciding whether to save over the current file.
        await projectFileSystem.validateForSave(
          document,
        );

      const targetPath =
        activeProjectPath ??
        await chooseProjectSavePath(
          window,
          normalizedDocument.name,
        );

      if (!targetPath) {
        return null;
      }

      const savedDocument =
        await projectFileSystem.writeProject(
          targetPath,
          normalizedDocument,
        );

      activeProjectPath = targetPath;

      return makeProjectSession(
        savedDocument,
        targetPath,
      );
    },
  );

  registerSecureHandler(
    IPC_CHANNELS.projectsSaveAs,
    getMainWindow,
    async (_event, input) => {
      const window = requireWindow(
        getMainWindow,
      );

      const document =
        parseProjectDocumentInput(input);

      const normalizedDocument =
        await projectFileSystem.validateForSave(
          document,
        );

      const targetPath =
        await chooseProjectSavePath(
          window,
          normalizedDocument.name,
          activeProjectPath ?? undefined,
        );

      if (!targetPath) {
        return null;
      }

      const savedDocument =
        await projectFileSystem.writeProject(
          targetPath,
          normalizedDocument,
        );

      activeProjectPath = targetPath;

      return makeProjectSession(
        savedDocument,
        targetPath,
      );
    },
  );
}