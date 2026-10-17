
import type {
  EdgeId,
  NodeId,
} from '@zerobotforge/shared';

import type {
  FlowDefinition,
  FlowEdge,
  FlowNode,
} from './flow.model';

export class FlowGraph {
  private readonly nodesById = new Map<NodeId, FlowNode>();

  private readonly edgesById = new Map<EdgeId, FlowEdge>();

  private readonly outgoingByNodeId = new Map<
    NodeId,
    FlowEdge[]
  >();

  private readonly incomingByNodeId = new Map<
    NodeId,
    FlowEdge[]
  >();

  public constructor(flow: FlowDefinition) {
    for (const node of flow.nodes) {
      this.nodesById.set(node.id, node);
      this.outgoingByNodeId.set(node.id, []);
      this.incomingByNodeId.set(node.id, []);
    }

    for (const edge of flow.edges) {
      this.edgesById.set(edge.id, edge);

      const outgoing = this.outgoingByNodeId.get(
        edge.sourceNodeId,
      );

      const incoming = this.incomingByNodeId.get(
        edge.targetNodeId,
      );

      if (outgoing) {
        outgoing.push(edge);
      }

      if (incoming) {
        incoming.push(edge);
      }
    }
  }

  public getNode(nodeId: NodeId): FlowNode | undefined {
    return this.nodesById.get(nodeId);
  }

  public hasNode(nodeId: NodeId): boolean {
    return this.nodesById.has(nodeId);
  }

  public getNodeIds(): NodeId[] {
    return [...this.nodesById.keys()];
  }

  public getNodes(): FlowNode[] {
    return [...this.nodesById.values()];
  }

  public getOutgoingEdges(
    nodeId: NodeId,
    sourcePortId?: string,
  ): FlowEdge[] {
    const edges =
      this.outgoingByNodeId.get(nodeId) ?? [];

    if (sourcePortId === undefined) {
      return [...edges];
    }

    return edges.filter(
      (edge) => edge.sourceHandle === sourcePortId,
    );
  }

  public getIncomingEdges(nodeId: NodeId): FlowEdge[] {
    return [
      ...(this.incomingByNodeId.get(nodeId) ?? []),
    ];
  }

  public getSuccessors(nodeId: NodeId): NodeId[] {
    return this.getOutgoingEdges(nodeId).map(
      (edge) => edge.targetNodeId,
    );
  }

  public getPredecessors(nodeId: NodeId): NodeId[] {
    return this.getIncomingEdges(nodeId).map(
      (edge) => edge.sourceNodeId,
    );
  }

  /** Finds an edge by ID using the edge index. */
  public findEdge(edgeId: EdgeId): FlowEdge | undefined {
    return this.edgesById.get(edgeId);
  }

  /**
   * Performs breadth-first reachability analysis.
   * This method traverses the graph without executing any nodes.
   *
   * The queue index avoids repeatedly shifting array elements.
   */
  public getReachableNodeIds(
    startNodeId: NodeId,
  ): NodeId[] {
    if (!this.nodesById.has(startNodeId)) {
      return [];
    }

    const visited = new Set<NodeId>();
    const queue: NodeId[] = [startNodeId];
    const result: NodeId[] = [];

    let queueIndex = 0;

    while (queueIndex < queue.length) {
      const current = queue[queueIndex++];

      if (
        current === undefined ||
        visited.has(current)
      ) {
        continue;
      }

      visited.add(current);
      result.push(current);

      for (const next of this.getSuccessors(current)) {
        if (!visited.has(next)) {
          queue.push(next);
        }
      }
    }

    return result;
  }
}
