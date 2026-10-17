import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { deserializeProject } from "@zerobotforge/project-format/serialization";
import type { FlowDefinition } from "@zerobotforge/flow-engine";
import { TelegramBotManager } from "../../packages/telegram-adapter/src/bot-manager";
import {
  ConversationStore,
  ConversationStoreError,
} from "../../packages/telegram-adapter/src/conversation-store";
import { mapTelegramError } from "../../packages/telegram-adapter/src/telegram-client";
import { TelegramUpdateRouter } from "../../packages/telegram-adapter/src/update-router";
import type {
  TelegramBotIdentity,
  TelegramClientPort,
  TelegramClientStatus,
  TelegramErrorHandler,
  TelegramInboundUpdate,
  TelegramInlineButton,
  TelegramUpdateHandler,
} from "../../packages/telegram-adapter/src/types";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PROJECT_PATH = path.resolve(
  CURRENT_DIR,
  "../fixtures/sample-project.json",
);

const temporaryDirs: string[] = [];

async function createTempStateDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "zerobotforge-tg-int-"));
  temporaryDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirs
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

class MockTelegramClient implements TelegramClientPort {
  messages: Array<{ chatId: string; text: string }> = [];
  photos: Array<{ chatId: string; url: string; caption?: string }> = [];
  keyboards: Array<{
    chatId: string;
    text: string;
    buttons: readonly TelegramInlineButton[];
    prefix: "button" | "choice";
  }> = [];
  answeredCallbacks: string[] = [];
  private updateHandler: TelegramUpdateHandler | undefined;
  private status: TelegramClientStatus = {
    state: "stopped",
    updatedAt: new Date().toISOString(),
  };

  async start(
    onUpdate: TelegramUpdateHandler,
    _onError: TelegramErrorHandler,
  ): Promise<TelegramBotIdentity> {
    this.updateHandler = onUpdate;
    const identity: TelegramBotIdentity = {
      id: 9001,
      firstName: "Integration Support Bot",
      username: "zbf_support_bot",
      isBot: true,
    };
    this.status = {
      state: "running",
      updatedAt: new Date().toISOString(),
      botIdentity: identity,
    };
    return identity;
  }

  async stop(): Promise<void> {
    this.status = {
      state: "stopped",
      updatedAt: new Date().toISOString(),
    };
  }

  getStatus(): TelegramClientStatus {
    return { ...this.status };
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    this.messages.push({ chatId, text });
  }

  async sendPhoto(chatId: string, url: string, caption?: string): Promise<void> {
    this.photos.push({
      chatId,
      url,
      ...(caption !== undefined ? { caption } : {}),
    });
  }

  async sendInlineKeyboard(
    chatId: string,
    text: string,
    buttons: readonly TelegramInlineButton[],
    callbackPrefix: "button" | "choice",
  ): Promise<void> {
    this.keyboards.push({ chatId, text, buttons, prefix: callbackPrefix });
  }

  async answerCallbackQuery(callbackQueryId: string): Promise<void> {
    this.answeredCallbacks.push(callbackQueryId);
  }

  async dispatchInbound(update: TelegramInboundUpdate): Promise<void> {
    await this.updateHandler?.(update);
  }
}

async function loadSampleFlows(): Promise<{
  projectId: string;
  flows: FlowDefinition[];
}> {
  const raw = await readFile(SAMPLE_PROJECT_PATH, "utf8");
  const project = deserializeProject(raw);
  const flows: FlowDefinition[] = project.flows.map((flow) => ({
    id: flow.id,
    name: flow.name,
    ...(flow.description !== undefined ? { description: flow.description } : {}),
    nodes: flow.nodes,
    edges: flow.edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      sourceHandle: edge.sourceHandle ?? "next",
      targetNodeId: edge.targetNodeId,
      targetHandle: edge.targetHandle ?? "in",
    })),
  }));
  return { projectId: project.id, flows };
}

describe("Phase 12 integration: Telegram adapter routing and conversation state persistence", () => {
  it("routes multi-turn conversation updates using sample-project.json without a real Telegram token", async () => {
    const stateDir = await createTempStateDir();
    const store = new ConversationStore(stateDir);
    const client = new MockTelegramClient();
    const { projectId, flows } = await loadSampleFlows();

    const router = new TelegramUpdateRouter({
      projectId,
      flows,
      store,
      client,
    });

    const manager = new TelegramBotManager(client, (update) =>
      router.handleUpdate(update).then(() => undefined),
    );

    const startStatus = await manager.start();
    expect(startStatus.state).toBe("running");

    await client.dispatchInbound({
      updateId: 501,
      kind: "message",
      chatId: "chat-42",
      userId: "user-42",
      date: 1_800_000_100,
      messageId: 1,
      text: "/start",
    });

    expect(client.messages).toContainEqual({
      chatId: "chat-42",
      text: "Welcome to ZeroBotForge Support. How can we help you today?",
    });
    expect(client.keyboards).toHaveLength(1);
    expect(client.keyboards[0]?.text).toBe(
      "Please select a support category:",
    );

    const waitingState = await store.get(projectId, "chat-42");
    expect(waitingState).toMatchObject({
      status: "waiting_for_input",
      waitingFor: "button",
      currentNodeId: "node-topic-buttons",
      lastUpdateId: 501,
    });

    await client.dispatchInbound({
      updateId: 502,
      kind: "callback_query",
      chatId: "chat-42",
      userId: "user-42",
      date: 1_800_000_105,
      callbackQueryId: "cb-502",
      callbackData: "button:guide",
    });

    expect(client.answeredCallbacks).toContain("cb-502");
    expect(client.photos).toContainEqual({
      chatId: "chat-42",
      url: "https://example.com/assets/zerobotforge-architecture.png",
      caption: "ZeroBotForge layered runtime overview.",
    });

    const completedState = await store.get(projectId, "chat-42");
    expect(completedState).toMatchObject({
      status: "completed",
      waitingFor: null,
      currentNodeId: null,
      lastUpdateId: 502,
    });

    const stopStatus = await manager.stop();
    expect(stopStatus.state).toBe("stopped");
  });

  it("quarantines corrupted state files on disk and redacts token patterns from adapter errors", async () => {
    const stateDir = await createTempStateDir();
    const store = new ConversationStore(stateDir);
    const client = new MockTelegramClient();
    const { projectId, flows } = await loadSampleFlows();

    const router = new TelegramUpdateRouter({
      projectId,
      flows,
      store,
      client,
    });

    await router.handleUpdate({
      updateId: 700,
      kind: "message",
      chatId: "chat-corrupt",
      userId: "user-9",
      date: 1_800_000_200,
      text: "/start",
    });

    const files = (await readdir(stateDir)).filter((name) =>
      name.endsWith(".json"),
    );
    expect(files).toHaveLength(1);

    await writeFile(
      path.join(stateDir, files[0]!),
      "{corrupted-state-payload",
      "utf8",
    );

    await expect(store.get(projectId, "chat-corrupt")).rejects.toBeInstanceOf(
      ConversationStoreError,
    );

    const recoveryFiles = await readdir(path.join(stateDir, "recovery"));
    expect(recoveryFiles).toHaveLength(1);

    const leakedToken = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi";
    const mappedError = mapTelegramError(
      new Error(`Request failed with token ${leakedToken} during getUpdates`),
    );
    expect(mappedError.message).not.toContain(leakedToken);
  });
});