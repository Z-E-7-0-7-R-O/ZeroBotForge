<h1 align="center">
  ZeroBotForge Core Workspace Packages (<code>packages/*</code>)
</h1>

<div align="center">
<i>Shared domain contracts, versioned project serialization, flow graph validation and execution, standalone TypeScript code generation, and Telegram Bot API runtime adaptation.</i>
<br><br>
<b>Parent Documentation:</b> <a href="../README.md">Root README.md</a><br>
<b>Workspace Scope:</b> <code>@zerobotforge/shared</code>, <code>@zerobotforge/project-format</code>, <code>@zerobotforge/flow-engine</code>, <code>@zerobotforge/code-generator</code>, <code>@zerobotforge/telegram-adapter</code>
</div>

--------------------------------------------------------------------------------

## Overview

The `packages/` directory contains the five internal npm workspace packages that implement ZeroBotForge's domain models, validation rules, execution semantics, standalone project generation, and Telegram Bot API integration. All packages in this directory are strictly decoupled from Electron and React UI state so they can be executed in Node.js, tested independently under Vitest, and consumed by both the desktop renderer and main processes.

### Inter-Package Dependency Graph

| Package | Version | Internal Dependencies | External Dependencies | Primary Responsibility |
|---|---|---|---|---|
| [`@zerobotforge/shared`](shared/README.md) | `0.1.0` | None | `zod ^3.24.1` | Branded IDs, canonical node/color constants, error hierarchy, and base Zod schemas. |
| [`@zerobotforge/project-format`](project-format/README.md) | `0.1.0` | `@zerobotforge/shared` | `zod ^3.24.1` | Versioned `.zbf`/`.json` document model, v0->v1 migration, strict structural and semantic validation, and JSON serialization. |
| [`@zerobotforge/flow-engine`](flow-engine/README.md) | `0.1.0` | `@zerobotforge/shared` | `zod ^3.24.1` | Node registry (`start`, `text`, `image`, `button`, `choice`, `menu`, `action`), graph reachability (`FlowGraph`), port/edge validation (`validateFlow`), and step-budget execution (`executeFlow`). |
| [`@zerobotforge/code-generator`](code-generator/README.md) | `0.1.0` | `@zerobotforge/shared`, `@zerobotforge/project-format`, `@zerobotforge/flow-engine` | None | Escaped template context construction, `.tpl` rendering, token-leak scanning, and 7-file standalone TypeScript bot manifest assembly. |
| [`@zerobotforge/telegram-adapter`](telegram-adapter/README.md) | `0.1.0` | `@zerobotforge/shared`, `@zerobotforge/flow-engine` | `telegraf ^4.16.3` | Long-polling `TelegramClient`, idempotent `TelegramBotManager`, SHA-256 file-locked `ConversationStore` with corruption quarantine, and state-first `TelegramUpdateRouter`. |

--------------------------------------------------------------------------------

## Directory Configuration Files

* **[tsconfig.json](tsconfig.json)**
  * **Role:** Shared TypeScript Typechecking Configuration for Workspace Packages.
  * **Implementation:** Extends [`../tsconfig.base.json`](../tsconfig.base.json) and configures `"target": "ES2022"`, `"lib": ["ES2022", "DOM"]`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"types": ["node", "vitest/globals"]`, `"noEmit": true`, and `"verbatimModuleSyntax": true`. Includes source files matching `shared/src/**/*.ts`, `project-format/src/**/*.ts`, `flow-engine/src/**/*.ts`, and `telegram-adapter/src/**/*.ts`, while excluding `**/dist/**` and `**/node_modules/**`. Executed via `npm run typecheck:packages` (`tsc --noEmit -p packages/tsconfig.json`).

--------------------------------------------------------------------------------

## Package Documentation Index

Navigate to each package's dedicated `README.md` for a complete file-by-file engineering breakdown:

1. **[`packages/shared/README.md`](shared/README.md)** — Dissects `package.json`, `src/constants.ts`, `src/types.ts`, `src/errors.ts`, and `src/validators.ts`.
2. **[`packages/project-format/README.md`](project-format/README.md)** — Dissects `package.json`, `src/project.model.ts`, `src/project.schema.ts`, `src/project.migrations.ts`, `src/project.serialization.ts`, and `src/project.serialization.test.ts`.
3. **[`packages/flow-engine/README.md`](flow-engine/README.md)** — Dissects `package.json`, `src/flow.model.ts`, `src/node-registry.ts`, `src/flow-graph.ts`, `src/flow-validator.ts`, `src/flow-executor.ts`, `src/flow-engine.test.ts`, and all 7 node definitions in `src/nodes/`.
4. **[`packages/code-generator/README.md`](code-generator/README.md)** — Dissects `package.json`, `src/generator.ts`, `src/generator-context.ts`, `src/template-loader.ts`, `src/output-assembler.ts`, `src/generator.test.ts`, and all 6 `.tpl` templates in `src/templates/`.
5. **[`packages/telegram-adapter/README.md`](telegram-adapter/README.md)** — Dissects `package.json`, `src/types.ts`, `src/telegram-client.ts`, `src/bot-manager.ts`, `src/conversation-store.ts`, `src/update-router.ts`, and `src/telegram-adapter.test.ts`.
