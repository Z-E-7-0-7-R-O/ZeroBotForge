import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "@zerobotforge/shared/constants";
import {
  edgeIdSchema,
  flowIdSchema,
  nodeIdSchema,
} from "@zerobotforge/shared/validators";
import type { FlowDefinition, FlowNode } from "@zerobotforge/flow-engine";
import { validateFlow } from "@zerobotforge/flow-engine/validator";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_FLOW_PATH = path.resolve(
  CURRENT_DIR,
  "../fixtures/sample-flow.json",
);

function loadSampleFlow(): FlowDefinition {
  return JSON.parse(readFileSync(SAMPLE_FLOW_PATH, "utf8")) as FlowDefinition;
}

function makeMinimalFlow(): FlowDefinition {
  const startId = nodeIdSchema.parse("node-start");
  const textId = nodeIdSchema.parse("node-text");
  return {
    id: flowIdSchema.parse("flow-minimal"),
    name: "Minimal Valid Flow",
    nodes: [
      {
        id: startId,
        type: "start",
        label: "Start",
        position: { x: 0, y: 0 },
        data: {},
      },
      {
        id: textId,
        type: "text",
        label: "Reply",
        position: { x: 240, y: 0 },
        data: { text: "Hello!" },
      },
    ],
    edges: [
      {
        id: edgeIdSchema.parse("edge-start-reply"),
        sourceNodeId: startId,
        sourceHandle: "next",
        targetNodeId: textId,
        targetHandle: "in",
      },
    ],
  };
}

describe("Phase 12 unit: flow-validator rules and diagnostics", () => {
  it("validates the sample-flow.json fixture without issues", () => {
    const validation = validateFlow(loadSampleFlow());
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it("rejects flows with a missing start node or multiple start nodes", () => {
    const flowWithoutStart = {
      ...makeMinimalFlow(),
      nodes: makeMinimalFlow().nodes.filter((node) => node.type !== "start"),
      edges: [],
    };
    const missingStartResult = validateFlow(flowWithoutStart);
    expect(missingStartResult.valid).toBe(false);
    expect(
      missingStartResult.issues.some(
        (issue) => issue.code === ERROR_CODES.FLOW_START_NODE_MISSING,
      ),
    ).toBe(true);

    const extraStartNode: FlowNode = {
      id: nodeIdSchema.parse("node-start-2"),
      type: "start",
      label: "Second Start",
      position: { x: 0, y: 120 },
      data: {},
    };
    const multipleStartResult = validateFlow({
      ...makeMinimalFlow(),
      nodes: [...makeMinimalFlow().nodes, extraStartNode],
    });
    expect(multipleStartResult.valid).toBe(false);
    expect(
      multipleStartResult.issues.some(
        (issue) => issue.code === ERROR_CODES.FLOW_MULTIPLE_START_NODES,
      ),
    ).toBe(true);
  });

  it("rejects duplicate node IDs and duplicate edge IDs", () => {
    const base = makeMinimalFlow();
    const duplicateNodeFlow: FlowDefinition = {
      ...base,
      nodes: [...base.nodes, { ...base.nodes[1]! }],
    };
    const nodeResult = validateFlow(duplicateNodeFlow);
    expect(nodeResult.valid).toBe(false);
    expect(
      nodeResult.issues.some(
        (issue) => issue.code === ERROR_CODES.FLOW_DUPLICATE_NODE_ID,
      ),
    ).toBe(true);

    const duplicateEdgeFlow: FlowDefinition = {
      ...base,
      edges: [...base.edges, { ...base.edges[0]! }],
    };
    const edgeResult = validateFlow(duplicateEdgeFlow);
    expect(edgeResult.valid).toBe(false);
    expect(
      edgeResult.issues.some(
        (issue) => issue.code === ERROR_CODES.FLOW_DUPLICATE_EDGE_ID,
      ),
    ).toBe(true);
  });

  it("rejects broken edge endpoints and invalid source or target port handles", () => {
    const base = makeMinimalFlow();
    const edge = base.edges[0]!;

    const missingSource = validateFlow({
      ...base,
      edges: [{ ...edge, sourceNodeId: nodeIdSchema.parse("node-nonexistent") }],
    });
    expect(
      missingSource.issues.some(
        (issue) => issue.code === ERROR_CODES.FLOW_EDGE_SOURCE_NOT_FOUND,
      ),
    ).toBe(true);

    const missingTarget = validateFlow({
      ...base,
      edges: [{ ...edge, targetNodeId: nodeIdSchema.parse("node-nonexistent") }],
    });
    expect(
      missingTarget.issues.some(
        (issue) => issue.code === ERROR_CODES.FLOW_EDGE_TARGET_NOT_FOUND,
      ),
    ).toBe(true);

    const badSourcePort = validateFlow({
      ...base,
      edges: [{ ...edge, sourceHandle: "invalid-port" }],
    });
    expect(
      badSourcePort.issues.some(
        (issue) => issue.code === ERROR_CODES.FLOW_SOURCE_PORT_INVALID,
      ),
    ).toBe(true);

    const badTargetPort = validateFlow({
      ...base,
      edges: [{ ...edge, targetHandle: "invalid-input" }],
    });
    expect(
      badTargetPort.issues.some(
        (issue) => issue.code === ERROR_CODES.FLOW_TARGET_PORT_INVALID,
      ),
    ).toBe(true);
  });

  it("rejects invalid node configurations and unconnected required button ports", () => {
    const base = makeMinimalFlow();

    const invalidImageFlow: FlowDefinition = {
      ...base,
      nodes: base.nodes.map((node) =>
        node.type === "text"
          ? {
              ...node,
              type: "image",
              data: { url: "ftp://invalid-protocol.example.com/file.png" },
            }
          : node,
      ),
    };
    const imageValidation = validateFlow(invalidImageFlow);
    expect(imageValidation.valid).toBe(false);
    expect(
      imageValidation.issues.some(
        (issue) => issue.code === ERROR_CODES.FLOW_NODE_CONFIG_INVALID,
      ),
    ).toBe(true);

    const unconnectedButtonFlow: FlowDefinition = {
      ...base,
      nodes: base.nodes.map((node) =>
        node.type === "text"
          ? {
              ...node,
              type: "button",
              data: {
                text: "Pick one",
                buttons: [{ id: "opt1", label: "Option 1" }],
              },
            }
          : node,
      ),
    };
    const buttonValidation = validateFlow(unconnectedButtonFlow);
    expect(buttonValidation.valid).toBe(false);
    expect(
      buttonValidation.issues.some((issue) =>
        issue.message.includes("Required output port"),
      ),
    ).toBe(true);
  });
});