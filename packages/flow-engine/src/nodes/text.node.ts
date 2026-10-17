import { z } from 'zod';

import { nonEmptyStringSchema } from '@zerobotforge/shared/validators';

import type {
  FlowPort,
  NodeDefinition,
} from '../flow.model';

export const TextNodeDataSchema = z
  .object({
    text: nonEmptyStringSchema,
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
    id: 'next',
    label: 'Next',
    direction: 'output',
  },
];

export const textNodeDefinition: NodeDefinition = {
  type: 'text',
  title: 'Text message',
  description: 'Emits a text-message event.',
  executionKind: 'text',

  configSchema: TextNodeDataSchema,

  getInputPorts: () => inputPorts,
  getOutputPorts: () => outputPorts,
};