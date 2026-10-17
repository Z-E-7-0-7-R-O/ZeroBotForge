import { z } from 'zod';

import {
  identifierSchema,
  nonEmptyStringSchema,
} from '@zerobotforge/shared/validators';

import type {
  FlowPort,
  NodeDefinition,
} from '../flow.model';

export const ButtonColorSchema = z.enum([
  'default',
  'green',
  'blue',
  'red',
]);

export const ButtonNodeDataSchema = z
  .object({
    text: nonEmptyStringSchema,

    buttons: z
      .array(
        z
          .object({
            id: identifierSchema,
            label: nonEmptyStringSchema,
            color: ButtonColorSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .superRefine((data, context) => {
    const seen = new Set<string>();

    data.buttons.forEach((button, index) => {
      if (seen.has(button.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['buttons', index, 'id'],
          message: `Duplicate button ID "${button.id}".`,
        });
      }

      seen.add(button.id);
    });
  });

const inputPorts: readonly FlowPort[] = [
  {
    id: 'in',
    label: 'Input',
    direction: 'input',
  },
];

export const buttonNodeDefinition: NodeDefinition = {
  type: 'button',
  title: 'Buttons',
  description: 'Presents buttons and routes a selected button.',
  executionKind: 'button',

  configSchema: ButtonNodeDataSchema,

  getInputPorts: () => inputPorts,

  getOutputPorts: (data) => {
    const result = ButtonNodeDataSchema.safeParse(data);

    if (!result.success) {
      return [];
    }

    return result.data.buttons.map((button) => ({
      id: `button:${button.id}`,
      label: button.label,
      direction: 'output' as const,
      requiredConnection: true,
    }));
  },
};