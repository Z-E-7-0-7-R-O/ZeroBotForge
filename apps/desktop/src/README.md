<h1 align="center">
  <code>apps/desktop/src</code> — React Renderer Core, Pages, Services, Stores, Hooks &amp; Styles
</h1>

<div align="center">
<i>React 18 application bootstrap, top-level workspace pages, renderer-side domain services, external-store state management, custom hooks, CSS design system, and preload IPC type contracts.</i>
<br><br>
<b>Parent Documentation:</b> <a href="../README.md">apps/desktop/README.md</a> · <a href="../../../README.md">Root README.md</a><br>
<b>Child Documentation:</b> <a href="components/README.md">src/components/README.md</a> · <a href="features/README.md">src/features/README.md</a>
</div>

--------------------------------------------------------------------------------

## Overview

`apps/desktop/src/` contains the React 18 renderer codebase for ZeroBotForge. State is managed deterministically through three external stores (`app.store.ts`, `project.store.ts`, `flow.store.ts`) consumed via React's `useSyncExternalStore`, while all communication with the Electron main process is funneled through `window.zeroBotForge` inside dedicated service modules (`src/services/`).

--------------------------------------------------------------------------------

## Source Code Modules

### 1. Renderer Root Entry Files (`src/`)

* **[main.tsx](main.tsx)**
  * **Role:** React DOM Entry Point and Stylesheet Cascade Loader.
  * **Implementation:** Imports `styles.css`, `styles/feature-views.css`, `styles/variables.css`, `styles/layout.css`, `styles/components.css`, and `styles/responsive.css`. Verifies `#root` exists in the DOM and mounts `<App />` inside `<React.StrictMode>`.

* **[App.tsx](App.tsx)**
  * **Role:** Root Application Switcher and Theme Bootstrapper.
  * **Implementation:** Queries `window.zeroBotForge.system.settings.get()` on mount to apply `document.documentElement.dataset.theme = result.data.theme`. Subscribes to `useAppStore()` (`activePage`) and `useProject()` (`session`, `createProject`, `openProject`, `saveCurrentProject`), and renders the active workspace page (`DashboardPage`, `BotBuilderPage`, `RunPage`, `ConversationsPage`, `AnalyticsPage`, or `SettingsPage`) with an exhaustive TypeScript `never` check.

* **[vite-env.d.ts](vite-env.d.ts)**
  * **Role:** Vite Client Type Reference.
  * **Implementation:** Declares `/// <reference types="vite/client" />`.

* **[styles.css](styles.css)**
  * **Role:** Primary Application Stylesheet and Dark Theme Baseline.
  * **Implementation:** Defines root CSS variables (`--bg: #080918`, `--panel: #0c0e22`, `--purple: #a66bff`, `--blue: #4d6dff`, `--cyan: #74cfff`), the `.app-shell` ambient background and `.dashboard` grid (`245px` sidebar + main panel), `.sidebar`, `.topbar`, `.page-heading`, `.button-primary`/`.button-secondary`/`.button-danger`, `.chat-window`, and Phase 05 shared `.empty-state`, `.modal-overlay`/`.modal-panel`, and `.notification-region`/`.notification-toast` rules.

---

### 2. Workspace Pages (`src/pages/`)

* **[pages/DashboardPage.tsx](pages/DashboardPage.tsx)**
  * **Role:** Workspace Overview and Project Lifecycle Page (`"Dashboard"`).
  * **Implementation:** Orchestrates project creation (`CreateProjectDialog`), opening, saving, Save-As, closing, JSON export (`exportProjectJson`), standalone bot generation (`exportGeneratedProject`), in-place bot project update (`updateGeneratedProject`), existing generated folder linking (`telegramService.openGeneratedProject`), generated directory deletion (`telegramService.deleteGeneratedProject`), compilation (`telegramService.compileGeneratedProject`), and launching/navigating to the `Run` monitor. Displays active project statistics (flow count, total persisted node count, and conversation repository status) and quick navigation cards to `Bot Builder`, `Conversations`, and `Analytics`.

* **[pages/BotBuilderPage.tsx](pages/BotBuilderPage.tsx)**
  * **Role:** Visual Conversation Flow Editor Workbench (`"Bot"`).
  * **Implementation:**
    * Synchronizes the active `ProjectFlowDto` with the flow engine via `toEngineFlow` and `useFlow`. Automatically seeds newly created empty projects with a validated `Start` node flow (`createEmptyEditorFlow`).
    * Computes `validation = validateFlow(activeFlow)` and maps failing issue paths to `invalidNodeIds` so nodes with configuration or edge errors are highlighted on the canvas.
    * Renders the flow selector dropdown, `FlowToolbar`, `NodePalette`, `FlowCanvas`, `NodeEditor`, selected connection inspector, local `ChatPreview`, and the `Flow validation issues` ordered list, plus a `ConfirmDialog` for node/edge deletion (protecting the `Start` node from removal).

* **[pages/RunPage.tsx](pages/RunPage.tsx)**
  * **Role:** Local Bot Compilation, Process Execution, Telemetry & Live Terminal Page (`"Run"`).
  * **Implementation:**
    * Polls `telegramService.getRuntimeStatus({ checkTelegram: false })` every `1,200 ms` (and with `checkTelegram: true` on mount and manual refresh).
    * Renders the 3-stage protective pipeline stepper (`1. Generate Project`, `2. Compile (npm install & build)`, `3. Local Bot Execution`), action toolbar (`Get bot status`, `Open bot project`, `Generate bot project`, `Update bot project`, `Delete bot project`, `Compile`, `Run`, `Stop`), 4 telemetry cards (`LOCAL RUN STATUS`, `TELEGRAM BOT STATUS`, `TOKEN & .ENV SYNC`, `BUILD ARTIFACT STATE`), and the auto-scrolling `Live Process Terminal` displaying `stdout`, `stderr`, and `system` logs with token auto-redaction.

* **[pages/ConversationsPage.tsx](pages/ConversationsPage.tsx)**
  * **Role:** Conversation Activity View (`"Conversations"`).
  * **Implementation:** Renders `ConversationList` and `ConversationDetails` with `sourceState = "unavailable"` and `conversations = []`, displaying a truthful notice that no persistent conversation repository is wired into the current desktop version rather than fabricating sample messages.

* **[pages/AnalyticsPage.tsx](pages/AnalyticsPage.tsx)**
  * **Role:** Bot Performance Metrics View (`"Analytics"`).
  * **Implementation:** Renders `AnalyticsOverview` and `AnalyticsCharts` with `dataState = "unavailable"`, listing the architectural dependencies required for future analytics (`Event collection` and `Persistent event store`).

* **[pages/SettingsPage.tsx](pages/SettingsPage.tsx)**
  * **Role:** Application Preferences, Generator Export Config, and Bot Token Settings Page (`"Settings"`).
  * **Implementation:** Loads and saves `AppSettings` via `window.zeroBotForge.system.settings.get()` / `save()`, embedding `AppearanceSettings`, `GeneralSettings`, `ExportSettings` (with live project save, JSON export, and standalone bot generation), and `ProjectBotSettingsPanel`.

---

### 3. Renderer Services (`src/services/`)

* **[services/project.service.ts](services/project.service.ts)**
  * **Role:** Renderer Facade for Project IPC Operations and Store Synchronization.
  * **Implementation:** Wraps `window.zeroBotForge.projects` and `window.zeroBotForge.exports`. Before saving or exporting, `mergeActiveFlowIntoDocument` flushes any in-memory edits from `flow.store.ts` into `ProjectDocumentDto`. Updates `project.store.ts` (`loading`, `saving`, `ready`, `error`, `isDirty`) and `flow.store.ts` (`synchronizeActiveFlow`).

* **[services/flow.service.ts](services/flow.service.ts)**
  * **Role:** Pure Flow Graph Mutation and Validation Service.
  * **Implementation:** Defines `FlowOperationError` and pure functions `validateFlowDefinition`, `createFlowDefinition`, `createFlowNode` (enforcing single `start` node and grid-staggered initial coordinates `x: 420 + (index % 2) * 340, y: 90 + Math.floor(index / 2) * 220`), `addFlowNode`, `updateFlowNode` (pruning edges whose `sourceHandle` was removed), `connectFlowNodes` (rejecting self-loops, edges into `start`, invalid registry ports, and duplicate connections from the same output port), `removeFlowNode` (protecting `start`), `removeFlowEdge`, and `replaceProjectFlow`.

* **[services/preview.service.ts](services/preview.service.ts)**
  * **Role:** Local In-Memory Flow Execution Service (`runFlowPreview`).
  * **Implementation:** Calls `executeFlow(flow, { maxSteps: 100, resumeAtNodeId, context })` from `@zerobotforge/flow-engine/executor` with a cloned `FlowRuntimeContext` and formats emitted events and errors into `FlowPreviewReport` (`{ executedAt, result, outputLines }`).

* **[services/export.service.ts](services/export.service.ts)**
  * **Role:** Project JSON and Standalone Code Generation Export Orchestrator.
  * **Implementation:** Provides `exportProjectJson(document)`, `exportGeneratedProject(document)` (flushes active flow, runs `generateProjectFiles(flushedDocument)` in memory, sends files to Electron via `projectService.exportGeneratedProject`, and refreshes `runtimeStatus`), and `updateGeneratedProject(document, directoryPath?)`.

* **[services/telegram.service.ts](services/telegram.service.ts)**
  * **Role:** Renderer Facade for Telegram Token and Bot Runtime IPC Channels.
  * **Implementation:** Wraps `window.zeroBotForge.telegram` (`getStatus`, `setToken`, `clearToken`, `testConnection`) and `window.zeroBotForge.runtime` (`getRuntimeStatus`, `openGeneratedProject`, `compileGeneratedProject`, `startBotRuntime`, `stopBotRuntime`, `clearRuntimeLogs`, `deleteGeneratedProject`), automatically updating `runtimeStatus` in `app.store.ts`.

---

### 4. External State Stores (`src/store/`)

* **[store/app.store.ts](store/app.store.ts)**
  * **Role:** Global Navigation and Runtime Status Store.
  * **Implementation:** Manages `AppStoreState` (`activePage: NavigationPage` defaulting to `"Bot"`, `globalBusy: boolean`, `lastError: string | null`, `runtimeStatus: BotRuntimeStatus | null`) via `useSyncExternalStore`. Exports `setActivePage`, `setGlobalBusy`, `setAppError`, `setRuntimeStatus`, `resetAppStoreForTests`, and `useAppStore`.

* **[store/project.store.ts](store/project.store.ts)**
  * **Role:** Active Project Session and Dirty-Flag Store.
  * **Implementation:** Manages `ProjectStoreState` (`session: ProjectSession | null`, `status: 'idle' | 'loading' | 'saving' | 'ready' | 'error'`, `isDirty: boolean`, `error: string | null`). Exports `setProjectStoreStatus`, `setProjectSession`, `updateProjectDocument`, `markProjectSaved`, and `resetProjectStoreForTests`.

* **[store/flow.store.ts](store/flow.store.ts)**
  * **Role:** Active Flow Editor Selection, Validation, and Preview Store.
  * **Implementation:** Manages `FlowStoreState` (`activeFlow`, `selectedNodeId`, `selectedEdgeId`, `validation`, `previewResult`, `previewStatus`, `isDirty`, `error`). Exports `synchronizeActiveFlow` (preserving selection only if the node/edge still exists in the synchronized flow), `recordFlowChange`, `selectFlowNode`, `selectFlowEdge`, `clearFlowSelection`, `setFlowValidation`, `setFlowPreviewStatus`, `setFlowPreviewResult`, `markFlowSaved`, `resetFlowStoreForTests`, and `useFlowStore`.

---

### 5. Custom React Hooks (`src/hooks/`)

* **[hooks/useProject.ts](hooks/useProject.ts)**
  * **Role:** React Hook Binding `project.store.ts` and `project.service.ts`.
  * **Implementation:** Subscribes to `project.store.ts` via `useSyncExternalStore` and exposes memoized callbacks `createProject`, `openProject`, `saveProject`, `saveProjectAs` / `saveAsProject`, `saveCurrentProject`, `setSession`, and `updateDocument`.

* **[hooks/useFlow.ts](hooks/useFlow.ts)**
  * **Role:** React Hook Binding `flow.store.ts`, `flow.service.ts`, and `preview.service.ts`.
  * **Implementation:** Synchronizes `flow` into `flow.store.ts`, runs `validateFlowDefinition`, mirrors changes to the parent project via `onFlowChange`, and exposes `addNode`, `connectNodes`, `updateNode`, `removeNode`, `removeEdge`, `validateCurrentFlow`, `runPreview`, `resetEditorState`, and `markSaved`.

* **[hooks/useNotifications.ts](hooks/useNotifications.ts)**
  * **Role:** Toast Notification State and Auto-Dismiss Timer Hook.
  * **Implementation:** Manages an array of `AppNotification` items (`success`, `error`, `warning`, `info`) with per-notification `setTimeout` timers (default `5,000 ms`, cleared on unmount or manual dismissal). Exports `notifications`, `notify`, `dismissNotification`, and `clearNotifications`.

---

### 6. Modular CSS Stylesheets (`src/styles/`)

* **[styles/variables.css](styles/variables.css)** — Defines `--zf-space-*`, `--zf-radius-*`, `--zf-shadow-soft`, `--zf-content-max`, and light-mode palette overrides (`:root[data-theme="light"]` and `@media (prefers-color-scheme: light) { :root[data-theme="system"] }`).
* **[styles/layout.css](styles/layout.css)** — Scoped `.p6-page`, `.p6-panel`, `.p6-stat-grid`, `.p6-link-grid`, `.p6-project-summary`, and `.p6-settings-form` structural layout rules.
* **[styles/components.css](styles/components.css)** — Scoped `.p6-*` rules for stat cards, link cards, form fields, theme radio cards (`.p6-theme-options`), and toggle switches (`.p6-toggle-row`).
* **[styles/feature-views.css](styles/feature-views.css)** — Scoped `.p8-*` rules for project list cards, modal dialogs, bot token connection banners, conversation bubbles, analytics bar charts, and `.p9-*` rules for the Run page pipeline stepper, 4-column telemetry grid, dark monospace terminal viewport (`.p9-terminal-viewport`), and unified scrollbar styling.
* **[styles/flow-editor.css](styles/flow-editor.css)** — Scoped `.flow-*` rules for the 3-column Bot Builder workbench (`.flow-editor-workbench`), sticky node palette, dotted 2D canvas stage (`.flow-editor-stage`), SVG cubic Bezier connections (`.flow-edge`), node cards (`.flow-node-card`), port handles, color cubes (`.flow-color-cube`), live menu shape preview (`.flow-menu-live-layout`), and validation panel.
* **[styles/preview-chat.css](styles/preview-chat.css)** — Scoped `.chat-preview-*` and `.preview-chat-*` rules for the local conversation simulator transcript, colored inline buttons, and persistent menu dock (`.chat-preview-menu-dock`).
* **[styles/responsive.css](styles/responsive.css)** — Media queries (`1180px`, `900px`, `640px`) collapsing multi-column grids and action bars on narrower viewports.

---

### 7. Preload TypeScript Contracts (`src/types/`)

* **[types/electron-api.ts](types/electron-api.ts)**
  * **Role:** Shared Renderer/Main DTOs and `DesktopApi` Interface.
  * **Implementation:** Defines `ProjectNodeDto`, `ProjectEdgeDto`, `ProjectFlowDto`, `ProjectDocumentDto`, `DesktopApiError`, `DesktopApiResult<T>`, `ProjectSession`, `AppTheme`, `AppSettings`, `AppInfo`, `TelegramConnectionStatus`, `ExportProjectResult`, `GeneratedProjectFile`, `ExportGeneratedProjectResult`, `RuntimeLifecycleState`, `RuntimeLogEntry`, `BotRuntimeStatus`, and `DesktopApi`.

* **[types/electron.d.ts](types/electron.d.ts)**
  * **Role:** Global `Window` Interface Augmentation.
  * **Implementation:** Augments `Window` with `zeroBotForge: DesktopApi`.

---

### 8. Sub-Directory Component & Feature Documentation

* **[`src/components/README.md`](components/README.md)** — Dissects all 23 UI, Layout, Flow Editor, Node Card, and Preview components.
* **[`src/features/README.md`](features/README.md)** — Dissects all 14 domain feature components and hooks (`projects`, `bot`, `settings`, `conversations`, `analytics`).
