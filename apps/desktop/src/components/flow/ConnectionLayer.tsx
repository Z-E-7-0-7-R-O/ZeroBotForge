import type { KeyboardEvent } from "react";

import {
  DEFAULT_NODE_REGISTRY,
} from "@zerobotforge/flow-engine/registry";

import type { FlowDefinition } from "@zerobotforge/flow-engine";

import {
  FLOW_NODE_WIDTH,
  FLOW_PORT_ANCHOR_OFFSET,
  FLOW_PORT_ROW_HEIGHT,
  getNodeHeight,
} from "./flow-editor.model";

export interface ConnectionLayerProps {
  flow: FlowDefinition;
  width: number;
  height: number;
  selectedEdgeId: string | null;
  onSelectEdge: (edgeId: string) => void;
}

function portIndexForEdge(
  flow: FlowDefinition,
  nodeId: string,
  handleId: string | null | undefined,
  direction: "input" | "output",
): number {
  const node = flow.nodes.find((entry) => entry.id === nodeId);
  if (!node) return 0;

  const definition = DEFAULT_NODE_REGISTRY.get(node.type);
  if (!definition) return 0;

  const ports = direction === "output"
    ? definition.getOutputPorts(node.data)
    : definition.getInputPorts(node.data);
  const index = ports.findIndex((port) => port.id === handleId);

  return index < 0 ? 0 : index;
}

function handleEdgeKeyDown(
  event: KeyboardEvent<SVGPathElement>,
  edgeId: string,
  onSelectEdge: (edgeId: string) => void,
): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelectEdge(edgeId);
  }
}

export default function ConnectionLayer({
  flow,
  width,
  height,
  selectedEdgeId,
  onSelectEdge,
}: ConnectionLayerProps) {
  const nodesById = new Map(flow.nodes.map((node) => [node.id, node]));

  return (
    <svg
      className="flow-editor-connections"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label="Flow connections"
    >
      <defs>
        <marker
          id="zbf-flow-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L6,3 z" className="flow-edge-arrow" />
        </marker>
      </defs>

      {flow.edges.map((edge) => {
        const source = nodesById.get(edge.sourceNodeId);
        const target = nodesById.get(edge.targetNodeId);
        if (!source || !target) return null;

        const sourceIndex = portIndexForEdge(
          flow,
          source.id,
          edge.sourceHandle,
          "output",
        );
        const targetIndex = portIndexForEdge(
          flow,
          target.id,
          edge.targetHandle,
          "input",
        );

        const x1 = source.position.x + FLOW_NODE_WIDTH;
        const y1 = source.position.y + FLOW_PORT_ANCHOR_OFFSET + sourceIndex * FLOW_PORT_ROW_HEIGHT;
        const x2 = target.position.x;
        const y2 = target.position.y + FLOW_PORT_ANCHOR_OFFSET + targetIndex * FLOW_PORT_ROW_HEIGHT;
        const curve = Math.max(52, Math.abs(x2 - x1) * 0.42);
        const path = `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
        const selected = edge.id === selectedEdgeId;

        return (
          <g key={edge.id}>
            <path
              d={path}
              className={`flow-edge ${selected ? "is-selected" : ""}`}
              markerEnd="url(#zbf-flow-arrow)"
              role="button"
              tabIndex={0}
              aria-label={`Connection from ${source.label} to ${target.label}${edge.label ? `: ${edge.label}` : ""}`}
              onClick={() => onSelectEdge(edge.id)}
              onKeyDown={(event) => handleEdgeKeyDown(event, edge.id, onSelectEdge)}
            />
            {edge.label && (
              <text
                x={(x1 + x2) / 2}
                y={(y1 + y2) / 2 - 8}
                className="flow-edge-label"
                textAnchor="middle"
              >
                {edge.label}
              </text>
            )}
          </g>
        );
      })}

      {flow.nodes.some((node) => getNodeHeight(node) > 250) && (
        <title>Some nodes have many dynamic ports; scroll to inspect their full height.</title>
      )}
    </svg>
  );
}
