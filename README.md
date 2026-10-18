<h1 align="center">
  ZeroBotForge: Visual Flow-Based Telegram Bot Studio<br>
  and Standalone TypeScript Code Generator
</h1>

<div align="center">
<i>An Electron and React desktop application for designing Telegram bot conversation flows, executing local runtime processes without terminal commands, and generating standalone TypeScript bot projects.</i>
<br><br>
<b>Developer:</b> Zero-AI-Native (Age 15, assisted by Google Gemini 4 Argon) <br>
<b>Package:</b> zerobotforge 0.1.0 (MIT License)<br>
<b>Architecture:</b> Electron 44 / React 18 / TypeScript 5.6 / npm Workspaces Monorepo<br>
<b>Status:</b> Initial Version (0.1.0, functional core, known limitations documented below)
</div>

--------------------------------------------------------------------------------

## Overview

ZeroBotForge is a desktop application and modular TypeScript monorepo that enables users to design Telegram bot conversation flows visually, simulate multi-turn interactions locally, execute and monitor compiled bots directly from the graphical interface, and export self-contained Node.js/TypeScript bot projects. The repository is structured around npm workspaces (`apps/desktop` and `packages/*`) under strict TypeScript compilation (`ES2022` target) and enforces explicit security boundaries between the React renderer, the Electron main process, the OS credential store, and generated source code.

Rather than embedding Telegram bot tokens into project documents or generated source files, ZeroBotForge persists only the target environment variable name (`tokenEnvVar`, defaulting to `TELEGRAM_BOT_TOKEN`) inside the `.zbf` / `.json` project schema. Actual BotFather credentials are encrypted on disk via Electron's `safeStorage` API (`secrets.json`) and automatically synchronized to the target runtime `.env` file and child process environment during local compilation and execution.

### Objective and Engineering Philosophy of ZeroBotForge

ZeroBotForge is designed for users who do not possess programming knowledge as well as developers or operators who have limited time and require a deterministic workflow to build, test, and run a Telegram bot in the shortest time possible without writing code or entering commands in a terminal. Every architectural layer in the codebase directly serves this zero-code, zero-terminal objective:

1. **Visual Node-Graph Authoring Instead of Manual Coding:** In [`BotBuilderPage.tsx`](apps/desktop/src/pages/BotBuilderPage.tsx), [`FlowCanvas.tsx`](apps/desktop/src/components/flow/FlowCanvas.tsx), [`NodePalette.tsx`](apps/desktop/src/components/flow/NodePalette.tsx), and [`NodeEditor.tsx`](apps/desktop/src/components/flow/NodeEditor.tsx), conversation logic is constructed by adding typed nodes (`start`, `text`, `image`, `button`, `choice`, `menu`, `action`) from a palette, dragging node cards across a 2D stage, and clicking output and input port handles to draw directed SVG cubic Bezier connections ([`ConnectionLayer.tsx`](apps/desktop/src/components/flow/ConnectionLayer.tsx)). Users configure message text, HTTP/HTTPS image URLs, inline buttons, choice prompts, persistent reply keyboards (including one-click row layout presets: `2 per row`, `3 per row`, `Mixed (2 + 3 + 1)`, and `Full-width stack`), button colors (`default`, `green`, `blue`, `red`), and JSON action payloads through form controls rather than writing Telegraf API calls.
2. **Real-Time Structural Validation and Visual Diagnostics:** Every graph mutation is validated immediately by `@zerobotforge/flow-engine` ([`flow-validator.ts`](packages/flow-engine/src/flow-validator.ts)). Nodes with missing required fields, invalid URLs, duplicate option IDs, or unconnected required output ports are highlighted on the canvas with warning indicators and listed with exact schema paths in the validation panel, preventing broken bot logic before code generation or execution occurs.
3. **Zero-Terminal Compilation and Process Execution Pipeline:** Through [`RunPage.tsx`](apps/desktop/src/pages/RunPage.tsx), [`DashboardPage.tsx`](apps/desktop/src/pages/DashboardPage.tsx), and [`BotRuntimeService`](apps/desktop/electron/services/bot-runtime.service.ts), the user never opens an external command prompt or shell. A three-stage protective pipeline (`1. Generate Project` -> `2. Compile` -> `3. Local Bot Execution`) is operated entirely by GUI buttons:
   * Clicking **Generate bot project** validates the active flow, renders the 7-file TypeScript project in memory, writes it atomically to a selected folder, and registers the path with `BotRuntimeService`.
   * Clicking **Compile** spawns `cmd.exe /d /s /c "npm install && npm run build"` on Windows or `sh -c "npm install && npm run build"` on Unix/macOS in the background (`windowsHide: true`, `FORCE_COLOR: "0"`, `NO_COLOR: "1"`) and verifies the existence of the compiled `dist/bot.js` artifact.
   * Clicking **Run** probes `https://api.telegram.org/bot<token>/getMe` to verify connectivity and spawns `node dist/bot.js` as a managed child process while streaming `stdout`, `stderr`, and `system` events into an in-app **Live Process Terminal** with automatic token redaction.
   * Clicking **Stop** terminates the running bot process (using `taskkill /pid <pid> /T /F` on Windows or `SIGTERM` followed by a 4,000 ms fallback `SIGKILL` timeout on POSIX systems).
4. **Automated Credential Management and `.env` Synchronization:** In [`BotTokenSettings.tsx`](apps/desktop/src/features/bot/BotTokenSettings.tsx) and [`SecureStorageService`](apps/desktop/electron/services/secure-storage.service.ts), the user pastes their Telegram BotFather token once. The token is validated against `/^[0-9]{5,}:[A-Za-z0-9_-]{20,}$/`, encrypted via OS-backed `safeStorage`, and cleared from the UI input. Whenever a bot project is generated, updated, compiled, or started, `BotRuntimeService.syncTokenToActiveDirectory()` automatically writes `TELEGRAM_BOT_TOKEN=<token>` (and the project's custom `tokenEnvVar` if different) into the generated folder's `.env` file, eliminating manual `.env` file creation or editing.
5. **Local In-Studio Conversation Simulation:** [`ChatPreview.tsx`](apps/desktop/src/components/preview/ChatPreview.tsx) and [`preview.service.ts`](apps/desktop/src/services/preview.service.ts) execute the active flow graph locally inside the Bot Builder using `@zerobotforge/flow-engine` without network calls or a Telegram token. Users can step through text messages, image previews, inline buttons, choices, and persistent bottom menus to verify conversation branches in seconds.
6. **Self-Contained Standalone Code Export:** When external hosting or code inspection is desired, `@zerobotforge/code-generator` emits a complete, dependency-complete TypeScript/Telegraf project (`package.json`, `tsconfig.json`, `.env.example`, `project.json`, `src/bot.ts`, `src/handlers.ts`, `README.md`) that compiles cleanly and runs independently of the ZeroBotForge desktop application.

### Studio Interface Gallery

*Slide horizontally to view screenshots #1 through #13 of the ZeroBotForge desktop environment:*

<table>
  <tr>
    <td align="center">
      <pre>                              Photo #1 from ZeroBotForge                              </pre>
      <img src="assets/Photo 1 from ZeroBotForge.png" alt="Photo #1 from ZeroBotForge" width="1000" />
    </td>
    <td align="center">
      <pre>                              Photo #2 from ZeroBotForge                              </pre>
      <img src="assets/Photo 2 from ZeroBotForge.png" alt="Photo #2 from ZeroBotForge" width="800" />
    </td>
    <td align="center">
      <pre>                              Photo #3 from ZeroBotForge                              </pre>
      <img src="assets/Photo 3 from ZeroBotForge.png" alt="Photo #3 from ZeroBotForge" width="800" />
    </td>
    <td align="center">
      <pre>                              Photo #4 from ZeroBotForge                              </pre>
      <img src="assets/Photo 4 from ZeroBotForge.png" alt="Photo #4 from ZeroBotForge" width="800" />
    </td>
    <td align="center">
      <pre>                              Photo #5 from ZeroBotForge                              </pre>
      <img src="assets/Photo 5 from ZeroBotForge.png" alt="Photo #5 from ZeroBotForge" width="800" />
    </td>
    <td align="center">
      <pre>                              Photo #6 from ZeroBotForge                              </pre>
      <img src="assets/Photo 6 from ZeroBotForge.png" alt="Photo #6 from ZeroBotForge" width="800" />
    </td>
    <td align="center">
      <pre>                              Photo #7 from ZeroBotForge                              </pre>
      <img src="assets/Photo 7 from ZeroBotForge.png" alt="Photo #7 from ZeroBotForge" width="800" />
    </td>
    <td align="center">
      <pre>                              Photo #8 from ZeroBotForge                              </pre>
      <img src="assets/Photo 8 from ZeroBotForge.png" alt="Photo #8 from ZeroBotForge" width="800" />
    </td>
    <td align="center">
      <pre>                              Photo #9 from ZeroBotForge                              </pre>
      <img src="assets/Photo 9 from ZeroBotForge.png" alt="Photo #9 from ZeroBotForge" width="800" />
    </td>
    <td align="center">
      <pre>                              Photo #10 from ZeroBotForge                             </pre>
      <img src="assets/Photo 10 from ZeroBotForge.png" alt="Photo #10 from ZeroBotForge" width="800" />
    </td>
    <td align="center">
      <pre>                              Photo #11 from ZeroBotForge                             </pre>
      <img src="assets/Photo 11 from ZeroBotForge.png" alt="Photo #11 from ZeroBotForge" width="800" />
    </td>
    <td align="center">
      <pre>                              Photo #12 from ZeroBotForge                             </pre>
      <img src="assets/Photo 12 from ZeroBotForge.png" alt="Photo #12 from ZeroBotForge" width="800" />
    </td>
    <td align="center">
      <pre>                              Photo #13 from ZeroBotForge                             </pre>
      <img src="assets/Photo 13 from ZeroBotForge.png" alt="Photo #13 from ZeroBotForge" width="800" />
    </td>
  </tr>
</table>

### Core Implemented Mechanisms

The functionality across the monorepo is organized into nine engineering mechanisms:

1. **Shared Domain Contracts and Nominal Identifiers (`@zerobotforge/shared`):** Defines branded string types (`ProjectId`, `FlowId`, `NodeId`, `EdgeId`), canonical node type constants, button color constants, recursive JSON value schemas (`jsonValueSchema`), identifier regex validation (`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`), and serializable error structures (`ZeroBotForgeError`, `ValidationError`, `ProjectFormatError`, `toOperationErrorInfo`).
2. **Versioned Project Schema, Migration, and Serialization (`@zerobotforge/project-format`):** Defines the `zerobotforge.project` document model (`formatVersion: 1`), strict Zod structural schemas that reject unknown properties (`.strict()`), deterministic migration from legacy `formatVersion: 0` documents (`migrateProjectData`), separate graph-level semantic checks (`validateProjectSemantics`), and JSON serialization/deserialization (`serializeProject`, `deserializeProject`).
3. **Node Registry, Graph Analyzer, Validator, and Step-Budget Executor (`@zerobotforge/flow-engine`):** Registers seven executable node definitions (`start`, `text`, `image`, `button`, `choice`, `menu`, `action`) in `DEFAULT_NODE_REGISTRY`, performs breadth-first reachability analysis (`FlowGraph.getReachableNodeIds`), validates port handles and required output connections (`validateFlow`), and executes flows deterministically (`executeFlow`) with suspension/resumption on interactive nodes (`waiting_for_input`), allowlisted action handlers (`FlowActionRegistry`), and a configurable step budget (`maxSteps`, default `100`) to halt cyclic graphs (`step_limit_exceeded`).
4. **Template-Based Standalone Code Generator (`@zerobotforge/code-generator`):** Validates all project flows through the flow engine, escapes user-controlled strings for JSON and Markdown contexts (`createGeneratorContext`), renders six `.tpl` files (`renderGeneratorTemplates`), combines them with the serialized `project.json` in `assembleGeneratedProject`, scans all output content against `/\b\d{6,12}:[A-Za-z0-9_-]{25,}\b/` to block accidental Telegram token leaks, and enforces per-file (2 MB) and total (8 MB) size limits.
5. **Telegram Bot API Adapter and File-Backed Conversation Store (`@zerobotforge/telegram-adapter`):** Wraps `Telegraf` in a single explicit long-polling loop (`TelegramClient.pollLoop`) with exponential backoff and `retry_after` compliance, normalizes `message` and `callback_query` updates (`normalizeTelegramUpdate`), maps API/network exceptions into token-redacted error categories (`mapTelegramError`), manages idempotent start/stop lifecycles (`TelegramBotManager`), persists per-chat continuation state atomically using SHA-256 filenames and in-process directory locks (`ConversationStore`) while quarantining corrupted records to `recovery/`, and routes multi-turn updates state-first through `TelegramUpdateRouter`.
6. **Hardened Electron Main Process and Trusted IPC Layer (`apps/desktop/electron/ipc`):** Configures `BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, and default permission denial. Wraps every `ipcMain.handle` registration in `registerSecureHandler`, which verifies via `assertTrustedIpcSender` that requests originate exclusively from the main frame of the active `BrowserWindow` and match either `http://127.0.0.1:5173/` (development) or the packaged `dist/index.html` `file://` URL (production).
7. **Atomic File System, Settings, and OS Credential Services (`apps/desktop/electron/services`):** `atomicWriteFile` writes all files via unpredictable `.tmp` sibling files opened with `wx` and mode `0o600`, flushes with `handle.sync()`, and atomically renames over the destination while rejecting symbolic links. `ProjectFileSystemService` enforces `.zbf` and `.json` extensions and a 10 MB file size cap. `AppSettingsService` persists workspace preferences in `settings.json`. `SecureStorageService` encrypts and decrypts the bot token via `safeStorage.encryptStringAsync` / `decryptStringAsync` and blocks unsafe `basic_text` backends on Linux.
8. **Child-Process Bot Runtime Controller (`BotRuntimeService`):** Manages the lifecycle of generated bot directories (`idle`, `generated`, `compiling`, `compiled`, `starting`, `running`, `stopping`, `error`), synchronizes encrypted tokens to `.env`, runs `npm install && npm run build`, spawns `node dist/bot.js`, probes the Telegram `getMe` HTTP endpoint, and maintains a ring buffer of 400 token-redacted log lines.
9. **React 18 Studio Interface and External-Store State Management (`apps/desktop/src`):** Implements six workspace pages (`DashboardPage`, `BotBuilderPage`, `RunPage`, `ConversationsPage`, `AnalyticsPage`, `SettingsPage`) backed by three `useSyncExternalStore` stores (`app.store.ts`, `flow.store.ts`, `project.store.ts`), five renderer services (`project.service.ts`, `flow.service.ts`, `preview.service.ts`, `export.service.ts`, `telegram.service.ts`), and dark/light/system CSS theme tokens.

### Supported Flow Node Types and Execution Contracts

| Node Type | Registry Status | Input Ports | Output Ports | Required Connection | Configuration Schema (`zod`) & Runtime Behavior |
|---|---|---|---|---|---|
| `start` | Registered (`startNodeDefinition`) | None (`[]`) | `next` | No | `z.object({}).strict()`. Entry point of a flow. Exactly one `start` node is required per flow; cannot be the target of an edge or deleted in the editor. |
| `text` | Registered (`textNodeDefinition`) | `in` | `next` | No | `{ text: nonEmptyStringSchema }`. Emits `send_text` event in the flow engine and calls `context.reply(data.text)` in generated handlers. |
| `image` | Registered (`imageNodeDefinition`) | `in` | `next` | No | `{ url: string (http/https URL), caption?: nonEmptyString, altText?: nonEmptyString }`. Emits `send_image` event and calls `context.replyWithPhoto`. |
| `button` | Registered (`buttonNodeDefinition`) | `in` | Dynamic: `button:<id>` per button | Yes (`requiredConnection: true`) | `{ text: nonEmptyString, buttons: Array<{ id, label, color? }> (1..20, unique IDs) }`. Emits `show_buttons`, suspends execution (`waiting_for_input`), and routes on callback selection. |
| `choice` | Registered (`choiceNodeDefinition`) | `in` | Dynamic: `choice:<id>` per option | Yes (`requiredConnection: true`) | `{ prompt: nonEmptyString, options: Array<{ id, label, color? }> (2..20, unique IDs) }`. Emits `show_choices`, suspends execution (`waiting_for_input`), and routes on callback selection. |
| `menu` | Registered (`menuNodeDefinition`) | `in` | Dynamic: `menu:<id>` per item | Yes (`requiredConnection: true`) | `{ text: nonEmptyString, placeholder?: string (<=64), persistent?: boolean, resizeKeyboard?: boolean, oneTimeKeyboard?: boolean, items: Array<{ id, label, color?, row? (1..12), width? }> (1..24, unique IDs) }`. At most one `menu` node allowed per flow. Emits `show_menu` / persistent reply keyboard. |
| `action` | Registered (`actionNodeDefinition`) | `in` | `success`, `failure` | No | `{ operationId: identifierSchema, params: Record<string, JsonValue> }`. Executes registered handler in `FlowActionRegistry` or JSON fallback (`defaultJsonActionHandler` in generated code) and routes to `success` or `failure`. |
| `condition`, `input`, `end` | Defined in `NODE_TYPE_VALUES` only | None | None | N/A | Present in `@zerobotforge/shared` constants and schema enums, but not registered in `DEFAULT_NODE_REGISTRY` and rejected by `validateFlow` (`FLOW_NODE_TYPE_UNREGISTERED`) and `generateProjectFiles`. |

### Default Parameters, Limits, and Environment Specifications

| Parameter / Limit | Value | Defined In |
|---|---|---|
| Minimum Node.js / npm Engine | Node.js `>=22.12.0`, npm `>=10.8.0` | [`package.json`](package.json) |
| Project Format Identifier & Version | `"zerobotforge.project"`, `formatVersion: 1` (legacy `0` supported) | [`packages/shared/src/constants.ts`](packages/shared/src/constants.ts) |
| Default Bot Settings | `displayName: "My Telegram Bot"`, `tokenEnvVar: "TELEGRAM_BOT_TOKEN"`, `parseMode: "HTML"` | [`packages/project-format/src/project.model.ts`](packages/project-format/src/project.model.ts) |
| Default Code Generation Settings | `language: "typescript"`, `runtime: "node"`, `nodeVersion: 22`, `moduleFormat: "esm"`, `packageManager: "npm"`, `strict: true`, `includeReadme: true`, `includeTests: false` | [`packages/project-format/src/project.model.ts`](packages/project-format/src/project.model.ts) |
| Allowed Node Version Range (Export UI) | `22` to `30` (`MINIMUM_NODE_VERSION` .. `MAXIMUM_NODE_VERSION`) | [`apps/desktop/src/features/settings/ExportSettings.tsx`](apps/desktop/src/features/settings/ExportSettings.tsx) |
| Identifier Pattern | `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$` (1–128 chars) | [`packages/shared/src/constants.ts`](packages/shared/src/constants.ts) |
| Flow Execution Step Budget (`maxSteps`) | `100` steps per execution run | [`packages/flow-engine/src/flow-executor.ts`](packages/flow-engine/src/flow-executor.ts), [`handlers.ts.tpl`](packages/code-generator/src/templates/handlers.ts.tpl) |
| Button / Choice / Menu Item Counts | Buttons: `1..20`; Choices: `2..20`; Menu items: `1..24` (rows `1..12`) | [`button.node.ts`](packages/flow-engine/src/nodes/button.node.ts), [`choice.node.ts`](packages/flow-engine/src/nodes/choice.node.ts), [`menu.node.ts`](packages/flow-engine/src/nodes/menu.node.ts) |
| Project File Size & Extensions | Max `10 MB` (`10,485,760` bytes); `.zbf` and `.json` only | [`apps/desktop/electron/services/file-system.service.ts`](apps/desktop/electron/services/file-system.service.ts) |
| Generated Project Size Limits | Max `2 MB` per file, `8 MB` total, 7 fixed manifest files | [`packages/code-generator/src/output-assembler.ts`](packages/code-generator/src/output-assembler.ts), [`generated-project-export.ipc.ts`](apps/desktop/electron/ipc/generated-project-export.ipc.ts) |
| Default Application Settings | `theme: "system"`, `autoSaveEnabled: true`, `autoSaveIntervalSeconds: 60`, `reopenLastProject: true` | [`apps/desktop/electron/services/app-settings.service.ts`](apps/desktop/electron/services/app-settings.service.ts) |
| Allowed Autosave Intervals | `15`, `30`, `60`, `120` seconds | [`apps/desktop/electron/services/app-settings.service.ts`](apps/desktop/electron/services/app-settings.service.ts) |
| Runtime Log Buffer & Polling Interval | `400` entries (`MAX_LOG_ENTRIES`); UI status poll every `1,200 ms` | [`bot-runtime.service.ts`](apps/desktop/electron/services/bot-runtime.service.ts), [`RunPage.tsx`](apps/desktop/src/pages/RunPage.tsx) |
| Telegram API Timeouts & Limits | `getMe` probe: `8,000 ms` (runtime) / `10,000 ms` (IPC test); `TelegramClient` long-poll: `5 s` (max `30 s`), backoff `500 ms`..`30,000 ms`; callback data max `64 bytes` | [`bot-runtime.service.ts`](apps/desktop/electron/services/bot-runtime.service.ts), [`telegram.ipc.ts`](apps/desktop/electron/ipc/telegram.ipc.ts), [`telegram-client.ts`](packages/telegram-adapter/src/telegram-client.ts) |

--------------------------------------------------------------------------------

## Technical Details / Architecture

All source code, templates, stylesheets, fixtures, and test suites are included in the repository for inspection.

### Project Document Format, Schema Validation, and Version Migration

ZeroBotForge separates persisted domain data (`ProjectDocument` in `@zerobotforge/project-format`) from ephemeral UI store state (`selectedNodeId`, `previewResult`, `isDirty`). Every project file on disk must satisfy `ProjectDocumentSchema`, which uses Zod `.strict()` objects at every nesting level (`PointSchema`, `FlowNodeSchema`, `FlowEdgeSchema`, `FlowDefinitionSchema`, `BotSettingsSchema`, `CodeGenerationSettingsSchema`, `ProjectMetadataSchema`). Any unexpected property (such as a leaked UI store snapshot) causes schema parsing to fail rather than silently stripping keys.

When `deserializeProject(jsonText)` is called:
1. Raw text is parsed via `JSON.parse`. Malformed JSON throws `ProjectFormatError` with `ERROR_CODES.PROJECT_JSON_INVALID`.
2. `migrateProjectData(parsed)` inspects `formatVersion`. Missing or non-integer versions throw `PROJECT_VERSION_MISSING` or `PROJECT_FORMAT_INVALID`; unsupported integers throw `PROJECT_VERSION_UNSUPPORTED`.
3. Documents at `formatVersion: 1` are validated directly against `ProjectDocumentSchema`.
4. Legacy documents at `formatVersion: 0` are validated against `LegacyProjectV0Schema` and upgraded to `formatVersion: 1` by populating `bot.tokenEnvVar = "TELEGRAM_BOT_TOKEN"`, `bot.parseMode = null`, `metadata = { description: "", tags: [] }`, and `generation = DEFAULT_CODE_GENERATION_SETTINGS`, followed by a final `ProjectDocumentSchema` verification pass.
5. `validateProjectSemantics(project)` performs cross-entity checks outside the structural schema: duplicate flow IDs (`DUPLICATE_FLOW_ID`), missing `activeFlowId` target (`ACTIVE_FLOW_NOT_FOUND`), duplicate node IDs (`DUPLICATE_NODE_ID`), duplicate edge IDs (`DUPLICATE_EDGE_ID`), and dangling edge `sourceNodeId` / `targetNodeId` references.

### Flow Graph Validation and Execution Engine

`@zerobotforge/flow-engine` governs both design-time validation and runtime execution:

* **Graph Representation (`FlowGraph`):** Indexes `FlowNode` and `FlowEdge` records in `Map` structures by ID, precomputes incoming and outgoing adjacency lists per node, filters outgoing edges by `sourceHandle`, and computes reachable node IDs from any starting node via non-mutating breadth-first search (`getReachableNodeIds`).
* **Structural & Port Validation (`validateFlow`):**
  * Verifies `FlowDefinitionSchema`.
  * Enforces node cardinality: exactly one `start` node (`FLOW_START_NODE_MISSING`, `FLOW_MULTIPLE_START_NODES`) and at most one `menu` node (`FLOW_MULTIPLE_MENU_NODES`) per flow.
  * Checks every node's `type` against `NodeRegistry` (`FLOW_NODE_TYPE_UNREGISTERED`) and validates `node.data` against the node's `configSchema` (`FLOW_NODE_CONFIG_INVALID`).
  * Rejects edges targeting a `start` node (`FLOW_EDGE_TO_START`), edges referencing missing nodes (`FLOW_EDGE_SOURCE_NOT_FOUND`, `FLOW_EDGE_TARGET_NOT_FOUND`), edges with invalid `sourceHandle` or `targetHandle` port IDs (`FLOW_SOURCE_PORT_INVALID`, `FLOW_TARGET_PORT_INVALID`), and multiple outgoing edges sharing the same `(sourceNodeId, sourceHandle)` pair (`FLOW_MULTIPLE_EDGES_FROM_PORT`) to guarantee deterministic routing.
  * Enforces that all dynamic output ports with `requiredConnection: true` (`button:<id>`, `choice:<id>`, `menu:<id>`) have an outgoing edge (`FLOW_OUTPUT_PORT_UNCONNECTED`).
* **Step-Budget Execution (`executeFlow`):**
  * Validates the flow prior to execution. If invalid, returns `status: "failed"` with `steps: 0` and mapped `FlowExecutionIssue` entries.
  * Starts at the single `start` node or at `options.resumeAtNodeId` when resuming a suspended conversation.
  * Iterates while `steps < maxSteps` (default `100`). If the loop reaches `maxSteps` (for example, in a cyclic graph), execution halts deterministically with `status: "step_limit_exceeded"` and `ERROR_CODES.FLOW_STEP_LIMIT_EXCEEDED`.
  * Interactive nodes (`button`, `choice`, `menu`): When `context.input` is `undefined`, emits `show_buttons`, `show_choices`, or `show_menu` and returns `status: "waiting_for_input"` with `currentNodeId` set to the interactive node's ID. When resumed with `context.input = { kind, optionId }`, consumes `context.input`, validates that `kind` and `optionId` match a configured option on the node, and traverses the corresponding `<kind>:<optionId>` outgoing edge.
  * Action nodes (`action`): Looks up `config.operationId` in `options.actions` (`FlowActionRegistry`).
    * When a handler is registered, invokes `await handler({ node, params, context })`, stores any returned value in `context.variables.lastActionResult`, emits `action_completed`, and follows the `success` edge. If the handler throws, records `FLOW_EXECUTION_FAILED`, emits `action_failed`, and follows the `failure` edge (or fails if no `failure` edge is connected).
    * When `options.actions` is `undefined` (such as during local UI preview) and `config.params` is non-empty, executes a built-in parameter inspection branch: extracts candidate text fields (`text`, `message`, `reply`) to emit `send_text`, stores `rawParams` under `context.variables[config.operationId]` and `context.variables.lastActionResult`, checks for explicit failure flags (`outcome === "failure"`, `status === "failure"`, `success === false`), and routes to `success` or `failure`.
    * Otherwise, records `FLOW_ACTION_NOT_REGISTERED`, emits `action_failed`, and follows the `failure` edge if present.

### Standalone Code Generation and Security Boundaries

`@zerobotforge/code-generator` produces a fixed 7-file manifest (`package.json`, `tsconfig.json`, `.env.example`, `project.json`, `src/bot.ts`, `src/handlers.ts`, `README.md`):

* **User Content Isolation:** User-authored node labels, message texts, button labels, image URLs, and action parameters are **never** interpolated into `src/bot.ts` or `src/handlers.ts` as TypeScript code fragments. Instead, the validated project document is written to `project.json`, and the generated `src/bot.ts` loads `project.json` from `process.cwd()` at runtime. Template placeholders in `package.json.tpl`, `tsconfig.json.tpl`, and `bot.ts.tpl` receive `JSON.stringify`-encoded strings (`createGeneratorContext`), preventing code injection via crafted project names or node payloads.
* **Credential Leak Prevention:** `generateProjectFiles` never reads `SecureStorageService`. Before returning the file array, `assembleGeneratedProject` scans every generated file against `/\b\d{6,12}:[A-Za-z0-9_-]{25,}\b/` and throws an error if any node payload or metadata string resembles a Telegram bot token.
* **Generated Runtime Mechanics (`src/handlers.ts`):**
  * Registers `/start` to launch `activeFlowId` (or `flows[0]`).
  * Generates a per-selection `randomUUID()` key stored in `pendingSelections` (`zbf:<uuid>`) for inline `button` and `choice` callbacks, verifying on callback receipt that `pending.chatId === context.chat?.id` and `pending.userId === context.from?.id` before resuming `runFlow`.
  * Listens to incoming text messages (`bot.on("text")`) to match button labels from the flow's persistent `menu` node and routes to `menu:<id>`.
  * Provides `defaultJsonActionHandler` for `action` nodes, supporting variable assignment (`variables`, `set`, `assign`, `state`), string interpolation (`{{var}}` and `{var}` including `userId`, `chatId`, `username`, `firstName`, `lastName`, `operationId`), batch `steps`/`actions`/`messages`, `fetch`-based HTTP/Webhook requests with a 10,000 ms `AbortSignal.timeout`, photo replies (`replyWithPhoto`), and URL inline keyboards.

### Telegram Bot API Adapter and State Persistence

`@zerobotforge/telegram-adapter` provides an programmatic runtime adapter used by the monorepo's integration and unit architectures:

* **`TelegramClient`:** Validates the token on startup via `bot.telegram.getMe()`, calls `bot.telegram.deleteWebhook({ drop_pending_updates: false })`, and runs an explicit `while (this.active)` long-polling loop calling `bot.telegram.getUpdates(pollTimeoutSeconds, 100, nextOffset, ["message", "callback_query"])`. Advancing `nextOffset = Math.max(nextOffset, update.update_id + 1)` occurs in a `finally` block only after the update handler settles. Rate limits (`429` / `retry_after`) and transient network codes (`ECONNRESET`, `ETIMEDOUT`, etc.) trigger exponential backoff (`retryBaseMilliseconds * 2^attempt`, honouring `retry_after`), whereas `401` (`invalid_token`) and `409` (`conflict`) halt polling and transition the client to `state: "error"`. All error descriptions pass through `safeText()`, which redacts `/\b[0-9]{5,}:[A-Za-z0-9_-]{20,}\b/g`.
* **`ConversationStore`:** Persists `ConversationState` records as individual JSON files named `${sha256(projectId + "\0" + chatId)}.json`. Concurrent operations within the process are serialized per directory via `withDirectoryLock`, and writes use exclusive temporary files (`wx`, mode `0o600`) with `handle.sync()` and `rename`. If `get` or `listByProject` encounters malformed JSON or a record failing schema/identity checks, `quarantineUnlocked` moves the file into `<directory>/recovery/<hash>.corrupt-<timestamp>-<uuid>.json` and throws `ConversationStoreError("CORRUPT_RECORD")`.
* **`TelegramUpdateRouter`:** Serializes update handling through an internal promise queue (`operationQueue`), deduplicates updates where `update.updateId <= existing.lastUpdateId` (`status: "duplicate"`), resumes `waiting_for_input` conversations when a matching `button:<id>` or `choice:<id>` callback arrives, and commits the updated `ConversationState` to `ConversationStore` **before** dispatching outbound Telegram messages (`send_text`, `send_image`, `show_buttons`, `show_choices`) so redelivered updates cannot re-execute side effects.

### Electron Security Model, IPC Boundary, and Local Runtime Controller

In `apps/desktop/electron`:
* **Window & Content Security:** [`index.html`](apps/desktop/index.html) enforces a strict Content-Security-Policy (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:5173; object-src 'none'; base-uri 'self'; frame-src 'none'`). [`main.ts`](apps/desktop/electron/main.ts) denies all `setWindowOpenHandler` requests (opening `http:`/`https:` URLs externally via `shell.openExternal`), blocks unauthorized `will-navigate` events, and denies all session permission requests (`setPermissionRequestHandler`).
* **IPC Sender Verification:** [`secure-handler.ts`](apps/desktop/electron/ipc/secure-handler.ts) validates on every IPC invocation that `event.sender === mainWindow.webContents`, `event.senderFrame === event.sender.mainFrame` (rejecting iframes or subframes with `IPC_UNTRUSTED_FRAME`), and `isAllowedRendererUrl(frame.url)` is `true`. All exceptions are converted into `{ ok: false, error: { code, message } }` without leaking stack traces or host paths.
* **Preload Bridge:** [`preload.ts`](apps/desktop/electron/preload.ts) exposes a fixed `window.zeroBotForge` object (`projects`, `exports`, `system`, `telegram`, `runtime`) over `contextBridge.exposeInMainWorld` mapped to the 21 channel constants in [`channels.ts`](apps/desktop/electron/ipc/channels.ts).

--------------------------------------------------------------------------------

### Source Code Modules & Hierarchical Documentation Map

Because the ZeroBotForge repository contains over 120 source, template, style, and test files across multiple workspaces, the code-by-code engineering documentation is organized hierarchically inside the project's native directory structure.

#### 1. Root Configuration & Workspace Orchestration (`/`)

* **[package.json](package.json)**
  * **Role:** Monorepo Root Manifest and Script Orchestrator.
  * **Implementation:** Declares `"name": "zerobotforge"`, `"version": "0.1.0"`, `"private": true`, `"type": "module"`, `"packageManager": "npm@10.9.2"`, and `"engines": { "node": ">=22.12.0", "npm": ">=10.8.0" }`. Configures npm workspaces for `"apps/desktop"` and `"packages/*"`. Defines 14 lifecycle scripts (`dev`, `dev:ui`, `dev:electron`, `typecheck:packages`, `typecheck:ui`, `typecheck:electron`, `typecheck`, `build`, `build:ui`, `build:electron`, `package:desktop`, `test`, `test:watch`, `test:unit`, `test:integration`) and root `devDependencies` (`@types/node`, `concurrently`, `electron-builder`, `esbuild`, `typescript ~5.6.3`, `vitest ^3.2.4`, `wait-on`).

* **[tsconfig.base.json](tsconfig.base.json)**
  * **Role:** Shared TypeScript Compiler Baseline.
  * **Implementation:** Enforces `"target": "ES2022"`, `"useDefineForClassFields": true`, `"forceConsistentCasingInFileNames": true`, `"skipLibCheck": true`, `"strict": true`, `"noUnusedLocals": true`, `"noUnusedParameters": true`, and `"noFallthroughCasesInSwitch": true` across all extending workspaces.

* **[tsconfig.json](tsconfig.json)**
  * **Role:** Root TypeScript Project Reference File.
  * **Implementation:** Sets `"files": []` and references `./apps/desktop/tsconfig.json` for composite TypeScript builds.

* **[vite.config.ts](vite.config.ts)**
  * **Role:** Root Vitest Test Runner Configuration.
  * **Implementation:** Uses `defineConfig` from `vitest/config` to include test files matching `tests/**/*.test.{ts,tsx}`, `packages/**/*.test.{ts,tsx}`, and `apps/desktop/tests/**/*.test.{ts,tsx}`. Runs in the `node` environment with `clearMocks: true`, `restoreMocks: true`, `mockReset: true`, and `passWithNoTests: true`.

* **[electron-builder.yml](electron-builder.yml)**
  * **Role:** Desktop Packaging and Installer Specification.
  * **Implementation:** Sets `appId: com.zerobotforge.desktop`, `productName: ZeroBotForge`, and `artifactName: "${productName}-${version}-${os}-${arch}.${ext}"`. Points `directories.app` to `apps/desktop`, `buildResources` to `apps/desktop/assets`, and `output` to `release/${version}`. Packages `dist/**/*`, `dist-electron/**/*`, and `package.json` into an `asar: true` archive while excluding TypeScript source and config files (`!src/**/*`, `!electron/**/*.ts`, `!vite.config.ts`, `!tsconfig*.json`). Configures `win` (`nsis` target for `x64`, `oneClick: false`, `perMachine: false`, `allowToChangeInstallationDirectory: true`, desktop and start menu shortcuts), `mac` (`dmg`), and `linux` (`AppImage`).

* **[.env.example](.env.example)**
  * **Role:** Non-Secret Environment Configuration Template.
  * **Implementation:** Documents `VITE_APP_NAME=ZeroBotForge`, `ZEROBOTFORGE_LOG_LEVEL=info`, and `ZEROBOTFORGE_DATA_DIR=`, explicitly warning against placing real Telegram bot tokens in `.env` or `VITE_*` variables exposed to the renderer bundle.

* **[.gitignore](.gitignore)**
  * **Role:** Version Control Exclusion Rules.
  * **Implementation:** Excludes `node_modules/`, build outputs (`**/dist/`, `**/dist-electron/`, `release/`, `build/`, `coverage/`), `*.tsbuildinfo`, logs, `.env` and `.env.*` (while keeping `!.env.example`), local runtime data (`.zerobotforge/`, `*.local`), OS metadata files, IDE directories (keeping `.vscode/extensions.json` and `.vscode/settings.example.json`), and Electron Builder artifacts (`artifacts/`, `*.blockmap`, `*.AppImage`).

* **[LICENSE](LICENSE)**
  * **Role:** Software License.
  * **Implementation:** Standard MIT License (`Copyright (c) 2026 ZeroBotForge contributors`).

---

#### 2. Hierarchical Sub-Directory Documentation (`README.md` Index)

Click any directory link below to navigate to its dedicated `README.md`, which dissects every source file, class, function, and component inside that layer:

* **[`apps/desktop/` — Electron & React Desktop Studio Application](apps/desktop/README.md)**
  * **Scope:** Workspace manifest (`@zerobotforge/desktop`), Vite renderer server configuration (`127.0.0.1:5173`), composite TypeScript configurations (`tsconfig.app.json`, `tsconfig.electron.json`, `tsconfig.node.json`), Content-Security-Policy HTML entry (`index.html`), and architectural links to the three desktop sub-layers:
  * **[`apps/desktop/electron/` — Electron Main Process, Preload, IPC & Native Services](apps/desktop/electron/README.md)**
    * Dissects `main.ts`, `preload.ts`, `errors.ts`, all 8 IPC modules in `electron/ipc/` (`channels.ts`, `secure-handler.ts`, `project.ipc.ts`, `export.ipc.ts`, `generated-project-export.ipc.ts`, `system.ipc.ts`, `telegram.ipc.ts`, `runtime.ipc.ts`), and all 4 native services in `electron/services/` (`file-system.service.ts`, `app-settings.service.ts`, `secure-storage.service.ts`, `bot-runtime.service.ts`).
  * **[`apps/desktop/src/` — React Renderer Core, Pages, Stores, Services, Hooks & Styles](apps/desktop/src/README.md)**
    * Dissects `main.tsx`, `App.tsx`, `styles.css`, `vite-env.d.ts`, all 6 workspace pages in `src/pages/` (`DashboardPage.tsx`, `BotBuilderPage.tsx`, `RunPage.tsx`, `ConversationsPage.tsx`, `AnalyticsPage.tsx`, `SettingsPage.tsx`), all 5 renderer services in `src/services/` (`project.service.ts`, `flow.service.ts`, `preview.service.ts`, `export.service.ts`, `telegram.service.ts`), all 3 external stores in `src/store/` (`app.store.ts`, `flow.store.ts`, `project.store.ts`), all 3 React hooks in `src/hooks/` (`useProject.ts`, `useFlow.ts`, `useNotifications.ts`), all 7 modular CSS stylesheets in `src/styles/`, and all TypeScript IPC contracts in `src/types/` (`electron-api.ts`, `electron.d.ts`), plus links to:
    * **[`apps/desktop/src/components/` — UI Layout, Visual Flow Canvas, Node Cards & Chat Preview Components](apps/desktop/src/components/README.md)**
      * Dissects all 23 component files across `common/` (`Modal.tsx`, `ConfirmDialog.tsx`, `EmptyState.tsx`, `Notification.tsx`), `layout/` (`AppLayout.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `StatusBar.tsx`), `flow/` (`flow-editor.model.ts`, `FlowCanvas.tsx`, `ConnectionLayer.tsx`, `FlowNode.tsx`, `FlowToolbar.tsx`, `NodePalette.tsx`, `NodeEditor.tsx`), `nodes/` (`StartNode.tsx`, `TextNode.tsx`, `ImageNode.tsx`, `ButtonNode.tsx`, `ChoiceNode.tsx`, `ActionNode.tsx`), and `preview/` (`ChatPreview.tsx`, `PreviewControls.tsx`).
    * **[`apps/desktop/src/features/` — Domain Feature Modules (Projects, Bot, Settings, Conversations, Analytics)](apps/desktop/src/features/README.md)**
      * Dissects all 14 feature modules across `projects/` (`ProjectList.tsx`, `CreateProjectDialog.tsx`, `useProjects.ts`), `bot/` (`BotSettings.tsx`, `BotTokenSettings.tsx`, `BotConnectionStatus.tsx`, `ProjectBotSettingsPanel.tsx`), `settings/` (`AppearanceSettings.tsx`, `GeneralSettings.tsx`, `ExportSettings.tsx`), `conversations/` (`ConversationList.tsx`, `ConversationDetails.tsx`), and `analytics/` (`AnalyticsOverview.tsx`, `AnalyticsCharts.tsx`).
  * **[`apps/desktop/tests/` — Desktop Service, IPC Security, and Store Test Suites](apps/desktop/tests/README.md)**
    * Dissects all 5 desktop test suites (`app-settings.service.test.ts`, `file-system.service.test.ts`, `flow-editor.model.test.ts`, `ipc-security.test.ts`, `phase08-store-services.test.ts`).

* **[`packages/` — Core Domain & Engine Monorepo Packages](packages/README.md)**
  * **Scope:** Shared package TypeScript configuration (`packages/tsconfig.json`), inter-package dependency graph, and links to each package's code-by-code documentation:
  * **[`packages/shared/` — `@zerobotforge/shared`](packages/shared/README.md)**
    * Dissects `package.json`, `constants.ts`, `types.ts`, `errors.ts`, and `validators.ts`.
  * **[`packages/project-format/` — `@zerobotforge/project-format`](packages/project-format/README.md)**
    * Dissects `package.json`, `project.model.ts`, `project.schema.ts`, `project.migrations.ts`, `project.serialization.ts`, and `project.serialization.test.ts`.
  * **[`packages/flow-engine/` — `@zerobotforge/flow-engine`](packages/flow-engine/README.md)**
    * Dissects `package.json`, `flow.model.ts`, `node-registry.ts`, `flow-graph.ts`, `flow-validator.ts`, `flow-executor.ts`, `flow-engine.test.ts`, and all 7 node definitions in `src/nodes/` (`start.node.ts`, `text.node.ts`, `image.node.ts`, `button.node.ts`, `choice.node.ts`, `menu.node.ts`, `action.node.ts`).
  * **[`packages/code-generator/` — `@zerobotforge/code-generator`](packages/code-generator/README.md)**
    * Dissects `package.json`, `generator.ts`, `generator-context.ts`, `template-loader.ts`, `output-assembler.ts`, `generator.test.ts`, and all 6 code generation templates in `src/templates/` (`package.json.tpl`, `tsconfig.json.tpl`, `env.example.tpl`, `bot.ts.tpl`, `handlers.ts.tpl`, `README.md.tpl`).
  * **[`packages/telegram-adapter/` — `@zerobotforge/telegram-adapter`](packages/telegram-adapter/README.md)**
    * Dissects `package.json`, `types.ts`, `telegram-client.ts`, `bot-manager.ts`, `conversation-store.ts`, `update-router.ts`, and `telegram-adapter.test.ts`.

* **[`tests/` — Repository-Wide Unit & Integration Test Suites and Fixtures](tests/README.md)**
  * **Scope:** Dissects the reference JSON fixtures in `tests/fixtures/` (`sample-flow.json`, `sample-project.json`), the 3 cross-package integration test suites in `tests/integration/` (`export-project.test.ts`, `project-storage.test.ts`, `telegram-adapter.test.ts`), and the 4 unit test suites in `tests/unit/` (`code-generator.test.ts`, `flow-engine.test.ts`, `flow-validator.test.ts`, `project-format.test.ts`).

---

#### 3. Verification and Test Suite Inventory

The repository includes 16 Vitest test suites containing 96 test cases across `tests/unit/`, `tests/integration/`, `packages/*/src/`, and `apps/desktop/tests/`:

<table>
  <thead>
    <tr>
      <th align="left">Test Suite Path</th>
      <th align="left">Layer / Scope</th>
      <th align="right">Tests (<code>it</code>)</th>
    </tr>
  </thead>
  <tbody>
    <tr><td><code>tests/unit/code-generator.test.ts</code></td><td>7-file manifest generation, <code>project.generation</code> transfer, untrusted node text isolation &amp; TS transpilation, token leak rejection</td><td align="right">4</td></tr>
    <tr><td><code>tests/unit/flow-engine.test.ts</code></td><td><code>sample-flow.json</code> pause at button prompt, action success/failure branch routing, image branch, invalid optionId failure, cyclic graph step limit</td><td align="right">6</td></tr>
    <tr><td><code>tests/unit/flow-validator.test.ts</code></td><td><code>sample-flow.json</code> validation, missing/multiple start nodes, duplicate node/edge IDs, broken endpoints/ports, invalid image URL &amp; unconnected button ports</td><td align="right">5</td></tr>
    <tr><td><code>tests/unit/project-format.test.ts</code></td><td><code>sample-project.json</code> round-trip, strict schema rejection of unknown keys, legacy v0 migration, invalid JSON/version errors, semantic validation</td><td align="right">5</td></tr>
    <tr><td><code>tests/integration/export-project.test.ts</code></td><td>Temporary directory atomic write of 7-file manifest, Telegraf dependency check, TS transpilation of generated <code>bot.ts</code>/<code>handlers.ts</code>, invalid graph refusal</td><td align="right">2</td></tr>
    <tr><td><code>tests/integration/project-storage.test.ts</code></td><td><code>ProjectFileSystemService</code> create/save/reopen/update lifecycle on disk, v0 file migration on read, missing/extension/corrupt/oversized file errors</td><td align="right">3</td></tr>
    <tr><td><code>tests/integration/telegram-adapter.test.ts</code></td><td>Multi-turn <code>/start</code> and <code>callback_query</code> routing with <code>MockTelegramClient</code> and <code>ConversationStore</code>, corrupt state quarantine, token redaction</td><td align="right">2</td></tr>
    <tr><td><code>packages/code-generator/src/generator.test.ts</code></td><td>Empty flow rejection, non-project rejection, fixed manifest check, blank token placeholder, markdown/source injection escaping, token pattern rejection, unsupported node rejection, TS syntax verification, npm manifest dependencies</td><td align="right">9</td></tr>
    <tr><td><code>packages/flow-engine/src/flow-engine.test.ts</code></td><td><code>validateFlow</code> rules, <code>FlowGraph</code> reachability, <code>executeFlow</code> text/button pause &amp; resume, step budget termination, allowlisted vs unregistered <code>FlowActionRegistry</code></td><td align="right">13</td></tr>
    <tr><td><code>packages/project-format/src/project.serialization.test.ts</code></td><td><code>ProjectDocumentSchema</code> validation, JSON serialization round-trip, invalid serialization rejection, malformed JSON error codes, v0 migration, semantic dangling edge detection</td><td align="right">9</td></tr>
    <tr><td><code>packages/telegram-adapter/src/telegram-adapter.test.ts</code></td><td><code>normalizeTelegramUpdate</code>, <code>mapTelegramError</code> (401, 429, 409, network, token redaction), <code>ConversationStore</code> persistence/concurrency/quarantine, <code>TelegramUpdateRouter</code> routing/deduplication, <code>TelegramBotManager</code> idempotency</td><td align="right">14</td></tr>
    <tr><td><code>apps/desktop/tests/app-settings.service.test.ts</code></td><td><code>AppSettingsService</code> defaults, persistence across instances, invalid interval rejection (<code>SETTINGS_INVALID</code>), preservation of malformed <code>settings.json</code></td><td align="right">4</td></tr>
    <tr><td><code>apps/desktop/tests/file-system.service.test.ts</code></td><td><code>ProjectFileSystemService</code> read/write round-trip, invalid extension rejection (<code>.exe</code>), malformed JSON preservation, <code>MAX_PROJECT_FILE_BYTES</code> enforcement, invalid data pre-write rejection</td><td align="right">5</td></tr>
    <tr><td><code>apps/desktop/tests/flow-editor.model.test.ts</code></td><td><code>createEmptyEditorFlow</code> validity, incomplete image node detection, DTO round-trip of node positions and edge handles</td><td align="right">3</td></tr>
    <tr><td><code>apps/desktop/tests/ipc-security.test.ts</code></td><td><code>isAllowedRendererUrl</code> in dev (<code>http://127.0.0.1:5173/</code>) and packaged mode (<code>dist/index.html</code>), look-alike origin rejection, <code>assertTrustedIpcSender</code> main-frame vs iframe enforcement</td><td align="right">5</td></tr>
    <tr><td><code>apps/desktop/tests/phase08-store-services.test.ts</code></td><td><code>flow.service</code> node/edge creation &amp; duplicate port rejection, <code>generateProjectFiles</code> manifest, <code>runFlowPreview</code> execution/error/resume, <code>project.store</code> and <code>flow.store</code> dirty state tracking</td><td align="right">7</td></tr>
    <tr><td><b>Total</b></td><td>16 test suites across root, packages, and desktop workspaces</td><td align="right"><b>96</b></td></tr>
  </tbody>
</table>

--------------------------------------------------------------------------------

## Current Status

This is version `0.1.0` of ZeroBotForge. The following components are implemented and functional in the source tree:

* **Visual Flow Builder (`BotBuilderPage`):** Interactive canvas with pointer-captured node dragging, SVG cubic Bezier edge rendering, port-to-port connection creation, node palette with cardinality locks for `start` and `menu` nodes, property inspector (`NodeEditor`) with color swatches and menu row layout presets, and real-time `validateFlow` diagnostics.
* **In-Studio Local Conversation Preview (`ChatPreview`):** Executes flows locally through `runFlowPreview` (`@zerobotforge/flow-engine`), supporting multi-step progression, inline button/choice selection, persistent bottom menu rendering, and step-count reporting without requiring a Telegram connection.
* **Project Storage & Format Lifecycle:** Creation, opening, saving, Save-As, and JSON export of `.zbf` and `.json` files via native Electron dialogs and `atomicWriteFile`, with schema validation and automatic `formatVersion: 0 -> 1` migration.
* **OS-Encrypted Credential Management (`SecureStorageService`):** Encryption and decryption of the Telegram BotFather token via Electron `safeStorage`, live connection testing against `https://api.telegram.org/bot<token>/getMe`, and automatic synchronization to `.env` in generated bot directories.
* **Standalone TypeScript Bot Code Generator (`@zerobotforge/code-generator`):** In-memory rendering and atomic disk export (plus in-place update and safe directory deletion) of complete 7-file Node.js/TypeScript Telegraf bot projects.
* **GUI-Driven Local Bot Compiler & Process Runner (`RunPage` & `BotRuntimeService`):** Background execution of `npm install && npm run build`, verification of `dist/bot.js`, child-process execution of `node dist/bot.js`, live Telegram status probing, and a 400-line token-redacted terminal log viewer.
* **Programmatic Telegram Adapter (`@zerobotforge/telegram-adapter`):** Standalone package providing `TelegramClient`, `TelegramBotManager`, `ConversationStore`, and `TelegramUpdateRouter` with 14 unit tests and 2 integration tests.

--------------------------------------------------------------------------------

## Assumptions & Limitations

This is an initial version (`0.1.0`). Review the following code-verified limitations and architectural assumptions before deploying generated bots or extending the studio:

1. **Conversations and Analytics Pages Are Unconnected UI Shells:** In [`ConversationsPage.tsx`](apps/desktop/src/pages/ConversationsPage.tsx) and [`AnalyticsPage.tsx`](apps/desktop/src/pages/AnalyticsPage.tsx), the data state is hardcoded to `const sourceState = "unavailable" as const` and `const dataState = "unavailable" as const` with empty arrays (`conversations = []`, `metrics = []`, `data = []`). While the UI components (`ConversationList`, `ConversationDetails`, `AnalyticsOverview`, `AnalyticsCharts`) implement rendering logic for `loading`, `ready`, `empty`, `unavailable`, and `error` states, no IPC channel or persistent event database is wired to feed live bot conversation history or telemetry into these two pages.
2. **"Publish bot" Button in Bot Builder Is Not Connected:** In [`BotBuilderPage.tsx`](apps/desktop/src/pages/BotBuilderPage.tsx), clicking the **Publish bot** button triggers an informational notification (`"Publishing is not connected — This phase implements visual flow editing and project persistence; Telegram publishing is not part of the current runtime flow."`). Actual bot compilation and execution are performed in the **Dashboard** and **Run** pages.
3. **Unregistered Node Types (`condition`, `input`, `end`):** [`constants.ts`](packages/shared/src/constants.ts) defines 10 node types in `NODE_TYPE_VALUES` (`start`, `text`, `image`, `button`, `choice`, `menu`, `action`, `condition`, `input`, `end`), and `ProjectDocumentSchema` accepts all 10 in structural parsing. However, only the first 7 are registered in `DEFAULT_NODE_REGISTRY` ([`node-registry.ts`](packages/flow-engine/src/node-registry.ts)) and supported by `GENERATOR_SUPPORTED_NODE_TYPES` ([`generator.ts`](packages/code-generator/src/generator.ts)). Any flow containing `condition`, `input`, or `end` nodes fails flow validation (`FLOW_NODE_TYPE_UNREGISTERED`) and is rejected during code generation.
4. **Autosave and Reopen-Last-Project Settings Are Persisted Only as Preferences:** [`GeneralSettings.tsx`](apps/desktop/src/features/settings/GeneralSettings.tsx) and [`AppSettingsService`](apps/desktop/electron/services/app-settings.service.ts) validate and persist `autoSaveEnabled`, `autoSaveIntervalSeconds` (`15`, `30`, `60`, `120`), and `reopenLastProject` inside `settings.json`. However, `App.tsx` only reads `settings.theme` on startup; no interval timer for automatic project saving or startup hook for reopening the last file path is currently active in the renderer or main process.
5. **Dual Runtime Implementations (`@zerobotforge/telegram-adapter` vs Generated `src/handlers.ts`):** The monorepo contains `@zerobotforge/telegram-adapter` (which uses `ConversationStore` on disk and `@zerobotforge/flow-engine`), while exported standalone projects use the self-contained template [`handlers.ts.tpl`](packages/code-generator/src/templates/handlers.ts.tpl) so that exported projects have zero dependencies on private `@zerobotforge/*` workspace packages. Consequently:
   * Generated standalone bots store pending button/choice callback states in an in-memory `Map` (`const pendingSelections = new Map<string, PendingSelection>()`). Restarting the generated bot process clears pending inline keyboard selections.
   * `@zerobotforge/telegram-adapter` handles `send_text`, `send_image`, `show_buttons`, and `show_choices` events in `TelegramUpdateRouter.dispatchEvents`, whereas `show_menu` (persistent reply keyboards) and `defaultJsonActionHandler` (HTTP/Webhook/variable interpolation) are implemented in the generated `handlers.ts.tpl` and local `flow-executor.ts`.
6. **README Template Note vs `handlers.ts.tpl` Action Behavior:** The exported [`README.md.tpl`](packages/code-generator/src/templates/README.md.tpl) states that until a trusted operation registry is implemented, an action node reports that it is unregistered and follows its failure connection. In the actual [`handlers.ts.tpl`](packages/code-generator/src/templates/handlers.ts.tpl) implementation, `registerProjectHandlers` automatically registers `defaultJsonActionHandler` for every `action` node in the project, which executes JSON-configured variable assignments, messages, and `fetch` HTTP/HTTPS requests and routes to `"success"` unless an error or explicit failure status occurs.
7. **Single Active Flow Execution in Generated Bots:** While a `ProjectDocument` can store multiple flows in `project.flows[]`, both `TelegramUpdateRouter.chooseInitialFlow()` and `registerProjectHandlers()` in `handlers.ts.tpl` bind `/start` and `menu` text matching exclusively to `activeFlowId` (or `flows[0]`). Cross-flow jumping is not implemented.
8. **Single-Token Global Storage:** `SecureStorageService` stores one encrypted token in `<userData>/secrets.json`. Switching between different bot projects shares the same stored desktop token unless the user updates the token in **Settings -> Bot & Telegram integration**.
9. **Linux Credential Store Requirement:** On Linux, `SecureStorageService.assertEncryptionAvailable()` checks `safeStorage.getSelectedStorageBackend()` and throws `SECURE_STORAGE_BACKEND_UNSAFE` if the backend is `"basic_text"` or `"unknown"`. A system keyring (such as `gnome-libsecret` or `kwallet`) must be active on Linux to save tokens.
10. **Host Tooling Dependency for Local Compile & Run:** `BotRuntimeService.compile()` and `BotRuntimeService.start()` spawn `npm` (via `cmd.exe` or `sh`) and `node` from the host operating system's `PATH`. Even when running the packaged ZeroBotForge desktop executable, the host machine must have Node.js (`>=22.0.0`) and `npm` installed and accessible in `PATH` to compile and run generated bots.
11. **Single-Window Active Project Path State:** `project.ipc.ts` tracks `let activeProjectPath: string | null = null` at the module level in the Electron main process for a single primary `BrowserWindow`. Multi-window editing is not supported.
12. **Static Sidebar Chrome Elements:** In [`Sidebar.tsx`](apps/desktop/src/components/layout/Sidebar.tsx) and [`Topbar.tsx`](apps/desktop/src/components/layout/Topbar.tsx), UI elements such as the workspace switcher (`"Workspace" / "Free plan"`), default conversation badge (`conversationCount = 4`), user profile (`"User" / "Workspace Owner"`), and `"Log out"` button (which navigates back to `"Dashboard"`) are static interface chrome; ZeroBotForge is a local desktop application with no cloud account or authentication system.

--------------------------------------------------------------------------------

## Usage / Requirements

### Runtime Requirements

* **Node.js:** `>=22.12.0` (enforced in root [`package.json`](package.json)).
* **Package Manager:** `npm >=10.8.0` (`npm@10.9.2` configured in `packageManager`).
* **Operating System:** Windows (`x64` NSIS target configured), macOS (`dmg` target configured), or Linux (`AppImage` target configured; requires a secret-service/kwallet backend for `safeStorage`).
* **Network Access:** Outbound HTTPS access to `https://api.telegram.org` for token verification and bot long-polling, and to the npm registry when compiling generated bot projects via `BotRuntimeService`.

### Dependencies (Across Workspaces)

* **Root (`package.json`):**
  * Development: `@types/node ^22.15.30`, `concurrently ^9.1.2`, `electron-builder ^26.0.0`, `esbuild ^0.25.0`, `typescript ~5.6.3`, `vitest ^3.2.4`, `wait-on ^8.0.3`.
* **Desktop Application (`apps/desktop/package.json`):**
  * Runtime: `react 18.3.1`, `react-dom 18.3.1`, `lucide-react 0.468.0`, `@zerobotforge/flow-engine 0.1.0`, `@zerobotforge/code-generator 0.1.0`.
  * Development: `electron 44.7.0`, `vite 6.0.5`, `@vitejs/plugin-react 4.3.4`, `esbuild ^0.25.0`, `@types/react 18.3.12`, `@types/react-dom 18.3.1`, `@zerobotforge/project-format 0.1.0`.
* **Core Packages (`packages/*/package.json`):**
  * `@zerobotforge/shared`: `zod ^3.24.1`.
  * `@zerobotforge/project-format`: `@zerobotforge/shared 0.1.0`, `zod ^3.24.1`.
  * `@zerobotforge/flow-engine`: `@zerobotforge/shared 0.1.0`, `zod ^3.24.1`.
  * `@zerobotforge/code-generator`: `@zerobotforge/shared 0.1.0`, `@zerobotforge/project-format 0.1.0`, `@zerobotforge/flow-engine 0.1.0`.
  * `@zerobotforge/telegram-adapter`: `@zerobotforge/shared 0.1.0`, `@zerobotforge/flow-engine 0.1.0`, `telegraf ^4.16.3`.
* **Generated Standalone Bot Projects (`package.json.tpl`):**
  * Runtime: `dotenv ^16.4.7`, `telegraf ^4.16.3`.
  * Development: `@types/node ^22.10.2`, `tsx ^4.19.2`, `typescript ^5.7.2`.

### Compilation, Development & Packaging Instructions

1. **Clone the repository:**
```bash
git clone https://github.com/Z-E-7-0-7-R-O/ZeroBotForge
cd ZeroBotForge
```

2. **Install all workspace dependencies from the root directory:**
```bash
npm install
```

3. **Run full static typechecking (packages, React UI, and Electron main/preload):**
```bash
npm run typecheck
```

4. **Run the Vitest test suites (unit, integration, package, and desktop tests):**
```bash
npm test
```
To run only unit or integration suites in `tests/`:
```bash
npm run test:unit
npm run test:integration
```

5. **Launch the desktop studio in development mode:**
Starts the Vite dev server on `http://127.0.0.1:5173`, waits for readiness via `wait-on`, bundles `electron/main.ts` and `electron/preload.ts` into `apps/desktop/dist-electron/*.cjs` using `esbuild`, and launches Electron:
```bash
npm run dev
```

6. **Build production bundles and package a distributable desktop installer:**
```bash
npm run build
npm run package:desktop
```
Packaged artifacts are written to `release/0.1.0/` (for example, `ZeroBotForge-0.1.0-win-x64.exe`).

### Workspace Scripts Reference (`package.json`)

| Script | Command Executed | Description |
|---|---|---|
| `npm run dev` | `concurrently -k -n UI,Electron "npm:dev:ui" "npm:dev:electron"` | Runs the Vite renderer dev server and Electron shell concurrently. |
| `npm run dev:ui` | `npm --workspace @zerobotforge/desktop run dev` | Starts Vite on `http://127.0.0.1:5173` (`strictPort: true`). |
| `npm run dev:electron` | `wait-on http://127.0.0.1:5173 && npm run build:electron && npm --workspace @zerobotforge/desktop run start:electron` | Waits for Vite, compiles Electron entry points to `.cjs`, and launches Electron. |
| `npm run typecheck` | `npm run typecheck:packages && npm run typecheck:ui && npm run typecheck:electron` | Runs TypeScript typechecking across all workspaces without emitting files. |
| `npm run build` | `npm run typecheck && npm run build:ui && npm run build:electron` | Typechecks and builds both the React renderer (`dist/`) and Electron (`dist-electron/`). |
| `npm run package:desktop` | `npm run build && electron-builder --config electron-builder.yml` | Builds the application and produces platform installers in `release/${version}`. |
| `npm test` | `vitest run --passWithNoTests` | Executes all 16 test suites across the monorepo. |
| `npm run test:unit` | `vitest run tests/unit` | Runs the 4 root unit test suites. |
| `npm run test:integration` | `vitest run tests/integration` | Runs the 3 root integration test suites. |

--------------------------------------------------------------------------------

## License

Released under the MIT License. See the [LICENSE](LICENSE) file for full license text.

--------------------------------------------------------------------------------
