import { executeFlow } from "@zerobotforge/flow-engine/executor";
import type {
  FlowDefinition,
  FlowExecutionResult,
  FlowRuntimeContext,
} from "@zerobotforge/flow-engine";

export interface FlowPreviewOptions {
  context?: Partial<FlowRuntimeContext>;
  maxSteps?: number;
  resumeAtNodeId?: FlowExecutionResult["currentNodeId"];
}

export interface FlowPreviewReport {
  executedAt: string;
  result: FlowExecutionResult;
  outputLines: string[];
}

function describeEvent(event: FlowExecutionResult["events"][number]): string {
  switch (event.type) {
    case "send_text":
      return event.text;
    case "send_image":
      return event.caption ? `Image: ${event.url} — ${event.caption}` : `Image: ${event.url}`;
    case "show_buttons":
      return `${event.text} [${event.buttons.map((button) => button.label).join(" · ")}]`;
    case "show_choices":
      return `${event.prompt} [${event.options.map((option) => option.label).join(" · ")}]`;
    case "show_menu":
      return `${event.text} [${event.items.map((item) => item.label).join(" · ")}]`;
    case "action_completed":
      return `Action completed: ${event.operationId}`;
    case "action_failed":
      return `Action failed: ${event.operationId} — ${event.message}`;
  }
}

/**
 * Executes the real flow-engine executor using an isolated preview context.
 * No Telegram adapter, secure token, or external action handler is consulted.
 */
export async function runFlowPreview(
  flow: FlowDefinition,
  options: FlowPreviewOptions = {},
): Promise<FlowPreviewReport> {
  const context = options.context;
  const result = await executeFlow(flow, {
    maxSteps: options.maxSteps ?? 100,
    ...(options.resumeAtNodeId === undefined
      ? {}
      : { resumeAtNodeId: options.resumeAtNodeId }),
    context: {
      ...(context ?? {}),
      variables: { ...(context?.variables ?? {}) },
      ...(context?.input === undefined ? {} : { input: { ...context.input } }),
    },
  });

  const outputLines = result.events.map(describeEvent);
  if (result.errors.length > 0) {
    outputLines.push(...result.errors.map((entry) => `Error ${entry.code}: ${entry.message}`));
  }
  if (outputLines.length === 0) {
    outputLines.push(
      result.status === "completed"
        ? "Execution completed without output events."
        : `Preview ended with status: ${result.status}.`,
    );
  }

  return { executedAt: new Date().toISOString(), result, outputLines };
}
