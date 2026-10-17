import { dialog } from "electron";
import type { BotRuntimeStatus } from "../../src/types/electron-api.js";
import { DesktopApplicationError } from "../errors.js";
import type { BotRuntimeService } from "../services/bot-runtime.service.js";
import { IPC_CHANNELS } from "./channels.js";
import { registerSecureHandler, type MainWindowProvider } from "./secure-handler.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function registerRuntimeIpc(
  getMainWindow: MainWindowProvider,
  runtimeService: BotRuntimeService,
): void {
  registerSecureHandler(
    IPC_CHANNELS.runtimeGetStatus,
    getMainWindow,
    async (_event, input): Promise<BotRuntimeStatus> => {
      const checkTelegram =
        isRecord(input) && typeof input.checkTelegram === "boolean"
          ? input.checkTelegram
          : false;
      return runtimeService.getStatus({ checkTelegram });
    },
  );

  registerSecureHandler(
    IPC_CHANNELS.runtimeOpenGeneratedProject,
    getMainWindow,
    async (): Promise<BotRuntimeStatus | null> => {
      const window = getMainWindow();
      if (!window || window.isDestroyed()) {
        throw new DesktopApplicationError(
          "WINDOW_UNAVAILABLE",
          "The main application window is not available.",
        );
      }

      const selection = await dialog.showOpenDialog(window, {
        title: "Select an existing generated bot project folder",
        properties: ["openDirectory"],
      });

      if (selection.canceled || selection.filePaths.length === 0) {
        return null;
      }

      return runtimeService.openExistingGeneratedDirectory(
        selection.filePaths[0]!,
      );
    },
  );

  registerSecureHandler(
    IPC_CHANNELS.runtimeCompile,
    getMainWindow,
    async (_event, input): Promise<BotRuntimeStatus> => {
      const directoryPath =
        isRecord(input) && typeof input.directoryPath === "string"
          ? input.directoryPath
          : undefined;
      return runtimeService.compile(directoryPath);
    },
  );

  registerSecureHandler(
    IPC_CHANNELS.runtimeStart,
    getMainWindow,
    async (_event, input): Promise<BotRuntimeStatus> => {
      const directoryPath =
        isRecord(input) && typeof input.directoryPath === "string"
          ? input.directoryPath
          : undefined;
      return runtimeService.start(directoryPath);
    },
  );

  registerSecureHandler(
    IPC_CHANNELS.runtimeStop,
    getMainWindow,
    async (): Promise<BotRuntimeStatus> => {
      return runtimeService.stop();
    },
  );

  registerSecureHandler(
    IPC_CHANNELS.runtimeClearLogs,
    getMainWindow,
    async (): Promise<BotRuntimeStatus> => {
      return runtimeService.clearLogs();
    },
  );

  registerSecureHandler(
    IPC_CHANNELS.runtimeDeleteGeneratedProject,
    getMainWindow,
    async (_event, input): Promise<BotRuntimeStatus> => {
      const directoryPath =
        isRecord(input) && typeof input.directoryPath === "string"
          ? input.directoryPath
          : undefined;
      return runtimeService.deleteGeneratedDirectory(directoryPath);
    },
  );
}