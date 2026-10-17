<h1 align="center">
  <code>@zerobotforge/code-generator</code> — Standalone TypeScript Bot Generator
</h1>

<div align="center">
<i>Validates ZeroBotForge project documents, builds escaped template contexts, renders standalone Telegraf runtime templates, and assembles a verified 7-file project manifest.</i>
<br><br>
<b>Parent Documentation:</b> <a href="../README.md">packages/README.md</a> · <a href="../../README.md">Root README.md</a><br>
<b>Package:</b> <code>@zerobotforge/code-generator</code> 0.1.0
</div>

--------------------------------------------------------------------------------

## Overview

`@zerobotforge/code-generator` transforms a validated `ProjectDocument` into a self-contained Node.js/TypeScript Telegram bot project consisting of seven files: `package.json`, `tsconfig.json`, `.env.example`, `project.json`, `src/bot.ts`, `src/handlers.ts`, and `README.md`. User-authored flow content is isolated inside `project.json` rather than interpolated into TypeScript source code, and all generated files are scanned to prevent accidental Telegram token leakage.

--------------------------------------------------------------------------------

## Source Code Modules

### 1. Generator Pipeline (`src/`)

* **[package.json](package.json)**
  * **Role:** Package Manifest.
  * **Implementation:** Declares `"name": "@zerobotforge/code-generator"`, `"version": "0.1.0"`, and exports `"."` (`./src/generator.ts`). Depends on `@zerobotforge/shared`, `@zerobotforge/project-format`, and `@zerobotforge/flow-engine`.

* **[src/generator.ts](src/generator.ts)**
  * **Role:** Primary Code Generation Entry Point (`generateProjectFiles`).
  * **Implementation:**
    * Defines `GENERATOR_SUPPORTED_NODE_TYPES = new Set(["start", "text", "image", "button", "choice", "menu", "action"])`.
    * `generateProjectFiles(input: unknown)`:
      1. Serializes and deserializes `input` via `@zerobotforge/project-format/serialization` to guarantee canonical structural validity.
      2. Rejects projects with `project.flows.length === 0`.
      3. Iterates over every flow and node, throwing an explicit error if any node uses an unsupported type (such as `"condition"`) or if `validateFlow(flow)` returns `valid: false`.
      4. Validates `project.bot.tokenEnvVar` against `/^[A-Z_][A-Z0-9_]*$/`.
      5. Calls `createGeneratorContext`, `renderGeneratorTemplates`, and `assembleGeneratedProject` to return `GeneratedProjectFile[]`.

* **[src/generator-context.ts](src/generator-context.ts)**
  * **Role:** Context Builder and Output-Specific Escaping.
  * **Implementation:**
    * `toPackageName(name)`: Converts the project name to lowercase kebab-case (`[^a-z0-9-]+` replaced with `-`, trimmed to 60 characters, fallback `"zerobotforge-bot"`).
    * `escapeMarkdownText(value)`: Replaces newlines with spaces and backslash-escapes Markdown punctuation characters (`` [`*_{}\[\]()#+.!|>~-] ``) so user project names cannot inject arbitrary Markdown headings or links into `README.md`.
    * `createGeneratorContext(project, serializedProject)`: Produces the 11-key `GeneratorContext` object (`PACKAGE_NAME_JSON`, `MODULE_TYPE_JSON`, `NODE_ENGINE_RANGE_JSON`, `STRICT_MODE_JSON`, `TOKEN_ENV_VAR`, `TOKEN_ENV_VAR_JSON`, `PROJECT_NAME_MARKDOWN`, `NODE_VERSION`, `PACKAGE_MANAGER`, `INSTALL_COMMAND`, `PROJECT_JSON`), using `JSON.stringify` for all values interpolated into JSON or TypeScript templates.

* **[src/template-loader.ts](src/template-loader.ts)**
  * **Role:** Raw Template Loader and Placeholder Substitution Engine.
  * **Implementation:** Imports the six `.tpl` files using Vite's `?raw` loader (`package.json.tpl`, `tsconfig.json.tpl`, `env.example.tpl`, `bot.ts.tpl`, `handlers.ts.tpl`, `README.md.tpl`). `renderGeneratorTemplate(name, context)` replaces all `/\{\{([A-Z][A-Z0-9_]*)\}\}/g` tokens with values from `GeneratorContext`, throws if any required key is missing, and verifies that no unresolved `/\{\{[^{}]+\}\}/` token remains in the output.

* **[src/output-assembler.ts](src/output-assembler.ts)**
  * **Role:** Manifest Integrity, Size Limit, JSON Syntax, and Token-Leak Verifier.
  * **Implementation:**
    * Enforces the fixed 7-file `OUTPUT_MANIFEST` (`package.json`, `tsconfig.json`, `.env.example`, `project.json`, `src/bot.ts`, `src/handlers.ts`, `README.md`).
    * Rejects path traversal, backslashes, leading slashes, drive letters, duplicate paths, files exceeding `MAX_FILE_BYTES` (`2 MB`), manifests exceeding `MAX_TOTAL_BYTES` (`8 MB`), invalid JSON in `package.json`, `tsconfig.json`, or `project.json`, and any file content matching `TELEGRAM_TOKEN_PATTERN` (`/\b\d{6,12}:[A-Za-z0-9_-]{25,}\b/`).

* **[src/generator.test.ts](src/generator.test.ts)**
  * **Role:** Package Unit Test Suite (9 tests).
  * **Implementation:** Verifies rejection of flowless projects, rejection of non-project objects, exact 7-file manifest ordering, valid JSON manifests and blank `.env.example` token assignment, isolation of untrusted node text (`console.log` injection payload) into `project.json` and Markdown escaping of project names, rejection of embedded Telegram token patterns, rejection of unsupported `"condition"` nodes, TypeScript syntax verification via `typescript.transpileModule` (`DiagnosticCategory.Error` count `=== 0`), and presence of `telegraf`, `dotenv`, and `typescript` in generated `package.json`.

---

### 2. Standalone Bot Templates (`src/templates/`)

* **[src/templates/package.json.tpl](src/templates/package.json.tpl)**
  * **Role:** Generated Bot `package.json` Template.
  * **Implementation:** Sets `"name": {{PACKAGE_NAME_JSON}}`, `"version": "1.0.0"`, `"private": true`, `"type": {{MODULE_TYPE_JSON}}`, `"engines": { "node": {{NODE_ENGINE_RANGE_JSON}} }`, scripts (`"dev": "tsx watch src/bot.ts"`, `"build": "tsc -p tsconfig.json"`, `"start": "node dist/bot.js"`), runtime dependencies (`"dotenv": "^16.4.7"`, `"telegraf": "^4.16.3"`), and `devDependencies` (`"@types/node": "^22.10.2"`, `"tsx": "^4.19.2"`, `"typescript": "^5.7.2"`).

* **[src/templates/tsconfig.json.tpl](src/templates/tsconfig.json.tpl)**
  * **Role:** Generated Bot TypeScript Configuration Template.
  * **Implementation:** Configures `"target": "ES2022"`, `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"strict": {{STRICT_MODE_JSON}}`, `"outDir": "dist"`, and `"rootDir": "src"`.

* **[src/templates/env.example.tpl](src/templates/env.example.tpl)**
  * **Role:** Generated Environment Variable Template.
  * **Implementation:** Emits `{{TOKEN_ENV_VAR}}=` with comments instructing the user to copy `.env.example` to `.env` and keep `.env` private.

* **[src/templates/bot.ts.tpl](src/templates/bot.ts.tpl)**
  * **Role:** Generated Bot Process Entry Point (`src/bot.ts`).
  * **Implementation:** Imports `"dotenv/config"`, reads `process.env[tokenEnvironmentVariable]?.trim()`, loads `project.json` from `process.cwd()`, instantiates `new Telegraf(token)`, calls `registerProjectHandlers(bot, project)`, attaches a token-safe `bot.catch` handler, launches long-polling (`await bot.launch()`), and registers `SIGINT`/`SIGTERM` process exit handlers.

* **[src/templates/handlers.ts.tpl](src/templates/handlers.ts.tpl)**
  * **Role:** Generated Standalone Flow Execution and Action Handler Module (`src/handlers.ts`).
  * **Implementation:**
    * Implements a standalone flow interpreter (`runFlow`) with a 100-step safety limit covering `start`, `text`, `image`, `button`, `choice`, `menu`, and `action` nodes.
    * Maps ZeroBotForge button colors (`green` -> `"success"`, `blue` -> `"primary"`, `red` -> `"danger"`) via `toTelegramButtonStyle`.
    * Builds multi-row persistent reply keyboards (`buildMenuKeyboardRows`) honoring explicit `row` (`1..12`) and `width` (`full` = 1, `half` = 2, `third` = 3, `quarter` = 4, `auto` = 2) settings.
    * Stores pending inline selections in `pendingSelections` (`Map<string, PendingSelection>`) keyed by `zbf:<randomUUID()>` and validates originating `chatId` and `userId` on callback queries.
    * Implements `defaultJsonActionHandler` with a 7-stage execution pipeline:
      1. Variable assignment from `variables`, `set`, `assign`, or `state` objects.
      2. Recursive batch step execution (`steps` / `actions` / `messages` arrays).
      3. `fetch`-based HTTP/Webhook execution (`http_request`, `webhook`, `fetch`, `api`, `request`, or `webhookUrl`/`endpoint` fields) with header/body variable interpolation (`{{key}}` and `{key}`), a 10,000 ms timeout (`AbortSignal.timeout(10_000)`), and response storage in `variables[operationId]` and `variables.lastActionResult`.
      4. HTTP/HTTPS photo sending (`replyWithPhoto`) when `imageUrl`/`photoUrl`/`photo`/`image` is provided.
      5. Text message sending (`context.reply`) with `parseMode` (`HTML`, `Markdown`, `MarkdownV2`) and URL inline buttons (`buildActionInlineKeyboard`).
      6. State persistence of merged JSON parameters under `variables[operationId]`.
      7. Explicit `"failure"` / `"success"` routing based on `outcome`, `status`, or `success` properties.

* **[src/templates/README.md.tpl](src/templates/README.md.tpl)**
  * **Role:** Generated Project Documentation Template.
  * **Implementation:** Renders setup, configuration, and local execution commands (`{{INSTALL_COMMAND}}`, `{{PACKAGE_MANAGER}} run dev/build/start`, and `{{TOKEN_ENV_VAR}}`) for the exported standalone bot project.
