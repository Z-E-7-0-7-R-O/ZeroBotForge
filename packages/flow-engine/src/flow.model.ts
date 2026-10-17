
import { z } from 'zod';

import { NODE_TYPE_VALUES } from '@zerobotforge/shared/constants';

import {
  edgeIdSchema,
  flowIdSchema,
  jsonValueSchema,
  nodeIdSchema,
  nonEmptyStringSchema,
} from '@zerobotforge/shared/validators';

import type {
  EdgeId,
  FlowId,
  JsonObject,
  JsonValue,
  NodeId,
  NodeType,
} from '@zerobotforge/shared';

export type SupportedFlowNodeType = Extract<
  NodeType,
  'start' | 'text' | 'image' | 'button' | 'choice' | 'menu' | 'action'
>;

export type FlowButtonColor =
  | 'default'
  | 'green'
  | 'blue'
  | 'red';

export type FlowMenuButtonWidth =
  | 'auto'
  | 'full'
  | 'half'
  | 'third'
  | 'quarter';

export interface FlowPoint {
  x: number;
  y: number;
}

export interface FlowPort {
  id: string;
  label: string;
  direction: 'input' | 'output';

  /**
   * When true, the validator requires one connection
   * from this output port.
   */
  requiredConnection?: boolean;
}

export type NodeExecutionKind =
  | 'start'
  | 'text'
  | 'image'
  | 'button'
  | 'choice'
  | 'menu'
  | 'action';

/**
 * Position is display metadata only.
 * It must never determine logical execution order.
 */
export interface FlowNode {
  id: NodeId;
  type: NodeType;
  label: string;
  position: FlowPoint;
  data: JsonObject;
}

/**
 * sourceHandle identifies the source output port.
 * targetHandle optionally identifies the destination input port.
 */
export interface FlowEdge {
  id: EdgeId;
  sourceNodeId: NodeId;
  sourceHandle: string;
  targetNodeId: NodeId;
  targetHandle?: string | null;
  label?: string;
}

export interface FlowDefinition {
  id: FlowId;
  name: string;
  description?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** Contract registered for each supported node type. */
export interface NodeDefinition {
  type: SupportedFlowNodeType;
  title: string;
  description: string;
  executionKind: NodeExecutionKind;

  configSchema: z.ZodTypeAny;

  getInputPorts(data: unknown): readonly FlowPort[];
  getOutputPorts(data: unknown): readonly FlowPort[];
}

export interface FlowUserInput {
  kind: 'button' | 'choice' | 'menu';
  optionId: string;
}

/** Explicit runtime state; independent of React, Electron, and Telegram. */
export interface FlowRuntimeContext {
  variables: Record<string, JsonValue>;
  userId?: string;
  conversationId?: string;
  input?: FlowUserInput;
}

export type FlowExecutionEvent =
  | {
      type: 'send_text';
      nodeId: NodeId;
      text: string;
    }
  | {
      type: 'send_image';
      nodeId: NodeId;
      url: string;
      caption?: string;
      altText?: string;
    }
  | {
      type: 'show_buttons';
      nodeId: NodeId;
      text: string;
      buttons: Array<{
        id: string;
        label: string;
        color?: FlowButtonColor;
      }>;
    }
  | {
      type: 'show_choices';
      nodeId: NodeId;
      prompt: string;
      options: Array<{
        id: string;
        label: string;
        color?: FlowButtonColor;
      }>;
    }
  | {
      type: 'show_menu';
      nodeId: NodeId;
      text: string;
      placeholder?: string;
      persistent?: boolean;
      resizeKeyboard?: boolean;
      oneTimeKeyboard?: boolean;
      items: Array<{
        id: string;
        label: string;
        color?: FlowButtonColor;
        row?: number;
        width?: FlowMenuButtonWidth;
      }>;
    }
  | {
      type: 'action_completed';
      nodeId: NodeId;
      operationId: string;
      result?: JsonValue;
    }
  | {
      type: 'action_failed';
      nodeId: NodeId;
      operationId: string;
      message: string;
    };

export interface FlowExecutionIssue {
  code: string;
  message: string;
  nodeId?: NodeId;
  path?: Array<string | number>;
  details?: unknown;
}

export type FlowExecutionStatus =
  | 'completed'
  | 'waiting_for_input'
  | 'failed'
  | 'step_limit_exceeded';

export interface FlowExecutionResult {
  status: FlowExecutionStatus;
  flowId?: FlowId;
  currentNodeId?: NodeId;
  steps: number;
  events: FlowExecutionEvent[];
  errors: FlowExecutionIssue[];
  context: FlowRuntimeContext;
}

export const FlowPointSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

export const FlowNodeSchema = z
  .object({
    id: nodeIdSchema,
    type: z.enum(NODE_TYPE_VALUES),
    label: nonEmptyStringSchema,
    position: FlowPointSchema,
    data: z.record(z.string(), jsonValueSchema),
  })
  .strict();

export const FlowEdgeSchema = z
  .object({
    id: edgeIdSchema,
    sourceNodeId: nodeIdSchema,
    sourceHandle: nonEmptyStringSchema,
    targetNodeId: nodeIdSchema,
    targetHandle: nonEmptyStringSchema.nullable().optional(),
    label: nonEmptyStringSchema.optional(),
  })
  .strict();

export const FlowDefinitionSchema = z
  .object({
    id: flowIdSchema,
    name: nonEmptyStringSchema,
    description: z.string().optional(),
    nodes: z.array(FlowNodeSchema),
    edges: z.array(FlowEdgeSchema),
  })
  .strict();
