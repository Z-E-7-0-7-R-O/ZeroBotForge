import { Markup, Telegraf } from "telegraf";
import type {
  TelegramAdapterErrorCategory,
  TelegramBotIdentity,
  TelegramClientPort,
  TelegramClientStatus,
  TelegramErrorHandler,
  TelegramInboundUpdate,
  TelegramInlineButton,
  TelegramUpdateHandler,
} from "./types";
import { TelegramAdapterError } from "./types";

export interface TelegramClientOptions {
  /** Telegram long-poll timeout; deliberately bounded so stop() is predictable. */
  pollTimeoutSeconds?: number;
  retryBaseMilliseconds?: number;
  retryMaximumMilliseconds?: number;
}

const DEFAULT_POLL_TIMEOUT_SECONDS = 5;
const DEFAULT_RETRY_BASE_MILLISECONDS = 500;
const DEFAULT_RETRY_MAXIMUM_MILLISECONDS = 30_000;
const TOKEN_PATTERN = /\b[0-9]{5,}:[A-Za-z0-9_-]{20,}\b/g;
const NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function safeText(value: unknown): string | undefined {
  return typeof value === "string" ? value.replace(TOKEN_PATTERN, "[redacted token]") : undefined;
}

function getNestedRecord(record: UnknownRecord, key: string): UnknownRecord {
  const value = record[key];
  return isRecord(value) ? value : {};
}

/** Converts Telegraf/API/network exceptions into stable internal error categories. */
export function mapTelegramError(error: unknown): TelegramAdapterError {
  if (error instanceof TelegramAdapterError) return error;

  const root = isRecord(error) ? error : {};
  const response = getNestedRecord(root, "response");
  const parameters = getNestedRecord(response, "parameters");
  const description = safeText(response.description) ?? safeText(root.description) ?? safeText(root.message);
  const rawCode = typeof response.error_code === "number"
    ? response.error_code
    : typeof root.error_code === "number"
      ? root.error_code
      : undefined;
  const rawNetworkCode = typeof root.code === "string" ? root.code : undefined;
  const retryAfterSeconds = typeof parameters.retry_after === "number"
    ? Math.max(0, parameters.retry_after)
    : undefined;

  let category: TelegramAdapterErrorCategory = "unknown";
  let message = "An unexpected Telegram adapter error occurred.";
  let recoverable = true;

  if (rawCode === 401 || /unauthorized|invalid token/i.test(description ?? "")) {
    category = "invalid_token";
    message = "Telegram rejected the bot token. Check the token in secure settings.";
    recoverable = false;
  } else if (rawCode === 429 || retryAfterSeconds !== undefined || /too many requests|retry after/i.test(description ?? "")) {
    category = "rate_limited";
    message = "Telegram rate limit reached; the adapter will retry when permitted.";
    recoverable = true;
  } else if (rawCode === 409 || /conflict|getUpdates.*webhook|another.*getupdates/i.test(description ?? "")) {
    category = "conflict";
    message = "Telegram polling conflict. Another polling session or webhook may be active.";
    recoverable = false;
  } else if (rawCode === 403 || /forbidden/i.test(description ?? "")) {
    category = "forbidden";
    message = "Telegram denied the operation. Check the bot permissions and chat access.";
    recoverable = false;
  } else if (rawCode === 404) {
    category = "not_found";
    message = "Telegram could not find the requested resource.";
    recoverable = false;
  } else if ((rawCode !== undefined && rawCode >= 400 && rawCode < 500) || /bad request/i.test(description ?? "")) {
    category = "bad_request";
    message = description ? `Telegram rejected the request: ${description}` : "Telegram rejected the request.";
    recoverable = false;
  } else if (
    (rawNetworkCode !== undefined && NETWORK_CODES.has(rawNetworkCode)) ||
    /fetcherror|network error|socket hang up|connection timed out/i.test(description ?? "") ||
    root.name === "FetchError"
  ) {
    category = "network";
    message = "The Telegram network request failed; the adapter will retry.";
    recoverable = true;
  } else if (rawCode !== undefined && rawCode >= 500) {
    category = "api_error";
    message = description ? `Telegram API error (${rawCode}): ${description}` : `Telegram API error (${rawCode}).`;
    recoverable = true;
  } else if (description) {
    message = description;
  }

  return new TelegramAdapterError(category, message, {
    ...(rawCode === undefined ? {} : { telegramCode: rawCode }),
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    recoverable,
    originalError: error,
  });
}

/**
 * Normalizes only message and callback_query updates. Unsupported update kinds
 * are deliberately acknowledged by polling but do not enter the flow router.
 */
export function normalizeTelegramUpdate(raw: unknown): TelegramInboundUpdate | null {
  if (!isRecord(raw) || typeof raw.update_id !== "number" || !Number.isInteger(raw.update_id)) return null;

  const message = isRecord(raw.message) ? raw.message : undefined;
  if (message) {
    const chat = getNestedRecord(message, "chat");
    const from = getNestedRecord(message, "from");
    if ((typeof chat.id !== "number" && typeof chat.id !== "string") || !Number.isInteger(message.message_id)) {
      return null;
    }

    const output: TelegramInboundUpdate = {
      updateId: raw.update_id,
      kind: "message",
      chatId: String(chat.id),
      userId: String(typeof from.id === "number" || typeof from.id === "string" ? from.id : chat.id),
      date: typeof message.date === "number" ? message.date : 0,
      messageId: message.message_id as number,
    };
    if (typeof message.text === "string") output.text = message.text;
    return output;
  }

  const callback = isRecord(raw.callback_query) ? raw.callback_query : undefined;
  if (!callback || typeof callback.id !== "string") return null;
  const callbackMessage = isRecord(callback.message) ? callback.message : undefined;
  if (!callbackMessage) return null;
  const chat = getNestedRecord(callbackMessage, "chat");
  const from = getNestedRecord(callback, "from");
  if (typeof chat.id !== "number" && typeof chat.id !== "string") return null;

  const output: TelegramInboundUpdate = {
    updateId: raw.update_id,
    kind: "callback_query",
    chatId: String(chat.id),
    userId: String(typeof from.id === "number" || typeof from.id === "string" ? from.id : chat.id),
    date: typeof callbackMessage.date === "number" ? callbackMessage.date : 0,
    callbackQueryId: callback.id,
  };
  if (typeof callbackMessage.message_id === "number") output.messageId = callbackMessage.message_id;
  if (typeof callback.data === "string") output.callbackData = callback.data;
  return output;
}

function mapIdentity(value: { id: number; first_name: string; username?: string; is_bot: boolean }): TelegramBotIdentity {
  return {
    id: value.id,
    firstName: value.first_name,
    isBot: value.is_bot,
    ...(value.username === undefined ? {} : { username: value.username }),
  };
}

function summarizeError(error: TelegramAdapterError): NonNullable<TelegramClientStatus["lastError"]> {
  return {
    category: error.category,
    message: error.message,
    recoverable: error.recoverable,
    ...(error.telegramCode === undefined ? {} : { telegramCode: error.telegramCode }),
  };
}

/** Telegraf-backed Bot API wrapper with a single, explicit long-polling loop. */
export class TelegramClient implements TelegramClientPort {
  private bot: Telegraf | undefined;
  private active = false;
  private pollPromise: Promise<void> | undefined;
  private onUpdate: TelegramUpdateHandler | undefined;
  private onError: TelegramErrorHandler | undefined;
  private nextOffset = 0;
  private retryWake: (() => void) | undefined;
  private status: TelegramClientStatus = { state: "stopped", updatedAt: new Date().toISOString() };
  private readonly pollTimeoutSeconds: number;
  private readonly retryBaseMilliseconds: number;
  private readonly retryMaximumMilliseconds: number;

  constructor(private readonly token: string, options: TelegramClientOptions = {}) {
    this.pollTimeoutSeconds = Math.min(30, Math.max(1, Math.floor(options.pollTimeoutSeconds ?? DEFAULT_POLL_TIMEOUT_SECONDS)));
    this.retryBaseMilliseconds = Math.max(50, options.retryBaseMilliseconds ?? DEFAULT_RETRY_BASE_MILLISECONDS);
    this.retryMaximumMilliseconds = Math.max(this.retryBaseMilliseconds, options.retryMaximumMilliseconds ?? DEFAULT_RETRY_MAXIMUM_MILLISECONDS);
  }

  getStatus(): TelegramClientStatus {
    return { ...this.status, ...(this.status.botIdentity ? { botIdentity: { ...this.status.botIdentity } } : {}) };
  }

  async start(onUpdate: TelegramUpdateHandler, onError: TelegramErrorHandler): Promise<TelegramBotIdentity> {
    if (this.active || this.status.state === "starting" || this.status.state === "running") {
      throw new TelegramAdapterError("client_state", "Telegram client is already running.", { recoverable: true });
    }
    if (this.token.trim().length === 0) {
      const error = new TelegramAdapterError("invalid_token", "No Telegram bot token was provided by the trusted caller.", { recoverable: false });
      this.setStatus("error", error);
      throw error;
    }

    this.setStatus("starting");
    const bot = new Telegraf(this.token);
    try {
      // Validate the token and ensure polling is not competing with a webhook.
      // Pending updates are preserved; no token is included in diagnostics.
      const identity = mapIdentity(await bot.telegram.getMe());
      await bot.telegram.deleteWebhook({ drop_pending_updates: false });

      this.bot = bot;
      this.onUpdate = onUpdate;
      this.onError = onError;
      this.nextOffset = 0;
      this.active = true;
      this.status = { state: "running", updatedAt: new Date().toISOString(), botIdentity: identity };
      this.pollPromise = this.pollLoop();
      return identity;
    } catch (error) {
      const mapped = mapTelegramError(error);
      this.setStatus("error", mapped);
      this.bot = undefined;
      throw mapped;
    }
  }

  async stop(): Promise<void> {
    if (this.status.state === "stopped" && !this.active) return;
    this.setStatus("stopping");
    this.active = false;
    this.retryWake?.();
    this.retryWake = undefined;
    await this.pollPromise?.catch(() => undefined);
    this.pollPromise = undefined;
    this.bot = undefined;
    this.onUpdate = undefined;
    this.onError = undefined;
    this.status = { state: "stopped", updatedAt: new Date().toISOString() };
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    await this.requireBot().telegram.sendMessage(chatId, text);
  }

  async sendPhoto(chatId: string, url: string, caption?: string): Promise<void> {
    await this.requireBot().telegram.sendPhoto(chatId, url, caption === undefined ? {} : { caption });
  }

  async sendInlineKeyboard(
    chatId: string,
    text: string,
    buttons: readonly TelegramInlineButton[],
    callbackPrefix: "button" | "choice",
  ): Promise<void> {
    const rows = buttons.map((button) => {
      const callbackData = `${callbackPrefix}:${button.id}`;
      if (Buffer.byteLength(callbackData, "utf8") > 64) {
        throw new TelegramAdapterError("bad_request", "A flow option identifier exceeds Telegram's 64-byte callback-data limit.", { recoverable: false });
      }
      return [Markup.button.callback(button.label, callbackData)];
    });
    await this.requireBot().telegram.sendMessage(chatId, text, Markup.inlineKeyboard(rows));
  }

  async answerCallbackQuery(callbackQueryId: string): Promise<void> {
    await this.requireBot().telegram.answerCbQuery(callbackQueryId);
  }

  private requireBot(): Telegraf {
    if (!this.bot || !this.active) {
      throw new TelegramAdapterError("client_state", "Telegram client is not running.", { recoverable: true });
    }
    return this.bot;
  }

  private async pollLoop(): Promise<void> {
    let retryAttempt = 0;
    while (this.active) {
      try {
        const bot = this.bot;
        if (!bot) break;
        const updates = await bot.telegram.getUpdates(
          this.pollTimeoutSeconds,
          100,
          this.nextOffset,
          ["message", "callback_query"],
        );
        retryAttempt = 0;

        for (const update of updates) {
          if (!this.active) break;
          try {
            const normalized = normalizeTelegramUpdate(update);
            if (normalized) await this.onUpdate?.(normalized);
          } catch (error) {
            const mapped = mapTelegramError(error);
            // An outbound error for one chat (for example, that user blocked the
            // bot) should not falsely mark the whole polling session as stopped.
            // Authentication and polling conflicts remain fatal to the session.
            const handlerError = mapped.category === "invalid_token" || mapped.category === "conflict"
              ? mapped
              : new TelegramAdapterError(mapped.category, mapped.message, {
                ...(mapped.telegramCode === undefined ? {} : { telegramCode: mapped.telegramCode }),
                ...(mapped.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: mapped.retryAfterSeconds }),
                recoverable: true,
                originalError: error,
              });
            if (!handlerError.recoverable) {
              this.active = false;
              this.setStatus("error", handlerError);
            }
            await this.reportError(handlerError);
          } finally {
            // Telegram confirms previously delivered updates when this offset is
            // used in the next getUpdates call. Advance only after handler settles.
            this.nextOffset = Math.max(this.nextOffset, update.update_id + 1);
          }
        }
      } catch (error) {
        if (!this.active) break;
        const mapped = mapTelegramError(error);
        await this.reportError(mapped);
        if (!mapped.recoverable) {
          this.active = false;
          this.setStatus("error", mapped);
          break;
        }
        const exponential = Math.min(this.retryMaximumMilliseconds, this.retryBaseMilliseconds * (2 ** Math.min(retryAttempt, 10)));
        // Honour Telegram's retry_after exactly when supplied; capping a server
        // rate-limit delay could immediately generate another rejected request.
        const delay = mapped.retryAfterSeconds === undefined
          ? exponential
          : Math.max(exponential, mapped.retryAfterSeconds * 1000);
        retryAttempt += 1;
        await this.waitForRetry(delay);
      }
    }
  }

  private async reportError(error: TelegramAdapterError): Promise<void> {
    this.status = {
      ...this.status,
      updatedAt: new Date().toISOString(),
      lastError: summarizeError(error),
    };
    try {
      await this.onError?.(error);
    } catch {
      // A diagnostic callback must not crash or fork the polling loop.
    }
  }

  private waitForRetry(milliseconds: number): Promise<void> {
    if (!this.active) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.retryWake = undefined;
        resolve();
      }, milliseconds);
      this.retryWake = () => {
        clearTimeout(timer);
        this.retryWake = undefined;
        resolve();
      };
    });
  }

  private setStatus(state: TelegramClientStatus["state"], error?: TelegramAdapterError): void {
    this.status = {
      state,
      updatedAt: new Date().toISOString(),
      ...(this.status.botIdentity && state !== "stopped" && state !== "starting" ? { botIdentity: this.status.botIdentity } : {}),
      ...(error === undefined ? {} : { lastError: summarizeError(error) }),
    };
  }
}
