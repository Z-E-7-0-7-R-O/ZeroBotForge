import {
  DEFAULT_NODE_REGISTRY,
} from "@zerobotforge/flow-engine/registry";
import {
  validateFlow,
} from "@zerobotforge/flow-engine/validator";
import type {
  FlowDefinition,
  FlowEdge,
  FlowNode,
  SupportedFlowNodeType,
} from "@zerobotforge/flow-engine";
import type { ProjectDocumentDto, ProjectFlowDto } from "../types/electron-api";
import {
  createDefaultNodeData,
  createEditorId,
  createEmptyEditorFlow,
  toProjectFlow,
} from "../components/flow/flow-editor.model";

export class FlowOperationError extends Error {
  public readonly code: string;
  public constructor(code: string, message: string) {
    super(message);
    this.name = "FlowOperationError";
    this.code = code;
  }
}

export function validateFlowDefinition(flow: FlowDefinition) {
  return validateFlow(flow);
}

export function createFlowDefinition(name = "Main flow"): FlowDefinition {
  return createEmptyEditorFlow(name);
}

export function createFlowNode(
  flow: FlowDefinition,
  type: SupportedFlowNodeType,
): FlowNode {
  const definition = DEFAULT_NODE_REGISTRY.get(type);
  if (!definition) throw new FlowOperationError("NODE_TYPE_UNREGISTERED", `Node type "${type}" is not registered.`);
  if (type === "start" && flow.nodes.some((node) => node.type === "start")) {
    throw new FlowOperationError("START_NODE_ALREADY_EXISTS", "A flow must contain exactly one Start node.");
  }

  const index = flow.nodes.filter((node) => node.type !== "start").length;
  return {
    id: createEditorId() as FlowNode["id"],
    type,
    label: definition.title,
    position: { x: 420 + (index % 2) * 340, y: 90 + Math.floor(index / 2) * 220 },
    data: createDefaultNodeData(type),
  };
}

export function addFlowNode(flow: FlowDefinition, type: SupportedFlowNodeType): FlowDefinition {
  return { ...flow, nodes: [...flow.nodes, createFlowNode(flow, type)] };
}

export function updateFlowNode(
  flow: FlowDefinition,
  nextNode: FlowNode,
  removedOutputHandles: readonly string[] = [],
): FlowDefinition {
  if (!flow.nodes.some((node) => node.id === nextNode.id)) {
    throw new FlowOperationError("NODE_NOT_FOUND", `Node "${nextNode.id}" does not exist in the active flow.`);
  }

  const edges = removedOutputHandles.length === 0
    ? flow.edges
    : flow.edges.filter((edge) => edge.sourceNodeId !== nextNode.id || !removedOutputHandles.includes(edge.sourceHandle));

  return {
    ...flow,
    nodes: flow.nodes.map((node) => node.id === nextNode.id ? nextNode : node),
    edges,
  };
}

export function connectFlowNodes(
  flow: FlowDefinition,
  input: {
    sourceNodeId: string;
    sourceHandle: string;
    targetNodeId: string;
    targetHandle?: string | null;
    label?: string;
  },
): FlowDefinition {
  const source = flow.nodes.find((node) => node.id === input.sourceNodeId);
  const target = flow.nodes.find((node) => node.id === input.targetNodeId);
  if (!source) throw new FlowOperationError("SOURCE_NODE_NOT_FOUND", "The source node no longer exists.");
  if (!target) throw new FlowOperationError("TARGET_NODE_NOT_FOUND", "The target node no longer exists.");
  if (source.id === target.id) throw new FlowOperationError("SELF_CONNECTION_NOT_ALLOWED", "A node cannot be connected to itself in this editor.");
  if (target.type === "start") throw new FlowOperationError("EDGE_TO_START_NOT_ALLOWED", "A Start node cannot receive a connection.");

  const sourcePort = DEFAULT_NODE_REGISTRY.getOutputPorts(source).find((port) => port.id === input.sourceHandle);
  if (!sourcePort) throw new FlowOperationError("SOURCE_PORT_INVALID", `"${input.sourceHandle}" is not an output port of ${source.label}.`);

  if (input.targetHandle) {
    const targetPort = DEFAULT_NODE_REGISTRY.getInputPorts(target).find((port) => port.id === input.targetHandle);
    if (!targetPort) throw new FlowOperationError("TARGET_PORT_INVALID", `"${input.targetHandle}" is not an input port of ${target.label}.`);
  }

  if (flow.edges.some((edge) => edge.sourceNodeId === source.id && edge.sourceHandle === input.sourceHandle)) {
    throw new FlowOperationError("OUTPUT_PORT_ALREADY_CONNECTED", "This output port already has a connection. Each output port can route to only one destination.");
  }

  const nextEdge: FlowEdge = {
    id: createEditorId() as FlowEdge["id"],
    sourceNodeId: source.id,
    sourceHandle: input.sourceHandle,
    targetNodeId: target.id,
    targetHandle: input.targetHandle ?? null,
    ...(input.label ? { label: input.label } : {}),
  };
  return { ...flow, edges: [...flow.edges, nextEdge] };
}

export function removeFlowNode(flow: FlowDefinition, nodeId: string): FlowDefinition {
  const node = flow.nodes.find((entry) => entry.id === nodeId);
  if (!node) return flow;
  if (node.type === "start") throw new FlowOperationError("START_NODE_PROTECTED", "The Start node cannot be removed.");
  return {
    ...flow,
    nodes: flow.nodes.filter((entry) => entry.id !== nodeId),
    edges: flow.edges.filter((edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId),
  };
}

export function removeFlowEdge(flow: FlowDefinition, edgeId: string): FlowDefinition {
  return { ...flow, edges: flow.edges.filter((edge) => edge.id !== edgeId) };
}

export function replaceProjectFlow(
  document: ProjectDocumentDto,
  flow: FlowDefinition,
): ProjectDocumentDto {
  const dto: ProjectFlowDto = toProjectFlow(flow);
  const exists = document.flows.some((candidate) => candidate.id === dto.id);
  return {
    ...document,
    flows: exists
      ? document.flows.map((candidate) => candidate.id === dto.id ? dto : candidate)
      : [...document.flows, dto],
    activeFlowId: dto.id,
    updatedAt: new Date().toISOString(),
  };
}
