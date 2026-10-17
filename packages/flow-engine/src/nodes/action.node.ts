import { z } from 'zod';

import {
  identifierSchema,
} from '@zerobotforge/shared/validators';

import {
  jsonValueSchema,
} from '@zerobotforge/shared/validators';

import type {
  FlowPort,
  NodeDefinition,
} from '../flow.model';

export const ActionNodeDataSchema = z
  .object({
    operationId: identifierSchema,

    params: z
      .record(z.string(), jsonValueSchema)
      .default({}),
  })
  .strict();

const inputPorts: readonly FlowPort[] = [
  {
    id: 'in',
    label: 'Input',
    direction: 'input',
  },
];

const outputPorts: readonly FlowPort[] = [
  {
    id: 'success',
    label: 'Success',
    direction: 'output',
  },
  {
    id: 'failure',
    label: 'Failure',
    direction: 'output',
  },
];

export const actionNodeDefinition: NodeDefinition = {
  type: 'action',
  title: 'Action',
  description: 'Runs a registered, explicitly allowed operation.',
  executionKind: 'action',

  configSchema: ActionNodeDataSchema,

  getInputPorts: () => inputPorts,
  getOutputPorts: () => outputPorts,
};