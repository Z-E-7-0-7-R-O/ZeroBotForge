import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@zerobotforge/shared/constants';

import {
  edgeIdSchema,
  flowIdSchema,
  nodeIdSchema,
} from '@zerobotforge/shared/validators';

import type {
  FlowDefinition,
  FlowEdge,
  FlowNode,
} from './flow.model';

import {
  validateFlow,
} from './flow-validator';

import {
  executeFlow,
  FlowActionRegistry,
} from './flow-executor';

import {
  FlowGraph,
} from './flow-graph';

const START_ID = nodeIdSchema.parse('node-start');
const TEXT_ID = nodeIdSchema.parse('node-text');
const FLOW_ID = flowIdSchema.parse('flow-main');

function makeStartNode(): FlowNode {
  return {
    id: START_ID,
    type: 'start',
    label: 'Start',
    position: { x: 0, y: 0 },
    data: {},
  };
}

function makeTextNode(
  id = TEXT_ID,
  text = 'Hello from ZeroBotForge',
): FlowNode {
  return {
    id,
    type: 'text',
    label: 'Text',
    position: { x: 200, y: 0 },
    data: { text },
  };
}

function makeBasicFlow(): FlowDefinition {
  return {
    id: FLOW_ID,
    name: 'Basic conversation',
    nodes: [
      makeStartNode(),
      makeTextNode(),
    ],
    edges: [
      {
        id: edgeIdSchema.parse('edge-start-text'),
        sourceNodeId: START_ID,
        sourceHandle: 'next',
        targetNodeId: TEXT_ID,
        targetHandle: 'in',
      },
    ],
  };
}

function hasIssue(
  result: ReturnType<typeof validateFlow>,
  code: string,
): boolean {
  return (
    !result.valid &&
    result.issues.some((entry) => entry.code === code)
  );
}

describe('flow validation', () => {
  it('accepts a valid Start → Text flow', () => {
    const result = validateFlow(makeBasicFlow());

    expect(result.valid).toBe(true);
  });

  it('rejects duplicate node IDs', () => {
    const flow = makeBasicFlow();

    const result = validateFlow({
      ...flow,
      nodes: [
        ...flow.nodes,
        makeTextNode(),
      ],
    });

    expect(result.valid).toBe(false);
    expect(
      hasIssue(result, ERROR_CODES.FLOW_DUPLICATE_NODE_ID),
    ).toBe(true);
  });

  it('rejects a missing Start node', () => {
    const flow = makeBasicFlow();

    const result = validateFlow({
      ...flow,
      nodes: flow.nodes.filter(
        (node) => node.type !== 'start',
      ),
    });

    expect(result.valid).toBe(false);
    expect(
      hasIssue(result, ERROR_CODES.FLOW_START_NODE_MISSING),
    ).toBe(true);
  });

  it('rejects an edge referencing a missing destination', () => {
    const flow = makeBasicFlow();
    const edge = flow.edges[0];

    if (!edge) {
      throw new Error('The test fixture must have an edge.');
    }

    const brokenEdge: FlowEdge = {
      ...edge,
      targetNodeId: nodeIdSchema.parse('node-missing'),
    };

    const result = validateFlow({
      ...flow,
      edges: [brokenEdge],
    });

    expect(result.valid).toBe(false);
    expect(
      hasIssue(result, ERROR_CODES.FLOW_EDGE_TARGET_NOT_FOUND),
    ).toBe(true);
  });

  it('rejects an invalid source port', () => {
    const flow = makeBasicFlow();
    const edge = flow.edges[0];

    if (!edge) {
      throw new Error('The test fixture must have an edge.');
    }

    const result = validateFlow({
      ...flow,
      edges: [
        {
          ...edge,
          sourceHandle: 'missing-port',
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(
      hasIssue(result, ERROR_CODES.FLOW_SOURCE_PORT_INVALID),
    ).toBe(true);
  });

  it('rejects invalid text-node configuration', () => {
    const flow = makeBasicFlow();

    const invalidNodes = flow.nodes.map((node) =>
      node.type === 'text'
        ? { ...node, data: { text: '' } }
        : node,
    );

    const result = validateFlow({
      ...flow,
      nodes: invalidNodes,
    });

    expect(result.valid).toBe(false);
    expect(
      hasIssue(result, ERROR_CODES.FLOW_NODE_CONFIG_INVALID),
    ).toBe(true);
  });

  it('rejects unsupported node types', () => {
    const flow = makeBasicFlow();

    const unsupportedNodes: FlowNode[] = flow.nodes.map(
      (node) =>
        node.type === 'text'
          ? {
              ...node,
              type: 'condition',
              data: {},
            }
          : node,
    );

    const result = validateFlow({
      ...flow,
      nodes: unsupportedNodes,
    });

    expect(result.valid).toBe(false);
    expect(
      hasIssue(
        result,
        ERROR_CODES.FLOW_NODE_TYPE_UNREGISTERED,
      ),
    ).toBe(true);
  });
});

describe('flow graph', () => {
  it('finds reachable nodes without executing them', () => {
    const flow = makeBasicFlow();
    const graph = new FlowGraph(flow);

    expect(
      graph.getReachableNodeIds(START_ID),
    ).toEqual([START_ID, TEXT_ID]);

    expect(
      graph.getOutgoingEdges(START_ID, 'next'),
    ).toHaveLength(1);
  });
});

describe('flow executor', () => {
  it('executes Start → Text and returns an event', async () => {
    const result = await executeFlow(makeBasicFlow());

    expect(result.status).toBe('completed');
    expect(result.steps).toBe(2);

    expect(result.events).toContainEqual({
      type: 'send_text',
      nodeId: TEXT_ID,
      text: 'Hello from ZeroBotForge',
    });

    expect(result.errors).toEqual([]);
  });

  it('stops at a button and can resume after user input', async () => {
    const buttonId = nodeIdSchema.parse('node-buttons');

    const flow: FlowDefinition = {
      id: FLOW_ID,
      name: 'Button route',

      nodes: [
        makeStartNode(),

        {
          id: buttonId,
          type: 'button',
          label: 'Choose',
          position: { x: 200, y: 0 },
          data: {
            text: 'Select an option',
            buttons: [
              {
                id: 'continue',
                label: 'Continue',
              },
            ],
          },
        },

        makeTextNode(),
      ],

      edges: [
        {
          id: edgeIdSchema.parse('edge-start-button'),
          sourceNodeId: START_ID,
          sourceHandle: 'next',
          targetNodeId: buttonId,
          targetHandle: 'in',
        },

        {
          id: edgeIdSchema.parse('edge-button-text'),
          sourceNodeId: buttonId,
          sourceHandle: 'button:continue',
          targetNodeId: TEXT_ID,
          targetHandle: 'in',
        },
      ],
    };

    const firstRun = await executeFlow(flow);

    expect(firstRun.status).toBe('waiting_for_input');
    expect(firstRun.currentNodeId).toBe(buttonId);

    expect(firstRun.events).toContainEqual({
      type: 'show_buttons',
      nodeId: buttonId,
      text: 'Select an option',
      buttons: [
        { id: 'continue', label: 'Continue' },
      ],
    });

    const resumeAtNodeId = firstRun.currentNodeId;

    if (!resumeAtNodeId) {
      throw new Error('Expected a waiting node ID.');
    }

    const resumedRun = await executeFlow(flow, {
      resumeAtNodeId,
      context: {
        variables: {},
        input: {
          kind: 'button',
          optionId: 'continue',
        },
      },
    });

    expect(resumedRun.status).toBe('completed');

    expect(resumedRun.events).toContainEqual({
      type: 'send_text',
      nodeId: TEXT_ID,
      text: 'Hello from ZeroBotForge',
    });
  });

  it('stops a cyclic flow after reaching the step budget', async () => {
    const flow = makeBasicFlow();
    const textNodeId = TEXT_ID;

    const cyclicFlow: FlowDefinition = {
      ...flow,

      edges: [
        ...flow.edges,
        {
          id: edgeIdSchema.parse('edge-text-loop'),
          sourceNodeId: textNodeId,
          sourceHandle: 'next',
          targetNodeId: textNodeId,
          targetHandle: 'in',
        },
      ],
    };

    const result = await executeFlow(cyclicFlow, {
      maxSteps: 3,
    });

    expect(result.status).toBe('step_limit_exceeded');
    expect(result.steps).toBe(3);

    expect(
      result.errors.some(
        (entry) =>
          entry.code === ERROR_CODES.FLOW_STEP_LIMIT_EXCEEDED,
      ),
    ).toBe(true);
  });

  it('does not execute an action absent from the allowlist', async () => {
    const actionId = nodeIdSchema.parse('node-action');

    const flow: FlowDefinition = {
      id: FLOW_ID,
      name: 'Unregistered action',

      nodes: [
        makeStartNode(),

        {
          id: actionId,
          type: 'action',
          label: 'Unregistered operation',
          position: { x: 200, y: 0 },
          data: {
            operationId: 'unsafe-operation',
            params: {},
          },
        },
      ],

      edges: [
        {
          id: edgeIdSchema.parse('edge-start-action'),
          sourceNodeId: START_ID,
          sourceHandle: 'next',
          targetNodeId: actionId,
          targetHandle: 'in',
        },
      ],
    };

    const result = await executeFlow(flow);

    expect(result.status).toBe('failed');

    expect(
      result.errors.some(
        (entry) =>
          entry.code === ERROR_CODES.FLOW_ACTION_NOT_REGISTERED,
      ),
    ).toBe(true);

    expect(result.events).toContainEqual({
      type: 'action_failed',
      nodeId: actionId,
      operationId: 'unsafe-operation',
      message:
        'Action "unsafe-operation" is not registered in the allowed operation registry.',
    });
  });

  it('executes a registered action and records its result', async () => {
    const actionId = nodeIdSchema.parse('node-action');

    const flow: FlowDefinition = {
      id: FLOW_ID,
      name: 'Registered action',

      nodes: [
        makeStartNode(),

        {
          id: actionId,
          type: 'action',
          label: 'Set value',
          position: { x: 200, y: 0 },
          data: {
            operationId: 'safe-operation',
            params: { value: 'approved' },
          },
        },
      ],

      edges: [
        {
          id: edgeIdSchema.parse('edge-start-action-safe'),
          sourceNodeId: START_ID,
          sourceHandle: 'next',
          targetNodeId: actionId,
          targetHandle: 'in',
        },
      ],
    };

    const actions = new FlowActionRegistry();

    actions.register('safe-operation', ({ params }) => {
      const value = params.value;

      if (typeof value !== 'string') {
        throw new Error('Expected a string value.');
      }

      return value;
    });

    const result = await executeFlow(flow, { actions });

    expect(result.status).toBe('completed');
    expect(result.context.variables.lastActionResult).toBe(
      'approved',
    );

    expect(result.events).toContainEqual({
      type: 'action_completed',
      nodeId: actionId,
      operationId: 'safe-operation',
      result: 'approved',
    });
  });
});