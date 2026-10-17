import { randomUUID } from "node:crypto";
import { Markup } from "telegraf";
import type { Context, Telegraf } from "telegraf";

export interface FlowNode {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
}

export interface FlowDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface ProjectDocument {
  name: string;
  bot: {
    displayName: string;
    tokenEnvVar: string;
    parseMode: "HTML" | "Markdown" | "MarkdownV2" | null;
  };
  flows: FlowDefinition[];
  activeFlowId: string | null;
}

type ButtonColor = "default" | "green" | "blue" | "red";
type MenuButtonWidth = "auto" | "full" | "half" | "third" | "quarter";
type Selection = { kind: "button" | "choice" | "menu"; optionId: string };

interface PendingSelection {
  flowId: string;
  nodeId: string;
  chatId: number;
  userId: number;
  kind: Selection["kind"];
  optionId: string;
  variables: Record<string, unknown>;
}

interface SelectableOption {
  id: string;
  label: string;
  color?: ButtonColor;
  row?: number;
  width?: MenuButtonWidth;
}

const pendingSelections = new Map<string, PendingSelection>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeButtonColor(value: unknown): ButtonColor {
  return value === "green" || value === "blue" || value === "red"
    ? value
    : "default";
}

function normalizeMenuWidth(value: unknown): MenuButtonWidth {
  return value === "full" ||
    value === "half" ||
    value === "third" ||
    value === "quarter"
    ? value
    : "auto";
}

function toTelegramButtonStyle(
  color: ButtonColor | undefined,
): "success" | "primary" | "danger" | undefined {
  switch (color) {
    case "green":
      return "success";
    case "blue":
      return "primary";
    case "red":
      return "danger";
    default:
      return undefined;
  }
}

function readOptions(value: unknown): SelectableOption[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const result: SelectableOption[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "string" ||
      typeof candidate.label !== "string" ||
      candidate.id.length === 0 ||
      candidate.label.trim().length === 0
    ) {
      return null;
    }
    const rowValue =
      typeof candidate.row === "number" &&
      Number.isInteger(candidate.row) &&
      candidate.row >= 1 &&
      candidate.row <= 12
        ? candidate.row
        : undefined;
    result.push({
      id: candidate.id,
      label: candidate.label,
      color: normalizeButtonColor(candidate.color),
      ...(rowValue !== undefined ? { row: rowValue } : {}),
      width: normalizeMenuWidth(candidate.width),
    });
  }
  return result;
}

function widthCapacityForRow(width: MenuButtonWidth | undefined): number {
  switch (width) {
    case "full":
      return 1;
    case "half":
      return 2;
    case "third":
      return 3;
    case "quarter":
      return 4;
    default:
      return 2;
  }
}

function buildMenuKeyboardRows(
  items: SelectableOption[],
): Array<Array<{ text: string; style?: "success" | "primary" | "danger" }>> {
  const hasExplicitRows = items.some(
    (item) => item.row !== undefined && item.row > 1,
  );
  const rows: Array<
    Array<{ text: string; style?: "success" | "primary" | "danger" }>
  > = [];

  if (hasExplicitRows) {
    const grouped = new Map<number, SelectableOption[]>();
    for (const item of items) {
      const rowIndex = item.row ?? 1;
      const bucket = grouped.get(rowIndex) ?? [];
      bucket.push(item);
      grouped.set(rowIndex, bucket);
    }
    const sortedKeys = [...grouped.keys()].sort((a, b) => a - b);
    for (const key of sortedKeys) {
      const bucket = grouped.get(key) ?? [];
      let currentRow: Array<{
        text: string;
        style?: "success" | "primary" | "danger";
      }> = [];
      let currentCap = 4;

      for (const item of bucket) {
        const cap =
          item.width && item.width !== "auto"
            ? widthCapacityForRow(item.width)
            : bucket.length;
        currentCap = Math.min(currentCap, cap);
        const style = toTelegramButtonStyle(item.color);
        currentRow.push({
          text: item.label,
          ...(style ? { style } : {}),
        });
        if (currentRow.length >= currentCap) {
          rows.push(currentRow);
          currentRow = [];
          currentCap = 4;
        }
      }
      if (currentRow.length > 0) {
        rows.push(currentRow);
      }
    }
    return rows;
  }

  let currentRow: Array<{
    text: string;
    style?: "success" | "primary" | "danger";
  }> = [];
  let activeCapacity = 2;

  for (const item of items) {
    const itemCapacity = widthCapacityForRow(item.width);
    if (
      currentRow.length > 0 &&
      (itemCapacity === 1 ||
        currentRow.length >= activeCapacity ||
        itemCapacity !== activeCapacity)
    ) {
      rows.push(currentRow);
      currentRow = [];
    }
    activeCapacity = itemCapacity;
    const style = toTelegramButtonStyle(item.color);
    currentRow.push({
      text: item.label,
      ...(style ? { style } : {}),
    });
    if (currentRow.length >= activeCapacity) {
      rows.push(currentRow);
      currentRow = [];
    }
  }

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

function findEdge(flow: FlowDefinition, nodeId: string, handle: string): FlowEdge | undefined {
  return flow.edges.find(
    (edge) => edge.sourceNodeId === nodeId && edge.sourceHandle === handle,
  );
}

function createCallbackData(
  flowId: string,
  nodeId: string,
  selection: Selection,
  variables: Record<string, unknown>,
  context: Context,
): string {
  const chatId = context.chat?.id;
  const userId = context.from?.id;
  if (typeof chatId !== "number" || typeof userId !== "number") {
    throw new Error("Telegram chat/user context is unavailable.");
  }

  const key = randomUUID();
  pendingSelections.set(key, {
    flowId,
    nodeId,
    chatId,
    userId,
    kind: selection.kind,
    optionId: selection.optionId,
    variables: { ...variables },
  });
  return `zbf:${key}`;
}

async function runFlow(
  context: Context,
  project: ProjectDocument,
  flowId: string,
  selection?: Selection,
  resumeAtNodeId?: string,
  initialVariables: Record<string, unknown> = {},
): Promise<void> {
  const flow = project.flows.find((candidate) => candidate.id === flowId);
  if (!flow) {
    await context.reply("The selected flow was not found in project.json.");
    return;
  }

  const start = flow.nodes.find((node) => node.type === "start");
  if (!start) {
    await context.reply("This flow has no Start node.");
    return;
  }

  let currentNodeId = resumeAtNodeId ?? start.id;
  let userSelection = selection;
  const variables = { ...initialVariables };

  for (let step = 0; step < 100; step += 1) {
    const node = flow.nodes.find((candidate) => candidate.id === currentNodeId);
    if (!node) {
      await context.reply("Flow execution stopped because a node was missing.");
      return;
    }

    const data = node.data;
    let outputHandle: string | null = null;

    switch (node.type) {
      case "start": {
        outputHandle = "next";
        break;
      }

      case "text": {
        if (typeof data.text !== "string" || data.text.trim().length === 0) {
          await context.reply("This text node has an invalid or empty message.");
          return;
        }
        await context.reply(data.text);
        outputHandle = "next";
        break;
      }

      case "image": {
        if (typeof data.url !== "string") {
          await context.reply("This image node has no valid HTTP(S) URL.");
          return;
        }
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(data.url);
        } catch {
          await context.reply("This image node has no valid HTTP(S) URL.");
          return;
        }
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          await context.reply("This image node has no valid HTTP(S) URL.");
          return;
        }
        const caption = typeof data.caption === "string" ? data.caption : undefined;
        await context.replyWithPhoto(data.url, caption ? { caption } : {});
        outputHandle = "next";
        break;
      }

      case "button": {
        const buttons = readOptions(data.buttons);
        if (!buttons) {
          await context.reply("This button node has invalid or missing buttons.");
          return;
        }
        if (!userSelection) {
          const keyboard = buttons.map((button) => {
            const cbButton = Markup.button.callback(
              button.label,
              createCallbackData(
                flow.id,
                node.id,
                { kind: "button", optionId: button.id },
                variables,
                context,
              ),
            );
            const style = toTelegramButtonStyle(button.color);
            return style ? Object.assign(cbButton, { style }) : cbButton;
          });
          await context.reply(
            typeof data.text === "string" ? data.text : "Choose an option",
            Markup.inlineKeyboard(keyboard),
          );
          return;
        }
        if (userSelection.kind !== "button") {
          await context.reply("The flow expected a button selection.");
          return;
        }
        const selected = buttons.find((button) => button.id === userSelection?.optionId);
        if (!selected) {
          await context.reply("The selected button is not part of this node.");
          return;
        }
        outputHandle = `button:${selected.id}`;
        userSelection = undefined;
        break;
      }

      case "choice": {
        const options = readOptions(data.options);
        if (!options || options.length < 2) {
          await context.reply("This choice node has invalid or missing options.");
          return;
        }
        if (!userSelection) {
          const keyboard = options.map((option) => {
            const cbButton = Markup.button.callback(
              option.label,
              createCallbackData(
                flow.id,
                node.id,
                { kind: "choice", optionId: option.id },
                variables,
                context,
              ),
            );
            const style = toTelegramButtonStyle(option.color);
            return style ? Object.assign(cbButton, { style }) : cbButton;
          });
          await context.reply(
            typeof data.prompt === "string" ? data.prompt : "Choose an option",
            Markup.inlineKeyboard(keyboard),
          );
          return;
        }
        if (userSelection.kind !== "choice") {
          await context.reply("The flow expected a choice selection.");
          return;
        }
        const selected = options.find((option) => option.id === userSelection?.optionId);
        if (!selected) {
          await context.reply("The selected option is not part of this node.");
          return;
        }
        outputHandle = `choice:${selected.id}`;
        userSelection = undefined;
        break;
      }

      case "menu": {
        const items = readOptions(data.items);
        if (!items || items.length === 0) {
          await context.reply("This menu node has invalid or missing menu buttons.");
          return;
        }
        if (!userSelection) {
          const keyboardRows = buildMenuKeyboardRows(items);
          const placeholder =
            typeof data.placeholder === "string" && data.placeholder.trim().length > 0
              ? data.placeholder.trim()
              : undefined;
          const isPersistent =
            typeof data.persistent === "boolean" ? data.persistent : true;
          const resizeKeyboard =
            typeof data.resizeKeyboard === "boolean" ? data.resizeKeyboard : true;
          const oneTimeKeyboard =
            typeof data.oneTimeKeyboard === "boolean" ? data.oneTimeKeyboard : false;

          await context.reply(
            typeof data.text === "string" && data.text.trim().length > 0
              ? data.text
              : "Choose an option from the menu below:",
            {
              reply_markup: {
                keyboard: keyboardRows,
                resize_keyboard: resizeKeyboard,
                is_persistent: isPersistent,
                one_time_keyboard: oneTimeKeyboard,
                ...(placeholder ? { input_field_placeholder: placeholder } : {}),
              },
            },
          );
          return;
        }
        if (userSelection.kind !== "menu") {
          await context.reply("The flow expected a menu selection.");
          return;
        }
        const selectedItem = items.find(
          (item) => item.id === userSelection?.optionId,
        );
        if (!selectedItem) {
          await context.reply("The selected button is not part of this menu.");
          return;
        }
        outputHandle = `menu:${selectedItem.id}`;
        userSelection = undefined;
        break;
      }

      case "action": {
        const operationId =
          typeof data.operationId === "string" && data.operationId.trim().length > 0
            ? data.operationId.trim()
            : node.id;
        const rawParams = isRecord(data.params) ? data.params : {};
        outputHandle = await executeRegisteredAction(
          context,
          project,
          operationId,
          rawParams,
          variables,
        );
        break;
      }

      default: {
        await context.reply(`Unsupported node type: ${node.type}`);
        return;
      }
    }

    if (outputHandle === null) return;
    const next = findEdge(flow, node.id, outputHandle);
    if (!next) return;
    currentNodeId = next.targetNodeId;
  }

  await context.reply("Flow stopped after reaching the 100-step safety limit.");
}

type RegisteredActionHandler = (
  context: Context,
  project: ProjectDocument,
  operationId: string,
  params: Record<string, unknown>,
  variables: Record<string, unknown>,
) => Promise<"success" | "failure">;

const registeredActionOperations = new Map<string, RegisteredActionHandler>();

const DOUBLE_BRACE_PATTERN = new RegExp("\\x7b\\x7b\\s*([a-zA-Z0-9_.-]+)\\s*\\x7d\\x7d", "g");
const SINGLE_BRACE_PATTERN = new RegExp("\\{([a-zA-Z0-9_.-]+)\\}", "g");

function resolveTemplateVariable(
  keyPath: string,
  context: Context,
  operationId: string,
  variables: Record<string, unknown>,
): string | undefined {
  if (keyPath === "operationId") return operationId;
  if (keyPath === "userId") return context.from?.id !== undefined ? String(context.from.id) : "";
  if (keyPath === "chatId") return context.chat?.id !== undefined ? String(context.chat.id) : "";
  if (keyPath === "username") return context.from?.username ?? "";
  if (keyPath === "firstName") return context.from?.first_name ?? "";
  if (keyPath === "lastName") return context.from?.last_name ?? "";

  const segments = keyPath.split(".");
  let cursor: unknown = variables;
  for (const segment of segments) {
    if (isRecord(cursor) && Object.prototype.hasOwnProperty.call(cursor, segment)) {
      cursor = cursor[segment];
    } else {
      return undefined;
    }
  }
  if (cursor === null || cursor === undefined) return "";
  if (typeof cursor === "string" || typeof cursor === "number" || typeof cursor === "boolean") {
    return String(cursor);
  }
  return JSON.stringify(cursor);
}

function interpolateActionText(
  template: string,
  context: Context,
  operationId: string,
  variables: Record<string, unknown>,
): string {
  const withDoubleBraces = template.replace(DOUBLE_BRACE_PATTERN, (fullMatch, key: string) => {
    const resolved = resolveTemplateVariable(key, context, operationId, variables);
    return resolved !== undefined ? resolved : fullMatch;
  });
  return withDoubleBraces.replace(SINGLE_BRACE_PATTERN, (fullMatch, key: string) => {
    const resolved = resolveTemplateVariable(key, context, operationId, variables);
    return resolved !== undefined ? resolved : fullMatch;
  });
}

function extractMergedActionConfig(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...params };
  const nestedKeys = ["config", "payload", "data", "options", "settings", "parameters"];
  for (const key of nestedKeys) {
    const candidate = params[key];
    if (isRecord(candidate)) {
      for (const [nestedKey, nestedValue] of Object.entries(candidate)) {
        if (merged[nestedKey] === undefined) {
          merged[nestedKey] = nestedValue;
        }
      }
    }
  }
  return merged;
}

function extractActionTextCandidate(config: Record<string, unknown>): string | null {
  const textKeys = ["text", "message", "reply", "content", "output", "response", "prompt", "caption"];
  for (const key of textKeys) {
    const value = config[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function resolveActionParseMode(
  config: Record<string, unknown>,
  project: ProjectDocument,
): "HTML" | "Markdown" | "MarkdownV2" | undefined {
  const candidate = config.parseMode ?? config.parse_mode ?? project.bot.parseMode;
  if (candidate === "HTML" || candidate === "Markdown" || candidate === "MarkdownV2") {
    return candidate;
  }
  return undefined;
}

function buildActionInlineKeyboard(config: Record<string, unknown>) {
  const rawButtons = config.buttons ?? config.keyboard ?? config.inlineKeyboard;
  if (!Array.isArray(rawButtons) || rawButtons.length === 0) {
    return undefined;
  }
  const buttons = [];
  for (const item of rawButtons) {
    if (!isRecord(item)) continue;
    const label =
      typeof item.label === "string"
        ? item.label.trim()
        : typeof item.text === "string"
          ? item.text.trim()
          : "";
    if (!label) continue;
    if (typeof item.url === "string" && /^https?:\/\//i.test(item.url.trim())) {
      buttons.push(Markup.button.url(label, item.url.trim()));
    }
  }
  return buttons.length > 0 ? Markup.inlineKeyboard(buttons) : undefined;
}

async function defaultJsonActionHandler(
  context: Context,
  project: ProjectDocument,
  operationId: string,
  params: Record<string, unknown>,
  variables: Record<string, unknown>,
): Promise<"success" | "failure"> {
  try {
    const merged = extractMergedActionConfig(params);
    const actionType =
      typeof merged.type === "string"
        ? merged.type.trim().toLowerCase()
        : typeof merged.action === "string"
          ? merged.action.trim().toLowerCase()
          : typeof merged.kind === "string"
            ? merged.kind.trim().toLowerCase()
            : "";

    // 1. Apply any variable assignments included in the JSON payload.
    const variableSources = [merged.variables, merged.set, merged.assign, merged.state];
    for (const source of variableSources) {
      if (isRecord(source)) {
        for (const [varKey, varVal] of Object.entries(source)) {
          variables[varKey] =
            typeof varVal === "string"
              ? interpolateActionText(varVal, context, operationId, variables)
              : varVal;
        }
      }
    }

    // 2. Execute batch steps/actions if an array of sub-actions or messages is provided.
    if (Array.isArray(merged.steps) || Array.isArray(merged.actions)) {
      const list = (Array.isArray(merged.steps) ? merged.steps : merged.actions) as unknown[];
      for (const item of list) {
        if (isRecord(item)) {
          const stepResult = await defaultJsonActionHandler(
            context,
            project,
            operationId,
            item,
            variables,
          );
          if (stepResult === "failure") return "failure";
        } else if (typeof item === "string" && item.trim().length > 0) {
          await context.reply(interpolateActionText(item, context, operationId, variables));
        }
      }
    }

    if (Array.isArray(merged.messages)) {
      for (const msg of merged.messages) {
        if (typeof msg === "string" && msg.trim().length > 0) {
          await context.reply(interpolateActionText(msg, context, operationId, variables));
        } else if (isRecord(msg)) {
          const nestedText = extractActionTextCandidate(msg);
          if (nestedText) {
            await context.reply(interpolateActionText(nestedText, context, operationId, variables));
          }
        }
      }
    }

    // 3. Handle HTTP / Webhook requests if configured.
    const isHttpAction =
      actionType === "http_request" ||
      actionType === "webhook" ||
      actionType === "fetch" ||
      actionType === "api" ||
      actionType === "request" ||
      (typeof merged.webhookUrl === "string" && merged.webhookUrl.trim().length > 0) ||
      (typeof merged.endpoint === "string" && merged.endpoint.trim().length > 0);

    if (isHttpAction) {
      const rawUrl =
        typeof merged.url === "string"
          ? merged.url
          : typeof merged.webhookUrl === "string"
            ? merged.webhookUrl
            : typeof merged.endpoint === "string"
              ? merged.endpoint
              : "";
      const targetUrl = interpolateActionText(rawUrl.trim(), context, operationId, variables);
      const parsedUrl = new URL(targetUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return "failure";
      }

      const method =
        typeof merged.method === "string" ? merged.method.trim().toUpperCase() : "GET";
      const headers: Record<string, string> = { accept: "application/json" };
      if (isRecord(merged.headers)) {
        for (const [hKey, hVal] of Object.entries(merged.headers)) {
          if (typeof hVal === "string") {
            headers[hKey] = interpolateActionText(hVal, context, operationId, variables);
          }
        }
      }

      let requestBody: string | undefined;
      if (method !== "GET" && method !== "HEAD" && merged.body !== undefined) {
        if (typeof merged.body === "string") {
          requestBody = interpolateActionText(merged.body, context, operationId, variables);
        } else {
          headers["content-type"] = headers["content-type"] ?? "application/json";
          requestBody = JSON.stringify(merged.body);
        }
      }

      const response = await fetch(parsedUrl.toString(), {
        method,
        headers,
        ...(requestBody !== undefined ? { body: requestBody } : {}),
        signal: AbortSignal.timeout(10_000),
      });

      const responseText = await response.text();
      let parsedResponse: unknown = responseText;
      try {
        parsedResponse = JSON.parse(responseText) as unknown;
      } catch {
        // Keep plain text response when body is not JSON.
      }

      variables[operationId] = parsedResponse;
      variables.lastActionResult = parsedResponse;

      if (!response.ok) {
        return "failure";
      }
    }

    // 4. Handle Photo / Image sending if configured.
    const rawPhotoUrl =
      typeof merged.imageUrl === "string"
        ? merged.imageUrl
        : typeof merged.photoUrl === "string"
          ? merged.photoUrl
          : typeof merged.photo === "string"
            ? merged.photo
            : typeof merged.image === "string"
              ? merged.image
              : (actionType === "send_image" ||
                  actionType === "send_photo" ||
                  actionType === "image" ||
                  actionType === "photo") &&
                typeof merged.url === "string"
                ? merged.url
                : null;

    if (rawPhotoUrl && rawPhotoUrl.trim().length > 0) {
      const resolvedPhotoUrl = interpolateActionText(
        rawPhotoUrl.trim(),
        context,
        operationId,
        variables,
      );
      const parsedPhoto = new URL(resolvedPhotoUrl);
      if (parsedPhoto.protocol === "http:" || parsedPhoto.protocol === "https:") {
        const captionRaw = typeof merged.caption === "string" ? merged.caption : undefined;
        const caption = captionRaw
          ? interpolateActionText(captionRaw, context, operationId, variables)
          : undefined;
        await context.replyWithPhoto(
          parsedPhoto.toString(),
          caption ? { caption } : {},
        );
      }
    }

    // 5. Handle Text / Message sending if present in JSON config or top-level parameters.
    const textCandidate = extractActionTextCandidate(merged);
    if (
      textCandidate &&
      (!rawPhotoUrl || merged.text !== undefined || merged.message !== undefined || merged.reply !== undefined)
    ) {
      const renderedText = interpolateActionText(
        textCandidate,
        context,
        operationId,
        variables,
      );
      const parseMode = resolveActionParseMode(merged, project);
      const inlineKeyboard = buildActionInlineKeyboard(merged);
      await context.reply(renderedText, {
        ...(parseMode ? { parse_mode: parseMode } : {}),
        ...(inlineKeyboard ? inlineKeyboard : {}),
      });
    }

    // 6. Persist custom JSON state under the operation ID for downstream nodes.
    if (!isHttpAction) {
      variables[operationId] = merged;
      variables.lastActionResult = merged;
    }

    // 7. Evaluate explicit outcome/status overrides if specified in JSON.
    if (
      merged.outcome === "failure" ||
      merged.status === "failure" ||
      merged.status === "error" ||
      merged.success === false
    ) {
      return "failure";
    }

    return "success";
  } catch (error) {
    variables.lastActionError =
      error instanceof Error ? error.message : "Action execution error";
    return "failure";
  }
}

export function registerActionOperation(
  operationId: string,
  handler: RegisteredActionHandler = defaultJsonActionHandler,
): void {
  const normalizedId = operationId.trim();
  if (!normalizedId) return;
  registeredActionOperations.set(normalizedId, handler);
}

async function executeRegisteredAction(
  context: Context,
  project: ProjectDocument,
  operationId: string,
  params: Record<string, unknown>,
  variables: Record<string, unknown>,
): Promise<"success" | "failure"> {
  if (!registeredActionOperations.has(operationId)) {
    registerActionOperation(operationId, defaultJsonActionHandler);
  }
  const handler = registeredActionOperations.get(operationId) ?? defaultJsonActionHandler;
  return handler(context, project, operationId, params, variables);
}

export function registerProjectHandlers(
  bot: Telegraf<Context>,
  project: ProjectDocument,
): void {
  for (const flow of project.flows) {
    for (const node of flow.nodes) {
      if (node.type === "action") {
        const opId =
          typeof node.data.operationId === "string" && node.data.operationId.trim().length > 0
            ? node.data.operationId.trim()
            : node.id;
        registerActionOperation(opId, defaultJsonActionHandler);
      }
    }
  }

  const defaultFlow =
    project.flows.find((flow) => flow.id === project.activeFlowId) ?? project.flows[0];

  bot.start(async (context) => {
    if (!defaultFlow) {
      await context.reply("This project does not contain a flow to run.");
      return;
    }
    await runFlow(context, project, defaultFlow.id);
  });

  bot.action(/^zbf:([0-9a-f-]+)$/i, async (context) => {
    const key = context.match[1];
    if (!key) {
      await context.answerCbQuery("This option is invalid.");
      return;
    }

    const pending = pendingSelections.get(key);
    const chatId = context.chat?.id;
    const userId = context.from?.id;
    if (!pending) {
      await context.answerCbQuery("This option has expired.");
      return;
    }
    if (pending.chatId !== chatId || pending.userId !== userId) {
      await context.answerCbQuery("This option belongs to another conversation.");
      return;
    }

    pendingSelections.delete(key);
    await context.answerCbQuery();
    await runFlow(
      context,
      project,
      pending.flowId,
      { kind: pending.kind, optionId: pending.optionId },
      pending.nodeId,
      pending.variables,
    );
  });

  bot.on("text", async (context) => {
    const incomingText = context.message?.text?.trim();
    if (!incomingText || incomingText.startsWith("/") || !defaultFlow) {
      return;
    }

    const menuNode = defaultFlow.nodes.find((node) => node.type === "menu");
    if (!menuNode) {
      return;
    }

    const items = readOptions(menuNode.data.items);
    if (!items) {
      return;
    }

    const matchedItem = items.find(
      (item) => item.label.trim() === incomingText,
    );
    if (!matchedItem) {
      return;
    }

    await runFlow(
      context,
      project,
      defaultFlow.id,
      { kind: "menu", optionId: matchedItem.id },
      menuNode.id,
    );
  });
}