import {
  DEFAULT_NODE_REGISTRY,
} from "@zerobotforge/flow-engine/registry";

import type {
  FlowDefinition,
  FlowNode,
  SupportedFlowNodeType,
} from "@zerobotforge/flow-engine";

import type {
  ProjectEdgeDto,
  ProjectFlowDto,
  ProjectNodeDto,
} from "../../types/electron-api";

export const FLOW_NODE_WIDTH = 260;
export const FLOW_NODE_HEADER_HEIGHT = 52;
export const FLOW_PORT_ROW_HEIGHT = 26;
export const FLOW_PORT_ANCHOR_OFFSET =
  FLOW_NODE_HEADER_HEIGHT + FLOW_PORT_ROW_HEIGHT / 2;

export function createEditorId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `zbf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Convert the persisted desktop DTO into the flow-engine domain model.
 * The casts only restore branded identifier types; runtime validation remains
 * the responsibility of validateFlow(). Missing source ports become an empty
 * string so the validator reports the invalid data rather than guessing.
 */
export function toEngineFlow(flow: ProjectFlowDto): FlowDefinition {
  return {
    id: flow.id as FlowDefinition["id"],
    name: flow.name,
    ...(flow.description === undefined
      ? {}
      : { description: flow.description }),
    nodes: flow.nodes.map((node) => ({
      id: node.id as FlowDefinition["nodes"][number]["id"],
      type: node.type as FlowDefinition["nodes"][number]["type"],
      label: node.label,
      position: { x: node.position.x, y: node.position.y },
      data: node.data as FlowNode["data"],
    })),
    edges: flow.edges.map((edge) => ({
      id: edge.id as FlowDefinition["edges"][number]["id"],
      sourceNodeId:
        edge.sourceNodeId as FlowDefinition["edges"][number]["sourceNodeId"],
      sourceHandle: edge.sourceHandle ?? "",
      targetNodeId:
        edge.targetNodeId as FlowDefinition["edges"][number]["targetNodeId"],
      targetHandle: edge.targetHandle ?? null,
      ...(edge.label === undefined ? {} : { label: edge.label }),
    })),
  };
}

/** Convert the validated/editor engine model back to the persisted DTO shape. */
export function toProjectFlow(flow: FlowDefinition): ProjectFlowDto {
  const nodes: ProjectNodeDto[] = flow.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    label: node.label,
    position: { x: node.position.x, y: node.position.y },
    data: node.data,
  }));

  const edges: ProjectEdgeDto[] = flow.edges.map((edge) => ({
    id: edge.id,
    sourceNodeId: edge.sourceNodeId,
    sourceHandle: edge.sourceHandle,
    targetNodeId: edge.targetNodeId,
    targetHandle: edge.targetHandle ?? null,
    ...(edge.label === undefined ? {} : { label: edge.label }),
  }));

  return {
    id: flow.id,
    name: flow.name,
    ...(flow.description === undefined
      ? {}
      : { description: flow.description }),
    nodes,
    edges,
  };
}

export function createEmptyEditorFlow(name = "Main flow"): FlowDefinition {
  const startDefinition = DEFAULT_NODE_REGISTRY.get("start");

  return {
    id: createEditorId() as FlowDefinition["id"],
    name,
    nodes: [
      {
        id: createEditorId() as FlowNode["id"],
        type: "start",
        label: startDefinition?.title ?? "Start",
        position: { x: 80, y: 90 },
        data: {},
      },
    ],
    edges: [],
  };
}

/** Initial settings are templates, not execution results or fake conversations. */
export function createDefaultNodeData(
  type: SupportedFlowNodeType,
): FlowNode["data"] {
  switch (type) {
    case "start":
      return {};
    case "text":
      return { text: "Write your message here" };
    case "image":
      // Intentionally invalid until the user enters a real image URL.
      return { url: "" };
    case "button":
      return {
        text: "Choose an option",
        buttons: [{ id: "option_1", label: "Option 1", color: "default" }],
      };
    case "choice":
      return {
        prompt: "Choose an option",
        options: [
          { id: "option_1", label: "Option 1", color: "default" },
          { id: "option_2", label: "Option 2", color: "default" },
        ],
      };
    case "menu":
      return {
        text: "Choose an option from the main menu below:",
        placeholder: "Choose an option 👇",
        persistent: true,
        resizeKeyboard: true,
        oneTimeKeyboard: false,
        items: [
          {
            id: "menu_1",
            label: "Services 🛒",
            color: "green",
            row: 1,
            width: "half",
          },
          {
            id: "menu_2",
            label: "Test Account 🆓",
            color: "blue",
            row: 1,
            width: "half",
          },
          {
            id: "menu_3",
            label: "Wallet 💵",
            color: "default",
            row: 2,
            width: "half",
          },
          {
            id: "menu_4",
            label: "Account 💳",
            color: "default",
            row: 2,
            width: "half",
          },
          {
            id: "menu_5",
            label: "Support 💬",
            color: "blue",
            row: 3,
            width: "full",
          },
        ],
      };
    case "action":
      return { operationId: "configure_me", params: {} };
  }
}

export function getNodePortCounts(node: FlowNode): {
  inputCount: number;
  outputCount: number;
} {
  const definition = DEFAULT_NODE_REGISTRY.get(node.type);

  if (!definition) {
    return { inputCount: 0, outputCount: 0 };
  }

  return {
    inputCount: definition.getInputPorts(node.data).length,
    outputCount: definition.getOutputPorts(node.data).length,
  };
}

export function getNodeHeight(node: FlowNode): number {
  const { inputCount, outputCount } = getNodePortCounts(node);
  const rows = Math.max(1, inputCount, outputCount);

  return FLOW_NODE_HEADER_HEIGHT + rows * FLOW_PORT_ROW_HEIGHT + 8;
}
