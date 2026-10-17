import {
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  PointerEvent as ReactPointerEvent,
} from "react";

import {
  X,
} from "lucide-react";

import type {
  FlowDefinition,
  FlowNode as EngineFlowNode,
  FlowPort,
} from "@zerobotforge/flow-engine";

import StartNode from "../nodes/StartNode";
import TextNode from "../nodes/TextNode";
import ImageNode from "../nodes/ImageNode";
import ButtonNode from "../nodes/ButtonNode";
import ChoiceNode from "../nodes/ChoiceNode";
import ActionNode from "../nodes/ActionNode";

import FlowNodeCard from "./FlowNode";
import ConnectionLayer from "./ConnectionLayer";
import {
  createEditorId,
  FLOW_NODE_WIDTH,
  getNodeHeight,
} from "./flow-editor.model";

interface DragState {
  nodeId: string;
  offsetX: number;
  offsetY: number;
  pointerId: number;
  x: number;
  y: number;
}

interface PendingConnection {
  nodeId: string;
  port: FlowPort;
}

export interface FlowCanvasProps {
  flow: FlowDefinition;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  invalidNodeIds: ReadonlySet<string>;
  onChange: (flow: FlowDefinition) => void;
  onSelectNode: (nodeId: string | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onConnectionMessage: (message: string, isError?: boolean) => void;
}

export default function FlowCanvas({
  flow,
  selectedNodeId,
  selectedEdgeId,
  invalidNodeIds,
  onChange,
  onSelectNode,
  onSelectEdge,
  onConnectionMessage,
}: FlowCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragPosition, setDragPosition] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [pendingConnection, setPendingConnection] =
    useState<PendingConnection | null>(null);

  const displayFlow = useMemo<FlowDefinition>(() => {
    if (!dragPosition) return flow;

    return {
      ...flow,
      nodes: flow.nodes.map((node) =>
        node.id === dragPosition.nodeId
          ? {
              ...node,
              position: {
                x: dragPosition.x,
                y: dragPosition.y,
              },
            }
          : node,
      ),
    };
  }, [flow, dragPosition]);

  const width = Math.max(
    1200,
    ...displayFlow.nodes.map((node) => node.position.x + FLOW_NODE_WIDTH + 220),
  );
  const height = Math.max(
    820,
    ...displayFlow.nodes.map((node) => node.position.y + getNodeHeight(node) + 180),
  );

  const beginDrag = (
    nodeId: string,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;
    const stage = stageRef.current;
    if (!stage) return;

    const node = displayFlow.nodes.find((entry) => entry.id === nodeId);
    if (!node) return;

    const bounds = stage.getBoundingClientRect();
    dragRef.current = {
      nodeId,
      offsetX: event.clientX - bounds.left - node.position.x,
      offsetY: event.clientY - bounds.top - node.position.y,
      pointerId: event.pointerId,
      x: node.position.x,
      y: node.position.y,
    };
    onSelectNode(nodeId);
    onSelectEdge(null);
    event.preventDefault();

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort; stage handlers still cover normal dragging.
    }
  };

  const handleStagePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || drag.pointerId !== event.pointerId) return;

    const bounds = stage.getBoundingClientRect();
    drag.x = Math.max(12, Math.round(event.clientX - bounds.left - drag.offsetX));
    drag.y = Math.max(12, Math.round(event.clientY - bounds.top - drag.offsetY));
    setDragPosition({ nodeId: drag.nodeId, x: drag.x, y: drag.y });
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.x !== flow.nodes.find((node) => node.id === drag.nodeId)?.position.x ||
        drag.y !== flow.nodes.find((node) => node.id === drag.nodeId)?.position.y) {
      onChange({
        ...flow,
        nodes: flow.nodes.map((node) =>
          node.id === drag.nodeId
            ? {
                ...node,
                position: { x: drag.x, y: drag.y },
              }
            : node,
        ),
      });
    }

    dragRef.current = null;
    setDragPosition(null);
  };

  const selectOutput = (nodeId: string, port: FlowPort) => {
    onSelectNode(nodeId);
    onSelectEdge(null);
    setPendingConnection((current) => {
      if (current?.nodeId === nodeId && current.port.id === port.id) {
        return null;
      }
      return { nodeId, port };
    });
  };

  const selectInput = (nodeId: string, port: FlowPort) => {
    if (!pendingConnection) {
      onConnectionMessage("Select an output port first, then choose a target input.", true);
      return;
    }

    if (pendingConnection.nodeId === nodeId) {
      onConnectionMessage("A node cannot be connected to itself in this editor.", true);
      return;
    }

    const targetNode = flow.nodes.find((node) => node.id === nodeId);
    if (targetNode?.type === "start") {
      onConnectionMessage("The Start node cannot be the target of a connection.", true);
      return;
    }

    const alreadyConnected = flow.edges.some(
      (edge) =>
        edge.sourceNodeId === pendingConnection.nodeId &&
        edge.sourceHandle === pendingConnection.port.id,
    );

    if (alreadyConnected) {
      onConnectionMessage(
        `Output "${pendingConnection.port.label}" already has a connection. Remove it before routing that output again.`,
        true,
      );
      return;
    }

    const sourceNode = flow.nodes.find((node) => node.id === pendingConnection.nodeId);
    if (!sourceNode || !targetNode) {
      onConnectionMessage("The selected source or target node no longer exists.", true);
      setPendingConnection(null);
      return;
    }

    const nextEdgeId = createEditorId() as FlowDefinition["edges"][number]["id"];
    const nextEdge: FlowDefinition["edges"][number] = {
      id: nextEdgeId,
      sourceNodeId: sourceNode.id,
      sourceHandle: pendingConnection.port.id,
      targetNodeId: targetNode.id,
      targetHandle: port.id,
    };

    onChange({ ...flow, edges: [...flow.edges, nextEdge] });
    onSelectNode(null);
    onSelectEdge(nextEdgeId);
    setPendingConnection(null);
    onConnectionMessage(`Connected ${sourceNode.label} → ${targetNode.label}.`);
  };

  const renderNode = (node: EngineFlowNode) => {
    const common = {
      node,
      selected: node.id === selectedNodeId,
      invalid: invalidNodeIds.has(node.id),
      pendingOutput: pendingConnection
        ? `${pendingConnection.nodeId}:${pendingConnection.port.id}`
        : null,
      style: {
        position: "absolute" as const,
        left: node.position.x,
        top: node.position.y,
        width: FLOW_NODE_WIDTH,
        height: getNodeHeight(node),
      },
      onSelect: (nodeId: string) => {
        onSelectNode(nodeId);
        onSelectEdge(null);
      },
      onHeaderPointerDown: beginDrag,
      onInputPortClick: selectInput,
      onOutputPortClick: selectOutput,
    };

    switch (node.type) {
      case "start": return <StartNode key={node.id} {...common} />;
      case "text": return <TextNode key={node.id} {...common} />;
      case "image": return <ImageNode key={node.id} {...common} />;
      case "button": return <ButtonNode key={node.id} {...common} />;
      case "choice": return <ChoiceNode key={node.id} {...common} />;
      case "action": return <ActionNode key={node.id} {...common} />;
      default: return <FlowNodeCard key={node.id} {...common} />;
    }
  };

  return (
    <section className="flow-editor-canvas-panel" aria-label="Visual flow editor">
      <div className="flow-editor-canvas-toolbar">
        <div className="flow-editor-canvas-heading">
          <span className="flow-editor-live-dot" />
          <strong>Flow canvas</strong>
          <span>{displayFlow.nodes.length} nodes</span>
          <span>{displayFlow.edges.length} connections</span>
        </div>
        <div className="flow-canvas-instruction">
          Drag node headers to move. Select an output, then an input to connect.
        </div>
      </div>

      {pendingConnection && (
        <div className="flow-connection-pending" role="status">
          <span>
            Connecting from <strong>{flow.nodes.find((node) => node.id === pendingConnection.nodeId)?.label ?? "node"}</strong>
            {" · "}{pendingConnection.port.label}. Select a target input.
          </span>
          <button type="button" onClick={() => setPendingConnection(null)} aria-label="Cancel connection">
            <X size={15} /> Cancel
          </button>
        </div>
      )}

      <div className="flow-editor-viewport">
        <div
          className="flow-editor-stage"
          ref={stageRef}
          style={{ width, height }}
          onPointerMove={handleStagePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onSelectNode(null);
              onSelectEdge(null);
            }
          }}
        >
          <ConnectionLayer
            flow={displayFlow}
            width={width}
            height={height}
            selectedEdgeId={selectedEdgeId}
            onSelectEdge={(edgeId) => {
              onSelectNode(null);
              onSelectEdge(edgeId);
            }}
          />
          {displayFlow.nodes.map(renderNode)}
          {displayFlow.nodes.length === 0 && (
            <div className="flow-editor-canvas-empty">
              Add a node from the palette to start building this flow.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
