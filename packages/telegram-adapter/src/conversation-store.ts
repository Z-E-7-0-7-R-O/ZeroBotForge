import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { flowIdSchema, nodeIdSchema } from "@zerobotforge/shared/validators";
import type { JsonValue } from "@zerobotforge/shared";
import type { ConversationState } from "./types";

export type ConversationStoreErrorCode = "IO_ERROR" | "CORRUPT_RECORD" | "INVALID_STATE";

export class ConversationStoreError extends Error {
  readonly code: ConversationStoreErrorCode;
  readonly originalError?: unknown;

  constructor(code: ConversationStoreErrorCode, message: string, originalError?: unknown) {
    super(message);
    this.name = "ConversationStoreError";
    this.code = code;
    if (originalError !== undefined) this.originalError = originalError;
  }
}

const directoryLocks = new Map<string, Promise<void>>();

async function withDirectoryLock<T>(directory: string, operation: () => Promise<T>): Promise<T> {
  const key = path.resolve(directory);
  const previous = directoryLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  directoryLocks.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (directoryLocks.get(key) === current) directoryLocks.delete(key);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isRecord(value)) return Object.values(value).every(isJsonValue);
  return false;
}

function decodeState(value: unknown): ConversationState | null {
  if (!isRecord(value)) return null;
  if (typeof value.projectId !== "string" || value.projectId.length === 0) return null;
  if (typeof value.chatId !== "string" || value.chatId.length === 0) return null;
  if (typeof value.flowId !== "string" || value.flowId.length === 0) return null;
  if (value.currentNodeId !== null && typeof value.currentNodeId !== "string") return null;
  if (![
    "completed",
    "waiting_for_input",
    "failed",
    "step_limit_exceeded",
  ].includes(String(value.status))) return null;
  if (!isRecord(value.variables) || !isJsonValue(value.variables)) return null;
  if (value.waitingFor !== null && value.waitingFor !== "button" && value.waitingFor !== "choice") return null;
  if (typeof value.lastUpdateId !== "number" || !Number.isSafeInteger(value.lastUpdateId) || value.lastUpdateId < 0) return null;
  if (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) return null;

  try {
    return {
      projectId: value.projectId,
      chatId: value.chatId,
      flowId: flowIdSchema.parse(value.flowId),
      currentNodeId: value.currentNodeId === null ? null : nodeIdSchema.parse(value.currentNodeId),
      status: value.status as ConversationState["status"],
      variables: value.variables as Record<string, JsonValue>,
      waitingFor: value.waitingFor,
      lastUpdateId: value.lastUpdateId,
      updatedAt: value.updatedAt,
    };
  } catch {
    return null;
  }
}

function storageKey(projectId: string, chatId: string): string {
  return createHash("sha256").update(projectId).update("\0").update(chatId).digest("hex");
}

/**
 * File-backed conversation state. All operations for this directory are
 * serialized within the process; each conversation is atomically replaced as
 * one JSON file so concurrent writes for different chats cannot overwrite one
 * another. Corrupt records are quarantined instead of silently discarded.
 */
export class ConversationStore {
  private readonly directory: string;

  constructor(directory: string) {
    if (!directory.trim()) throw new ConversationStoreError("INVALID_STATE", "Conversation storage directory must not be empty.");
    this.directory = path.resolve(directory);
  }

  async get(projectId: string, chatId: string): Promise<ConversationState | null> {
    this.assertIdentity(projectId, chatId);
    return withDirectoryLock(this.directory, async () => this.readUnlocked(projectId, chatId));
  }

  async set(state: ConversationState): Promise<void> {
    const parsed = decodeState(state);
    if (!parsed) throw new ConversationStoreError("INVALID_STATE", "Conversation state failed schema validation.");
    await withDirectoryLock(this.directory, async () => {
      await mkdir(this.directory, { recursive: true });
      const destination = this.filePath(parsed.projectId, parsed.chatId);
      const temporary = path.join(this.directory, `.${path.basename(destination)}.${process.pid}.${randomUUID()}.tmp`);
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      try {
        handle = await open(temporary, "wx", 0o600);
        await handle.writeFile(`${JSON.stringify(parsed, null, 2)}\n`, "utf8");
        await handle.sync();
        await handle.close();
        handle = undefined;
        await rename(temporary, destination);
      } catch (error) {
        if (handle) await handle.close().catch(() => undefined);
        await rm(temporary, { force: true }).catch(() => undefined);
        throw new ConversationStoreError("IO_ERROR", "Could not atomically persist the conversation record.", error);
      }
    });
  }

  async delete(projectId: string, chatId: string): Promise<boolean> {
    this.assertIdentity(projectId, chatId);
    return withDirectoryLock(this.directory, async () => {
      try {
        await rm(this.filePath(projectId, chatId));
        return true;
      } catch (error) {
        if (isRecord(error) && error.code === "ENOENT") return false;
        throw new ConversationStoreError("IO_ERROR", "Could not delete the conversation record.", error);
      }
    });
  }

  async listByProject(projectId: string): Promise<ConversationState[]> {
    if (!projectId.trim()) throw new ConversationStoreError("INVALID_STATE", "Project identifier must not be empty.");
    return withDirectoryLock(this.directory, async () => {
      let entries: string[];
      try {
        entries = await readdir(this.directory);
      } catch (error) {
        if (isRecord(error) && error.code === "ENOENT") return [];
        throw new ConversationStoreError("IO_ERROR", "Could not list conversation records.", error);
      }

      const output: ConversationState[] = [];
      for (const entry of entries.filter((name) => name.endsWith(".json")).sort()) {
        try {
          const text = await readFile(path.join(this.directory, entry), "utf8");
          const parsed = decodeState(JSON.parse(text) as unknown);
          if (!parsed) {
            await this.quarantineUnlocked(path.join(this.directory, entry));
            throw new ConversationStoreError("CORRUPT_RECORD", "A corrupt conversation record was moved to the recovery directory.");
          }
          if (parsed.projectId === projectId) output.push(parsed);
        } catch (error) {
          if (error instanceof ConversationStoreError) throw error;
          if (isRecord(error) && error.code === "ENOENT") continue;
          if (error instanceof SyntaxError) {
            await this.quarantineUnlocked(path.join(this.directory, entry));
            throw new ConversationStoreError("CORRUPT_RECORD", "A corrupt conversation record was moved to the recovery directory.", error);
          }
          throw new ConversationStoreError("IO_ERROR", "Could not read a conversation record.", error);
        }
      }
      return output;
    });
  }

  private assertIdentity(projectId: string, chatId: string): void {
    if (!projectId.trim() || !chatId.trim()) {
      throw new ConversationStoreError("INVALID_STATE", "Project and chat identifiers must not be empty.");
    }
  }

  private filePath(projectId: string, chatId: string): string {
    return path.join(this.directory, `${storageKey(projectId, chatId)}.json`);
  }

  private async readUnlocked(projectId: string, chatId: string): Promise<ConversationState | null> {
    const file = this.filePath(projectId, chatId);
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if (isRecord(error) && error.code === "ENOENT") return null;
      throw new ConversationStoreError("IO_ERROR", "Could not read the conversation record.", error);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text) as unknown;
    } catch (error) {
      await this.quarantineUnlocked(file);
      throw new ConversationStoreError("CORRUPT_RECORD", "A corrupt conversation record was moved to the recovery directory.", error);
    }
    const parsed = decodeState(raw);
    if (!parsed || parsed.projectId !== projectId || parsed.chatId !== chatId) {
      await this.quarantineUnlocked(file);
      throw new ConversationStoreError("CORRUPT_RECORD", "A corrupt or mismatched conversation record was moved to the recovery directory.");
    }
    return parsed;
  }

  private async quarantineUnlocked(file: string): Promise<void> {
    const recoveryDirectory = path.join(this.directory, "recovery");
    await mkdir(recoveryDirectory, { recursive: true });
    const destination = path.join(
      recoveryDirectory,
      `${path.basename(file, ".json")}.corrupt-${Date.now()}-${randomUUID()}.json`,
    );
    try {
      await rename(file, destination);
    } catch (error) {
      throw new ConversationStoreError("IO_ERROR", "Could not quarantine a corrupt conversation record.", error);
    }
  }
}
