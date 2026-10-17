<h1 align="center">
  <code>apps/desktop/tests</code> — Desktop Services, IPC Security &amp; Store Test Suites
</h1>

<div align="center">
<i>Vitest unit and integration tests verifying Electron main-process services, IPC sender origin authentication, flow editor DTO adapters, and renderer services/stores.</i>
<br><br>
<b>Parent Documentation:</b> <a href="../README.md">apps/desktop/README.md</a> · <a href="../../../README.md">Root README.md</a>
</div>

--------------------------------------------------------------------------------

## Overview

`apps/desktop/tests/` contains five test suites (24 test cases) targeting the desktop workspace's Electron services, IPC security guards, editor model converters, and renderer stores.

--------------------------------------------------------------------------------

## Test Suite Modules

* **[app-settings.service.test.ts](app-settings.service.test.ts)**
  * **Role:** `AppSettingsService` Unit & Disk Persistence Tests (4 tests).
  * **Implementation:** Uses temporary directories (`mkdtemp`) to verify default settings when `settings.json` is absent, persistence and restoration across service instances, rejection of unsupported `autoSaveIntervalSeconds: 7` (`SETTINGS_INVALID`), and non-destructive error reporting (`SETTINGS_FILE_INVALID`) when `settings.json` contains malformed JSON.

* **[file-system.service.test.ts](file-system.service.test.ts)**
  * **Role:** `ProjectFileSystemService` Validation and Disk I/O Tests (5 tests).
  * **Implementation:** Verifies lossless write/read round-tripping of `.zbf` files, rejection of unsupported `.exe` file extensions (`PROJECT_FILE_EXTENSION_INVALID`), preservation of malformed JSON files on disk (`PROJECT_JSON_INVALID`), rejection of files exceeding `MAX_PROJECT_FILE_BYTES` (`10 MB + 1 byte`, `PROJECT_FILE_TOO_LARGE`), and pre-write rejection of invalid project documents (`PROJECT_SERIALIZATION_FAILED`).

* **[flow-editor.model.test.ts](flow-editor.model.test.ts)**
  * **Role:** Editor DTO Adapter and Default Node Data Tests (3 tests).
  * **Implementation:** Verifies that `createEmptyEditorFlow()` produces a valid flow with one `start` node, that `createDefaultNodeData("image")` is flagged by `validateFlow` (`FLOW_NODE_CONFIG_INVALID`) until a valid URL is entered, and that node coordinates and edge handles round-trip cleanly through `toProjectFlow` and `toEngineFlow`.

* **[ipc-security.test.ts](ipc-security.test.ts)**
  * **Role:** Electron IPC Origin and Frame Security Tests (5 tests).
  * **Implementation:** Mocks `electron` via `vi.hoisted` to verify `isAllowedRendererUrl` accepts `http://127.0.0.1:5173/` in development, rejects `https://example.com/`, `http://localhost:5173/`, and `http://127.0.0.1:5174/`, accepts only the packaged `dist/index.html` `file://` URL when `app.isPackaged === true`, and verifies `assertTrustedIpcSender` accepts main-frame requests while throwing `DesktopApplicationError` on requests originating from an embedded iframe.

* **[phase08-store-services.test.ts](phase08-store-services.test.ts)**
  * **Role:** Renderer Flow Service, Code Export, Local Preview, and Store Tests (7 tests).
  * **Implementation:** Verifies `flow.service` node creation and duplicate output port connection rejection, `generateProjectFiles` 7-file manifest generation with custom `ZBF_CUSTOM_TOKEN`, `runFlowPreview` execution of valid flows, error reporting on invalid flows, and interactive button suspension/resumption, plus `project.store` and `flow.store` dirty flag tracking and reset behavior.
