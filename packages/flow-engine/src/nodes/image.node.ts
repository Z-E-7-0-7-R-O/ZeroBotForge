import { z } from 'zod';

import { nonEmptyStringSchema } from '@zerobotforge/shared/validators';

import type {
  FlowPort,
  NodeDefinition,
} from '../flow.model';

const optionalTrimmedTextSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim().length === 0) {
      return undefined;
    }
    return value;
  },
  nonEmptyStringSchema.optional(),
);

export const ImageNodeDataSchema = z
  .object({
    url: z
      .string()
      .trim()
      .url()
      .refine((value) => {
        try {
          const parsed = new URL(value);

          return (
            parsed.protocol === 'http:' ||
            parsed.protocol === 'https:'
          );
        } catch {
          return false;
        }
      }, 'Image URL must use HTTP or HTTPS.'),

    caption: optionalTrimmedTextSchema,
    altText: optionalTrimmedTextSchema,
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

export const imageNodeDefinition: NodeDefinition = {
  type: 'image',
  title: 'Image',
  description: 'Emits an image-message event.',
  executionKind: 'image',

  configSchema: ImageNodeDataSchema,

  getInputPorts: () => inputPorts,
  getOutputPorts: () => outputPorts,
};