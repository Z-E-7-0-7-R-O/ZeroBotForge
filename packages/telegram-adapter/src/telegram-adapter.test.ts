import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { edgeIdSchema, flowIdSchema, nodeIdSchema } from "@zerobotforge/shared/validators";
import type { FlowDefinition } from "@zerobotforge/flow-engine";
import { TelegramBotManager } from "./bot-manager";
import { ConversationStore, ConversationStoreError } from "./conversation-store";
import { mapTelegramError, normalizeTelegramUpdate } from "./telegram-client";
import { TelegramUpdateRouter } from "./update-router";
import type {
  ConversationState,
  TelegramBotIdentity,
  TelegramClientPort,
  TelegramClientStatus,
  TelegramErrorHandler,
  TelegramInboundUpdate,
  TelegramInlineButton,
  TelegramUpdateHandler,
} from "./types";

const temporaryDirectories: string[] = [];

async function makeTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "zerobotforge-phase10-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

class FakeTelegramClient implements TelegramClientPort {
  starts = 0;
  stops = 0;
  messages: Array<{ chatId: string; text: string }> = [];
  photos: Array<{ chatId: string; url: string; caption?: string }> = [];
  keyboards: Array<{ chatId: string; text: string; buttons: readonly TelegramInlineButton[]; prefix: "button" | "choice" }> = [];
  answeredCallbacks: string[] = [];
  updateHandler: TelegramUpdateHandler | undefined;
  errorHandler: TelegramErrorHandler | undefined;
  startGate: Promise<void> | undefined;
  startError: Error | undefined;
  private status: TelegramClientStatus = { state: "stopped", updatedAt: new Date().toISOString() };

  async start(onUpdate: TelegramUpdateHandler, onError: TelegramErrorHandler): Promise<TelegramBotIdentity> {
    this.starts += 1;
    this.status = { state: "starting", updatedAt: new Date().toISOString() };
    this.updateHandler = onUpdate;
    this.errorHandler = onError;
    if (this.startGate) await this.startGate;
    if (this.startError) throw this.startError;
    this.status = {
      state: "running",
      updatedAt: new Date().toISOString(),
      botIdentity: { id: 42, firstName: "Test Bot", username: "phase10_test_bot", isBot: true },
    };
    return this.status.botIdentity!;
  }

  async stop(): Promise<void> {
    this.stops += 1;
    this.status = { state: "stopped", updatedAt: new Date().toISOString() };
  }

  getStatus(): TelegramClientStatus {
    return { ...this.status };
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    this.messages.push({ chatId, text });
  }

  async sendPhoto(chatId: string, url: string, caption?: string): Promise<void> {
    this.photos.push({ chatId, url, ...(caption === undefined ? {} : { caption }) });
  }

  async sendInlineKeyboard(chatId: string, text: string, buttons: readonly TelegramInlineButton[], prefix: "button" | "choice"): Promise<void> {
    this.keyboards.push({ chatId, text, buttons, prefix });
  }

  async answerCallbackQuery(callbackQueryId: string): Promise<void> {
    this.answeredCallbacks.push(callbackQueryId);
  }

  async emit(update: TelegramInboundUpdate): Promise<void> {
    await this.updateHandler?.(update);
  }
}

function makeNode(id: string, type: FlowDefinition["nodes"][number]["type"], data: Record<string, unknown> = {}) {
  return {
    id: nodeIdSchema.parse(id),
    type,
    label: id,
    position: { x: 0, y: 0 },
    data,
  } as FlowDefinition["nodes"][number];
}

function makeEdge(id: string, sourceNodeId: string, sourceHandle: string, targetNodeId: string) {
  return {
    id: edgeIdSchema.parse(id),
    sourceNodeId: nodeIdSchema.parse(sourceNodeId),
    sourceHandle,
    targetNodeId: nodeIdSchema.parse(targetNodeId),
    targetHandle: "in",
  } as FlowDefinition["edges"][number];
}

function makeTextFlow(): FlowDefinition {
  return {
    id: flowIdSchema.parse("flow-main"),
    name: "Main flow",
    nodes: [
      makeNode("node-start", "start"),
      makeNode("node-text", "text", { text: "Welcome to the bot." }),
    ],
    edges: [makeEdge("edge-start-text", "node-start", "next", "node-text")],
  };
}

function makeButtonFlow(): FlowDefinition {
  return {
    id: flowIdSchema.parse("flow-buttons"),
    name: "Button flow",
    nodes: [
      makeNode("node-start", "start"),
      makeNode("node-buttons", "button", {
        text: "Choose an option",
        buttons: [{ id: "continue", label: "Continue" }],
      }),
      makeNode("node-after", "text", { text: "Selection received." }),
    ],
    edges: [
      makeEdge("edge-start-buttons", "node-start", "next", "node-buttons"),
      makeEdge("edge-button-after", "node-buttons", "button:continue", "node-after"),
    ],
  };
}

function update(updateId: number, chatId: string, text: string, userId = "user-7"): TelegramInboundUpdate {
  return { updateId, kind: "message", chatId, userId, date: 1_800_000_000, text, messageId: updateId };
}

function callback(updateId: number, chatId: string, callbackData: string): TelegramInboundUpdate {
  return {
    updateId,
    kind: "callback_query",
    chatId,
    userId: "user-7",
    date: 1_800_000_001,
    callbackQueryId: `callback-${updateId}`,
    callbackData,
  };
}

function state(projectId: string, chatId: string, lastUpdateId: number): ConversationState {
  return {
    projectId,
    chatId,
    flowId: flowIdSchema.parse("flow-main"),
    currentNodeId: null,
    status: "completed",
    variables: { count: 1 },
    waitingFor: null,
    lastUpdateId,
    updatedAt: new Date().toISOString(),
  };
}

describe("Telegram update normalization and API error mapping", () => {
  it("normalizes a Telegram text update into the adapter contract", () => {
    const normalized = normalizeTelegramUpdate({
      update_id: 25,
      message: {
        message_id: 11,
        date: 100,
        text: "hello",
        chat: { id: -123, type: "group" },
        from: { id: 7 },
      },
    });
    expect(normalized).toEqual({
      updateId: 25,
      kind: "message",
      chatId: "-123",
      userId: "7",
      date: 100,
      messageId: 11,
      text: "hello",
    });
  });

  it("normalizes callback queries and ignores unsupported updates", () => {
    expect(normalizeTelegramUpdate({
      update_id: 26,
      callback_query: {
        id: "callback-1",
        data: "button:next",
        from: { id: 8 },
        message: { message_id: 12, date: 101, chat: { id: 8 } },
      },
    })).toMatchObject({ kind: "callback_query", callbackQueryId: "callback-1", callbackData: "button:next", chatId: "8" });
    expect(normalizeTelegramUpdate({ update_id: 27, inline_query: { id: "inline" } })).toBeNull();
  });

  it("maps unauthorized tokens, rate limits, polling conflicts and network faults", () => {
    expect(mapTelegramError({ response: { error_code: 401, description: "Unauthorized" } }).category).toBe("invalid_token");
    expect(mapTelegramError({ response: { error_code: 429, description: "Too Many Requests", parameters: { retry_after: 3 } } })).toMatchObject({ category: "rate_limited", retryAfterSeconds: 3, recoverable: true });
    expect(mapTelegramError({ response: { error_code: 409, description: "Conflict: another getUpdates request" } })).toMatchObject({ category: "conflict", recoverable: false });
    expect(mapTelegramError({ code: "ECONNRESET", message: "socket hang up" })).toMatchObject({ category: "network", recoverable: true });
  });

  it("never includes a token-shaped value in mapped diagnostics", () => {
    const error = mapTelegramError({ message: "Failed request for 123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi" });
    expect(error.message).not.toContain("123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi");
  });
});

describe("conversation store", () => {
  it("persists state and reads it back from a new store instance", async () => {
    const directory = await makeTempDirectory();
    const first = new ConversationStore(directory);
    await first.set(state("project-a", "chat-a", 10));
    const second = new ConversationStore(directory);
    expect(await second.get("project-a", "chat-a")).toMatchObject({ projectId: "project-a", chatId: "chat-a", lastUpdateId: 10, variables: { count: 1 } });
  });

  it("serializes concurrent operations and keeps conversations isolated by project and chat", async () => {
    const store = new ConversationStore(await makeTempDirectory());
    await Promise.all([
      store.set(state("project-a", "chat-1", 1)),
      store.set(state("project-a", "chat-2", 2)),
      store.set(state("project-b", "chat-1", 3)),
    ]);
    expect((await store.listByProject("project-a")).map((entry) => entry.chatId).sort()).toEqual(["chat-1", "chat-2"]);
    expect((await store.get("project-b", "chat-1"))?.lastUpdateId).toBe(3);
  });

  it("quarantines a corrupt record instead of silently treating it as absent", async () => {
    const directory = await makeTempDirectory();
    const store = new ConversationStore(directory);
    await store.set(state("project-a", "chat-a", 1));
    const entries = await readdir(directory);
    const record = entries.find((entry) => entry.endsWith(".json"));
    expect(record).toBeDefined();
    await writeFile(path.join(directory, record!), "{not-json", "utf8");
    await expect(store.get("project-a", "chat-a")).rejects.toBeInstanceOf(ConversationStoreError);
    expect(await readdir(path.join(directory, "recovery"))).toHaveLength(1);
  });
});

describe("Telegram update router", () => {
  it("routes an update to the correct project/chat and records the resulting state", async () => {
    const directory = await makeTempDirectory();
    const store = new ConversationStore(directory);
    const client = new FakeTelegramClient();
    const router = new TelegramUpdateRouter({ projectId: "project-a", flows: [makeTextFlow()], store, client });
    const result = await router.handleUpdate(update(100, "chat-1", "/start"));

    expect(result.status).toBe("processed");
    expect(client.messages).toContainEqual({ chatId: "chat-1", text: "Welcome to the bot." });
    expect(await store.get("project-a", "chat-1")).toMatchObject({ flowId: "flow-main", status: "completed", lastUpdateId: 100 });
    expect(await store.get("project-a", "chat-2")).toBeNull();
    expect(await store.get("project-b", "chat-1")).toBeNull();
  });

  it("persists a waiting button state and resumes through the flow engine on callback", async () => {
    const directory = await makeTempDirectory();
    const store = new ConversationStore(directory);
    const client = new FakeTelegramClient();
    const flow = makeButtonFlow();
    const router = new TelegramUpdateRouter({ projectId: "project-a", flows: [flow], store, client });

    const first = await router.handleUpdate(update(201, "chat-9", "/start"));
    expect(first.execution?.status).toBe("waiting_for_input");
    expect(await store.get("project-a", "chat-9")).toMatchObject({ status: "waiting_for_input", waitingFor: "button", currentNodeId: "node-buttons" });
    expect(client.keyboards).toContainEqual({ chatId: "chat-9", text: "Choose an option", buttons: [{ id: "continue", label: "Continue" }], prefix: "button" });

    const second = await router.handleUpdate(callback(202, "chat-9", "button:continue"));
    expect(second.execution?.status).toBe("completed");
    expect(client.messages).toContainEqual({ chatId: "chat-9", text: "Selection received." });
    expect(client.answeredCallbacks).toContain("callback-202");
    expect(await store.get("project-a", "chat-9")).toMatchObject({ status: "completed", waitingFor: null, lastUpdateId: 202 });
  });

  it("deduplicates a repeated update id", async () => {
    const directory = await makeTempDirectory();
    const store = new ConversationStore(directory);
    const client = new FakeTelegramClient();
    const router = new TelegramUpdateRouter({ projectId: "project-a", flows: [makeTextFlow()], store, client });
    await router.handleUpdate(update(301, "chat-1", "/start"));
    const before = client.messages.length;
    const duplicate = await router.handleUpdate(update(301, "chat-1", "/start"));
    expect(duplicate.status).toBe("duplicate");
    expect(client.messages).toHaveLength(before);
  });
});

describe("Telegram bot manager lifecycle", () => {
  it("starts idempotently and stops idempotently", async () => {
    const client = new FakeTelegramClient();
    const manager = new TelegramBotManager(client, async () => undefined);
    const first = await manager.start();
    const second = await manager.start();
    expect(first.state).toBe("running");
    expect(second.state).toBe("running");
    expect(client.starts).toBe(1);

    expect((await manager.stop()).state).toBe("stopped");
    expect((await manager.stop()).state).toBe("stopped");
    expect(client.stops).toBe(1);
  });

  it("shares an in-flight start promise rather than creating a second polling loop", async () => {
    const client = new FakeTelegramClient();
    let release!: () => void;
    client.startGate = new Promise<void>((resolve) => { release = resolve; });
    const manager = new TelegramBotManager(client, async () => undefined);
    const first = manager.start();
    const second = manager.start();
    expect(client.starts).toBe(1);
    release();
    await Promise.all([first, second]);
    expect(manager.getStatus().state).toBe("running");
  });

  it("exposes a predictable error state when start fails", async () => {
    const client = new FakeTelegramClient();
    client.startError = new Error("network disabled in test");
    const manager = new TelegramBotManager(client, async () => undefined);
    await expect(manager.start()).rejects.toThrow("network disabled in test");
    expect(manager.getStatus().state).toBe("error");
  });

  it("shares concurrent stop requests even while startup is pending", async () => {
    const client = new FakeTelegramClient();
    let release!: () => void;
    client.startGate = new Promise<void>((resolve) => { release = resolve; });
    const manager = new TelegramBotManager(client, async () => undefined);
    const starting = manager.start();
    const firstStop = manager.stop();
    const secondStop = manager.stop();
    expect(client.stops).toBe(0);
    release();
    await Promise.all([starting, firstStop, secondStop]);
    expect(client.stops).toBe(1);
    expect(manager.getStatus().state).toBe("stopped");
  });
});
