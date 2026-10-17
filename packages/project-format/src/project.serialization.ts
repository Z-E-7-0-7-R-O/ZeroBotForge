
import { ERROR_CODES } from '@zerobotforge/shared/constants';
import { ProjectFormatError } from '@zerobotforge/shared/errors';

import type { ProjectDocument } from './project.model.js';

import { migrateProjectData } from './project.migrations.js';
import { ProjectDocumentSchema } from './project.schema.js';

export interface SerializeProjectOptions {
  /** Number of indentation spaces. Set to 0 for compact JSON. Defaults to 2. */
  indentation?: number;
}

/** Validate and serialize only the current project format. */
export function serializeProject(
  project: unknown,
  options: SerializeProjectOptions = {},
): string {
  const validation =
    ProjectDocumentSchema.safeParse(project);

  if (!validation.success) {
    throw new ProjectFormatError(
      'Cannot serialize an invalid project document.',
      ERROR_CODES.PROJECT_SERIALIZATION_FAILED,
      {
        issues: validation.error.issues,
      },
    );
  }

  const indentation = options.indentation ?? 2;

  if (
    !Number.isInteger(indentation) ||
    indentation < 0 ||
    indentation > 10
  ) {
    throw new ProjectFormatError(
      'Serialization indentation must be an integer between 0 and 10.',
      ERROR_CODES.INVALID_INPUT,
      { indentation },
    );
  }

  try {
    return JSON.stringify(
      validation.data,
      null,
      indentation,
    );
  } catch (cause) {
    throw new ProjectFormatError(
      'Project document could not be converted to JSON.',
      ERROR_CODES.PROJECT_SERIALIZATION_FAILED,
      undefined,
      cause,
    );
  }
}

/**
 * Parse JSON, migrate a recognized older version, and validate the result.
 * No UI state or renderer-store snapshot is restored by this function.
 */
export function deserializeProject(
  jsonText: string,
): ProjectDocument {
  if (typeof jsonText !== 'string') {
    throw new ProjectFormatError(
      'Project input must be a JSON string.',
      ERROR_CODES.INVALID_INPUT,
      { receivedType: typeof jsonText },
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch (cause) {
    throw new ProjectFormatError(
      'Project file contains invalid JSON.',
      ERROR_CODES.PROJECT_JSON_INVALID,
      undefined,
      cause,
    );
  }

  return migrateProjectData(parsed);
}
