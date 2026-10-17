import type { NodeType } from '@zerobotforge/shared';

import type {
  FlowNode,
  FlowPort,
  NodeDefinition,
  SupportedFlowNodeType,
} from './flow.model';

import { startNodeDefinition } from './nodes/start.node';
import { textNodeDefinition } from './nodes/text.node';
import { imageNodeDefinition } from './nodes/image.node';
import { buttonNodeDefinition } from './nodes/button.node';
import { choiceNodeDefinition } from './nodes/choice.node';
import { menuNodeDefinition } from './nodes/menu.node';
import { actionNodeDefinition } from './nodes/action.node';

export class NodeRegistry {
  private readonly definitions = new Map<
    SupportedFlowNodeType,
    NodeDefinition
  >();

  public constructor(
    definitions: readonly NodeDefinition[] = [],
  ) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  public register(definition: NodeDefinition): this {
    if (this.definitions.has(definition.type)) {
      throw new Error(
        `Node type "${definition.type}" is already registered.`,
      );
    }

    this.definitions.set(definition.type, definition);

    return this;
  }

  public get(type: string): NodeDefinition | undefined {
    return this.definitions.get(
      type as SupportedFlowNodeType,
    );
  }

  public has(type: string): boolean {
    return this.definitions.has(
      type as SupportedFlowNodeType,
    );
  }

  public list(): readonly NodeDefinition[] {
    return [...this.definitions.values()];
  }

  public getInputPorts(node: FlowNode): readonly FlowPort[] {
    const definition = this.get(node.type);

    if (!definition) {
      return [];
    }

    return definition.getInputPorts(node.data);
  }

  public getOutputPorts(node: FlowNode): readonly FlowPort[] {
    const definition = this.get(node.type);

    if (!definition) {
      return [];
    }

    return definition.getOutputPorts(node.data);
  }

  public getExecutionKind(
    type: NodeType,
  ): NodeDefinition['executionKind'] | undefined {
    return this.get(type)?.executionKind;
  }
}

export const DEFAULT_NODE_REGISTRY = new NodeRegistry([
  startNodeDefinition,
  textNodeDefinition,
  imageNodeDefinition,
  buttonNodeDefinition,
  choiceNodeDefinition,
  menuNodeDefinition,
  actionNodeDefinition,
]);