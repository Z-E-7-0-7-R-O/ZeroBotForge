import { setRuntimeStatus } from "../store/app.store";
import type {
  BotRuntimeStatus,
  DesktopApi,
  DesktopApiResult,
  TelegramConnectionStatus,
} from "../types/electron-api";

function getDesktopApi(): DesktopApi {
  if (typeof window === "undefined" || !window.zeroBotForge) {
    throw new Error(
      "The ZeroBotForge desktop API is only available inside the Electron desktop shell.",
    );
  }
  return window.zeroBotForge;
}

function unwrapDesktopResult<T>(
  response: DesktopApiResult<T>,
  fallbackMessage: string,
): T {
  if (!response.ok) {
    throw new Error(response.error.message || fallbackMessage);
  }
  return response.data;
}

export const telegramService = {
  async getStatus(): Promise<TelegramConnectionStatus> {
    return unwrapDesktopResult(
      await getDesktopApi().telegram.getStatus(),
      "Failed to query Telegram token status.",
    );
  },

  async setToken(token: string): Promise<TelegramConnectionStatus> {
    const status = unwrapDesktopResult(
      await getDesktopApi().telegram.setToken({ token }),
      "Failed to save the Telegram bot token.",
    );
    await this.getRuntimeStatus({ checkTelegram: false }).catch(() => null);
    return status;
  },

  async clearToken(): Promise<TelegramConnectionStatus> {
    const status = unwrapDesktopResult(
      await getDesktopApi().telegram.clearToken(),
      "Failed to remove the saved Telegram bot token.",
    );
    await this.getRuntimeStatus({ checkTelegram: false }).catch(() => null);
    return status;
  },

  async testConnection(): Promise<TelegramConnectionStatus> {
    const status = unwrapDesktopResult(
      await getDesktopApi().telegram.testConnection(),
      "Telegram connection test failed.",
    );
    await this.getRuntimeStatus({ checkTelegram: true }).catch(() => null);
    return status;
  },

  async getRuntimeStatus(options?: {
    checkTelegram?: boolean;
  }): Promise<BotRuntimeStatus> {
    const api = getDesktopApi();
    if (!api.runtime) {
      throw new Error("The bot runtime service is not available in this session.");
    }
    const status = unwrapDesktopResult(
      await api.runtime.getStatus(options),
      "Failed to retrieve bot runtime status.",
    );
    setRuntimeStatus(status);
    return status;
  },

  async openGeneratedProject(): Promise<BotRuntimeStatus | null> {
    const api = getDesktopApi();
    if (!api.runtime) {
      throw new Error("The bot runtime service is not available in this session.");
    }
    const status = unwrapDesktopResult(
      await api.runtime.openGeneratedProject(),
      "Opening the generated bot project folder failed.",
    );
    if (status) {
      setRuntimeStatus(status);
    }
    return status;
  },

  async compileGeneratedProject(
    directoryPath?: string,
  ): Promise<BotRuntimeStatus> {
    const api = getDesktopApi();
    if (!api.runtime) {
      throw new Error("The bot runtime service is not available in this session.");
    }
    try {
      const status = unwrapDesktopResult(
        await api.runtime.compile(
          directoryPath ? { directoryPath } : undefined,
        ),
        "Compiling the generated bot project failed.",
      );
      setRuntimeStatus(status);
      return status;
    } catch (error) {
      await this.getRuntimeStatus({ checkTelegram: false }).catch(() => null);
      throw error;
    }
  },

  async startBotRuntime(directoryPath?: string): Promise<BotRuntimeStatus> {
    const api = getDesktopApi();
    if (!api.runtime) {
      throw new Error("The bot runtime service is not available in this session.");
    }
    try {
      const status = unwrapDesktopResult(
        await api.runtime.start(
          directoryPath ? { directoryPath } : undefined,
        ),
        "Starting the local bot runtime failed.",
      );
      setRuntimeStatus(status);
      return status;
    } catch (error) {
      await this.getRuntimeStatus({ checkTelegram: false }).catch(() => null);
      throw error;
    }
  },

  async stopBotRuntime(): Promise<BotRuntimeStatus> {
    const api = getDesktopApi();
    if (!api.runtime) {
      throw new Error("The bot runtime service is not available in this session.");
    }
    const status = unwrapDesktopResult(
      await api.runtime.stop(),
      "Stopping the local bot runtime failed.",
    );
    setRuntimeStatus(status);
    return status;
  },

  async clearRuntimeLogs(): Promise<BotRuntimeStatus> {
    const api = getDesktopApi();
    if (!api.runtime) {
      throw new Error("The bot runtime service is not available in this session.");
    }
    const status = unwrapDesktopResult(
      await api.runtime.clearLogs(),
      "Clearing the runtime terminal output failed.",
    );
    setRuntimeStatus(status);
    return status;
  },

  async deleteGeneratedProject(
    directoryPath?: string,
  ): Promise<BotRuntimeStatus> {
    const api = getDesktopApi();
    if (!api.runtime) {
      throw new Error("The bot runtime service is not available in this session.");
    }
    const status = unwrapDesktopResult(
      await api.runtime.deleteGeneratedProject(
        directoryPath ? { directoryPath } : undefined,
      ),
      "Deleting the generated bot project failed.",
    );
    setRuntimeStatus(status);
    return status;
  },
};