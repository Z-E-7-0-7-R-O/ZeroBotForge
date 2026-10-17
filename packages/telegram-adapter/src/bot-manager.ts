import type {
  BotManagerStatus,
  TelegramAdapterErrorCategory,
  TelegramBotIdentity,
  TelegramClientPort,
  TelegramInboundUpdate,
} from "./types";
import { TelegramAdapterError } from "./types";

export type BotUpdateHandler = (update: TelegramInboundUpdate) => void | Promise<void>;

function statusError(error: TelegramAdapterError): NonNullable<BotManagerStatus["lastError"]> {
  return {
    category: error.category as TelegramAdapterErrorCategory,
    message: error.message,
    recoverable: error.recoverable,
    ...(error.telegramCode === undefined ? {} : { telegramCode: error.telegramCode }),
  };
}

/** Owns one client's lifecycle and prevents duplicate polling starts. */
export class TelegramBotManager {
  private state: BotManagerStatus = { state: "stopped", updatedAt: new Date().toISOString() };
  private startPromise: Promise<BotManagerStatus> | undefined;
  private stopPromise: Promise<BotManagerStatus> | undefined;
  private identity: TelegramBotIdentity | undefined;

  constructor(
    private readonly client: TelegramClientPort,
    private readonly onUpdate: BotUpdateHandler,
  ) {}

  getStatus(): BotManagerStatus {
    return {
      ...this.state,
      ...(this.identity ? { botIdentity: { ...this.identity } } : {}),
      ...(this.state.lastError ? { lastError: { ...this.state.lastError } } : {}),
    };
  }

  start(): Promise<BotManagerStatus> {
    if (this.state.state === "running") return Promise.resolve(this.getStatus());
    if (this.state.state === "starting" && this.startPromise) return this.startPromise;
    if (this.state.state === "stopping" && this.stopPromise) {
      return this.stopPromise.then(() => this.start());
    }

    this.setState("starting", { clearError: true });
    const operation = (async (): Promise<BotManagerStatus> => {
      try {
        this.identity = await this.client.start(
          async (update) => {
            try {
              await this.onUpdate(update);
            } catch (error) {
              const mapped = error instanceof TelegramAdapterError
                ? error
                : new TelegramAdapterError("unknown", error instanceof Error ? error.message : "Update handler failed.", { originalError: error });
              this.recordRuntimeError(mapped);
              throw mapped;
            }
          },
          async (error) => this.recordRuntimeError(error),
        );
        if (this.state.state === "starting") {
          this.setState("running", { clearError: false });
        }
        return this.getStatus();
      } catch (error) {
        const mapped = error instanceof TelegramAdapterError
          ? error
          : new TelegramAdapterError("unknown", error instanceof Error ? error.message : "Bot start failed.", { recoverable: false, originalError: error });
        this.setState("error", { error: mapped, clearError: false });
        throw mapped;
      }
    })();
    this.startPromise = operation;
    void operation.finally(() => {
      if (this.startPromise === operation) this.startPromise = undefined;
    }).catch(() => undefined);
    return operation;
  }

  stop(): Promise<BotManagerStatus> {
    if (this.state.state === "stopped") return Promise.resolve(this.getStatus());
    if (this.state.state === "stopping" && this.stopPromise) return this.stopPromise;

    const startup = this.startPromise;
    // Flip state before the first await so concurrent stop() calls share one operation,
    // even when start() is still in its token-validation/network preflight.
    this.setState("stopping", { clearError: false });
    const operation = (async (): Promise<BotManagerStatus> => {
      if (startup) await startup.catch(() => undefined);
      try {
        await this.client.stop();
        this.identity = undefined;
        this.setState("stopped", { clearError: true });
        return this.getStatus();
      } catch (error) {
        const mapped = error instanceof TelegramAdapterError
          ? error
          : new TelegramAdapterError("unknown", error instanceof Error ? error.message : "Bot stop failed.", { originalError: error });
        this.setState("error", { error: mapped, clearError: false });
        throw mapped;
      }
    })();
    this.stopPromise = operation;
    void operation.finally(() => {
      if (this.stopPromise === operation) this.stopPromise = undefined;
    }).catch(() => undefined);
    return operation;
  }

  private recordRuntimeError(error: TelegramAdapterError): void {
    const isFatal = !error.recoverable;
    this.state = {
      ...this.state,
      state: isFatal ? "error" : this.state.state,
      updatedAt: new Date().toISOString(),
      lastError: statusError(error),
    };
  }

  private setState(
    state: BotManagerStatus["state"],
    options: { error?: TelegramAdapterError; clearError: boolean },
  ): void {
    const now = new Date().toISOString();
    this.state = {
      state,
      updatedAt: now,
      ...(state === "running" ? { startedAt: now } : {}),
      ...(state === "stopped" ? { stoppedAt: now } : {}),
      ...(this.identity ? { botIdentity: { ...this.identity } } : {}),
      ...(options.error ? { lastError: statusError(options.error) } : {}),
      ...(!options.clearError && !options.error && this.state.lastError ? { lastError: this.state.lastError } : {}),
    };
  }
}
