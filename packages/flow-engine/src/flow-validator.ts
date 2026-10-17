
import { ERROR_CODES } from '@zerobotforge/shared/constants';

import {
  FlowDefinitionSchema,
} from './flow.model';

import type {
  FlowDefinition,
  FlowExecutionIssue,
  FlowNode,
} from './flow.model';

import {
  DEFAULT_NODE_REGISTRY,
} from './node-registry';

import type {
  NodeRegistry,
} from './node-registry';

export interface FlowValidationIssue {
  code: string;
  message: string;
  path: Array<string | number>;
}

export type FlowValidationResult =
  | {
      valid: true;
      flow: FlowDefinition;
      issues: [];
    }
  | {
      valid: false;
      issues: FlowValidationIssue[];
    };

function issue(
  code: string,
  message: string,
  path: Array<string | number>,
): FlowValidationIssue {
  return {
    code,
    message,
    path,
  };
}

function nodePath(
  index: number,
  ...rest: (string | number)[]
): (string | number)[] {
  return ['nodes', index, ...rest];
}

function edgePath(
  index: number,
  ...rest: (string | number)[]
): (string | number)[] {
  return ['edges', index, ...rest];
}

/**
 * Validates the flow's structure, node configurations, identifiers,
 * edge references, and port compatibility.
 *
 * Graph reachability and runtime policies remain separate concerns.
 */
export function validateFlow(
  input: unknown,
  registry: NodeRegistry = DEFAULT_NODE_REGISTRY,
): FlowValidationResult {
  const parsed = FlowDefinitionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((entry) =>
        issue(
          ERROR_CODES.FLOW_SCHEMA_INVALID,
          entry.message,
          entry.path.map((part) =>
            typeof part === 'string' ||
            typeof part === 'number'
              ? part
              : String(part),
          ),
        ),
      ),
    };
  }

  const flow = parsed.data;
  const issues: FlowValidationIssue[] = [];

  const nodesById = new Map<string, FlowNode>();

  const validConfigNodeIds = new Set<string>();

  const definitionsByNodeId = new Map<
    string,
    NonNullable<ReturnType<NodeRegistry['get']>>
  >();

  const seenNodeIds = new Set<string>();

  let startNodeCount = 0;
  let menuNodeCount = 0;

  flow.nodes.forEach((node, index) => {
    if (seenNodeIds.has(node.id)) {
      issues.push(
        issue(
          ERROR_CODES.FLOW_DUPLICATE_NODE_ID,
          `Node ID "${node.id}" is duplicated.`,
          nodePath(index, 'id'),
        ),
      );
    } else {
      seenNodeIds.add(node.id);
      nodesById.set(node.id, node);
    }

    if (node.type === 'start') {
      startNodeCount += 1;
    }

    if (node.type === 'menu') {
      menuNodeCount += 1;
    }

    const definition = registry.get(node.type);

    if (!definition) {
      issues.push(
        issue(
          ERROR_CODES.FLOW_NODE_TYPE_UNREGISTERED,
          `Node type "${node.type}" is not registered in the flow engine.`,
          nodePath(index, 'type'),
        ),
      );

      return;
    }

    definitionsByNodeId.set(
      node.id,
      definition,
    );

    const configResult =
      definition.configSchema.safeParse(node.data);

    if (!configResult.success) {
      for (const configIssue of configResult.error.issues) {
        issues.push(
          issue(
            ERROR_CODES.FLOW_NODE_CONFIG_INVALID,
            configIssue.message,
            nodePath(
              index,
              'data',
              ...configIssue.path.map(String),
            ),
          ),
        );
      }

      return;
    }

    validConfigNodeIds.add(node.id);
  });

  if (startNodeCount === 0) {
    issues.push(
      issue(
        ERROR_CODES.FLOW_START_NODE_MISSING,
        'The flow must contain exactly one Start node, but none was found.',
        ['nodes'],
      ),
    );
  } else if (startNodeCount > 1) {
    issues.push(
      issue(
        ERROR_CODES.FLOW_MULTIPLE_START_NODES,
        `The flow contains ${startNodeCount} Start nodes; exactly one is required.`,
        ['nodes'],
      ),
    );
  }

  if (menuNodeCount > 1) {
    issues.push(
      issue(
        ERROR_CODES.FLOW_MULTIPLE_MENU_NODES,
        `The flow contains ${menuNodeCount} Menu nodes; at most one main Menu node is allowed per flow.`,
        ['nodes'],
      ),
    );
  }

  const seenEdgeIds = new Set<string>();

  const edgeIdsByOutputPort = new Map<
    string,
    number[]
  >();

  flow.edges.forEach((edge, index) => {
    if (seenEdgeIds.has(edge.id)) {
      issues.push(
        issue(
          ERROR_CODES.FLOW_DUPLICATE_EDGE_ID,
          `Edge ID "${edge.id}" is duplicated.`,
          edgePath(index, 'id'),
        ),
      );
    }

    seenEdgeIds.add(edge.id);

    const source = nodesById.get(edge.sourceNodeId);
    const target = nodesById.get(edge.targetNodeId);

    if (!source) {
      issues.push(
        issue(
          ERROR_CODES.FLOW_EDGE_SOURCE_NOT_FOUND,
          `Edge "${edge.id}" references missing source node "${edge.sourceNodeId}".`,
          edgePath(index, 'sourceNodeId'),
        ),
      );
    }

    if (!target) {
      issues.push(
        issue(
          ERROR_CODES.FLOW_EDGE_TARGET_NOT_FOUND,
          `Edge "${edge.id}" references missing target node "${edge.targetNodeId}".`,
          edgePath(index, 'targetNodeId'),
        ),
      );
    }

    if (!source || !target) {
      return;
    }

    if (target.type === 'start') {
      issues.push(
        issue(
          ERROR_CODES.FLOW_EDGE_TO_START,
          'A Start node cannot be the target of an edge.',
          edgePath(index, 'targetNodeId'),
        ),
      );
    }

    const sourceDefinition =
      definitionsByNodeId.get(source.id);

    if (
      sourceDefinition &&
      validConfigNodeIds.has(source.id)
    ) {
      const outputPorts =
        sourceDefinition.getOutputPorts(source.data);

      const sourcePort = outputPorts.find(
        (port) =>
          port.direction === 'output' &&
          port.id === edge.sourceHandle,
      );

      if (!sourcePort) {
        issues.push(
          issue(
            ERROR_CODES.FLOW_SOURCE_PORT_INVALID,
            `Port "${edge.sourceHandle}" is not a valid output port of node "${source.id}".`,
            edgePath(index, 'sourceHandle'),
          ),
        );
      }

      const key =
        `${source.id}\u0000${edge.sourceHandle}`;

      const edgeIndexes =
        edgeIdsByOutputPort.get(key) ?? [];

      edgeIndexes.push(index);

      edgeIdsByOutputPort.set(key, edgeIndexes);
    }

    if (
      edge.targetHandle !== undefined &&
      edge.targetHandle !== null
    ) {
      const targetDefinition =
        definitionsByNodeId.get(target.id);

      if (
        targetDefinition &&
        validConfigNodeIds.has(target.id)
      ) {
        const inputPorts =
          targetDefinition.getInputPorts(target.data);

        const targetPort = inputPorts.find(
          (port) =>
            port.direction === 'input' &&
            port.id === edge.targetHandle,
        );

        if (!targetPort) {
          issues.push(
            issue(
              ERROR_CODES.FLOW_TARGET_PORT_INVALID,
              `Port "${edge.targetHandle}" is not a valid input port of node "${target.id}".`,
              edgePath(index, 'targetHandle'),
            ),
          );
        }
      }
    }
  });

  for (const [key, indexes] of edgeIdsByOutputPort) {
    if (indexes.length > 1) {
      const separator = key.indexOf('\u0000');
      const sourceId = key.slice(0, separator);
      const portId = key.slice(separator + 1);

      for (const index of indexes) {
        issues.push(
          issue(
            ERROR_CODES.FLOW_MULTIPLE_EDGES_FROM_PORT,
            `Output port "${portId}" on node "${sourceId}" has more than one outgoing edge. A port must route deterministically.`,
            edgePath(index, 'sourceHandle'),
          ),
        );
      }
    }
  }

  // Required output ports must have at least one outgoing connection.
  flow.nodes.forEach((node, index) => {
    const definition =
      definitionsByNodeId.get(node.id);

    if (
      !definition ||
      !validConfigNodeIds.has(node.id)
    ) {
      return;
    }

    const outputPorts =
      definition.getOutputPorts(node.data);

    for (const port of outputPorts) {
      if (
        port.direction !== 'output' ||
        !port.requiredConnection
      ) {
        continue;
      }

      const hasConnection = flow.edges.some(
        (edge) =>
          edge.sourceNodeId === node.id &&
          edge.sourceHandle === port.id,
      );

      if (!hasConnection) {
        issues.push(
          issue(
            ERROR_CODES.FLOW_OUTPUT_PORT_UNCONNECTED,
            `Required output port "${port.id}" on node "${node.id}" is not connected.`,
            nodePath(index, 'data'),
          ),
        );
      }
    }
  });

  if (issues.length > 0) {
    return {
      valid: false,
      issues,
    };
  }

  return {
    valid: true,
    flow,
    issues: [],
  };
}

export function isFlowValid(
  input: unknown,
  registry: NodeRegistry = DEFAULT_NODE_REGISTRY,
): boolean {
  return validateFlow(input, registry).valid;
}

/** Convert validation diagnostics to the shared execution-error shape. */
export function validationIssuesToExecutionIssues(
  issues: readonly FlowValidationIssue[],
): FlowExecutionIssue[] {
  return issues.map((entry) => ({
    code: entry.code,
    message: entry.message,
    path: entry.path,
  }));
}
