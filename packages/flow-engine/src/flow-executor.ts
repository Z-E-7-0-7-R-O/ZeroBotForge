import { ERROR_CODES } from '@zerobotforge/shared/constants';

import {
  identifierSchema,
} from '@zerobotforge/shared/validators';

import type {
  JsonObject,
  JsonValue,
  NodeId,
} from '@zerobotforge/shared';

import {
  ActionNodeDataSchema,
} from './nodes/action.node';

import {
  ButtonNodeDataSchema,
} from './nodes/button.node';

import {
  ChoiceNodeDataSchema,
} from './nodes/choice.node';

import {
  MenuNodeDataSchema,
} from './nodes/menu.node';

import {
  ImageNodeDataSchema,
} from './nodes/image.node';

import {
  TextNodeDataSchema,
} from './nodes/text.node';

import {
  DEFAULT_NODE_REGISTRY,
} from './node-registry';

import type {
  NodeRegistry,
} from './node-registry';

import {
  validateFlow,
  validationIssuesToExecutionIssues,
} from './flow-validator';

import {
  FlowGraph,
} from './flow-graph';

import type {
  FlowDefinition,
  FlowEdge,
  FlowExecutionIssue,
  FlowExecutionResult,
  FlowNode,
  FlowRuntimeContext,
} from './flow.model';

export interface FlowActionInvocation {
  node: FlowNode;
  params: JsonObject;
  context: FlowRuntimeContext;
}

export type FlowActionHandler = (
  invocation: FlowActionInvocation,
) => JsonValue | void | Promise<JsonValue | void>;

/**
 * Explicit allowlist of operations available to Action nodes.
 *
 * Register trusted application operations here. Flow data can only reference
 * operation IDs; it cannot provide executable JavaScript.
 */
export class FlowActionRegistry {
  private readonly handlers = new Map<
    string,
    FlowActionHandler
  >();

  public register(
    operationId: string,
    handler: FlowActionHandler,
  ): this {
    if (!identifierSchema.safeParse(operationId).success) {
      throw new Error(
        `Invalid action operation ID "${operationId}".`,
      );
    }

    if (this.handlers.has(operationId)) {
      throw new Error(
        `Action operation "${operationId}" is already registered.`,
      );
    }

    this.handlers.set(operationId, handler);

    return this;
  }

  public get(
    operationId: string,
  ): FlowActionHandler | undefined {
    return this.handlers.get(operationId);
  }

  public has(operationId: string): boolean {
    return this.handlers.has(operationId);
  }

  public listOperationIds(): string[] {
    return [...this.handlers.keys()];
  }
}

export interface FlowExecutionOptions {
  context?: Partial<FlowRuntimeContext>;
  maxSteps?: number;

  /**
   * Set this to a previously waiting node to resume a suspended flow.
   * Without it, execution starts at the single Start node.
   */
  resumeAtNodeId?: NodeId;

  nodeRegistry?: NodeRegistry;
  actions?: FlowActionRegistry;
}

function cloneContext(
  source: Partial<FlowRuntimeContext> | undefined,
): FlowRuntimeContext {
  return {
    variables: {
      ...(source?.variables ?? {}),
    },

    ...(source?.userId === undefined
      ? {}
      : { userId: source.userId }),

    ...(source?.conversationId === undefined
      ? {}
      : { conversationId: source.conversationId }),

    ...(source?.input === undefined
      ? {}
      : { input: { ...source.input } }),
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'An operation failed with a non-Error value.';
}

function createIssue(
  code: string,
  message: string,
  nodeId?: NodeId,
  details?: unknown,
): FlowExecutionIssue {
  return {
    code,
    message,
    ...(nodeId === undefined ? {} : { nodeId }),
    ...(details === undefined ? {} : { details }),
  };
}

function snapshotContext(
  context: FlowRuntimeContext,
): FlowRuntimeContext {
  return {
    variables: { ...context.variables },

    ...(context.userId === undefined
      ? {}
      : { userId: context.userId }),

    ...(context.conversationId === undefined
      ? {}
      : { conversationId: context.conversationId }),

    ...(context.input === undefined
      ? {}
      : { input: { ...context.input } }),
  };
}

export async function executeFlow(
  input: unknown,
  options: FlowExecutionOptions = {},
): Promise<FlowExecutionResult> {
  const context = cloneContext(options.context);
  const registry = options.nodeRegistry ?? DEFAULT_NODE_REGISTRY;

  const validation = validateFlow(input, registry);

  if (!validation.valid) {
    return {
      status: 'failed',
      steps: 0,
      events: [],
      errors: validationIssuesToExecutionIssues(
        validation.issues,
      ),
      context: snapshotContext(context),
    };
  }

  const flow: FlowDefinition = validation.flow;
  const maxSteps = options.maxSteps ?? 100;
  const graph = new FlowGraph(flow);

  let steps = 0;

  const events: FlowExecutionResult['events'] = [];
  const errors: FlowExecutionIssue[] = [];

  const makeResult = (
    status: FlowExecutionResult['status'],
    currentNodeId?: NodeId,
  ): FlowExecutionResult => ({
    status,
    flowId: flow.id,
    steps,
    events: [...events],
    errors: [...errors],
    context: snapshotContext(context),

    ...(currentNodeId === undefined
      ? {}
      : { currentNodeId }),
  });

  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    errors.push(
      createIssue(
        ERROR_CODES.INVALID_INPUT,
        'maxSteps must be a positive integer.',
        undefined,
        { maxSteps },
      ),
    );

    return makeResult('failed');
  }

  const startNode = flow.nodes.find(
    (node) => node.type === 'start',
  );

  if (!startNode) {
    errors.push(
      createIssue(
        ERROR_CODES.FLOW_START_NODE_MISSING,
        'Cannot start execution because the flow has no Start node.',
      ),
    );

    return makeResult('failed');
  }

  let currentNodeId =
    options.resumeAtNodeId ?? startNode.id;

  if (!graph.hasNode(currentNodeId)) {
    errors.push(
      createIssue(
        ERROR_CODES.FLOW_INVALID_INPUT,
        `Resume node "${currentNodeId}" does not exist in this flow.`,
        currentNodeId,
      ),
    );

    return makeResult('failed', currentNodeId);
  }

  while (steps < maxSteps) {
    const node = graph.getNode(currentNodeId);

    if (!node) {
      errors.push(
        createIssue(
          ERROR_CODES.FLOW_EXECUTION_FAILED,
          `Node "${currentNodeId}" disappeared during execution.`,
          currentNodeId,
        ),
      );

      return makeResult('failed', currentNodeId);
    }

    const definition = registry.get(node.type);

    if (!definition) {
      errors.push(
        createIssue(
          ERROR_CODES.FLOW_NODE_TYPE_UNREGISTERED,
          `Node type "${node.type}" is not registered.`,
          node.id,
        ),
      );

      return makeResult('failed', node.id);
    }

    steps += 1;

    let nextEdge: FlowEdge | undefined;

    switch (definition.executionKind) {
      case 'start': {
        nextEdge = graph.getOutgoingEdges(
          node.id,
          'next',
        )[0];

        break;
      }

      case 'text': {
        const config = TextNodeDataSchema.parse(node.data);

        events.push({
          type: 'send_text',
          nodeId: node.id,
          text: config.text,
        });

        nextEdge = graph.getOutgoingEdges(
          node.id,
          'next',
        )[0];

        break;
      }

      case 'image': {
        const config = ImageNodeDataSchema.parse(node.data);

        events.push({
          type: 'send_image',
          nodeId: node.id,
          url: config.url,

          ...(config.caption === undefined
            ? {}
            : { caption: config.caption }),

          ...(config.altText === undefined
            ? {}
            : { altText: config.altText }),
        });

        nextEdge = graph.getOutgoingEdges(
          node.id,
          'next',
        )[0];

        break;
      }

      case 'button': {
        const config = ButtonNodeDataSchema.parse(node.data);

        if (context.input === undefined) {
          events.push({
            type: 'show_buttons',
            nodeId: node.id,
            text: config.text,
            buttons: config.buttons.map((button) => ({
              id: button.id,
              label: button.label,
              ...(button.color === undefined
                ? {}
                : { color: button.color }),
            })),
          });

          return makeResult(
            'waiting_for_input',
            node.id,
          );
        }

        const userInput = context.input;
        delete context.input;

        if (userInput.kind !== 'button') {
          errors.push(
            createIssue(
              ERROR_CODES.FLOW_INVALID_INPUT,
              `Node "${node.id}" expects a button selection.`,
              node.id,
              { receivedKind: userInput.kind },
            ),
          );

          return makeResult('failed', node.id);
        }

        const selectedButton = config.buttons.find(
          (button) => button.id === userInput.optionId,
        );

        if (!selectedButton) {
          errors.push(
            createIssue(
              ERROR_CODES.FLOW_INVALID_INPUT,
              `Button ID "${userInput.optionId}" is not an option of node "${node.id}".`,
              node.id,
            ),
          );

          return makeResult('failed', node.id);
        }

        nextEdge = graph.getOutgoingEdges(
          node.id,
          `button:${selectedButton.id}`,
        )[0];

        if (!nextEdge) {
          errors.push(
            createIssue(
              ERROR_CODES.FLOW_INVALID_INPUT,
              `Selected button "${selectedButton.id}" has no outgoing edge.`,
              node.id,
            ),
          );

          return makeResult('failed', node.id);
        }

        break;
      }

      case 'choice': {
        const config = ChoiceNodeDataSchema.parse(node.data);

        if (context.input === undefined) {
          events.push({
            type: 'show_choices',
            nodeId: node.id,
            prompt: config.prompt,
            options: config.options.map((option) => ({
              id: option.id,
              label: option.label,
              ...(option.color === undefined
                ? {}
                : { color: option.color }),
            })),
          });

          return makeResult(
            'waiting_for_input',
            node.id,
          );
        }

        const userInput = context.input;
        delete context.input;

        if (userInput.kind !== 'choice') {
          errors.push(
            createIssue(
              ERROR_CODES.FLOW_INVALID_INPUT,
              `Node "${node.id}" expects a choice selection.`,
              node.id,
              { receivedKind: userInput.kind },
            ),
          );

          return makeResult('failed', node.id);
        }

        const selectedOption = config.options.find(
          (option) => option.id === userInput.optionId,
        );

        if (!selectedOption) {
          errors.push(
            createIssue(
              ERROR_CODES.FLOW_INVALID_INPUT,
              `Option ID "${userInput.optionId}" is not an option of node "${node.id}".`,
              node.id,
            ),
          );

          return makeResult('failed', node.id);
        }

        nextEdge = graph.getOutgoingEdges(
          node.id,
          `choice:${selectedOption.id}`,
        )[0];

        if (!nextEdge) {
          errors.push(
            createIssue(
              ERROR_CODES.FLOW_INVALID_INPUT,
              `Choice "${selectedOption.id}" has no outgoing edge.`,
              node.id,
            ),
          );

          return makeResult('failed', node.id);
        }

        break;
      }

      case 'menu': {
        const config = MenuNodeDataSchema.parse(node.data);

        if (context.input === undefined) {
          events.push({
            type: 'show_menu',
            nodeId: node.id,
            text: config.text,
            ...(config.placeholder === undefined
              ? {}
              : { placeholder: config.placeholder }),
            ...(config.persistent === undefined
              ? {}
              : { persistent: config.persistent }),
            ...(config.resizeKeyboard === undefined
              ? {}
              : { resizeKeyboard: config.resizeKeyboard }),
            ...(config.oneTimeKeyboard === undefined
              ? {}
              : { oneTimeKeyboard: config.oneTimeKeyboard }),
            items: config.items.map((item) => ({
              id: item.id,
              label: item.label,
              ...(item.color === undefined ? {} : { color: item.color }),
              ...(item.row === undefined ? {} : { row: item.row }),
              ...(item.width === undefined ? {} : { width: item.width }),
            })),
          });

          return makeResult(
            'waiting_for_input',
            node.id,
          );
        }

        const userInput = context.input;
        delete context.input;

        if (userInput.kind !== 'menu') {
          errors.push(
            createIssue(
              ERROR_CODES.FLOW_INVALID_INPUT,
              `Node "${node.id}" expects a menu item selection.`,
              node.id,
              { receivedKind: userInput.kind },
            ),
          );

          return makeResult('failed', node.id);
        }

        const selectedItem = config.items.find(
          (item) => item.id === userInput.optionId,
        );

        if (!selectedItem) {
          errors.push(
            createIssue(
              ERROR_CODES.FLOW_INVALID_INPUT,
              `Menu item ID "${userInput.optionId}" is not an item of node "${node.id}".`,
              node.id,
            ),
          );

          return makeResult('failed', node.id);
        }

        nextEdge = graph.getOutgoingEdges(
          node.id,
          `menu:${selectedItem.id}`,
        )[0];

        if (!nextEdge) {
          errors.push(
            createIssue(
              ERROR_CODES.FLOW_INVALID_INPUT,
              `Menu item "${selectedItem.id}" has no outgoing edge.`,
              node.id,
            ),
          );

          return makeResult('failed', node.id);
        }

        break;
      }

      case 'action': {
        const config = ActionNodeDataSchema.parse(node.data);
        const handler = options.actions?.get(
          config.operationId,
        );

        if (!handler && options.actions === undefined && Object.keys(config.params).length > 0) {
          const rawParams = config.params;
          const nestedConfig =
            typeof rawParams.config === 'object' &&
            rawParams.config !== null &&
            !Array.isArray(rawParams.config)
              ? (rawParams.config as JsonObject)
              : rawParams;

          const textCandidate =
            typeof nestedConfig.text === 'string'
              ? nestedConfig.text
              : typeof nestedConfig.message === 'string'
                ? nestedConfig.message
                : typeof nestedConfig.reply === 'string'
                  ? nestedConfig.reply
                  : typeof rawParams.text === 'string'
                    ? rawParams.text
                    : typeof rawParams.message === 'string'
                      ? rawParams.message
                      : typeof rawParams.reply === 'string'
                        ? rawParams.reply
                        : null;

          if (textCandidate && textCandidate.trim().length > 0) {
            events.push({
              type: 'send_text',
              nodeId: node.id,
              text: textCandidate,
            });
          }

          context.variables[config.operationId] = rawParams;
          context.variables.lastActionResult = rawParams;

          const explicitFailure =
            nestedConfig.outcome === 'failure' ||
            nestedConfig.status === 'failure' ||
            nestedConfig.success === false ||
            rawParams.outcome === 'failure' ||
            rawParams.status === 'failure' ||
            rawParams.success === false;

          if (explicitFailure) {
            events.push({
              type: 'action_failed',
              nodeId: node.id,
              operationId: config.operationId,
              message: `Action "${config.operationId}" returned a configured failure state.`,
            });
            nextEdge = graph.getOutgoingEdges(node.id, 'failure')[0];
            if (!nextEdge) {
              return makeResult('failed', node.id);
            }
          } else {
            events.push({
              type: 'action_completed',
              nodeId: node.id,
              operationId: config.operationId,
              result: rawParams,
            });
            nextEdge = graph.getOutgoingEdges(node.id, 'success')[0];
          }

          break;
        }

        if (!handler) {
          const message =
            `Action "${config.operationId}" is not registered ` +
            'in the allowed operation registry.';

          errors.push(
            createIssue(
              ERROR_CODES.FLOW_ACTION_NOT_REGISTERED,
              message,
              node.id,
              { operationId: config.operationId },
            ),
          );

          events.push({
            type: 'action_failed',
            nodeId: node.id,
            operationId: config.operationId,
            message,
          });

          nextEdge = graph.getOutgoingEdges(
            node.id,
            'failure',
          )[0];

          if (!nextEdge) {
            return makeResult('failed', node.id);
          }

          break;
        }

        try {
          const actionResult = await handler({
            node,
            params: config.params,
            context,
          });

          if (actionResult !== undefined) {
            context.variables.lastActionResult =
              actionResult;
          }

          events.push({
            type: 'action_completed',
            nodeId: node.id,
            operationId: config.operationId,

            ...(actionResult === undefined
              ? {}
              : { result: actionResult }),
          });

          nextEdge = graph.getOutgoingEdges(
            node.id,
            'success',
          )[0];
        } catch (error) {
          const message = errorMessage(error);

          errors.push(
            createIssue(
              ERROR_CODES.FLOW_EXECUTION_FAILED,
              message,
              node.id,
              { operationId: config.operationId },
            ),
          );

          events.push({
            type: 'action_failed',
            nodeId: node.id,
            operationId: config.operationId,
            message,
          });

          nextEdge = graph.getOutgoingEdges(
            node.id,
            'failure',
          )[0];

          if (!nextEdge) {
            return makeResult('failed', node.id);
          }
        }

        break;
      }
    }

    if (!nextEdge) {
      return makeResult('completed');
    }

    currentNodeId = nextEdge.targetNodeId;
  }

  errors.push(
    createIssue(
      ERROR_CODES.FLOW_STEP_LIMIT_EXCEEDED,
      `Execution stopped after reaching the max step budget of ${maxSteps}.`,
      currentNodeId,
      { maxSteps, steps },
    ),
  );

  return makeResult(
    'step_limit_exceeded',
    currentNodeId,
  );
}