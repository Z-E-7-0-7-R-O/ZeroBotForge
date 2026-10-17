<h1 align="center">
  <code>apps/desktop/src/features</code> — Domain Feature Modules
</h1>

<div align="center">
<i>Feature-scoped UI modules and orchestration hooks for project management, Telegram bot configuration and token storage, studio settings, conversation logs, and analytics views.</i>
<br><br>
<b>Parent Documentation:</b> <a href="../README.md">apps/desktop/src/README.md</a> · <a href="../../../../README.md">Root README.md</a>
</div>

--------------------------------------------------------------------------------

## Overview

`apps/desktop/src/features/` groups domain-specific UI panels and orchestration logic into five feature directories: `projects/`, `bot/`, `settings/`, `conversations/`, and `analytics/`.

--------------------------------------------------------------------------------

## Source Code Modules

### 1. Project Management Feature (`projects/`)

* **[projects/useProjects.ts](projects/useProjects.ts)**
  * **Role:** Page-Level Project Lifecycle Orchestration Hook.
  * **Implementation:** Manages `busy` and `operationError` state around `createProject` (enriching the created session with optional `description` and `botDisplayName` from `CreateProjectDialog`), `openProject`, `saveProject`, `saveAsProject`, and `closeProject`.

* **[projects/CreateProjectDialog.tsx](projects/CreateProjectDialog.tsx)**
  * **Role:** New Project Creation Modal Form.
  * **Implementation:** Validates `name` (`1..100` characters, matching `project.ipc.ts`), optional `botDisplayName` (`<= 100` chars), and optional `description` (`<= 300` chars) before invoking `onCreate`.

* **[projects/ProjectList.tsx](projects/ProjectList.tsx)**
  * **Role:** Active Project Summary Card and Pipeline Action Bar.
  * **Implementation:** Displays an `EmptyState` with `Open project` / `Create project` buttons when no session is loaded. When a session is active, displays project name, description, dirty status pill, file name, bot username, and code-generator target metadata, plus action buttons for `Open another`, `Save project`, `Save As`, `Export JSON`, `Open bot project`, `Generate bot project`, `Update bot project`, `Delete bot project`, `Compile`, `Run`, and `Close project` (protected by a `ConfirmDialog`).

---

### 2. Bot Configuration & Secure Token Feature (`bot/`)

* **[bot/BotSettings.tsx](bot/BotSettings.tsx)**
  * **Role:** Project Bot Metadata and Parse-Mode Form.
  * **Implementation:** Edits `bot.displayName` (required, `<= 100` chars), optional `bot.username` (normalizing leading `@` characters and offering a one-click `Use @<verifiedUsername>` button when a connection test has verified the bot's handle), `bot.tokenEnvVar` (validated against `/^[A-Z_][A-Z0-9_]*$/`), and `bot.parseMode` (`None`, `HTML`, `Markdown`, `MarkdownV2`).

* **[bot/BotTokenSettings.tsx](bot/BotTokenSettings.tsx)**
  * **Role:** OS-Encrypted Telegram Token Management Form.
  * **Implementation:** Communicates directly with `window.zeroBotForge.telegram` (`getStatus`, `setToken`, `testConnection`, `clearToken`). Immediately clears the password input field after saving the token to `SecureStorageService` so the credential never remains in React state.

* **[bot/BotConnectionStatus.tsx](bot/BotConnectionStatus.tsx)**
  * **Role:** Live Telegram Bot API Connectivity Banner.
  * **Implementation:** Supports both controlled props (`status`, `loading`, `error`) and autonomous fetching via `window.zeroBotForge.telegram.getStatus()`. Renders distinct visual states for `Checking connection`, `Telegram operation failed`, `Bot token not configured`, `Connected as @<username>`, `Not connected`, and `Token stored; connection not tested`.

* **[bot/ProjectBotSettingsPanel.tsx](bot/ProjectBotSettingsPanel.tsx)**
  * **Role:** Combined Project Bot Settings and Token Management Grid.
  * **Implementation:** Pairs `BotSettings` (persisted in the project `.zbf`/`.json` document) and `BotTokenSettings` (persisted in `SecureStorageService`) and passes `connectionStatus?.botUsername` between them.

---

### 3. Application & Export Settings Feature (`settings/`)

* **[settings/AppearanceSettings.tsx](settings/AppearanceSettings.tsx)**
  * **Role:** Studio Theme Selector and DOM Synchronizer.
  * **Implementation:** Exports `applyAppTheme(theme)` (setting `document.documentElement.dataset.theme = theme`) and renders radio cards for `light`, `dark`, and `system` themes.

* **[settings/GeneralSettings.tsx](settings/GeneralSettings.tsx)**
  * **Role:** Workspace Behavior Preferences Panel.
  * **Implementation:** Edits `autoSaveEnabled`, `autoSaveIntervalSeconds` (restricted to `ALLOWED_AUTOSAVE_INTERVAL_SECONDS = [15, 30, 60, 120]`), and `reopenLastProject`.

* **[settings/ExportSettings.tsx](settings/ExportSettings.tsx)**
  * **Role:** Standalone Code Generator Configuration and Export Form.
  * **Implementation:** Configures `packageManager` (`npm`, `pnpm`, `yarn`), `moduleFormat` (`esm`, `commonjs`), `nodeVersion` (validated integer in `22..30`), `strict`, `includeReadme`, and `includeTests`. Provides buttons to save settings into the active project document, `Export JSON`, and `Generate bot project`.

---

### 4. Conversations Feature (`conversations/`)

* **[conversations/ConversationList.tsx](conversations/ConversationList.tsx)**
  * **Role:** Conversation Record List Component.
  * **Implementation:** Explicitly distinguishes five data states (`loading`, `error`, `unavailable`, `empty`, `ready`) and renders selectable conversation summary items with unread badges when `ready`.

* **[conversations/ConversationDetails.tsx](conversations/ConversationDetails.tsx)**
  * **Role:** Conversation Message Transcript Component.
  * **Implementation:** Distinguishes `error`, `unavailable`, unselected (`!conversation`), `empty`, and `ready` states, rendering incoming and outgoing message bubbles with timestamps when data is present.

---

### 5. Analytics Feature (`analytics/`)

* **[analytics/AnalyticsOverview.tsx](analytics/AnalyticsOverview.tsx)**
  * **Role:** KPI Metric Cards Component.
  * **Implementation:** Distinguishes `loading`, `error`, `unavailable`, `empty`, and `ready` states, rendering formatted metric cards (`metric.value.toLocaleString()`) when `ready`.

* **[analytics/AnalyticsCharts.tsx](analytics/AnalyticsCharts.tsx)**
  * **Role:** Vertical Bar Chart Component.
  * **Implementation:** Distinguishes `error`, `unavailable`, `loading`, `empty`, and `ready` states, scaling bar track heights proportionally (`(point.value / maximum) * 100%`) when `ready`.
