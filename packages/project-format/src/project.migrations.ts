
import { z } from 'zod';

import {
  CURRENT_PROJECT_FORMAT_VERSION,
  DEFAULT_TOKEN_ENV_VAR,
  ERROR_CODES,
  LEGACY_PROJECT_FORMAT_VERSION,
  PROJECT_FILE_FORMAT,
} from '@zerobotforge/shared/constants';

import { ProjectFormatError } from '@zerobotforge/shared/errors';

import {
  flowIdSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  projectIdSchema,
} from '@zerobotforge/shared/validators';

import type { ProjectDocument } from './project.model.js';

import {
  DEFAULT_CODE_GENERATION_SETTINGS,
  DEFAULT_PROJECT_METADATA,
} from './project.model.js';

import {
  FlowDefinitionSchema,
  ProjectDocumentSchema,
} from './project.schema.js';

/**
 * Explicit schema for version 0.
 *
 * It predates project metadata, generation settings, tokenEnvVar, and parseMode.
 * An unversioned object is not automatically assumed to be version 0.
 */
export const LegacyProjectV0Schema = z
  .object({
    format: z.literal(PROJECT_FILE_FORMAT),
    formatVersion: z.literal(LEGACY_PROJECT_FORMAT_VERSION),

    id: projectIdSchema,
    name: nonEmptyStringSchema,

    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,

    bot: z
      .object({
        displayName: nonEmptyStringSchema,
        username: nonEmptyStringSchema.optional(),
      })
      .strict(),

    flows: z.array(FlowDefinitionSchema),
    activeFlowId: flowIdSchema.nullable(),
  })
  .strict();

export type LegacyProjectV0 =
  z.infer<typeof LegacyProjectV0Schema>;

function throwFormatInvalid(
  message: string,
  issues?: unknown,
): never {
  throw new ProjectFormatError(
    message,
    ERROR_CODES.PROJECT_FORMAT_INVALID,
    issues === undefined ? undefined : { issues },
  );
}

/** Upgrade a supported project version to the current project model. */
export function migrateProjectData(
  input: unknown,
): ProjectDocument {
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input)
  ) {
    throwFormatInvalid(
      'Project document must be a JSON object.',
    );
  }

  const inputRecord = input as Record<string, unknown>;

  if (
    !Object.prototype.hasOwnProperty.call(
      inputRecord,
      'formatVersion',
    )
  ) {
    throw new ProjectFormatError(
      'Project document is missing the required formatVersion field.',
      ERROR_CODES.PROJECT_VERSION_MISSING,
    );
  }

  const version = inputRecord.formatVersion;

  if (
    typeof version !== 'number' ||
    !Number.isInteger(version)
  ) {
    throwFormatInvalid(
      'Project formatVersion must be an integer.',
    );
  }

  if (
    version !== LEGACY_PROJECT_FORMAT_VERSION &&
    version !== CURRENT_PROJECT_FORMAT_VERSION
  ) {
    throw new ProjectFormatError(
      `Project format version ${version} is not supported by this version of ZeroBotForge.`,
      ERROR_CODES.PROJECT_VERSION_UNSUPPORTED,
      {
        receivedVersion: version,
        supportedVersions: [
          LEGACY_PROJECT_FORMAT_VERSION,
          CURRENT_PROJECT_FORMAT_VERSION,
        ],
      },
    );
  }

  // Current version: validate and return without migrating or repairing data.
  if (version === CURRENT_PROJECT_FORMAT_VERSION) {
    const result = ProjectDocumentSchema.safeParse(input);

    if (!result.success) {
      throwFormatInvalid(
        'Project document does not match the current project schema.',
        result.error.issues,
      );
    }

    return result.data;
  }

  // Version 0: validate against the exact legacy contract first.
  const legacyResult = LegacyProjectV0Schema.safeParse(input);

  if (!legacyResult.success) {
    throwFormatInvalid(
      'Version 0 project document is not valid for the supported legacy schema.',
      legacyResult.error.issues,
    );
  }

  const legacy = legacyResult.data;

  // Explicit migration from version 0 to version 1.
  const migratedCandidate = {
    ...legacy,

    formatVersion: CURRENT_PROJECT_FORMAT_VERSION,

    bot: {
      ...legacy.bot,
      tokenEnvVar: DEFAULT_TOKEN_ENV_VAR,
      parseMode: null,
    },

    metadata: {
      ...DEFAULT_PROJECT_METADATA,
      tags: [...DEFAULT_PROJECT_METADATA.tags],
    },

    generation: {
      ...DEFAULT_CODE_GENERATION_SETTINGS,
    },
  };

  // Never return a migrated document without validating the final format.
  const migratedResult =
    ProjectDocumentSchema.safeParse(migratedCandidate);

  if (!migratedResult.success) {
    throw new ProjectFormatError(
      'The version 0 project passed legacy validation but could not be migrated to the current schema.',
      ERROR_CODES.PROJECT_MIGRATION_FAILED,
      {
        issues: migratedResult.error.issues,
      },
    );
  }

  return migratedResult.data;
}
