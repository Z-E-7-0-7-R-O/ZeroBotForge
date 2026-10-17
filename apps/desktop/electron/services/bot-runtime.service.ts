import { spawn, type ChildProcess } from "node:child_process";
import { lstat, readFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type {
  BotRuntimeStatus,
  RuntimeLifecycleState,
  RuntimeLogEntry,
} from "../../src/types/electron-api.js";
import { DesktopApplicationError } from "../errors.js";
import { atomicWriteFile } from "./file-system.service.js";
import type { SecureStorageService } from "./secure-storage.service.js";

const MAX_LOG_ENTRIES = 400;
const TOKEN_REDACTION_PATTERN = /\b[0-9]{5,}:[A-Za-z0-9_-]{20,}\b/g;
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactSensitiveText(text: string, rawToken?: string | null): string {
  let sanitized = text.replace(TOKEN_REDACTION_PATTERN, "[REDACTED_TOKEN]");
  if (rawToken && rawToken.trim().length > 0) {
    sanitized = sanitized.split(rawToken.trim()).join("[REDACTED_TOKEN]");
  }
  return sanitized;
}

async function pathExistsAsFile(filePath: string): Promise<boolean> {
  try {
    const stats = await lstat(filePath);
    return stats.isFile() && !stats.isSymbolicLink();
  } catch {
    return false;
  }
}

async function pathExistsAsDirectory(directoryPath: string): Promise<boolean> {
  try {
    const stats = await lstat(directoryPath);
    return stats.isDirectory() && !stats.isSymbolicLink();
  } catch {
    return false;
  }
}

export class BotRuntimeService {
  private readonly secureStorage: SecureStorageService;
  private state: RuntimeLifecycleState = "idle";
  private directoryPath: string | null = null;
  private directoryName: string | null = null;
  private projectName: string | null = null;
  private isGenerated = false;
  private isCompiled = false;
  private compiledAt: string | null = null;
  private startedAt: string | null = null;
  private lastExitCode: number | null = null;
  private lastError: string | null = null;
  private tokenSyncedToEnv = false;
  private telegramConnected: boolean | null = null;
  private botUsername: string | null = null;
  private activeProcess: ChildProcess | null = null;
  private compileProcess: ChildProcess | null = null;
  private nextLogId = 1;
  private logs: RuntimeLogEntry[] = [];
  private activeTokenSnapshot: string | null = null;

  public constructor(secureStorage: SecureStorageService) {
    this.secureStorage = secureStorage;
  }

  private appendLog(
    stream: RuntimeLogEntry["stream"],
    rawMessage: string,
  ): void {
    const lines = rawMessage
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      const entry: RuntimeLogEntry = {
        id: this.nextLogId++,
        timestamp: new Date().toISOString(),
        stream,
        message: redactSensitiveText(line, this.activeTokenSnapshot),
      };
      this.logs.push(entry);
      if (this.logs.length > MAX_LOG_ENTRIES) {
        this.logs.splice(0, this.logs.length - MAX_LOG_ENTRIES);
      }
    }
  }

  private async resolveProjectEnvVarName(directoryPath: string): Promise<string> {
    try {
      const rawProject = await readFile(join(directoryPath, "project.json"), "utf8");
      const parsed = JSON.parse(rawProject) as unknown;
      if (
        isRecord(parsed) &&
        isRecord(parsed.bot) &&
        typeof parsed.bot.tokenEnvVar === "string" &&
        ENV_KEY_PATTERN.test(parsed.bot.tokenEnvVar.trim())
      ) {
        return parsed.bot.tokenEnvVar.trim();
      }
    } catch {
      // Fall back to the default environment variable name if project.json cannot be parsed.
    }
    return "TELEGRAM_BOT_TOKEN";
  }

  public async syncTokenToActiveDirectory(
    explicitToken?: string | null,
  ): Promise<boolean> {
    if (!this.directoryPath) {
      this.tokenSyncedToEnv = false;
      return false;
    }

    const exists = await pathExistsAsDirectory(this.directoryPath);
    if (!exists) {
      this.tokenSyncedToEnv = false;
      return false;
    }

    let token: string | null = null;
    if (explicitToken !== undefined) {
      token = explicitToken;
    } else {
      try {
        token = await this.secureStorage.getTelegramToken();
      } catch {
        token = null;
      }
    }

    this.activeTokenSnapshot = token;
    const envVarName = await this.resolveProjectEnvVarName(this.directoryPath);
    const trimmedToken = token?.trim() ?? "";

    const envLines: string[] = [];
    envLines.push(`TELEGRAM_BOT_TOKEN=${trimmedToken}`);
    if (envVarName !== "TELEGRAM_BOT_TOKEN") {
      envLines.push(`${envVarName}=${trimmedToken}`);
    }

    const envFilePath = join(this.directoryPath, ".env");
    await atomicWriteFile(envFilePath, `${envLines.join("\n")}\n`);
    this.tokenSyncedToEnv = trimmedToken.length > 0;
    return this.tokenSyncedToEnv;
  }

  public async registerGeneratedDirectory(input: {
    directoryPath: string;
    projectName: string;
  }): Promise<BotRuntimeStatus> {
    if (this.activeProcess) {
      await this.stop();
    }

    const resolvedDir = resolve(input.directoryPath);
    const dirExists = await pathExistsAsDirectory(resolvedDir);
    if (!dirExists) {
      throw new DesktopApplicationError(
        "RUNTIME_DIRECTORY_MISSING",
        "The generated project directory does not exist on disk.",
      );
    }

    this.directoryPath = resolvedDir;
    this.directoryName = basename(resolvedDir);
    this.projectName = input.projectName;
    this.isGenerated = true;
    this.isCompiled = await pathExistsAsFile(join(resolvedDir, "dist", "bot.js"));
    this.compiledAt = this.isCompiled ? new Date().toISOString() : null;
    this.startedAt = null;
    this.lastExitCode = null;
    this.lastError = null;
    this.state = this.isCompiled ? "compiled" : "generated";

    const synced = await this.syncTokenToActiveDirectory();
    this.appendLog(
      "system",
      `Registered generated project "${input.projectName}" in ${resolvedDir}.`,
    );
    this.appendLog(
      "system",
      synced
        ? "Telegram bot token from Secure Storage was automatically written to .env."
        : "No saved Telegram token found in Secure Storage yet. Save a token in Settings to populate .env automatically.",
    );

    return this.getStatus();
  }

  public getRegisteredDirectoryPath(): string | null {
    return this.directoryPath;
  }

  public async openExistingGeneratedDirectory(
    selectedDirectoryPath: string,
  ): Promise<BotRuntimeStatus> {
    if (this.compileProcess) {
      throw new DesktopApplicationError(
        "RUNTIME_COMPILE_IN_PROGRESS",
        "Wait for the active compilation process to finish before opening another bot project folder.",
      );
    }

    if (this.activeProcess) {
      await this.stop();
    }

    const resolvedDir = resolve(selectedDirectoryPath);
    const dirExists = await pathExistsAsDirectory(resolvedDir);
    if (!dirExists) {
      throw new DesktopApplicationError(
        "RUNTIME_DIRECTORY_MISSING",
        "The selected bot project folder does not exist on disk.",
      );
    }

    const hasPackageJson = await pathExistsAsFile(
      join(resolvedDir, "package.json"),
    );
    const hasProjectJson = await pathExistsAsFile(
      join(resolvedDir, "project.json"),
    );
    const hasBotSource = await pathExistsAsFile(
      join(resolvedDir, "src", "bot.ts"),
    );

    if (!hasPackageJson || (!hasProjectJson && !hasBotSource)) {
      throw new DesktopApplicationError(
        "RUNTIME_OPEN_INVALID_DIRECTORY",
        "The selected folder is not a valid generated ZeroBotForge bot project (missing package.json, project.json, or src/bot.ts).",
      );
    }

    let resolvedProjectName = basename(resolvedDir);
    if (hasProjectJson) {
      try {
        const rawProject = await readFile(
          join(resolvedDir, "project.json"),
          "utf8",
        );
        const parsed = JSON.parse(rawProject) as unknown;
        if (
          isRecord(parsed) &&
          typeof parsed.name === "string" &&
          parsed.name.trim().length > 0
        ) {
          resolvedProjectName = parsed.name.trim();
        }
      } catch {
        // Keep folder basename if project.json cannot be parsed.
      }
    }

    return this.registerGeneratedDirectory({
      directoryPath: resolvedDir,
      projectName: resolvedProjectName,
    });
  }

  public async markUpdatedGeneratedDirectory(input: {
    directoryPath: string;
    projectName: string;
  }): Promise<BotRuntimeStatus> {
    if (this.activeProcess) {
      await this.stop();
    }

    const resolvedDir = resolve(input.directoryPath);
    const dirExists = await pathExistsAsDirectory(resolvedDir);
    if (!dirExists) {
      throw new DesktopApplicationError(
        "RUNTIME_DIRECTORY_MISSING",
        "The generated project directory does not exist on disk.",
      );
    }

    // Remove the previous compiled entry file so the user compiles the updated TypeScript sources before running.
    await rm(join(resolvedDir, "dist", "bot.js"), { force: true }).catch(
      () => undefined,
    );

    this.directoryPath = resolvedDir;
    this.directoryName = basename(resolvedDir);
    this.projectName = input.projectName;
    this.isGenerated = true;
    this.isCompiled = false;
    this.compiledAt = null;
    this.lastError = null;
    this.state = "generated";

    await this.syncTokenToActiveDirectory();
    this.appendLog(
      "system",
      `Updated generated bot source files for "${input.projectName}" in ${resolvedDir}. Click Compile to build the updated flow and node changes.`,
    );

    return this.getStatus();
  }

  public async deleteGeneratedDirectory(
    directoryOverride?: string,
  ): Promise<BotRuntimeStatus> {
    if (this.compileProcess) {
      throw new DesktopApplicationError(
        "RUNTIME_COMPILE_IN_PROGRESS",
        "Cannot delete the generated project while compilation is in progress.",
      );
    }

    if (this.activeProcess) {
      await this.stop();
    }

    const targetPath =
      directoryOverride && directoryOverride.trim().length > 0
        ? resolve(directoryOverride.trim())
        : this.directoryPath;

    if (!targetPath) {
      throw new DesktopApplicationError(
        "RUNTIME_NOT_GENERATED",
        "No generated bot project directory is currently registered to delete.",
      );
    }

    const dirExists = await pathExistsAsDirectory(targetPath);
    if (dirExists) {
      const hasProjectJson = await pathExistsAsFile(
        join(targetPath, "project.json"),
      );
      const hasBotEntry = await pathExistsAsFile(
        join(targetPath, "src", "bot.ts"),
      );
      if (!hasProjectJson || !hasBotEntry) {
        throw new DesktopApplicationError(
          "RUNTIME_DELETE_UNSAFE_TARGET",
          "Refusing to delete a folder that does not match a generated ZeroBotForge project manifest.",
        );
      }

      await rm(targetPath, { recursive: true, force: true });
    }

    const deletedDir = targetPath;
    this.directoryPath = null;
    this.directoryName = null;
    this.projectName = null;
    this.isGenerated = false;
    this.isCompiled = false;
    this.compiledAt = null;
    this.startedAt = null;
    this.lastExitCode = null;
    this.lastError = null;
    this.tokenSyncedToEnv = false;
    this.state = "idle";

    this.appendLog(
      "system",
      `Deleted generated bot project directory: ${deletedDir}.`,
    );

    return this.getStatus();
  }

  public async probeTelegramApi(): Promise<{
    connected: boolean | null;
    botUsername: string | null;
  }> {
    let token: string | null = null;
    try {
      token = await this.secureStorage.getTelegramToken();
    } catch {
      token = null;
    }

    if (!token) {
      this.telegramConnected = null;
      this.botUsername = null;
      return { connected: null, botUsername: null };
    }

    this.activeTokenSnapshot = token;

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/getMe`,
        {
          method: "GET",
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(8_000),
        },
      );
      const payload = (await response.json().catch(() => null)) as unknown;
      if (
        response.ok &&
        isRecord(payload) &&
        payload.ok === true &&
        isRecord(payload.result) &&
        typeof payload.result.id === "number"
      ) {
        this.telegramConnected = true;
        this.botUsername =
          typeof payload.result.username === "string"
            ? payload.result.username
            : null;
        return {
          connected: true,
          botUsername: this.botUsername,
        };
      }
      this.telegramConnected = false;
      return { connected: false, botUsername: this.botUsername };
    } catch {
      this.telegramConnected = false;
      return { connected: false, botUsername: this.botUsername };
    }
  }

  public async compile(directoryOverride?: string): Promise<BotRuntimeStatus> {
    if (this.compileProcess) {
      throw new DesktopApplicationError(
        "RUNTIME_COMPILE_IN_PROGRESS",
        "A compilation process is already running.",
      );
    }
    if (this.activeProcess) {
      throw new DesktopApplicationError(
        "RUNTIME_ALREADY_RUNNING",
        "Stop the running bot process before recompiling the project.",
      );
    }

    if (directoryOverride && directoryOverride.trim().length > 0) {
      const resolvedOverride = resolve(directoryOverride.trim());
      if (await pathExistsAsDirectory(resolvedOverride)) {
        this.directoryPath = resolvedOverride;
        this.directoryName = basename(resolvedOverride);
        this.isGenerated = true;
      }
    }

    if (!this.directoryPath || !this.isGenerated) {
      throw new DesktopApplicationError(
        "RUNTIME_NOT_GENERATED",
        "Generate the bot project first before running Compile.",
      );
    }

    const dirExists = await pathExistsAsDirectory(this.directoryPath);
    if (!dirExists) {
      this.isGenerated = false;
      this.isCompiled = false;
      this.state = "idle";
      throw new DesktopApplicationError(
        "RUNTIME_DIRECTORY_MISSING",
        "The generated project directory could not be found on disk. Generate the project again.",
      );
    }

    await this.syncTokenToActiveDirectory();

    this.state = "compiling";
    this.isCompiled = false;
    this.lastError = null;
    this.appendLog(
      "system",
      `Starting compilation pipeline (npm install && npm run build) in ${this.directoryPath}...`,
    );

    const targetDir = this.directoryPath;
    const isWindows = process.platform === "win32";
    const command = isWindows ? "cmd.exe" : "sh";
    const args = isWindows
      ? ["/d", "/s", "/c", "npm install && npm run build"]
      : ["-c", "npm install && npm run build"];

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(command, args, {
        cwd: targetDir,
        env: {
          ...process.env,
          FORCE_COLOR: "0",
           NO_COLOR: "1",
        },
        windowsHide: true,
      });

      this.compileProcess = child;

      child.stdout?.on("data", (chunk: Buffer) => {
        this.appendLog("stdout", chunk.toString("utf8"));
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        this.appendLog("stderr", chunk.toString("utf8"));
      });

      child.once("error", (error) => {
        this.compileProcess = null;
        const message = `Compilation process failed to start: ${error.message}`;
        this.lastError = redactSensitiveText(message, this.activeTokenSnapshot);
        this.state = "error";
        this.appendLog("stderr", message);
        rejectPromise(
          new DesktopApplicationError("RUNTIME_COMPILE_FAILED", this.lastError),
        );
      });

      child.once("close", (code) => {
        this.compileProcess = null;
        this.lastExitCode = code;
        if (code === 0) {
          resolvePromise();
        } else {
          const message = `Compilation exited with non-zero code (${String(code)}). Review the terminal output for details.`;
          this.lastError = message;
          this.state = "error";
          this.appendLog("stderr", message);
          rejectPromise(
            new DesktopApplicationError("RUNTIME_COMPILE_FAILED", message),
          );
        }
      });
    });

    const compiledEntryExists = await pathExistsAsFile(
      join(targetDir, "dist", "bot.js"),
    );
    if (!compiledEntryExists) {
      const message =
        "Build command finished, but dist/bot.js was not produced.";
      this.lastError = message;
      this.isCompiled = false;
      this.state = "error";
      this.appendLog("stderr", message);
      throw new DesktopApplicationError("RUNTIME_BUILD_ARTIFACT_MISSING", message);
    }

    this.isCompiled = true;
    this.compiledAt = new Date().toISOString();
    this.state = "compiled";
    this.appendLog(
      "system",
      "Compilation finished. Dependencies are installed and dist/bot.js is ready for execution.",
    );

    return this.getStatus();
  }

  public async start(directoryOverride?: string): Promise<BotRuntimeStatus> {
    if (this.activeProcess) {
      return this.getStatus({ checkTelegram: true });
    }
    if (this.compileProcess) {
      throw new DesktopApplicationError(
        "RUNTIME_COMPILE_IN_PROGRESS",
        "Wait for the compilation process to complete before starting the bot.",
      );
    }

    if (directoryOverride && directoryOverride.trim().length > 0) {
      const resolvedOverride = resolve(directoryOverride.trim());
      if (await pathExistsAsDirectory(resolvedOverride)) {
        this.directoryPath = resolvedOverride;
        this.directoryName = basename(resolvedOverride);
        this.isGenerated = true;
      }
    }

    if (!this.directoryPath || !this.isGenerated) {
      throw new DesktopApplicationError(
        "RUNTIME_NOT_GENERATED",
        "Generate the bot project before starting the runtime.",
      );
    }

    const compiledEntryPath = join(this.directoryPath, "dist", "bot.js");
    const compiledExists = await pathExistsAsFile(compiledEntryPath);
    if (!this.isCompiled || !compiledExists) {
      this.isCompiled = false;
      this.state = "generated";
      throw new DesktopApplicationError(
        "RUNTIME_NOT_COMPILED",
        "Compile the generated project first before starting the bot runtime.",
      );
    }

    const token = await this.secureStorage.getTelegramToken();
    if (!token || token.trim().length === 0) {
      throw new DesktopApplicationError(
        "TELEGRAM_TOKEN_NOT_CONFIGURED",
        "No Telegram bot token is saved. Configure and save your bot token in Settings first.",
      );
    }

    const trimmedToken = token.trim();
    this.activeTokenSnapshot = trimmedToken;
    await this.syncTokenToActiveDirectory(trimmedToken);
    const envVarName = await this.resolveProjectEnvVarName(this.directoryPath);

    this.state = "starting";
    this.lastError = null;
    this.appendLog("system", "Verifying Telegram Bot API connectivity...");

    const probe = await this.probeTelegramApi();
    if (probe.connected) {
      this.appendLog(
        "system",
        `Telegram Bot API verified${probe.botUsername ? ` as @\${probe.botUsername}` : ""}. Launching local runtime process...`,
      );
    } else {
      this.appendLog(
        "system",
        "Telegram Bot API probe could not be confirmed prior to launch; starting node dist/bot.js...",
      );
    }

    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      TELEGRAM_BOT_TOKEN: trimmedToken,
      [envVarName]: trimmedToken,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    };

    const child = spawn("node", ["dist/bot.js"], {
      cwd: this.directoryPath,
      env: childEnv,
      windowsHide: true,
    });

    this.activeProcess = child;
    this.startedAt = new Date().toISOString();
    this.state = "running";
    this.appendLog(
      "system",
      `Bot runtime process is online (PID ${String(child.pid ?? "unknown")}). Listening for Telegram updates.`,
    );

    child.stdout?.on("data", (chunk: Buffer) => {
      this.appendLog("stdout", chunk.toString("utf8"));
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      this.appendLog("stderr", chunk.toString("utf8"));
    });

    child.once("error", (error) => {
      const message = redactSensitiveText(
        `Runtime process error: ${error.message}`,
        this.activeTokenSnapshot,
      );
      this.lastError = message;
      this.activeProcess = null;
      this.startedAt = null;
      this.state = "error";
      this.appendLog("stderr", message);
    });

    child.once("close", (code, signal) => {
      const wasStopping = this.state === "stopping";
      this.activeProcess = null;
      this.startedAt = null;
      this.lastExitCode = code;

      if (wasStopping || code === 0) {
        this.state = this.isCompiled ? "compiled" : "generated";
        this.appendLog(
          "system",
          `Bot runtime process stopped (code: ${String(code ?? 0)}${signal ? `, signal: \${signal}` : ""}).`,
        );
      } else {
        const message = `Bot runtime process terminated unexpectedly (exit code: ${String(code ?? "unknown")}).`;
        this.lastError = message;
        this.state = "error";
        this.appendLog("stderr", message);
      }
    });

    return this.getStatus();
  }

  public async stop(): Promise<BotRuntimeStatus> {
    const child = this.activeProcess;
    if (!child || child.pid === undefined) {
      this.activeProcess = null;
      this.startedAt = null;
      if (this.state === "running" || this.state === "starting" || this.state === "stopping") {
        this.state = this.isCompiled ? "compiled" : this.isGenerated ? "generated" : "idle";
      }
      return this.getStatus();
    }

    this.state = "stopping";
    const pid = child.pid;
    this.appendLog("system", `Stopping bot runtime process (PID ${String(pid)})...`);

    await new Promise<void>((resolvePromise) => {
      const timeout = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Process already exited.
        }
        resolvePromise();
      }, 4_000);

      child.once("close", () => {
        clearTimeout(timeout);
        resolvePromise();
      });

      if (process.platform === "win32") {
        const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
          windowsHide: true,
        });
        killer.once("error", () => {
          try {
            child.kill();
          } catch {
            // Process already exited.
          }
        });
      } else {
        try {
          child.kill("SIGTERM");
        } catch {
          clearTimeout(timeout);
          resolvePromise();
        }
      }
    });

    this.activeProcess = null;
    this.startedAt = null;
    this.state = this.isCompiled ? "compiled" : this.isGenerated ? "generated" : "idle";
    return this.getStatus();
  }

  public clearLogs(): Promise<BotRuntimeStatus> {
    this.logs = [];
    return this.getStatus();
  }

  public async getStatus(options?: {
    checkTelegram?: boolean;
  }): Promise<BotRuntimeStatus> {
    let tokenConfigured = false;
    try {
      tokenConfigured = await this.secureStorage.hasTelegramToken();
    } catch {
      tokenConfigured = false;
    }

    if (this.directoryPath) {
      const dirExists = await pathExistsAsDirectory(this.directoryPath);
      if (!dirExists) {
        this.isGenerated = false;
        this.isCompiled = false;
        if (!this.activeProcess) {
          this.state = "idle";
        }
      } else {
        this.isGenerated = true;
        this.isCompiled = await pathExistsAsFile(
          join(this.directoryPath, "dist", "bot.js"),
        );
        if (tokenConfigured && !this.tokenSyncedToEnv) {
          await this.syncTokenToActiveDirectory().catch(() => false);
        }
      }
    }

    const isRunning =
      this.activeProcess !== null &&
      this.activeProcess.exitCode === null &&
      !this.activeProcess.killed;

    if (!isRunning && (this.state === "running" || this.state === "starting")) {
      this.state = this.isCompiled
        ? "compiled"
        : this.isGenerated
          ? "generated"
          : "idle";
    }

    if (options?.checkTelegram || (tokenConfigured && this.botUsername === null)) {
      await this.probeTelegramApi();
    } else if (!tokenConfigured) {
      this.telegramConnected = null;
      this.botUsername = null;
    }

    const activeBotOnlineOnTelegram =
      isRunning && this.telegramConnected === true;

    return {
      state: this.state,
      directoryPath: this.directoryPath,
      directoryName: this.directoryName,
      projectName: this.projectName,
      isGenerated: this.isGenerated,
      isCompiled: this.isCompiled,
      isRunning,
      pid: isRunning ? (this.activeProcess?.pid ?? null) : null,
      startedAt: isRunning ? this.startedAt : null,
      compiledAt: this.compiledAt,
      lastExitCode: this.lastExitCode,
      lastError: this.lastError,
      tokenConfigured,
      tokenSyncedToEnv: this.tokenSyncedToEnv && tokenConfigured,
      telegramConnected: activeBotOnlineOnTelegram
        ? true
        : this.telegramConnected === false
          ? false
          : null,
      botUsername: this.botUsername,
      logs: [...this.logs],
    };
  }
}