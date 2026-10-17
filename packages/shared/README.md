<h1 align="center">
  <code>@zerobotforge/shared</code> — Shared Domain Contracts &amp; Validators
</h1>

<div align="center">
<i>Foundational constants, nominal branded types, structured error classes, and Zod validation primitives shared across all ZeroBotForge packages and processes.</i>
<br><br>
<b>Parent Documentation:</b> <a href="../README.md">packages/README.md</a> · <a href="../../README.md">Root README.md</a><br>
<b>Package:</b> <code>@zerobotforge/shared</code> 0.1.0
</div>

--------------------------------------------------------------------------------

## Overview

`@zerobotforge/shared` is the leaf dependency of the ZeroBotForge monorepo. It defines the machine-readable error codes, format identifiers, node and button color enumerations, nominal TypeScript brand types (`ProjectId`, `FlowId`, `NodeId`, `EdgeId`), JSON-safe value types, custom error hierarchy (`ZeroBotForgeError`), and Zod validation schemas used by all upstream packages.

--------------------------------------------------------------------------------

## Source Code Modules

* **[package.json](package.json)**
  * **Role:** Package Manifest and Subpath Export Map.
  * **Implementation:** Declares `"name": "@zerobotforge/shared"`, `"version": "0.1.0"`, `"private": true`, and `"type": "module"`. Exposes four subpath exports: `"."` (`./src/types.ts`), `"./constants"` (`./src/constants.ts`), `"./errors"` (`./src/errors.ts`), and `"./validators"` (`./src/validators.ts`). Depends on `zod ^3.24.1`.

* **[src/constants.ts](src/constants.ts)**
  * **Role:** Canonical Constants and Machine-Readable Error Codes.
  * **Implementation:**
    * Format constants: `PROJECT_FILE_FORMAT = 'zerobotforge.project'`, `CURRENT_PROJECT_FORMAT_VERSION = 1`, `LEGACY_PROJECT_FORMAT_VERSION = 0`, `SUPPORTED_PROJECT_FORMAT_VERSIONS = [0, 1]`.
    * Node constants: `NODE_TYPE_VALUES` and `NODE_TYPES` containing `'start'`, `'text'`, `'image'`, `'button'`, `'choice'`, `'menu'`, `'action'`, `'condition'`, `'input'`, and `'end'`.
    * Button color constants: `BUTTON_COLOR_VALUES = ['default', 'green', 'blue', 'red']`.
    * Validation & generation defaults: `IDENTIFIER_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'`, `DEFAULT_TOKEN_ENV_VAR = 'TELEGRAM_BOT_TOKEN'`, `DEFAULT_NODE_VERSION = 22`.
    * `ERROR_CODES` object and `ErrorCode` union type defining 29 stable error codes across three categories:
      * General: `INVALID_INPUT`, `VALIDATION_FAILED`, `INTERNAL_ERROR`.
      * Project Format: `PROJECT_JSON_INVALID`, `PROJECT_FORMAT_INVALID`, `PROJECT_VERSION_MISSING`, `PROJECT_VERSION_UNSUPPORTED`, `PROJECT_MIGRATION_FAILED`, `PROJECT_SERIALIZATION_FAILED`, `PROJECT_SEMANTIC_INVALID`.
      * Flow Engine: `FLOW_SCHEMA_INVALID`, `FLOW_INVALID`, `FLOW_NODE_TYPE_UNREGISTERED`, `FLOW_NODE_CONFIG_INVALID`, `FLOW_DUPLICATE_NODE_ID`, `FLOW_DUPLICATE_EDGE_ID`, `FLOW_START_NODE_MISSING`, `FLOW_MULTIPLE_START_NODES`, `FLOW_MULTIPLE_MENU_NODES`, `FLOW_EDGE_SOURCE_NOT_FOUND`, `FLOW_EDGE_TARGET_NOT_FOUND`, `FLOW_SOURCE_PORT_INVALID`, `FLOW_TARGET_PORT_INVALID`, `FLOW_EDGE_TO_START`, `FLOW_MULTIPLE_EDGES_FROM_PORT`, `FLOW_OUTPUT_PORT_UNCONNECTED`, `FLOW_STEP_LIMIT_EXCEEDED`, `FLOW_ACTION_NOT_REGISTERED`, `FLOW_INVALID_INPUT`, `FLOW_EXECUTION_FAILED`.

* **[src/types.ts](src/types.ts)**
  * **Role:** Shared Domain Interfaces and Branded Types.
  * **Implementation:**
    * Nominal branding: `Brand<TValue, TBrand>` and branded string aliases `ProjectId`, `FlowId`, `NodeId`, and `EdgeId` to prevent accidental cross-assignment of string identifiers at compile time.
    * JSON types: `JsonPrimitive` (`string | number | boolean | null`), `JsonValue` (recursive primitive, array, or object), and `JsonObject` (`{ [key: string]: JsonValue }`), explicitly excluding `undefined`, functions, symbols, `bigint`, and non-finite numbers.
    * Graph & Project interfaces: `Point` (`{ x: number; y: number }`), `FlowNode` (`id`, `type`, `label`, `position`, `data`), `FlowEdge` (`id`, `sourceNodeId`, `targetNodeId`, `sourceHandle?`, `targetHandle?`, `label?`), `FlowDefinition`, `BotSettings` (`displayName`, `username?`, `tokenEnvVar`, `parseMode: 'HTML' | 'Markdown' | 'MarkdownV2' | null`), `CodeGenerationSettings` (`language: 'typescript'`, `runtime: 'node'`, `nodeVersion`, `moduleFormat: 'esm' | 'commonjs'`, `packageManager: 'npm' | 'pnpm' | 'yarn'`, `strict`, `includeReadme`, `includeTests`), and `ProjectMetadata` (`description`, `tags`, `author?`).
    * Diagnostic contracts: `ValidationIssue`, `OperationErrorInfo`, `OperationResult<TValue, TError>` (`{ ok: true; value: TValue } | { ok: false; error: TError }`), and `ProjectSemanticIssue`.

* **[src/errors.ts](src/errors.ts)**
  * **Role:** Structured Error Hierarchy and Renderer-Safe Error Serialization.
  * **Implementation:**
    * `ZeroBotForgeError`: Extends `Error` with `readonly code: ErrorCode` (defaults to `ERROR_CODES.INTERNAL_ERROR`) and `readonly details?: unknown`. Attaches `cause` as a non-enumerable property when supplied and restores prototype chain via `Object.setPrototypeOf(this, new.target.prototype)`.
    * `ValidationError`: Subclass of `ZeroBotForgeError` fixed to `ERROR_CODES.VALIDATION_FAILED`.
    * `ProjectFormatError`: Subclass of `ZeroBotForgeError` requiring an explicit `ErrorCode`.
    * `toOperationErrorInfo(error: unknown)`: Converts any thrown value into a serializable `OperationErrorInfo` (`{ code, message, details? }`) without exposing stack traces.

* **[src/validators.ts](src/validators.ts)**
  * **Role:** Reusable Zod Schemas and Type Guards.
  * **Implementation:**
    * `nonEmptyStringSchema`: Requires `.min(1)`, non-whitespace content (`value.trim().length > 0`), and no leading or trailing whitespace (`value === value.trim()`).
    * `identifierSchema`: Validates strings against `IDENTIFIER_PATTERN`.
    * Nominal ID schemas: `projectIdSchema`, `flowIdSchema`, `nodeIdSchema`, and `edgeIdSchema`, which apply `.transform()` to brand validated strings as `ProjectId`, `FlowId`, `NodeId`, and `EdgeId` without altering runtime values.
    * `isoDateTimeSchema`: `z.string().datetime({ offset: true })`.
    * `jsonValueSchema`: Recursive `z.lazy()` union accepting strings, finite numbers (`z.number().finite()`), booleans, `null`, arrays of `jsonValueSchema`, and string-keyed records of `jsonValueSchema`.
    * Type guards & helpers: `isRecord(value)`, `isNonEmptyString(value)`, `isIdentifier(value)`, `isIsoDateTime(value)`, and `validateWithSchema(schema, input)` which wraps `schema.safeParse(input)` and maps Zod issues into `OperationResult<z.infer<TSchema>>`.
