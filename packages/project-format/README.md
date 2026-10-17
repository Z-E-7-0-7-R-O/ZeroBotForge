<h1 align="center">
  <code>@zerobotforge/project-format</code> — Versioned Project Document Model &amp; Serialization
</h1>

<div align="center">
<i>Persisted project document model, strict Zod structural schemas, semantic graph integrity checks, v0-to-v1 format migration, and JSON serialization.</i>
<br><br>
<b>Parent Documentation:</b> <a href="../README.md">packages/README.md</a> · <a href="../../README.md">Root README.md</a><br>
<b>Package:</b> <code>@zerobotforge/project-format</code> 0.1.0
</div>

--------------------------------------------------------------------------------

## Overview

`@zerobotforge/project-format` defines the on-disk `.zbf` and `.json` document contract for ZeroBotForge projects. It separates structural validation (`ProjectDocumentSchema`), version migration (`migrateProjectData`), and cross-reference semantic validation (`validateProjectSemantics`) so that legacy files can be upgraded deterministically while malformed or unknown fields are rejected before reaching the editor or code generator.

--------------------------------------------------------------------------------

## Source Code Modules

* **[package.json](package.json)**
  * **Role:** Package Manifest and Subpath Export Map.
  * **Implementation:** Declares `"name": "@zerobotforge/project-format"`, `"version": "0.1.0"`, and exports `"."` (`./src/project.model.ts`), `"./schema"` (`./src/project.schema.ts`), `"./migrations"` (`./src/project.migrations.ts`), and `"./serialization"` (`./src/project.serialization.ts`). Depends on `@zerobotforge/shared` and `zod ^3.24.1`.

* **[src/project.model.ts](src/project.model.ts)**
  * **Role:** Canonical Project Document Interface, Default Settings, and Factory.
  * **Implementation:**
    * `ProjectDocument`: Defines the persisted root structure (`format: 'zerobotforge.project'`, `formatVersion: 1`, `id: ProjectId`, `name: string`, `createdAt: string`, `updatedAt: string`, `metadata: ProjectMetadata`, `bot: BotSettings`, `flows: FlowDefinition[]`, `activeFlowId: FlowId | null`, `generation: CodeGenerationSettings`).
    * Default constants: `DEFAULT_BOT_SETTINGS` (`displayName: 'My Telegram Bot'`, `tokenEnvVar: 'TELEGRAM_BOT_TOKEN'`, `parseMode: 'HTML'`), `DEFAULT_PROJECT_METADATA` (`description: ''`, `tags: []`), and `DEFAULT_CODE_GENERATION_SETTINGS` (`language: 'typescript'`, `runtime: 'node'`, `nodeVersion: 22`, `moduleFormat: 'esm'`, `packageManager: 'npm'`, `strict: true`, `includeReadme: true`, `includeTests: false`).
    * `createEmptyProject(options: CreateEmptyProjectOptions)`: Initializes a valid `ProjectDocument` with `options.id`, `options.name` (also assigned to `bot.displayName`), `options.now ?? new Date().toISOString()`, empty `flows: []`, and `activeFlowId: null`.

* **[src/project.schema.ts](src/project.schema.ts)**
  * **Role:** Strict Structural Zod Schemas and Semantic Graph Validator.
  * **Implementation:**
    * Defines `.strict()` Zod schemas for every document layer: `NodeTypeSchema`, `PointSchema`, `FlowNodeSchema`, `FlowEdgeSchema`, `FlowDefinitionSchema`, `BotSettingsSchema` (enforcing `tokenEnvVar` regex `/^[A-Z_][A-Z0-9_]*$/` and `parseMode` enum `['HTML', 'Markdown', 'MarkdownV2'] | null`), `CodeGenerationSettingsSchema` (`nodeVersion` integer `>= 22`), `ProjectMetadataSchema`, and `ProjectDocumentSchema`.
    * `validateProjectSemantics(project: ProjectDocument)`: Inspects referential integrity across `project.flows` and returns `ProjectSemanticIssue[]` for five conditions:
      1. `DUPLICATE_FLOW_ID`: Two flows share the same `flow.id`.
      2. `ACTIVE_FLOW_NOT_FOUND`: `project.activeFlowId` is non-null and does not match any flow in `project.flows`.
      3. `DUPLICATE_NODE_ID`: Two nodes in the same flow share `node.id`.
      4. `DUPLICATE_EDGE_ID`: Two edges in the same flow share `edge.id`.
      5. `EDGE_SOURCE_NODE_NOT_FOUND` / `EDGE_TARGET_NODE_NOT_FOUND`: An edge references a `sourceNodeId` or `targetNodeId` absent from its flow's `nodes` array.

* **[src/project.migrations.ts](src/project.migrations.ts)**
  * **Role:** Version Detection and Legacy `v0 -> v1` Document Migration.
  * **Implementation:**
    * `LegacyProjectV0Schema`: Strict schema for `formatVersion: 0` documents (which lacked `metadata`, `generation`, `bot.tokenEnvVar`, and `bot.parseMode`).
    * `migrateProjectData(input: unknown)`:
      * Rejects non-objects (`PROJECT_FORMAT_INVALID`), objects missing `formatVersion` (`PROJECT_VERSION_MISSING`), non-integer versions (`PROJECT_FORMAT_INVALID`), and versions other than `0` or `1` (`PROJECT_VERSION_UNSUPPORTED`).
      * For `formatVersion === 1`, validates against `ProjectDocumentSchema` and returns the data directly without repairing invalid fields.
      * For `formatVersion === 0`, validates against `LegacyProjectV0Schema`, constructs a `formatVersion: 1` candidate with `bot.tokenEnvVar = 'TELEGRAM_BOT_TOKEN'`, `bot.parseMode = null`, `DEFAULT_PROJECT_METADATA`, and `DEFAULT_CODE_GENERATION_SETTINGS`, and validates the result against `ProjectDocumentSchema` (throwing `PROJECT_MIGRATION_FAILED` if final validation fails).

* **[src/project.serialization.ts](src/project.serialization.ts)**
  * **Role:** JSON Serialization and Deserialization Entry Points.
  * **Implementation:**
    * `serializeProject(project: unknown, options?: SerializeProjectOptions)`: Validates `project` against `ProjectDocumentSchema` (throwing `PROJECT_SERIALIZATION_FAILED` if invalid), checks that `options.indentation` (default `2`) is an integer in `0..10` (`INVALID_INPUT`), and returns `JSON.stringify(validation.data, null, indentation)`.
    * `deserializeProject(jsonText: string)`: Verifies `typeof jsonText === 'string'` (`INVALID_INPUT`), parses JSON (throwing `PROJECT_JSON_INVALID` on syntax errors), and delegates to `migrateProjectData(parsed)`.

* **[src/project.serialization.test.ts](src/project.serialization.test.ts)**
  * **Role:** Package Unit Test Suite (9 tests).
  * **Implementation:** Tests `ProjectDocumentSchema` acceptance of valid documents, rejection of wrong field types and missing `formatVersion`, rejection of unexpected properties (`rendererStoreSnapshot`), `serializeProject` / `deserializeProject` round-tripping, serialization failure on empty `name`, `PROJECT_JSON_INVALID` reporting on malformed JSON, `migrateProjectData` error messages for missing or unsupported version `99`, `v0 -> v1` migration defaults, and `validateProjectSemantics` detection of `EDGE_SOURCE_NODE_NOT_FOUND` on structurally valid documents.
