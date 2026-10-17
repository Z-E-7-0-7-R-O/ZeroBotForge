import { z } from 'zod';

import type {
  FlowPort,
  NodeDefinition,
} from '../flow.model';

export const StartNodeDataSchema = z.object({}).strict();

const startInputPorts: readonly FlowPort[] = [];

const startOutputPorts: readonly FlowPort[] = [
  {
    id: 'next',
    label: 'Next',
    direction: 'output',
  },
];

export const startNodeDefinition: NodeDefinition = {
  type: 'start',
  title: 'Start',
  description: 'Entry point of a conversation flow.',
  executionKind: 'start',

  configSchema: StartNodeDataSchema,

  getInputPorts: () => startInputPorts,
  getOutputPorts: () => startOutputPorts,
};