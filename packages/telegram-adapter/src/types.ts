import type { JsonValue } from "@zerobotforge/shared";
import type { FlowDefinition, FlowExecutionResult } from "@zerobotforge/flow-engine";

export type TelegramAdapterErrorCategory =
  | "invalid_token"
  | "rate_limited"
  | "network"
  | "conflict"
  | "forbidden"
  | "not_found"
  | "bad_request"
  | "api_error"
  | "client_state"
  | "unknown";

export interface TelegramAdapterErrorOptions {
  telegramCode?: number;
  retryAfterSeconds?: number;
  recoverable?: boolean;
  originalError?: unknown;
}

/** Internal, token-safe error contract used across the adapter package. */
export class TelegramAdapterError extends Error {
  readonly category: TelegramAdapterErrorCategory;
  readonly telegramCode?: number;
  readonly retryAfterSeconds?: number;
  readonly recoverable: boolean;
  readonly originalError?: unknown;

  constructor(
    category: TelegramAdapterErrorCategory,
    message: string,
    options: TelegramAdapterErrorOptions = {},
  ) {
    super(message);
    this.name = "TelegramAdapterError";
    this.category = category;
    if (options.telegramCode !== undefined) this.telegramCode = options.telegramCode;
    if (options.retryAfterSeconds !== undefined) this.retryAfterSeconds = options.retryAfterSeconds;
    this.recoverable = options.recoverable ?? true;
    if (options.originalError !== undefined) this.originalError = options.originalError;
  }
}

export interface TelegramBotIdentity {
  id: number;
  firstName: string;
  username?: string;
  isBot: boolean;
}

/** Telegram updates are normalized before they cross the adapter boundary. */
export interface TelegramInboundUpdate {
  updateId: number;
  kind: "message" | "callback_query";
  chatId: string;
  userId: string;
  date: number;
  messageId?: number;
  text?: string;
  callbackQueryId?: string;
  callbackData?: string;
}

export type TelegramUpdateHandler = (update: TelegramInboundUpdate) => void | Promise<void>;
export type TelegramErrorHandler = (error: TelegramAdapterError) => void | Promise<void>;

export interface TelegramInlineButton {
  id: string;
  label: string;
}

export interface TelegramClientStatus {
  state: "stopped" | "starting" | "running" | "stopping" | "error";
  updatedAt: string;
  botIdentity?: TelegramBotIdentity;
  lastError?: {
    category: TelegramAdapterErrorCategory;
    message: string;
    telegramCode?: number;
    recoverable: boolean;
  };
}

/** Small surface area exposed to routing and lifecycle management. */
export interface TelegramClientPort {
  start(onUpdate: TelegramUpdateHandler, onError: TelegramErrorHandler): Promise<TelegramBotIdentity>;
  stop(): Promise<void>;
  getStatus(): TelegramClientStatus;
  sendMessage(chatId: string, text: string): Promise<void>;
  sendPhoto(chatId: string, url: string, caption?: string): Promise<void>;
  sendInlineKeyboard(
    chatId: string,
    text: string,
    buttons: readonly TelegramInlineButton[],
    callbackPrefix: "button" | "choice",
  ): Promise<void>;
  answerCallbackQuery(callbackQueryId: string): Promise<void>;
}

export type ConversationExecutionStatus = FlowExecutionResult["status"];

/** Persisted continuation data; no Telegram library objects are stored here. */
export interface ConversationState {
  projectId: string;
  chatId: string;
  flowId: FlowDefinition["id"] | string;
  currentNodeId: NonNullable<FlowExecutionResult["currentNodeId"]> | null;
  status: ConversationExecutionStatus;
  variables: Record<string, JsonValue>;
  waitingFor: "button" | "choice" | null;
  lastUpdateId: number;
  updatedAt: string;
}

export type BotManagerState = "stopped" | "starting" | "running" | "stopping" | "error";

export interface BotManagerStatus {
  state: BotManagerState;
  updatedAt: string;
  startedAt?: string;
  stoppedAt?: string;
  botIdentity?: TelegramBotIdentity;
  lastError?: {
    category: TelegramAdapterErrorCategory;
    message: string;
    telegramCode?: number;
    recoverable: boolean;
  };
}
