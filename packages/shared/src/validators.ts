
import { z } from 'zod';
import { ERROR_CODES, IDENTIFIER_PATTERN } from './constants.js';
import type {
  EdgeId,
  FlowId,
  JsonValue,
  NodeId,
  OperationResult,
  ProjectId,
  ValidationIssue,
} from './types.js';

/** Accept non-empty text without silently modifying the input. */
export const nonEmptyStringSchema = z
  .string()
  .min(1, 'Must not be empty.')
  .refine(
    (value) => value.trim().length > 0,
    'Must contain a non-whitespace character.',
  )
  .refine(
    (value) => value === value.trim(),
    'Leading or trailing whitespace is not allowed.',
  );

export const identifierSchema = z.string().regex(
  new RegExp(IDENTIFIER_PATTERN),
  'Identifier must be 1–128 characters, start with a letter or number, and contain only letters, numbers, dot, underscore, colon, or hyphen.',
);

// These transforms establish nominal TypeScript types only.
// The runtime string values are not modified.
export const projectIdSchema = identifierSchema.transform(
  (value) => value as ProjectId,
);

export const flowIdSchema = identifierSchema.transform(
  (value) => value as FlowId,
);

export const nodeIdSchema = identifierSchema.transform(
  (value) => value as NodeId,
);

export const edgeIdSchema = identifierSchema.transform(
  (value) => value as EdgeId,
);

export const isoDateTimeSchema = z.string().datetime({
  offset: true,
});

/** Recursive schema for values that can be faithfully represented in JSON. */
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function isNonEmptyString(
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value
  );
}

export function isIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    identifierSchema.safeParse(value).success
  );
}

export function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    isoDateTimeSchema.safeParse(value).success
  );
}

/**
 * Validate unknown input without throwing.
 * The returned error includes paths to the fields that failed validation.
 */
export function validateWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
): OperationResult<z.infer<TSchema>> {
  const result = schema.safeParse(input);

  if (result.success) {
    return {
      ok: true,
      value: result.data,
    };
  }

  const issues: ValidationIssue[] = result.error.issues.map(
    (issue) => ({
      path: issue.path.map((segment) =>
        typeof segment === 'string' ||
        typeof segment === 'number'
          ? segment
          : String(segment),
      ),
      code: issue.code,
      message: issue.message,
    }),
  );

  return {
    ok: false,
    error: {
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'Input did not satisfy the expected schema.',
      details: { issues },
    },
  };
}
