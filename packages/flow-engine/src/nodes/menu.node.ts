import { z } from 'zod';

import {
  identifierSchema,
  nonEmptyStringSchema,
} from '@zerobotforge/shared/validators';

import type {
  FlowPort,
  NodeDefinition,
} from '../flow.model';

export const MenuButtonColorSchema = z.enum([
  'default',
  'green',
  'blue',
  'red',
]);

export const MenuButtonWidthSchema = z.enum([
  'auto',
  'full',
  'half',
  'third',
  'quarter',
]);

export const MenuItemSchema = z
  .object({
    id: identifierSchema,
    label: nonEmptyStringSchema,
    color: MenuButtonColorSchema.optional(),
    row: z.number().int().min(1).max(12).optional(),
    width: MenuButtonWidthSchema.optional(),
  })
  .strict();

export const MenuNodeDataSchema = z
  .object({
    text: nonEmptyStringSchema,
    placeholder: z.preprocess(
      (value) =>
        typeof value === 'string' && value.trim().length === 0
          ? undefined
          : value,
      z.string().trim().max(64).optional(),
    ),
    persistent: z.boolean().optional(),
    resizeKeyboard: z.boolean().optional(),
    oneTimeKeyboard: z.boolean().optional(),
    items: z.array(MenuItemSchema).min(1).max(24),
  })
  .strict()
  .superRefine((data, context) => {
    const seenIds = new Set<string>();

    data.items.forEach((item, index) => {
      if (seenIds.has(item.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'id'],
          message: `Duplicate menu button ID "${item.id}".`,
        });
      }

      seenIds.add(item.id);
    });
  });

const inputPorts: readonly FlowPort[] = [
  {
    id: 'in',
    label: 'Input',
    direction: 'input',
  },
];

export const menuNodeDefinition: NodeDefinition = {
  type: 'menu',
  title: 'Menu',
  description:
    'Configures the main persistent Telegram bot menu with customizable button rows, widths, and colors.',
  executionKind: 'menu',

  configSchema: MenuNodeDataSchema,

  getInputPorts: () => inputPorts,

  getOutputPorts: (data) => {
    const result = MenuNodeDataSchema.safeParse(data);

    if (!result.success) {
      return [];
    }

    return result.data.items.map((item) => ({
      id: `menu:${item.id}`,
      label: item.label,
      direction: 'output' as const,
      requiredConnection: true,
    }));
  },
};