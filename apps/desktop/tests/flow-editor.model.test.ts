import { describe, expect, it } from "vitest";

import { validateFlow } from "@zerobotforge/flow-engine/validator";
import type { FlowDefinition, FlowNode } from "@zerobotforge/flow-engine";

import {
  createDefaultNodeData,
  createEmptyEditorFlow,
  toEngineFlow,
  toProjectFlow,
} from "../src/components/flow/flow-editor.model";

import type { ProjectFlowDto } from "../src/types/electron-api";

describe("flow editor model adapters", () => {
  it("creates a real engine-compatible flow with one Start node", () => {
    const flow = createEmptyEditorFlow();

    expect(flow.nodes).toHaveLength(1);
    expect(flow.nodes[0]?.type).toBe("start");
    expect(validateFlow(flow).valid).toBe(true);
  });

  it("does not hide incomplete image settings from validation", () => {
    const flow = createEmptyEditorFlow();
    const imageNode: FlowNode = {
      id: "image-node-test" as FlowNode["id"],
      type: "image",
      label: "Image",
      position: { x: 420, y: 90 },
      data: createDefaultNodeData("image"),
    };

    const result = validateFlow({ ...flow, nodes: [...flow.nodes, imageNode] });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.some((entry) => entry.code === "FLOW_NODE_CONFIG_INVALID")).toBe(true);
    }
  });

  it("round-trips node positions and concrete edge ports through the project DTO", () => {
    const flow = createEmptyEditorFlow();
    const startNode = flow.nodes[0];
    expect(startNode).toBeDefined();
    if (!startNode) throw new Error("Expected Start node");

    const textNode: FlowNode = {
      id: "text-node-test" as FlowNode["id"],
      type: "text",
      label: "Greeting",
      position: { x: 440, y: 160 },
      data: createDefaultNodeData("text"),
    };

    const extendedFlow: FlowDefinition = {
      ...flow,
      nodes: [...flow.nodes, textNode],
      edges: [
        {
          id: "edge-test" as FlowDefinition["edges"][number]["id"],
          sourceNodeId: startNode.id,
          sourceHandle: "next",
          targetNodeId: textNode.id,
          targetHandle: "in",
        },
      ],
    };

    expect(validateFlow(extendedFlow).valid).toBe(true);

    const dto: ProjectFlowDto = toProjectFlow(extendedFlow);
    const restored = toEngineFlow(dto);

    expect(restored.nodes.find((node) => node.id === textNode.id)?.position).toEqual({ x: 440, y: 160 });
    expect(restored.edges[0]?.sourceHandle).toBe("next");
    expect(restored.edges[0]?.targetHandle).toBe("in");
    expect(validateFlow(restored).valid).toBe(true);
  });
});
