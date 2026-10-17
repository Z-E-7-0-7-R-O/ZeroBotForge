import { useEffect, useState } from "react";

import {
  AlertTriangle,
  GitBranch,
  Image as ImageIcon,
  LayoutGrid,
  MousePointerClick,
  Play,
  Zap,
  MessageSquare,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

import {
  DEFAULT_NODE_REGISTRY,
} from "@zerobotforge/flow-engine/registry";

import type { SupportedFlowNodeType } from "@zerobotforge/flow-engine";
import { getFlowStoreSnapshot } from "../../store/flow.store";

const ICONS: Record<SupportedFlowNodeType, LucideIcon> = {
  start: Play,
  text: MessageSquare,
  image: ImageIcon,
  button: MousePointerClick,
  choice: GitBranch,
  menu: LayoutGrid,
  action: Zap,
};

export interface NodePaletteProps {
  hasStartNode: boolean;
  hasMenuNode?: boolean;
  onAddNode: (type: SupportedFlowNodeType) => void;
}

/** Palette entries always come from the flow-engine registry. */
export default function NodePalette({
  hasStartNode,
  hasMenuNode,
  onAddNode,
}: NodePaletteProps) {
  const definitions = DEFAULT_NODE_REGISTRY.list();
  const [canvasHasMenuNode, setCanvasHasMenuNode] = useState<boolean>(() => {
    const storeFlow = getFlowStoreSnapshot().activeFlow;
    return Boolean(storeFlow?.nodes.some((node) => node.type === "menu"));
  });

  useEffect(() => {
    const checkMenuPresence = () => {
      const storeFlow = getFlowStoreSnapshot().activeFlow;
      const inStore = Boolean(
        storeFlow?.nodes.some((node) => node.type === "menu"),
      );
      const inDom =
        typeof document !== "undefined" &&
        document.querySelector(".flow-node-card--menu") !== null;
      setCanvasHasMenuNode(inStore || inDom);
    };

    checkMenuPresence();

    if (typeof MutationObserver === "undefined" || typeof document === "undefined") {
      return;
    }

    const observer = new MutationObserver(() => {
      checkMenuPresence();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  const resolvedHasMenuNode = hasMenuNode ?? canvasHasMenuNode;

  return (
    <section className="flow-editor-panel flow-node-palette">
      <div className="flow-editor-panel-heading">
        <div>
          <h2>Node palette</h2>
          <p>Choose a node to add it to the canvas.</p>
        </div>
        <span className="flow-editor-count">{definitions.length}</span>
      </div>

      <div className="flow-palette-list">
        {definitions.map((definition) => {
          const Icon = ICONS[definition.type];
          const isStartLocked = definition.type === "start" && hasStartNode;
          const isMenuLocked =
            definition.type === "menu" && resolvedHasMenuNode;
          const disabled = isStartLocked || isMenuLocked;

          return (
            <button
              type="button"
              key={definition.type}
              className={`flow-palette-item flow-palette-item--${definition.type}`}
              disabled={disabled}
              title={
                isStartLocked
                  ? "A flow can contain exactly one Start node."
                  : isMenuLocked
                    ? "A flow can contain at most one main Menu node."
                    : definition.description
              }
              onClick={() => {
                if (disabled) return;
                if (definition.type === "menu") {
                  setCanvasHasMenuNode(true);
                }
                onAddNode(definition.type);
              }}
            >
              <span className="flow-palette-icon"><Icon size={17} /></span>
              <span className="flow-palette-copy">
                <strong>{definition.title}</strong>
                <small>{definition.description}</small>
              </span>
              <span className="flow-palette-add" aria-hidden="true">+</span>
            </button>
          );
        })}
      </div>

      <div className="flow-palette-note">
        <AlertTriangle size={15} />
        <span>New nodes with incomplete settings are marked invalid until configured.</span>
      </div>
    </section>
  );
}