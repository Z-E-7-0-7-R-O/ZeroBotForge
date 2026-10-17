import { dialog } from "electron";
import { lstat, mkdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { GeneratedProjectFile } from "../../src/types/electron-api.js";
import { atomicWriteFile } from "../services/file-system.service.js";
import { DesktopApplicationError } from "../errors.js";
import type { BotRuntimeService } from "../services/bot-runtime.service.js";
import type { SecureStorageService } from "../services/secure-storage.service.js";
import { IPC_CHANNELS } from "./channels.js";
import { registerSecureHandler } from "./secure-handler.js";
import type { MainWindowProvider } from "./secure-handler.js";

const ALLOWED_OUTPUT_PATHS = new Set([
  "package.json",
  "tsconfig.json",
  ".env.example",
  "project.json",
  "README.md",
  "src/bot.ts",
  "src/handlers.ts",
]);
const REQUIRED_OUTPUT_PATHS = [
  "package.json",
  "tsconfig.json",
  ".env.example",
  "project.json",
  "README.md",
  "src/bot.ts",
  "src/handlers.ts",
] as const;
const MAX_GENERATED_FILES = 20;
const MAX_GENERATED_FILE_BYTES = 2 * 1024 * 1024;
const MAX_GENERATED_TOTAL_BYTES = 8 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeFolderName(value: string): string {
  const cleaned = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "").replace(/\s+/g, "-").slice(0, 64);
  return cleaned || "zerobotforge-generated-bot";
}

function validateFiles(input: unknown): { projectName: string; files: GeneratedProjectFile[] } {
  if (!isRecord(input) || typeof input.projectName !== "string" || !Array.isArray(input.files)) {
    throw new DesktopApplicationError("GENERATED_EXPORT_INPUT_INVALID", "A project name and generated file list must be provided.");
  }
  const projectName = input.projectName.trim();
  if (!projectName || projectName.length > 120) {
    throw new DesktopApplicationError("GENERATED_EXPORT_NAME_INVALID", "The generated project name must contain between 1 and 120 characters.");
  }
  if (input.files.length === 0 || input.files.length > MAX_GENERATED_FILES) {
    throw new DesktopApplicationError("GENERATED_EXPORT_FILE_COUNT_INVALID", `Generated exports must contain between 1 and ${MAX_GENERATED_FILES} files.`);
  }

  const seen = new Set<string>();
  let totalBytes = 0;
  const files: GeneratedProjectFile[] = [];
  for (const candidate of input.files) {
    if (!isRecord(candidate) || typeof candidate.path !== "string" || typeof candidate.content !== "string") {
      throw new DesktopApplicationError("GENERATED_EXPORT_FILE_INVALID", "Each generated file must have a relative path and text content.");
    }
    const relativePath = candidate.path;
    if (!ALLOWED_OUTPUT_PATHS.has(relativePath) || relativePath.includes("\\") || relativePath.startsWith("/") || /^[A-Za-z]:/.test(relativePath) || relativePath.split("/").some((part) => part === ".." || part === "." || part.length === 0 || !/^[A-Za-z0-9._-]+$/.test(part))) {
      throw new DesktopApplicationError("GENERATED_EXPORT_PATH_INVALID", `Generated output path "${relativePath}" is not allowed.`);
    }
    const key = relativePath.toLowerCase();
    if (seen.has(key)) {
      throw new DesktopApplicationError("GENERATED_EXPORT_PATH_DUPLICATE", `Generated output path "${relativePath}" is duplicated.`);
    }
    seen.add(key);
    const bytes = Buffer.byteLength(candidate.content, "utf8");
    if (bytes > MAX_GENERATED_FILE_BYTES) {
      throw new DesktopApplicationError("GENERATED_EXPORT_FILE_TOO_LARGE", `Generated file "${relativePath}" exceeds the 2 MB file limit.`);
    }
    totalBytes += bytes;
    if (totalBytes > MAX_GENERATED_TOTAL_BYTES) {
      throw new DesktopApplicationError("GENERATED_EXPORT_TOO_LARGE", "The generated project exceeds the 8 MB total size limit.");
    }
    files.push({ path: relativePath, content: candidate.content });
  }

  for (const required of REQUIRED_OUTPUT_PATHS) {
    if (!seen.has(required.toLowerCase())) {
      throw new DesktopApplicationError("GENERATED_EXPORT_MANIFEST_INCOMPLETE", `The generated output is missing required file "${required}".`);
    }
  }
  if (seen.size !== REQUIRED_OUTPUT_PATHS.length) {
    throw new DesktopApplicationError("GENERATED_EXPORT_MANIFEST_INVALID", "The generated output does not match the fixed output manifest.");
  }
  return { projectName, files };
}

async function chooseNewOutputDirectory(parent: string, projectName: string): Promise<string> {
  const safeBase = safeFolderName(projectName);
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? "-generated" : `-generated-${index + 1}`;
    const candidate = join(parent, `${safeBase}${suffix}`);
    try {
      await mkdir(candidate, { recursive: false });
      return candidate;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
        throw new DesktopApplicationError("GENERATED_EXPORT_DIRECTORY_CREATE_FAILED", "A new generated-project folder could not be created in the selected location.");
      }
    }
  }
  throw new DesktopApplicationError("GENERATED_EXPORT_DIRECTORY_COLLISION", "Too many folders with this name already exist. Select a different parent folder.");
}

async function ensureSafeSubdirectory(root: string, relativeDirectory: string): Promise<string> {
  const segments = relativeDirectory.split("/").filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    try {
      await mkdir(current, { recursive: false });
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
        throw new DesktopApplicationError("GENERATED_EXPORT_DIRECTORY_CREATE_FAILED", "A generated subdirectory could not be created.");
      }
    }
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new DesktopApplicationError("GENERATED_EXPORT_DIRECTORY_UNSAFE", "Generated output cannot be written through a symbolic link or a non-directory path.");
    }
  }
  return current;
}

export function registerGeneratedProjectExportIpc(
  getMainWindow: MainWindowProvider,
  secureStorage?: SecureStorageService,
  runtimeService?: BotRuntimeService,
): void {
  registerSecureHandler(
    IPC_CHANNELS.exportGeneratedProject,
    getMainWindow,
    async (_event, input) => {
      const window = getMainWindow();
      if (!window || window.isDestroyed()) {
        throw new DesktopApplicationError("WINDOW_UNAVAILABLE", "The main application window is not available.");
      }
      const validated = validateFiles(input);
      const selection = await dialog.showOpenDialog(window, {
        title: "Choose a folder for the generated bot project",
        properties: ["openDirectory", "createDirectory"],
      });
      if (selection.canceled || selection.filePaths.length === 0) return null;

      const parentDirectory = resolve(selection.filePaths[0]!);
      const parentInfo = await lstat(parentDirectory).catch(() => null);
      if (!parentInfo || parentInfo.isSymbolicLink() || !parentInfo.isDirectory()) {
        throw new DesktopApplicationError("GENERATED_EXPORT_DIRECTORY_INVALID", "Select a regular folder for the generated project output.");
      }

      const outputDirectory = await chooseNewOutputDirectory(parentDirectory, validated.projectName);
      let filesWritten = 0;
      let tokenConfigured = false;
      try {
        for (const file of validated.files) {
          const pathParts = file.path.split("/");
          const fileName = pathParts.pop();
          if (!fileName) {
            throw new DesktopApplicationError("GENERATED_EXPORT_PATH_INVALID", "A generated output filename is missing.");
          }
          const directory = pathParts.length > 0
            ? await ensureSafeSubdirectory(outputDirectory, pathParts.join("/"))
            : outputDirectory;
          await atomicWriteFile(join(directory, fileName), file.content);
          filesWritten += 1;
        }

        if (secureStorage) {
          const savedToken = await secureStorage.getTelegramToken().catch(() => null);
          const trimmedToken = savedToken?.trim() ?? "";
          tokenConfigured = trimmedToken.length > 0;
          await atomicWriteFile(
            join(outputDirectory, ".env"),
            `TELEGRAM_BOT_TOKEN=${trimmedToken}\n`,
          );
        }
      } catch (error) {
        // The directory was freshly created by this handler; remove partial output on failure.
        await rm(outputDirectory, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }

      if (filesWritten !== REQUIRED_OUTPUT_PATHS.length) {
        await rm(outputDirectory, { recursive: true, force: true }).catch(() => undefined);
        throw new DesktopApplicationError("GENERATED_EXPORT_INCOMPLETE", "The generated project was not fully written; the incomplete directory was removed.");
      }

      if (runtimeService) {
        await runtimeService.registerGeneratedDirectory({
          directoryPath: outputDirectory,
          projectName: validated.projectName,
        });
      }

      return {
        directoryPath: outputDirectory,
        projectName: validated.projectName,
        filesWritten,
        directoryName: basename(outputDirectory),
        tokenConfigured,
      };
    },
  );

  registerSecureHandler(
    IPC_CHANNELS.exportUpdateGeneratedProject,
    getMainWindow,
    async (_event, input) => {
      const validated = validateFiles(input);
      const rawDir =
        isRecord(input) && typeof input.directoryPath === "string" && input.directoryPath.trim().length > 0
          ? input.directoryPath.trim()
          : runtimeService?.getRegisteredDirectoryPath() ?? null;

      if (!rawDir) {
        throw new DesktopApplicationError(
          "GENERATED_UPDATE_NO_DIRECTORY",
          "Generate the bot project first before updating it.",
        );
      }

      const outputDirectory = resolve(rawDir);
      const dirInfo = await lstat(outputDirectory).catch(() => null);
      if (!dirInfo || dirInfo.isSymbolicLink() || !dirInfo.isDirectory()) {
        throw new DesktopApplicationError(
          "GENERATED_UPDATE_DIRECTORY_INVALID",
          "The existing generated bot project directory could not be found on disk.",
        );
      }

      if (runtimeService) {
        await runtimeService.stop();
      }

      let filesWritten = 0;
      let tokenConfigured = false;
      for (const file of validated.files) {
        const pathParts = file.path.split("/");
        const fileName = pathParts.pop();
        if (!fileName) {
          throw new DesktopApplicationError(
            "GENERATED_EXPORT_PATH_INVALID",
            "A generated output filename is missing.",
          );
        }
        const directory =
          pathParts.length > 0
            ? await ensureSafeSubdirectory(outputDirectory, pathParts.join("/"))
            : outputDirectory;
        await atomicWriteFile(join(directory, fileName), file.content);
        filesWritten += 1;
      }

      if (secureStorage) {
        const savedToken = await secureStorage.getTelegramToken().catch(() => null);
        const trimmedToken = savedToken?.trim() ?? "";
        tokenConfigured = trimmedToken.length > 0;
        await atomicWriteFile(
          join(outputDirectory, ".env"),
          `TELEGRAM_BOT_TOKEN=${trimmedToken}\n`,
        );
      }

      if (runtimeService) {
        await runtimeService.markUpdatedGeneratedDirectory({
          directoryPath: outputDirectory,
          projectName: validated.projectName,
        });
      }

      return {
        directoryPath: outputDirectory,
        projectName: validated.projectName,
        filesWritten,
        directoryName: basename(outputDirectory),
        tokenConfigured,
      };
    },
  );
}