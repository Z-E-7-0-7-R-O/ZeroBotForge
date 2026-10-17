<h1 align="center">
  <code>apps/desktop/electron</code> — Electron Main Process, Preload, IPC &amp; Native Services
</h1>

<div align="center">
<i>BrowserWindow security hardening, contextBridge preload API, sender-verified IPC handlers, atomic file system operations, OS-encrypted credential storage, and child-process bot runtime execution.</i>
<br><br>
<b>Parent Documentation:</b> <a href="../README.md">apps/desktop/README.md</a> · <a href="../../../README.md">Root README.md</a>
</div>

--------------------------------------------------------------------------------

## Overview

The `apps/desktop/electron/` directory contains all privileged code executing in the Electron Main Process and the sandboxed Preload script. It enforces strict isolation between the React UI and the host operating system: the renderer has no direct access to Node.js primitives or `ipcRenderer`, and every IPC request is authenticated against the main window's trusted frame before invoking file-system, settings, credential, or child-process services.

--------------------------------------------------------------------------------

## Source Code Modules

### 1. Core Process Entry Points (`electron/`)

* **[errors.ts](errors.ts)**
  * **Role:** Main-Process Application Error Contract.
  * **Implementation:** Defines `DesktopApplicationError extends Error` carrying a machine-readable `public readonly code: string` and preserving the prototype chain via `Object.setPrototypeOf`.

* **[main.ts](main.ts)**
  * **Role:** Electron Main Process Bootstrap and Window Security Controller.
  * **Implementation:**
    * `createMainWindow()`: Instantiates a `1440x920` (`minWidth: 1000`, `minHeight: 680`) `BrowserWindow` with `autoHideMenuBar: true`, `setMenuBarVisibility(false)`, and hardened `webPreferences`: `preload: join(__dirname, 'preload.cjs')`, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false`, `webviewTag: false`, and `devTools: !app.isPackaged`. Loads `http://127.0.0.1:5173/` in development or `dist/index.html` when packaged.
    * `attachWindowSecurity(window)`: Intercepts `setWindowOpenHandler` to deny new Electron windows while opening valid `http:`/`https:` links in the OS default browser via `shell.openExternal`; blocks unauthorized `will-navigate` transitions via `isAllowedRendererUrl`; denies all session permission requests via `setPermissionRequestHandler`.
    * `registerApplicationIpc()`: Instantiates `AppSettingsService`, `SecureStorageService`, and `BotRuntimeService` rooted at `app.getPath('userData')`, and registers all five IPC domain modules.
    * Lifecycle hooks: Stops any running bot child process (`activeRuntimeService.stop()`) and resets `activeProjectPath` on `before-quit`.

* **[preload.ts](preload.ts)**
  * **Role:** Context-Isolated Renderer Bridge (`window.zeroBotForge`).
  * **Implementation:** Uses `contextBridge.exposeInMainWorld("zeroBotForge", api)` to expose a typed `DesktopApi` object (`projects`, `exports`, `system`, `telegram`, `runtime`) where every method delegates to `ipcRenderer.invoke(channel, ...args)` using constants from [`ipc/channels.ts`](ipc/channels.ts).

---

### 2. Inter-Process Communication Layer (`electron/ipc/`)

* **[ipc/channels.ts](ipc/channels.ts)**
  * **Role:** Canonical IPC Channel Name Registry.
  * **Implementation:** Defines `IPC_CHANNELS` and `IpcChannel` containing 21 channels:
    * Projects: `projects:create`, `projects:open`, `projects:save`, `projects:save-as`.
    * Exports: `exports:project-json`, `exports:generated-project`, `exports:update-generated-project`.
    * System & Settings: `system:get-version`, `settings:get`, `settings:save`.
    * Telegram: `telegram:get-status`, `telegram:set-token`, `telegram:clear-token`, `telegram:test-connection`.
    * Runtime: `runtime:get-status`, `runtime:open-generated-project`, `runtime:compile`, `runtime:start`, `runtime:stop`, `runtime:clear-logs`, `runtime:delete-generated-project`.

* **[ipc/secure-handler.ts](ipc/secure-handler.ts)**
  * **Role:** IPC Sender Origin Verification and Error Sanitization Wrapper.
  * **Implementation:**
    * `isAllowedRendererUrl(rawUrl)`: In development (`!app.isPackaged`), accepts only `http://127.0.0.1:5173` with empty credentials. In production (`app.isPackaged`), accepts only `file:` URLs whose normalized path equals `join(app.getAppPath(), 'dist', 'index.html')`.
    * `assertTrustedIpcSender(event, getMainWindow)`: Throws `DesktopApplicationError('IPC_UNTRUSTED_SENDER')` if `event.sender !== mainWindow.webContents`, and `DesktopApplicationError('IPC_UNTRUSTED_FRAME')` if `event.senderFrame !== event.sender.mainFrame` or `!isAllowedRendererUrl(frame.url)`.
    * `registerSecureHandler(channel, getMainWindow, handler)`: Wraps `ipcMain.handle(channel, ...)`, enforces `assertTrustedIpcSender`, returns `{ ok: true, data }`, and catches errors via `toPublicIpcError` (mapping `DesktopApplicationError` and `ZeroBotForgeError` to `{ code, message }` and masking unknown errors as `INTERNAL_ERROR`).

* **[ipc/project.ipc.ts](ipc/project.ipc.ts)**
  * **Role:** Project Lifecycle IPC Handlers (`create`, `open`, `save`, `saveAs`).
  * **Implementation:** Maintains `activeProjectPath: string | null` in the main process.
    * `projects:create`: Validates `input.name` (`1..100` chars, default `'Untitled Project'`), generates a `randomUUID()` in the main process, calls `createEmptyProject`, resets `activeProjectPath = null`, and returns `ProjectSession`.
    * `projects:open`: Opens a native file dialog filtered to `.zbf` and `.json`, reads and validates the file via `ProjectFileSystemService.readProject`, sets `activeProjectPath`, and returns `ProjectSession`.
    * `projects:save` & `projects:save-as`: Validates `input.document` via `projectFileSystem.validateForSave(document)` before touching disk, prompts via `dialog.showSaveDialog` when needed, writes atomically via `projectFileSystem.writeProject`, updates `activeProjectPath`, and returns `ProjectSession`.

* **[ipc/export.ipc.ts](ipc/export.ipc.ts)**
  * **Role:** Project JSON Export Handler and Generated Export Registration Facade.
  * **Implementation:** Registers `exports:project-json` (validates document, prompts via `dialog.showSaveDialog` for `.json`, writes via `projectFileSystem.writeProject`) and delegates standalone source export registration to `registerGeneratedProjectExportIpc`.

* **[ipc/generated-project-export.ipc.ts](ipc/generated-project-export.ipc.ts)**
  * **Role:** Standalone Bot Project Disk Writer and In-Place Updater (`exports:generated-project`, `exports:update-generated-project`).
  * **Implementation:**
    * `validateFiles(input)`: Independently re-validates the generated file manifest in the main process against `ALLOWED_OUTPUT_PATHS` and `REQUIRED_OUTPUT_PATHS` (`package.json`, `tsconfig.json`, `.env.example`, `project.json`, `README.md`, `src/bot.ts`, `src/handlers.ts`), enforcing `1..120` char project names, relative path safety, `2 MB` per-file limit, and `8 MB` total limit.
    * `exports:generated-project`: Prompts for a parent directory via `dialog.showOpenDialog`, creates a non-colliding folder `${safeBase}-generated` (up to `-generated-100` using `mkdir(..., { recursive: false })`), verifies subdirectories are not symlinks (`ensureSafeSubdirectory`), writes all 7 files via `atomicWriteFile`, writes `.env` with `TELEGRAM_BOT_TOKEN=<savedToken>` from `SecureStorageService`, cleans up the directory if any write fails, and registers the directory with `BotRuntimeService.registerGeneratedDirectory`.
    * `exports:update-generated-project`: Stops any running bot process, overwrites the 7 manifest files and `.env` in the existing registered directory, and calls `runtimeService.markUpdatedGeneratedDirectory` (which removes stale `dist/bot.js` so the user recompiles).

* **[ipc/system.ipc.ts](ipc/system.ipc.ts)**
  * **Role:** Application Metadata and Settings IPC Handlers.
  * **Implementation:** Registers `system:get-version` (returning `name`, `version`, `platform`, `architecture`, `isPackaged`) and `settings:get` / `settings:save` (delegating to `AppSettingsService.load()` and `save()`).

* **[ipc/telegram.ipc.ts](ipc/telegram.ipc.ts)**
  * **Role:** Telegram Token Management and Live Connectivity Test IPC Handlers.
  * **Implementation:**
    * `parseTokenInput(input)`: Validates token length (`<= 200`) and regex `/^[0-9]{5,}:[A-Za-z0-9_-]{20,}$/` (`TELEGRAM_TOKEN_INVALID`).
    * `telegram:get-status`: Queries `secureStorage.hasTelegramToken()`.
    * `telegram:set-token`: Encrypts and saves the token via `secureStorage.saveTelegramToken(token)` and synchronizes it to the active generated bot's `.env` via `runtimeService.syncTokenToActiveDirectory(token)`.
    * `telegram:clear-token`: Removes `secrets.json` and clears the token in the active `.env`.
    * `telegram:test-connection`: Decrypts the saved token, sends a `GET https://api.telegram.org/bot${token}/getMe` request with `AbortSignal.timeout(10_000)`, maps HTTP `401` to `TELEGRAM_TOKEN_REJECTED`, and returns `{ configured: true, connected: true, botUsername }`.

* **[ipc/runtime.ipc.ts](ipc/runtime.ipc.ts)**
  * **Role:** Local Bot Compilation, Execution, Log, and Directory Management IPC Handlers.
  * **Implementation:** Registers `runtime:get-status`, `runtime:open-generated-project` (opens directory picker and calls `runtimeService.openExistingGeneratedDirectory`), `runtime:compile`, `runtime:start`, `runtime:stop`, `runtime:clear-logs`, and `runtime:delete-generated-project`.

---

### 3. Native Main-Process Services (`electron/services/`)

* **[services/file-system.service.ts](services/file-system.service.ts)**
  * **Role:** Atomic File Writer and Project File System Service.
  * **Implementation:**
    * `atomicWriteFile(targetPath, contents, mode = 0o600)`: Resolves `targetPath`, creates parent directories, verifies the target is not a symbolic link or directory (`lstat`), opens a sibling `.${basename}.${randomUUID()}.tmp` file with `'wx'` and mode `0o600`, writes UTF-8 contents, flushes to disk with `handle.sync()`, closes the descriptor, and atomically replaces the target via `rename`. Cleans up the `.tmp` file on any failure.
    * `ProjectFileSystemService`: Enforces `.zbf` and `.json` extensions (`PROJECT_FILE_EXTENSION_INVALID`) and `MAX_PROJECT_FILE_BYTES = 10 * 1024 * 1024` (`10 MB`, `PROJECT_FILE_TOO_LARGE`). Provides `validateForSave`, `readProject`, and `writeProject`.

* **[services/app-settings.service.ts](services/app-settings.service.ts)**
  * **Role:** Persistent Application Preferences Service (`settings.json`).
  * **Implementation:** Stores `{ version: 1, settings: { theme, autoSaveEnabled, autoSaveIntervalSeconds, reopenLastProject } }` in `<userData>/settings.json`. Returns `DEFAULT_SETTINGS` (`theme: 'system'`, `autoSaveEnabled: true`, `autoSaveIntervalSeconds: 60`, `reopenLastProject: true`) when `ENOENT`. Rejects unknown keys, invalid themes, and autosave intervals outside `ALLOWED_INTERVALS` (`15`, `30`, `60`, `120`) with `SETTINGS_INVALID`. Leaves corrupted `settings.json` files untouched on disk (`SETTINGS_FILE_INVALID`).

* **[services/secure-storage.service.ts](services/secure-storage.service.ts)**
  * **Role:** OS-Backed Encrypted Credential Service (`secrets.json`).
  * **Implementation:**
    * `assertEncryptionAvailable()`: Checks `await safeStorage.isAsyncEncryptionAvailable()`. On Linux (`process.platform === 'linux'`), checks `safeStorage.getSelectedStorageBackend()` and throws `SECURE_STORAGE_BACKEND_UNSAFE` if the backend is `'basic_text'` or `'unknown'`.
    * `saveTelegramToken(token)`: Encrypts the token via `safeStorage.encryptStringAsync(token)` and writes `{ version: 1, tokenCiphertext: base64 }` atomically to `<userData>/secrets.json`.
    * `getTelegramToken()`: Reads and validates `secrets.json`, calls `safeStorage.decryptStringAsync`, checks `{ result: string, shouldReEncrypt: boolean }`, re-encrypts automatically if `shouldReEncrypt === true`, and returns the plaintext token to the main-process caller.
    * `clearTelegramToken()`: Deletes `secrets.json` via `rm(..., { force: true })`.

* **[services/bot-runtime.service.ts](services/bot-runtime.service.ts)**
  * **Role:** Local Bot Compilation Pipeline, Child-Process Runner, `.env` Synchronizer, and Log Streamer.
  * **Implementation:**
    * Manages `RuntimeLifecycleState` (`'idle' | 'generated' | 'compiling' | 'compiled' | 'starting' | 'running' | 'stopping' | 'error'`) and a 400-entry ring buffer (`MAX_LOG_ENTRIES = 400`) where every log line is scrubbed by `redactSensitiveText` (redacting both `/\b[0-9]{5,}:[A-Za-z0-9_-]{20,}\b/g` and the exact active token string to `"[REDACTED_TOKEN]"`).
    * `syncTokenToActiveDirectory(explicitToken?)`: Reads `project.json` in the target directory to resolve `bot.tokenEnvVar`, fetches the token from `SecureStorageService`, and atomically writes `.env` containing `TELEGRAM_BOT_TOKEN=<token>` (plus `<tokenEnvVar>=<token>` if custom).
    * `openExistingGeneratedDirectory(selectedDirectoryPath)`: Verifies the selected directory contains `package.json` and either `project.json` or `src/bot.ts` (`RUNTIME_OPEN_INVALID_DIRECTORY`), checks whether `dist/bot.js` already exists, and registers the directory.
    * `deleteGeneratedDirectory(directoryOverride?)`: Verifies the target folder contains both `project.json` and `src/bot.ts` (`RUNTIME_DELETE_UNSAFE_TARGET`) before removing it recursively (`rm(..., { recursive: true, force: true })`).
    * `compile(directoryOverride?)`: Synchronizes `.env`, spawns `cmd.exe /d /s /c "npm install && npm run build"` (Windows) or `sh -c "npm install && npm run build"` (POSIX) with `windowsHide: true`, streams `stdout`/`stderr` into `this.logs`, and verifies `dist/bot.js` was created (`RUNTIME_BUILD_ARTIFACT_MISSING`).
    * `start(directoryOverride?)`: Requires `dist/bot.js` and a configured token in `SecureStorageService`, probes `https://api.telegram.org/bot${token}/getMe` (`8,000 ms` timeout), and spawns `node dist/bot.js` with `TELEGRAM_BOT_TOKEN` and `[envVarName]` injected into `childEnv`.
    * `stop()`: Terminates the active child process using `taskkill /pid <pid> /T /F` on Windows or `SIGTERM` (with a `4,000 ms` fallback `SIGKILL` timer) on POSIX.
