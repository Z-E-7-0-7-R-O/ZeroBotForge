import type { JsonValue } from "@zerobotforge/shared";
import { flowIdSchema, nodeIdSchema } from "@zerobotforge/shared/validators";
import type { FlowDefinition, FlowExecutionResult, FlowRuntimeContext } from "@zerobotforge/flow-engine";
import { executeFlow } from "@zerobotforge/flow-engine/executor";
import type { FlowExecutionOptions } from "@zerobotforge/flow-engine/executor";
import { ConversationStore } from "./conversation-store";
import type { ConversationState, TelegramClientPort, TelegramInboundUpdate } from "./types";
import { TelegramAdapterError } from "./types";

export interface TelegramUpdateRouterOptions {
  projectId: string;
  flows: readonly FlowDefinition[];
  store: ConversationStore;
  client: TelegramClientPort;
  defaultFlowId?: FlowDefinition["id"];
  maxSteps?: number;
  actions?: FlowExecutionOptions["actions"];
}

export type TelegramRouteStatus = "processed" | "ignored" | "duplicate" | "no_flow";

export interface TelegramRouteResult {
  status: TelegramRouteStatus;
  projectId: string;
  chatId: string;
  updateId: number;
  execution?: FlowExecutionResult;
}

function isStartCommand(text: string | undefined): boolean {
  return text !== undefined && /^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text.trim());
}

function matchingCallback(update: TelegramInboundUpdate, waitingFor: ConversationState["waitingFor"]): FlowRuntimeContext["input"] | undefined {
  if (update.kind !== "callback_query" || !update.callbackData || !waitingFor) return undefined;
  const separator = update.callbackData.indexOf(":");
  if (separator <= 0) return undefined;
  const prefix = update.callbackData.slice(0, separator);
  const optionId = update.callbackData.slice(separator + 1);
  if (!optionId || prefix !== waitingFor) return undefined;
  return waitingFor === "button"
    ? { kind: "button", optionId }
    : { kind: "choice", optionId };
}

function waitingForInput(result: FlowExecutionResult): ConversationState["waitingFor"] {
  if (result.status !== "waiting_for_input") return null;
  for (let index = result.events.length - 1; index >= 0; index -= 1) {
    const event = result.events[index];
    if (event?.type === "show_buttons") return "button";
    if (event?.type === "show_choices") return "choice";
  }
  return null;
}

/** Routes normalized incoming updates through the real flow engine. */
export class TelegramUpdateRouter {
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: TelegramUpdateRouterOptions) {
    if (!options.projectId.trim()) throw new Error("Telegram update router requires a project identifier.");
    if (options.flows.length === 0) throw new Error("Telegram update router requires at least one flow.");
    if (options.defaultFlowId && !options.flows.some((flow) => flow.id === options.defaultFlowId)) {
      throw new Error("Configured defaultFlowId does not match a project flow.");
    }
  }

  handleUpdate(update: TelegramInboundUpdate): Promise<TelegramRouteResult> {
    const operation = this.operationQueue.then(() => this.route(update));
    this.operationQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async route(update: TelegramInboundUpdate): Promise<TelegramRouteResult> {
    if (update.callbackQueryId) {
      // An expired callback acknowledgement must not prevent the flow from being routed.
      void this.options.client.answerCallbackQuery(update.callbackQueryId).catch(() => undefined);
    }

    const { projectId, store, flows } = this.options;
    const existing = await store.get(projectId, update.chatId);
    if (existing && update.updateId <= existing.lastUpdateId) {
      return this.routeResult("duplicate", update);
    }

    const restart = isStartCommand(update.text);
    if (existing && !restart && existing.status !== "waiting_for_input") {
      await store.set({ ...existing, lastUpdateId: update.updateId, updatedAt: new Date().toISOString() });
      return this.routeResult("ignored", update);
    }

    let flow: FlowDefinition | undefined;
    let input: FlowRuntimeContext["input"];
    let resumeAtNodeId: NonNullable<FlowExecutionResult["currentNodeId"]> | undefined;
    let variables: Record<string, JsonValue> = {};

    if (existing && !restart && existing.status === "waiting_for_input") {
      input = matchingCallback(update, existing.waitingFor);
      if (!input || !existing.currentNodeId) {
        await store.set({ ...existing, lastUpdateId: update.updateId, updatedAt: new Date().toISOString() });
        return this.routeResult("ignored", update);
      }
      flow = flows.find((candidate) => candidate.id === flowIdSchema.parse(existing.flowId));
      resumeAtNodeId = nodeIdSchema.parse(existing.currentNodeId);
      variables = { ...existing.variables };
    } else {
      flow = this.chooseInitialFlow();
    }

    if (!flow) {
      await this.options.client.sendMessage(update.chatId, "No flow is configured for this project.");
      return this.routeResult("no_flow", update);
    }

    const context: Partial<FlowRuntimeContext> = {
      variables,
      userId: update.userId,
      conversationId: `${projectId}:${update.chatId}`,
      ...(input === undefined ? {} : { input }),
    };
    const executionOptions: FlowExecutionOptions = {
      context,
      maxSteps: this.options.maxSteps ?? 100,
      ...(this.options.actions === undefined ? {} : { actions: this.options.actions }),
      ...(resumeAtNodeId === undefined ? {} : { resumeAtNodeId }),
    };
    const execution = await executeFlow(flow, executionOptions);

    const nextState: ConversationState = {
      projectId,
      chatId: update.chatId,
      flowId: execution.flowId ?? flow.id,
      currentNodeId: execution.currentNodeId ?? null,
      status: execution.status,
      variables: { ...execution.context.variables },
      waitingFor: waitingForInput(execution),
      lastUpdateId: update.updateId,
      updatedAt: new Date().toISOString(),
    };

    // Commit the continuation checkpoint before sending side effects. Telegram
    // delivery and local file writes cannot be one transaction; deduplication is
    // therefore state-first and prevents a redelivered update rerunning the flow.
    await store.set(nextState);
    await this.dispatchEvents(update.chatId, execution);

    if (execution.status === "failed" || execution.status === "step_limit_exceeded") {
      await this.options.client.sendMessage(
        update.chatId,
        "This conversation flow could not finish. Send /start to begin again.",
      );
    }
    return { ...this.routeResult("processed", update), execution };
  }

  private chooseInitialFlow(): FlowDefinition | undefined {
    if (this.options.defaultFlowId) {
      return this.options.flows.find((flow) => flow.id === this.options.defaultFlowId);
    }
    return this.options.flows[0];
  }

  private async dispatchEvents(chatId: string, execution: FlowExecutionResult): Promise<void> {
    for (const event of execution.events) {
      switch (event.type) {
        case "send_text":
          await this.options.client.sendMessage(chatId, event.text);
          break;
        case "send_image":
          await this.options.client.sendPhoto(chatId, event.url, event.caption);
          break;
        case "show_buttons":
          await this.options.client.sendInlineKeyboard(chatId, event.text, event.buttons, "button");
          break;
        case "show_choices":
          await this.options.client.sendInlineKeyboard(
            chatId,
            event.prompt,
            event.options,
            "choice",
          );
          break;
        case "action_completed":
        case "action_failed":
          // Action execution and its diagnostics belong to the flow engine.
          // This adapter intentionally does not reinterpret action node rules.
          break;
      }
    }
  }

  private routeResult(status: TelegramRouteStatus, update: TelegramInboundUpdate): TelegramRouteResult {
    return {
      status,
      projectId: this.options.projectId,
      chatId: update.chatId,
      updateId: update.updateId,
    };
  }
}

export function asRoutingError(error: unknown): TelegramAdapterError {
  if (error instanceof TelegramAdapterError) return error;
  const message = error instanceof Error ? error.message : "Unknown update-routing failure.";
  return new TelegramAdapterError("unknown", `Telegram update routing failed: ${message}`, { originalError: error });
}
