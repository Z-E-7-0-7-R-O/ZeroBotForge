<h1 align="center">
  <code>tests/</code> — Repository-Wide Unit &amp; Integration Test Suites and Fixtures
</h1>

<div align="center">
<i>Reference JSON fixtures, cross-workspace integration test suites, and package-level unit verification suites.</i>
<br><br>
<b>Parent Documentation:</b> <a href="../README.md">Root README.md</a>
</div>

--------------------------------------------------------------------------------

## Overview

The root `tests/` directory contains the canonical reference fixtures (`tests/fixtures/`), cross-package integration tests (`tests/integration/`), and root unit test suites (`tests/unit/`) executed by Vitest (`npm test`, `npm run test:unit`, `npm run test:integration`).

--------------------------------------------------------------------------------

## Source Code & Fixture Modules

### 1. Reference Fixtures (`fixtures/`)

* **[fixtures/sample-flow.json](fixtures/sample-flow.json)**
  * **Role:** Multi-Step Customer Support Reference Flow Fixture.
  * **Implementation:** Defines flow `"flow-customer-support"` containing 7 nodes (`node-start`, `node-welcome-text`, `node-topic-buttons` with `"status"` and `"guide"` buttons, `node-status-action` invoking `"lookup_service_status"`, `node-status-ok`, `node-status-degraded`, and `node-guide-image`) and 6 directed edges exercising `next`, `button:status`, `button:guide`, `success`, and `failure` handles.

* **[fixtures/sample-project.json](fixtures/sample-project.json)**
  * **Role:** Complete Reference `zerobotforge.project` (`formatVersion: 1`) Document Fixture.
  * **Implementation:** Defines project `"project-support-assistant"` (`"ZeroBotForge Support Assistant"`), bot configuration (`displayName: "Support Assistant Bot"`, `username: "zbf_support_bot"`, `tokenEnvVar: "TELEGRAM_BOT_TOKEN"`, `parseMode: "Markdown"`), a 5-node customer support flow, `activeFlowId: "flow-customer-support"`, and TypeScript/Node 22/ESM/npm generation settings.

---

### 2. Cross-Package Integration Tests (`integration/`)

* **[integration/export-project.test.ts](integration/export-project.test.ts)**
  * **Role:** End-to-End Standalone Bot Export and TypeScript Compilation Integration Suite (2 tests).
  * **Implementation:**
    * Deserializes `sample-project.json`, generates the 7-file manifest via `generateProjectFiles`, writes all files to an OS temporary directory using `atomicWriteFile` from `apps/desktop/electron/services/file-system.service.ts`, verifies file sizes and `package.json` dependencies (`telegraf`), verifies `.env.example` and `project.json` round-tripping, and compiles both `src/bot.ts` and `src/handlers.ts` with `typescript.transpileModule` to confirm zero compiler errors.
    * Verifies that `generateProjectFiles` refuses to export a project whose flow is missing its `start` node.

* **[integration/project-storage.test.ts](integration/project-storage.test.ts)**
  * **Role:** Project Disk Storage Lifecycle, Legacy Migration, and I/O Error Integration Suite (3 tests).
  * **Implementation:**
    * Exercises `ProjectFileSystemService` across creating, saving, reopening, updating (`packageManager: "pnpm"`), and reloading `support-assistant.zbf` on disk.
    * Writes a legacy `formatVersion: 0` JSON file to disk, verifies `readProject` migrates it to `formatVersion: 1` with `tokenEnvVar: "TELEGRAM_BOT_TOKEN"`, and verifies `writeProject` persists `formatVersion: 1`.
    * Verifies error codes for missing files (`PROJECT_FILE_READ_FAILED`), disallowed extensions (`bad.txt` -> `PROJECT_FILE_EXTENSION_INVALID`), corrupt JSON (`PROJECT_JSON_INVALID`), and files exceeding `MAX_PROJECT_FILE_BYTES` (`PROJECT_FILE_TOO_LARGE`).

* **[integration/telegram-adapter.test.ts](integration/telegram-adapter.test.ts)**
  * **Role:** Multi-Turn Telegram Update Routing and State Persistence Integration Suite (2 tests).
  * **Implementation:**
    * Loads `sample-project.json` into `TelegramUpdateRouter` and `TelegramBotManager` backed by a disk `ConversationStore` and `MockTelegramClient`. Dispatches `/start` (`updateId: 501`), verifies welcome message and inline keyboard emission, inspects the persisted `waiting_for_input` state on disk, dispatches `callback_query` `"button:guide"` (`updateId: 502`), verifies callback acknowledgement and photo delivery, and confirms final `completed` state on disk.
    * Corrupts an on-disk conversation JSON file, verifies `store.get` throws `ConversationStoreError` and moves the file to `recovery/`, and verifies `mapTelegramError` redacts leaked bot tokens from error messages.

---

### 3. Root Unit Tests (`unit/`)

* **[unit/code-generator.test.ts](unit/code-generator.test.ts)**
  * **Role:** Code Generator Manifest, Settings Transfer, Escaping, and Security Unit Suite (4 tests).
  * **Implementation:** Verifies complete 7-file manifest generation from `sample-project.json` with zero unresolved `{{...}}` placeholders; verifies transfer of `pnpm`, `commonjs`, `nodeVersion: 24`, and `strict: false` into generated files; verifies isolation of untrusted payload `'Welcome `user` ${process.exit(1)} "; import "fs"; //'` inside `project.json` with clean TypeScript transpilation of `src/bot.ts` and `src/handlers.ts`; and verifies rejection of flowless projects and embedded Telegram token patterns.

* **[unit/flow-engine.test.ts](unit/flow-engine.test.ts)**
  * **Role:** Flow Engine Execution, Action Branching, Resumption, and Step-Budget Unit Suite (6 tests).
  * **Implementation:** Verifies `sample-flow.json` reachability and suspension at `node-topic-buttons`; resumption along the registered `lookup_service_status` action `success` branch; routing to the action `failure` branch when the handler throws; resumption along the `guide` image branch (`send_image`); clean failure on unknown `optionId`; and deterministic termination of cyclic graphs (`step_limit_exceeded`, `FLOW_STEP_LIMIT_EXCEEDED`) at `maxSteps: 5`.

* **[unit/flow-validator.test.ts](unit/flow-validator.test.ts)**
  * **Role:** Flow Validator Rules and Diagnostic Codes Unit Suite (5 tests).
  * **Implementation:** Verifies `sample-flow.json` passes without issues; rejects missing or multiple `start` nodes (`FLOW_START_NODE_MISSING`, `FLOW_MULTIPLE_START_NODES`); rejects duplicate node and edge IDs (`FLOW_DUPLICATE_NODE_ID`, `FLOW_DUPLICATE_EDGE_ID`); rejects broken edge endpoints and invalid port handles (`FLOW_EDGE_SOURCE_NOT_FOUND`, `FLOW_EDGE_TARGET_NOT_FOUND`, `FLOW_SOURCE_PORT_INVALID`, `FLOW_TARGET_PORT_INVALID`); and rejects invalid `ftp://` image URLs (`FLOW_NODE_CONFIG_INVALID`) and unconnected required button ports.

* **[unit/project-format.test.ts](unit/project-format.test.ts)**
  * **Role:** Project Format Schema, Migration, Serialization, and Semantics Unit Suite (5 tests).
  * **Implementation:** Verifies lossless round-tripping of `sample-project.json`; strict rejection of unknown properties (`uiEphemeralState`); `v0 -> v1` migration defaults; typed error codes for invalid JSON (`PROJECT_JSON_INVALID`) and unsupported `formatVersion: 42`; and `validateProjectSemantics` detection of missing `activeFlowId`, duplicate node IDs, and dangling edge targets.
