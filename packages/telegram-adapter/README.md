<h1 align="center">
  <code>@zerobotforge/telegram-adapter</code> — Telegram Bot API Client, Lifecycle Manager &amp; Router
</h1>

<div align="center">
<i>Telegraf long-polling wrapper with exponential backoff, token-redacted error mapping, idempotent lifecycle management, atomic SHA-256 conversation state storage, and state-first flow routing.</i>
<br><br>
<b>Parent Documentation:</b> <a href="../README.md">packages/README.md</a> · <a href="../../README.md">Root README.md</a><br>
<b>Package:</b> <code>@zerobotforge/telegram-adapter</code> 0.1.0
</div>

--------------------------------------------------------------------------------

## Overview

`@zerobotforge/telegram-adapter` bridges the Telegram Bot API and `@zerobotforge/flow-engine`. It normalizes inbound Telegram updates, manages a single predictable long-polling loop, persists per-chat continuation state on disk with corruption quarantine, and routes multi-turn conversations through `executeFlow`.

--------------------------------------------------------------------------------

## Source Code Modules

* **[package.json](package.json)**
  * **Role:** Package Manifest and Subpath Export Map.
  * **Implementation:** Declares `"name": "@zerobotforge/telegram-adapter"`, `"version": "0.1.0"`, and exports `"."` (`./src/telegram-client.ts`), `"./manager"` (`./src/bot-manager.ts`), `"./router"` (`./src/update-router.ts`), `"./conversation-store"` (`./src/conversation-store.ts`), and `"types"` (`./src/types.ts`). Depends on `@zerobotforge/shared`, `@zerobotforge/flow-engine`, and `telegraf ^4.16.3`.

* **[src/types.ts](src/types.ts)**
  * **Role:** Adapter Error Classes, Client Port Contract, and State Interfaces.
  * **Implementation:**
    * `TelegramAdapterErrorCategory`: `'invalid_token' | 'rate_limited' | 'network' | 'conflict' | 'forbidden' | 'not_found' | 'bad_request' | 'api_error' | 'client_state' | 'unknown'`.
    * `TelegramAdapterError`: Custom `Error` carrying `category`, `telegramCode?`, `retryAfterSeconds?`, `recoverable: boolean` (default `true`), and `originalError?`.
    * Interfaces: `TelegramBotIdentity`, `TelegramInboundUpdate` (`updateId`, `kind: 'message' | 'callback_query'`, `chatId`, `userId`, `date`, `messageId?`, `text?`, `callbackQueryId?`, `callbackData?`), `TelegramInlineButton`, `TelegramClientStatus`, `TelegramClientPort`, `ConversationState`, and `BotManagerStatus`.

* **[src/telegram-client.ts](src/telegram-client.ts)**
  * **Role:** Long-Polling Telegram Bot API Client, Update Normalizer, and Error Mapper.
  * **Implementation:**
    * `mapTelegramError(error: unknown)`: Classifies raw Telegraf/network errors into `TelegramAdapterError` while redacting any substring matching `/\b[0-9]{5,}:[A-Za-z0-9_-]{20,}\b/g` to `"[redacted token]"`. Maps HTTP `401` to `invalid_token` (`recoverable: false`), `429` to `rate_limited` (`recoverable: true`, extracting `parameters.retry_after`), `409` to `conflict` (`recoverable: false`), `403` to `forbidden` (`recoverable: false`), `404` to `not_found` (`recoverable: false`), `400..499` to `bad_request` (`recoverable: false`), network codes (`ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, etc.) to `network` (`recoverable: true`), and `>=500` to `api_error` (`recoverable: true`).
    * `normalizeTelegramUpdate(raw: unknown)`: Converts raw `message` and `callback_query` updates into `TelegramInboundUpdate` and returns `null` for unsupported update types (such as `inline_query`).
    * `TelegramClient`: Implements `TelegramClientPort`. On `start()`, verifies the token via `bot.telegram.getMe()`, calls `bot.telegram.deleteWebhook({ drop_pending_updates: false })`, and launches `pollLoop()`. `pollLoop()` calls `getUpdates` with `pollTimeoutSeconds` (bounded to `1..30`, default `5`), advances `nextOffset = Math.max(this.nextOffset, update.update_id + 1)` in a `finally` block, and applies exponential backoff (`min(retryMaxMs, retryBaseMs * 2^min(attempt, 10))`, honouring `retryAfterSeconds * 1000` when larger). `sendInlineKeyboard` validates that `${callbackPrefix}:${button.id}` does not exceed Telegram's 64-byte UTF-8 callback-data limit.

* **[src/bot-manager.ts](src/bot-manager.ts)**
  * **Role:** Idempotent Bot Lifecycle Coordinator (`TelegramBotManager`).
  * **Implementation:** Wraps a `TelegramClientPort` and `BotUpdateHandler`. Deduplicates concurrent `start()` and `stop()` calls by sharing in-flight `startPromise` and `stopPromise` references, transitions deterministically across `'stopped' | 'starting' | 'running' | 'stopping' | 'error'`, and records fatal vs recoverable runtime errors in `BotManagerStatus`.

* **[src/conversation-store.ts](src/conversation-store.ts)**
  * **Role:** File-Backed Atomic Conversation State Repository with Corruption Quarantine.
  * **Implementation:**
    * Serializes all file operations per directory using an in-memory promise mutex (`withDirectoryLock`).
    * Computes filenames via `storageKey(projectId, chatId)` (`SHA-256(projectId + "\0" + chatId).hex + ".json"`).
    * `set(state)`: Validates `state` via `decodeState`, writes to `.${basename}.${pid}.${uuid}.tmp` opened with `'wx'` and mode `0o600`, flushes via `handle.sync()`, and atomically renames to the target file.
    * `get(projectId, chatId)` & `listByProject(projectId)`: Reads and validates JSON records. If JSON parsing fails or `decodeState` / identity verification fails, `quarantineUnlocked` moves the corrupted file into `<directory>/recovery/<basename>.corrupt-<timestamp>-<uuid>.json` and throws `ConversationStoreError("CORRUPT_RECORD")`.

* **[src/update-router.ts](src/update-router.ts)**
  * **Role:** Multi-Turn Flow Update Router (`TelegramUpdateRouter`).
  * **Implementation:**
    * Queues incoming updates sequentially via `this.operationQueue`.
    * Immediately acknowledges `callbackQueryId` via `answerCallbackQuery` without blocking routing on acknowledgement failure.
    * Checks `ConversationStore.get(projectId, update.chatId)`. If `update.updateId <= existing.lastUpdateId`, returns `status: "duplicate"`.
    * Recognizes `/start` commands via `/^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/i`. If an existing conversation is not waiting for input and the message is not `/start`, updates `lastUpdateId` and returns `status: "ignored"`.
    * Matches `button:<id>` or `choice:<id>` callback queries when `existing.status === "waiting_for_input"`, resumes `executeFlow` at `existing.currentNodeId` with saved `variables`, persists the resulting `ConversationState` to disk **before** dispatching outbound messages (`dispatchEvents`), and sends a fallback recovery notice if execution ends in `"failed"` or `"step_limit_exceeded"`.

* **[src/telegram-adapter.test.ts](src/telegram-adapter.test.ts)**
  * **Role:** Package Unit Test Suite (14 tests).
  * **Implementation:** Tests `normalizeTelegramUpdate` (text and callback queries, unsupported `inline_query` returning `null`), `mapTelegramError` (401, 429 with `retry_after`, 409, `ECONNRESET`, and token redaction), `ConversationStore` (persistence across instances, concurrent project/chat isolation, corruption quarantine into `recovery/`), `TelegramUpdateRouter` (`/start` routing, button suspension and callback resumption, duplicate `updateId` rejection), and `TelegramBotManager` (idempotent start/stop, shared in-flight start promise, error state transition, and concurrent stop during pending startup).
