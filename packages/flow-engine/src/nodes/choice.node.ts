import { z } from 'zod';

import {
  identifierSchema,
  nonEmptyStringSchema,
} from '@zerobotforge/shared/validators';

import type {
  FlowPort,
  NodeDefinition,
} from '../flow.model';

export const ChoiceColorSchema = z.enum([
  'default',
  'green',
  'blue',
  'red',
]);

export const ChoiceNodeDataSchema = z
  .object({
    prompt: nonEmptyStringSchema,

    options: z
      .array(
        z
          .object({
            id: identifierSchema,
            label: nonEmptyStringSchema,
            color: ChoiceColorSchema.optional(),
          })
          .strict(),
      )
      .min(2)
      .max(20),
  })
  .strict()
  .superRefine((data, context) => {
    const seen = new Set<string>();

    data.options.forEach((option, index) => {
      if (seen.has(option.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options', index, 'id'],
          message: `Duplicate option ID "${option.id}".`,
        });
      }

      seen.add(option.id);
    });
  });

const inputPorts: readonly FlowPort[] = [
  {
    id: 'in',
    label: 'Input',
    direction: 'input',
  },
];

export const choiceNodeDefinition: NodeDefinition = {
  type: 'choice',
  title: 'Choice',
  description: 'Prompts the user to select an option.',
  executionKind: 'choice',

  configSchema: ChoiceNodeDataSchema,

  getInputPorts: () => inputPorts,

  getOutputPorts: (data) => {
    const result = ChoiceNodeDataSchema.safeParse(data);

    if (!result.success) {
      return [];
    }

    return result.data.options.map((option) => ({
      id: `choice:${option.id}`,
      label: option.label,
      direction: 'output' as const,
      requiredConnection: true,
    }));
  },
};