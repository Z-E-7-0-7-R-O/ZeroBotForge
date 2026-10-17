import { dialog } from "electron";
import { basename, resolve } from "node:path";
import { DesktopApplicationError } from "../errors.js";
import { ProjectFileSystemService } from "../services/file-system.service.js";
import { IPC_CHANNELS } from "./channels.js";
import { registerSecureHandler } from "./secure-handler.js";
import type { MainWindowProvider } from "./secure-handler.js";
import type { BotRuntimeService } from "../services/bot-runtime.service.js";
import type { SecureStorageService } from "../services/secure-storage.service.js";
import { registerGeneratedProjectExportIpc } from "./generated-project-export.ipc.js";

const projectFileSystem = new ProjectFileSystemService();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireDocument(input: unknown): unknown {
  if (!isRecord(input) || !Object.prototype.hasOwnProperty.call(input, "document")) {
    throw new DesktopApplicationError("EXPORT_INPUT_INVALID", "A valid project document must be provided.");
  }
  return input.document;
}

function safeFileName(value: string): string {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "").trim().slice(0, 80);
  return cleaned || "ZeroBotForge-Project";
}

export function registerExportIpc(
  getMainWindow: MainWindowProvider,
  secureStorage?: SecureStorageService,
  runtimeService?: BotRuntimeService,
): void {
  registerSecureHandler(
    IPC_CHANNELS.exportProjectJson,
    getMainWindow,
    async (_event, input) => {
      const window = getMainWindow();
      if (!window || window.isDestroyed()) {
        throw new DesktopApplicationError("WINDOW_UNAVAILABLE", "The main application window is not available.");
      }
      const document = requireDocument(input);
      const normalizedDocument = await projectFileSystem.validateForSave(document);
      const result = await dialog.showSaveDialog(window, {
        title: "Export Project JSON",
        defaultPath: `${safeFileName(normalizedDocument.name)}.json`,
        filters: [{ name: "JSON Project", extensions: ["json"] }],
        properties: ["createDirectory", "showOverwriteConfirmation"],
      });
      if (result.canceled || !result.filePath) return null;
      const filePath = resolve(result.filePath);
      await projectFileSystem.writeProject(filePath, normalizedDocument);
      return { filePath, fileName: basename(filePath) };
    },
  );

  registerGeneratedProjectExportIpc(getMainWindow, secureStorage, runtimeService);
}