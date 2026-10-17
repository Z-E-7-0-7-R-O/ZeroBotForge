import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
} from "react";

import {
  AlertTriangle,
  GitBranch,
  Image as ImageIcon,
  LayoutGrid,
  MousePointerClick,
  Play,
  Plug,
  Zap,
  MessageSquare,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

import {
  DEFAULT_NODE_REGISTRY,
} from "@zerobotforge/flow-engine/registry";

import type {
  FlowNode as EngineFlowNode,
  FlowPort,
} from "@zerobotforge/flow-engine";

const NODE_ICONS: Record<string, LucideIcon> = {
  start: Play,
  text: MessageSquare,
  image: ImageIcon,
  button: MousePointerClick,
  choice: GitBranch,
  menu: LayoutGrid,
  action: Zap,
  condition: GitBranch,
  input: Plug,
  end: AlertTriangle,
};

function resolvePortButtonColor(
  node: EngineFlowNode,
  portId: string,
): "default" | "green" | "blue" | "red" | null {
  const listKey =
    node.type === "button"
      ? "buttons"
      : node.type === "choice"
        ? "options"
        : node.type === "menu"
          ? "items"
          : null;
  if (!listKey) return null;

  const list = node.data[listKey];
  if (!Array.isArray(list)) return null;

  const rawOptionId = portId.includes(":")
    ? portId.slice(portId.indexOf(":") + 1)
    : portId;

  for (const item of list) {
    if (
      typeof item === "object" &&
      item !== null &&
      !Array.isArray(item) &&
      item.id === rawOptionId
    ) {
      const color = item.color;
      if (color === "green" || color === "blue" || color === "red") {
        return color;
      }
      return "default";
    }
  }
  return null;
}

export interface FlowNodeCardProps {
  node: EngineFlowNode;
  selected: boolean;
  invalid: boolean;
  style?: CSSProperties;
  pendingOutput?: string | null;
  onSelect: (nodeId: string) => void;
  onHeaderPointerDown: (
    nodeId: string,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  onInputPortClick: (nodeId: string, port: FlowPort) => void;
  onOutputPortClick: (nodeId: string, port: FlowPort) => void;
}

/** Shared shell for all registry-backed flow nodes. */
function getNodeSummary(node: EngineFlowNode): string {
  const stringField = (key: string) => {
    const value = node.data[key];
    return typeof value === "string" ? value : "";
  };

  switch (node.type) {
    case "start":
      return "Entry point";
    case "text":
      return stringField("text") || "Message text not configured";
    case "image":
      return stringField("url") || "Image URL required";
    case "button": {
      const buttons = node.data.buttons;
      const count = Array.isArray(buttons) ? buttons.length : 0;
      return `${count} button${count === 1 ? "" : "s"} · ${stringField("text") || "Message required"}`;
    }
    case "choice": {
      const options = node.data.options;
      const count = Array.isArray(options) ? options.length : 0;
      return `${count} choices · ${stringField("prompt") || "Prompt required"}`;
    }
    case "menu": {
      const items = node.data.items;
      const count = Array.isArray(items) ? items.length : 0;
      return `Main Menu · ${count} button${count === 1 ? "" : "s"}`;
    }
    case "action":
      return `Operation · ${stringField("operationId") || "configure action"}`;
    default:
      return "Not supported by the current registry";
  }
}

export default function FlowNodeCard({
  node,
  selected,
  invalid,
  style,
  pendingOutput,
  onSelect,
  onHeaderPointerDown,
  onInputPortClick,
  onOutputPortClick,
}: FlowNodeCardProps) {
  const definition = DEFAULT_NODE_REGISTRY.get(node.type);
  const inputPorts = definition?.getInputPorts(node.data) ?? [];
  const outputPorts = definition?.getOutputPorts(node.data) ?? [];
  const Icon = NODE_ICONS[node.type] ?? AlertTriangle;
  const rowCount = Math.max(1, inputPorts.length, outputPorts.length);

  return (
    <article
      className={[
        "flow-node-card",
        `flow-node-card--${node.type}`,
        selected ? "is-selected" : "",
        invalid ? "is-invalid" : "",
      ].filter(Boolean).join(" ")}
      style={style}
      onClick={() => onSelect(node.id)}
      aria-label={`${definition?.title ?? node.type} node: ${node.label}`}
    >
      <div
        className="flow-node-header"
        onPointerDown={(event) => onHeaderPointerDown(node.id, event)}
        title="Drag to move this node"
      >
        <span className="flow-node-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <span className="flow-node-heading-copy">
          <strong>{node.label || definition?.title || node.type}</strong>
          <small>{getNodeSummary(node)}</small>
        </span>
        {invalid && (
          <span className="flow-node-invalid-mark" title="This node has validation issues">
            <AlertTriangle size={15} />
          </span>
        )}
      </div>

      {!definition && (
        <div className="flow-node-unsupported">
          This node type is not registered in the current flow engine.
        </div>
      )}

      <div className="flow-node-port-grid" aria-label="Node ports">
        {Array.from({ length: rowCount }, (_, index) => {
          const inputPort = inputPorts[index];
          const outputPort = outputPorts[index];
          const outputIsPending = Boolean(
            outputPort &&
            pendingOutput === `${node.id}:${outputPort.id}`,
          );

          return (
            <div className="flow-node-port-row" key={`${node.id}-port-row-${index}`}>
              <div className="flow-node-input-side">
                {inputPort && (
                  <button
                    type="button"
                    className="flow-port flow-port--input"
                    title={`Connect to ${inputPort.label}`}
                    aria-label={`Use ${inputPort.label} input on ${node.label}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onInputPortClick(node.id, inputPort);
                    }}
                  >
                    <span className="flow-port-dot" />
                    <span>{inputPort.label}</span>
                  </button>
                )}
              </div>

              <div className="flow-node-output-side">
                {outputPort && (() => {
                  const portColor = resolvePortButtonColor(node, outputPort.id);
                  return (
                    <button
                      type="button"
                      className={`flow-port flow-port--output ${outputIsPending ? "is-pending" : ""}`}
                      title={`Select ${outputPort.label} output to create a connection`}
                      aria-label={`Connect from ${outputPort.label} output on ${node.label}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOutputPortClick(node.id, outputPort);
                      }}
                    >
                      {portColor && portColor !== "default" && (
                        <span
                          className={`flow-port-color-indicator is-${portColor}`}
                          aria-hidden="true"
                        />
                      )}
                      <span>{outputPort.label}</span>
                      <span className="flow-port-dot" />
                    </button>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
