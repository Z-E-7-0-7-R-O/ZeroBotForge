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
import {
  executeFlow,
  FlowActionRegistry,
} from "@zerobotforge/flow-engine/executor";
import { FlowGraph } from "@zerobotforge/flow-engine/graph";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_FLOW_PATH = path.resolve(
  CURRENT_DIR,
  "../fixtures/sample-flow.json",
);

function loadSampleFlowFixture(): FlowDefinition {
  const raw = readFileSync(SAMPLE_FLOW_PATH, "utf8");
  return JSON.parse(raw) as FlowDefinition;
}

function createNode(
  id: string,
  type: FlowNode["type"],
  data: FlowNode["data"] = {},
): FlowNode {
  return {
    id: nodeIdSchema.parse(id),
    type,
    label: id,
    position: { x: 0, y: 0 },
    data,
  };
}

describe("Phase 12 unit: flow-engine execution and step budget", () => {
  it("loads sample-flow.json and pauses at the interactive button prompt", async () => {
    const sampleFlow = loadSampleFlowFixture();
    const graph = new FlowGraph(sampleFlow);

    expect(
      graph.getReachableNodeIds(nodeIdSchema.parse("node-start")),
    ).toHaveLength(sampleFlow.nodes.length);

    const firstRun = await executeFlow(sampleFlow);

    expect(firstRun.status).toBe("waiting_for_input");
    expect(firstRun.currentNodeId).toBe(
      nodeIdSchema.parse("node-topic-buttons"),
    );
    expect(firstRun.steps).toBe(3);
    expect(firstRun.events.map((event) => event.type)).toEqual([
      "send_text",
      "show_buttons",
    ]);
  });

  it("resumes sample-flow.json along the registered action success branch in exact step order", async () => {
    const sampleFlow = loadSampleFlowFixture();
    const actions = new FlowActionRegistry();

    actions.register("lookup_service_status", ({ params }) => {
      return {
        component: params.component ?? "unknown",
        healthy: true,
      };
    });

    const resumed = await executeFlow(sampleFlow, {
      resumeAtNodeId: nodeIdSchema.parse("node-topic-buttons"),
      actions,
      context: {
        variables: {},
        input: {
          kind: "button",
          optionId: "status",
        },
      },
    });

    expect(resumed.status).toBe("completed");
    expect(resumed.currentNodeId).toBeUndefined();
    expect(resumed.events).toEqual([
      {
        type: "action_completed",
        nodeId: nodeIdSchema.parse("node-status-action"),
        operationId: "lookup_service_status",
        result: {
          component: "core-gateway",
          healthy: true,
        },
      },
      {
        type: "send_text",
        nodeId: nodeIdSchema.parse("node-status-ok"),
        text: "All core services are operational.",
      },
    ]);
    expect(resumed.context.variables.lastActionResult).toEqual({
      component: "core-gateway",
      healthy: true,
    });
  });

  it("routes to the action failure branch when a registered action handler throws", async () => {
    const sampleFlow = loadSampleFlowFixture();
    const actions = new FlowActionRegistry();

    actions.register("lookup_service_status", () => {
      throw new Error("Upstream telemetry timeout");
    });

    const resumed = await executeFlow(sampleFlow, {
      resumeAtNodeId: nodeIdSchema.parse("node-topic-buttons"),
      actions,
      context: {
        variables: {},
        input: {
          kind: "button",
          optionId: "status",
        },
      },
    });

    expect(resumed.status).toBe("completed");
    expect(resumed.events).toEqual([
      {
        type: "action_failed",
        nodeId: nodeIdSchema.parse("node-status-action"),
        operationId: "lookup_service_status",
        message: "Upstream telemetry timeout",
      },
      {
        type: "send_text",
        nodeId: nodeIdSchema.parse("node-status-degraded"),
        text: "Status check is temporarily unavailable. Please try again later.",
      },
    ]);
  });

  it("resumes sample-flow.json along the image guide branch and emits send_image", async () => {
    const sampleFlow = loadSampleFlowFixture();

    const resumed = await executeFlow(sampleFlow, {
      resumeAtNodeId: nodeIdSchema.parse("node-topic-buttons"),
      context: {
        variables: {},
        input: {
          kind: "button",
          optionId: "guide",
        },
      },
    });

    expect(resumed.status).toBe("completed");
    expect(resumed.events).toEqual([
      {
        type: "send_image",
        nodeId: nodeIdSchema.parse("node-guide-image"),
        url: "https://example.com/assets/zerobotforge-architecture.png",
        caption: "ZeroBotForge layered runtime overview.",
      },
    ]);
  });

  it("fails cleanly when resuming a waiting button node with an unknown optionId", async () => {
    const sampleFlow = loadSampleFlowFixture();

    const invalidResume = await executeFlow(sampleFlow, {
      resumeAtNodeId: nodeIdSchema.parse("node-topic-buttons"),
      context: {
        variables: {},
        input: {
          kind: "button",
          optionId: "non-existent-option",
        },
      },
    });

    expect(invalidResume.status).toBe("failed");
    expect(invalidResume.errors.length).toBeGreaterThan(0);
  });

  it("terminates cyclic graphs deterministically when maxSteps is reached", async () => {
    const startId = nodeIdSchema.parse("node-start");
    const stepAId = nodeIdSchema.parse("node-step-a");
    const stepBId = nodeIdSchema.parse("node-step-b");

    const cyclicFlow: FlowDefinition = {
      id: flowIdSchema.parse("flow-loop"),
      name: "Cyclic Flow",
      nodes: [
        createNode("node-start", "start"),
        createNode("node-step-a", "text", { text: "Ping" }),
        createNode("node-step-b", "text", { text: "Pong" }),
      ],
      edges: [
        {
          id: edgeIdSchema.parse("edge-start-a"),
          sourceNodeId: startId,
          sourceHandle: "next",
          targetNodeId: stepAId,
          targetHandle: "in",
        },
        {
          id: edgeIdSchema.parse("edge-a-b"),
          sourceNodeId: stepAId,
          sourceHandle: "next",
          targetNodeId: stepBId,
          targetHandle: "in",
        },
        {
          id: edgeIdSchema.parse("edge-b-a"),
          sourceNodeId: stepBId,
          sourceHandle: "next",
          targetNodeId: stepAId,
          targetHandle: "in",
        },
      ],
    };

    const result = await executeFlow(cyclicFlow, { maxSteps: 5 });

    expect(result.status).toBe("step_limit_exceeded");
    expect(result.steps).toBe(5);
    expect(
      result.errors.some(
        (issue) => issue.code === ERROR_CODES.FLOW_STEP_LIMIT_EXCEEDED,
      ),
    ).toBe(true);
  });
});