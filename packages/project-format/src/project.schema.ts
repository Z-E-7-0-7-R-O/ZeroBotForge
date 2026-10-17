
import { z } from 'zod';

import {
  CURRENT_PROJECT_FORMAT_VERSION,
  NODE_TYPE_VALUES,
  PROJECT_FILE_FORMAT,
} from '@zerobotforge/shared/constants';

import type {
  NodeType,
  ProjectSemanticIssue,
} from '@zerobotforge/shared';

import {
  edgeIdSchema,
  flowIdSchema,
  isoDateTimeSchema,
  jsonValueSchema,
  nodeIdSchema,
  nonEmptyStringSchema,
  projectIdSchema,
} from '@zerobotforge/shared/validators';

import type { ProjectDocument } from './project.model.js';

const nodeTypeValues = [
  ...NODE_TYPE_VALUES,
] as [NodeType, ...NodeType[]];

export const NodeTypeSchema = z.enum(nodeTypeValues);

export const PointSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

export const FlowNodeSchema = z
  .object({
    id: nodeIdSchema,
    type: NodeTypeSchema,
    label: nonEmptyStringSchema,
    position: PointSchema,
    data: z.record(z.string(), jsonValueSchema),
  })
  .strict();

export const FlowEdgeSchema = z
  .object({
    id: edgeIdSchema,
    sourceNodeId: nodeIdSchema,
    targetNodeId: nodeIdSchema,
    sourceHandle: z.string().nullable().optional(),
    targetHandle: z.string().nullable().optional(),
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

export const BotSettingsSchema = z
  .object({
    displayName: nonEmptyStringSchema,
    username: nonEmptyStringSchema.optional(),

    tokenEnvVar: z.string().regex(
      /^[A-Z_][A-Z0-9_]*$/,
      'tokenEnvVar must be a valid environment-variable name.',
    ),

    parseMode: z
      .enum(['HTML', 'Markdown', 'MarkdownV2'])
      .nullable(),
  })
  .strict();

export const CodeGenerationSettingsSchema = z
  .object({
    language: z.literal('typescript'),
    runtime: z.literal('node'),
    nodeVersion: z.number().int().min(22),
    moduleFormat: z.enum(['esm', 'commonjs']),
    packageManager: z.enum(['npm', 'pnpm', 'yarn']),
    strict: z.boolean(),
    includeReadme: z.boolean(),
    includeTests: z.boolean(),
  })
  .strict();

export const ProjectMetadataSchema = z
  .object({
    description: z.string(),
    tags: z.array(nonEmptyStringSchema),
    author: nonEmptyStringSchema.optional(),
  })
  .strict();

/**
 * Structural schema for the current on-disk format.
 *
 * Strict objects reject unexpected keys instead of silently stripping them.
 * Structural parsing is deliberately separate from graph semantics.
 */
export const ProjectDocumentSchema = z
  .object({
    format: z.literal(PROJECT_FILE_FORMAT),
    formatVersion: z.literal(CURRENT_PROJECT_FORMAT_VERSION),

    id: projectIdSchema,
    name: nonEmptyStringSchema,

    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,

    metadata: ProjectMetadataSchema,
    bot: BotSettingsSchema,

    flows: z.array(FlowDefinitionSchema),
    activeFlowId: flowIdSchema.nullable(),

    generation: CodeGenerationSettingsSchema,
  })
  .strict();

export type ProjectDocumentInput =
  z.input<typeof ProjectDocumentSchema>;

/**
 * Performs semantic checks that do not belong to the structural schema.
 *
 * Graph reachability, start-node cardinality, handle compatibility, and cycle
 * policies must be checked by the flow engine, where the execution rules live.
 */
export function validateProjectSemantics(
  project: ProjectDocument,
): ProjectSemanticIssue[] {
  const issues: ProjectSemanticIssue[] = [];
  const flowIdIndexes = new Map<string, number>();

  project.flows.forEach((flow, flowIndex) => {
    const firstIndex = flowIdIndexes.get(flow.id);

    if (firstIndex !== undefined) {
      issues.push({
        code: 'DUPLICATE_FLOW_ID',
        message:
          `Flow ID "${flow.id}" is duplicated ` +
          `(first seen at index ${firstIndex}).`,
        path: ['flows', flowIndex, 'id'],
      });
    } else {
      flowIdIndexes.set(flow.id, flowIndex);
    }
  });

  if (
    project.activeFlowId !== null &&
    !flowIdIndexes.has(project.activeFlowId)
  ) {
    issues.push({
      code: 'ACTIVE_FLOW_NOT_FOUND',
      message:
        `Active flow "${project.activeFlowId}" does not exist ` +
        'in this project.',
      path: ['activeFlowId'],
    });
  }

  project.flows.forEach((flow, flowIndex) => {
    const nodeIdIndexes = new Map<string, number>();
    const edgeIdIndexes = new Map<string, number>();

    flow.nodes.forEach((node, nodeIndex) => {
      const firstIndex = nodeIdIndexes.get(node.id);

      if (firstIndex !== undefined) {
        issues.push({
          code: 'DUPLICATE_NODE_ID',
          message:
            `Node ID "${node.id}" is duplicated in flow "${flow.id}" ` +
            `(first seen at index ${firstIndex}).`,
          path: ['flows', flowIndex, 'nodes', nodeIndex, 'id'],
        });
      } else {
        nodeIdIndexes.set(node.id, nodeIndex);
      }
    });

    flow.edges.forEach((edge, edgeIndex) => {
      const firstIndex = edgeIdIndexes.get(edge.id);

      if (firstIndex !== undefined) {
        issues.push({
          code: 'DUPLICATE_EDGE_ID',
          message:
            `Edge ID "${edge.id}" is duplicated in flow "${flow.id}" ` +
            `(first seen at index ${firstIndex}).`,
          path: ['flows', flowIndex, 'edges', edgeIndex, 'id'],
        });
      } else {
        edgeIdIndexes.set(edge.id, edgeIndex);
      }

      if (!nodeIdIndexes.has(edge.sourceNodeId)) {
        issues.push({
          code: 'EDGE_SOURCE_NODE_NOT_FOUND',
          message:
            `Edge "${edge.id}" references missing source node ` +
            `"${edge.sourceNodeId}".`,
          path: [
            'flows',
            flowIndex,
            'edges',
            edgeIndex,
            'sourceNodeId',
          ],
        });
      }

      if (!nodeIdIndexes.has(edge.targetNodeId)) {
        issues.push({
          code: 'EDGE_TARGET_NODE_NOT_FOUND',
          message:
            `Edge "${edge.id}" references missing target node ` +
            `"${edge.targetNodeId}".`,
          path: [
            'flows',
            flowIndex,
            'edges',
            edgeIndex,
            'targetNodeId',
          ],
        });
      }
    });
  });

  return issues;
}
