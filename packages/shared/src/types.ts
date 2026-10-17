
import type {
  BUTTON_COLOR_VALUES,
  ErrorCode,
  NODE_TYPE_VALUES,
  PROJECT_FILE_FORMAT,
} from './constants.js';

/**
 * Brand types help TypeScript distinguish identifiers that are all strings
 * at runtime but represent different domain entities.
 */
export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export type ProjectId = Brand<string, 'ProjectId'>;
export type FlowId = Brand<string, 'FlowId'>;
export type NodeId = Brand<string, 'NodeId'>;
export type EdgeId = Brand<string, 'EdgeId'>;

export type NodeType = (typeof NODE_TYPE_VALUES)[number];
export type ButtonColor = (typeof BUTTON_COLOR_VALUES)[number];
export type ProjectFileFormat = typeof PROJECT_FILE_FORMAT;

/**
 * Values that can be represented faithfully in JSON.
 * This excludes undefined, functions, symbols, bigint, and non-finite numbers.
 */
export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export interface Point {
  x: number;
  y: number;
}

/**
 * Persisted flow node.
 *
 * `position` is part of the domain document because node placement must survive
 * save/load operations. Temporary editor state and viewport state do not belong
 * here. `data` contains the JSON-compatible settings specific to this node.
 */
export interface FlowNode {
  id: NodeId;
  type: NodeType;
  label: string;
  position: Point;
  data: JsonObject;
}

/** A directed connection between two nodes in the same flow. */
export interface FlowEdge {
  id: EdgeId;
  sourceNodeId: NodeId;
  targetNodeId: NodeId;
  sourceHandle?: string | null;
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

/**
 * Persist settings that describe the bot, but never persist the actual
 * Telegram token. `tokenEnvVar` is the environment variable name that generated
 * code should read at runtime.
 */
export interface BotSettings {
  displayName: string;
  username?: string;
  tokenEnvVar: string;
  parseMode: 'HTML' | 'Markdown' | 'MarkdownV2' | null;
}

export interface CodeGenerationSettings {
  language: 'typescript';
  runtime: 'node';
  nodeVersion: number;
  moduleFormat: 'esm' | 'commonjs';
  packageManager: 'npm' | 'pnpm' | 'yarn';
  strict: boolean;
  includeReadme: boolean;
  includeTests: boolean;
}

export interface ProjectMetadata {
  description: string;
  tags: string[];
  author?: string;
}

export interface ValidationIssue {
  path: Array<string | number>;
  code: string;
  message: string;
}

export interface OperationErrorInfo {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Standard result contract for operations that prefer returning errors over
 * throwing exceptions.
 */
export type OperationResult<TValue, TError = OperationErrorInfo> =
  | {
      ok: true;
      value: TValue;
    }
  | {
      ok: false;
      error: TError;
    };

export interface ProjectSemanticIssue {
  code: string;
  message: string;
  path: Array<string | number>;
}

export type NodeTypeValue = (typeof NODE_TYPE_VALUES)[number];
