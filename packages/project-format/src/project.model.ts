
import {
  CURRENT_PROJECT_FORMAT_VERSION,
  DEFAULT_NODE_VERSION,
  DEFAULT_TOKEN_ENV_VAR,
  PROJECT_FILE_FORMAT,
} from '@zerobotforge/shared/constants';

import type {
  BotSettings,
  CodeGenerationSettings,
  FlowDefinition,
  FlowId,
  ProjectId,
  ProjectMetadata,
} from '@zerobotforge/shared';

/** Current persisted domain model. UI store state must not be added here. */
export interface ProjectDocument {
  format: typeof PROJECT_FILE_FORMAT;
  formatVersion: typeof CURRENT_PROJECT_FORMAT_VERSION;

  id: ProjectId;
  name: string;

  createdAt: string;
  updatedAt: string;

  metadata: ProjectMetadata;
  bot: BotSettings;

  flows: FlowDefinition[];
  activeFlowId: FlowId | null;

  generation: CodeGenerationSettings;
}

export const DEFAULT_BOT_SETTINGS: BotSettings = {
  displayName: 'My Telegram Bot',
  tokenEnvVar: DEFAULT_TOKEN_ENV_VAR,
  parseMode: 'HTML',
};

export const DEFAULT_PROJECT_METADATA: ProjectMetadata = {
  description: '',
  tags: [],
};

export const DEFAULT_CODE_GENERATION_SETTINGS: CodeGenerationSettings = {
  language: 'typescript',
  runtime: 'node',
  nodeVersion: DEFAULT_NODE_VERSION,
  moduleFormat: 'esm',
  packageManager: 'npm',
  strict: true,
  includeReadme: true,
  includeTests: false,
};

export interface CreateEmptyProjectOptions {
  /**
   * Generate the ID at the application boundary.
   * This keeps the domain model independent from browser or Electron APIs.
   */
  id: ProjectId;

  name: string;

  /** Useful for deterministic tests and import workflows. */
  now?: string;
}

/** Create a new empty project draft with all required settings populated. */
export function createEmptyProject(
  options: CreateEmptyProjectOptions,
): ProjectDocument {
  const timestamp = options.now ?? new Date().toISOString();

  return {
    format: PROJECT_FILE_FORMAT,
    formatVersion: CURRENT_PROJECT_FORMAT_VERSION,

    id: options.id,
    name: options.name,

    createdAt: timestamp,
    updatedAt: timestamp,

    metadata: {
      ...DEFAULT_PROJECT_METADATA,
      tags: [...DEFAULT_PROJECT_METADATA.tags],
    },

    bot: {
      ...DEFAULT_BOT_SETTINGS,
      displayName: options.name,
    },

    flows: [],
    activeFlowId: null,

    generation: {
      ...DEFAULT_CODE_GENERATION_SETTINGS,
    },
  };
}
