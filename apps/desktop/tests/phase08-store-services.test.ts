import { afterEach, describe, expect, it } from "vitest";
import type { ProjectSession } from "../src/types/electron-api";
import { createEmptyProject } from "@zerobotforge/project-format";
import type { ProjectId } from "@zerobotforge/shared";
import { createEditorId, toProjectFlow } from "../src/components/flow/flow-editor.model";
import { generateProjectFiles } from "@zerobotforge/code-generator";
import { createEmptyEditorFlow } from "../src/components/flow/flow-editor.model";
import {
  addFlowNode,
  connectFlowNodes,
  validateFlowDefinition,
} from "../src/services/flow.service";
import { runFlowPreview } from "../src/services/preview.service";
import {
  getProjectStoreSnapshot,
  markProjectSaved,
  resetProjectStoreForTests,
  setProjectSession,
  updateProjectDocument,
} from "../src/store/project.store";
import {
  getFlowStoreSnapshot,
  recordFlowChange,
  resetFlowStoreForTests,
  selectFlowNode,
  synchronizeActiveFlow,
} from "../src/store/flow.store";

function makeValidTextFlow() {
  const initial = createEmptyEditorFlow("Preview flow");
  let flow = addFlowNode(initial, "text");
  const start = flow.nodes.find((node) => node.type === "start")!;
  const text = flow.nodes.find((node) => node.type === "text")!;
  flow = connectFlowNodes(flow, {
    sourceNodeId: start.id,
    sourceHandle: "next",
    targetNodeId: text.id,
    targetHandle: "in",
  });
  return flow;
}

afterEach(() => {
  resetProjectStoreForTests();
  resetFlowStoreForTests();
});

describe("Phase 08 flow service", () => {
  it("creates and connects nodes using registry ports from the flow engine", () => {
    const flow = makeValidTextFlow();
    const validation = validateFlowDefinition(flow);
    expect(validation.valid).toBe(true);
    expect(flow.nodes.map((node) => node.type)).toEqual(["start", "text"]);
    expect(flow.edges[0]?.sourceHandle).toBe("next");
    expect(flow.edges[0]?.targetHandle).toBe("in");
  });

  it("rejects a second connection from the same output port", () => {
    const flow = makeValidTextFlow();
    const start = flow.nodes.find((node) => node.type === "start")!;
    const text = flow.nodes.find((node) => node.type === "text")!;
    expect(() => connectFlowNodes(flow, {
      sourceNodeId: start.id,
      sourceHandle: "next",
      targetNodeId: text.id,
      targetHandle: "in",
    })).toThrow(/already has a connection/i);
  });
});

describe("Phase 09 generated export", () => {
  it("returns the fixed, standalone source manifest for an engine-valid persisted project", () => {
    const flow = makeValidTextFlow();
    const project = createEmptyProject({ id: createEditorId() as ProjectId, name: "Support Bot" });
    project.bot.tokenEnvVar = "ZBF_CUSTOM_TOKEN";
    const document = { ...project, flows: [toProjectFlow(flow)], activeFlowId: flow.id };
    const files = generateProjectFiles(document);
    expect(files.map((file) => file.path)).toEqual([
      "package.json",
      "tsconfig.json",
      ".env.example",
      "project.json",
      "src/bot.ts",
      "src/handlers.ts",
      "README.md",
    ]);
    const generatedSource = files.find((file) => file.path === "src/bot.ts")?.content ?? "";
    expect(generatedSource).toContain("registerProjectHandlers");
    expect(generatedSource).toContain("process.env[tokenEnvironmentVariable]");
    expect(files.find((file) => file.path === ".env.example")?.content).toContain("ZBF_CUSTOM_TOKEN=");
    expect(files.find((file) => file.path === ".env.example")?.content).not.toMatch(/ZBF_CUSTOM_TOKEN=.+/);
    expect(files.find((file) => file.path === "src/handlers.ts")?.content).toContain("function runFlow");
  });
});

describe("Phase 09 preview service", () => {
  it("executes a valid flow with the real flow executor and exposes output events", async () => {
    const report = await runFlowPreview(makeValidTextFlow());
    expect(report.result.status).toBe("completed");
    expect(report.result.events.some((event) => event.type === "send_text")).toBe(true);
    expect(report.outputLines.some((line) => line.includes("Write your message here"))).toBe(true);
  });

  it("returns actual executor validation issues for invalid flow data", async () => {
    const flow = makeValidTextFlow();
    const textIndex = flow.nodes.findIndex((node) => node.type === "text");
    const invalid = {
      ...flow,
      nodes: flow.nodes.map((node, index) => index === textIndex
        ? { ...node, data: { text: "" } }
        : node),
    };
    const report = await runFlowPreview(invalid);
    expect(report.result.status).toBe("failed");
    expect(report.result.errors.length).toBeGreaterThan(0);
  });

  it("resumes a waiting button flow using the executor's input and resume contract", async () => {
    const initial = createEmptyEditorFlow("Interactive preview");
    let flow = addFlowNode(initial, "button");
    flow = addFlowNode(flow, "text");
    const start = flow.nodes.find((node) => node.type === "start")!;
    const button = flow.nodes.find((node) => node.type === "button")!;
    const text = flow.nodes.find((node) => node.type === "text")!;
    const buttonData = button.data as { buttons: Array<{ id: string; label: string }> };
    const option = buttonData.buttons[0]!;
    flow = connectFlowNodes(flow, {
      sourceNodeId: start.id,
      sourceHandle: "next",
      targetNodeId: button.id,
      targetHandle: "in",
    });
    flow = connectFlowNodes(flow, {
      sourceNodeId: button.id,
      sourceHandle: `button:${option.id}`,
      targetNodeId: text.id,
      targetHandle: "in",
    });

    const firstRun = await runFlowPreview(flow);
    expect(firstRun.result.status).toBe("waiting_for_input");
    expect(firstRun.result.currentNodeId).toBe(button.id);

    const nextRun = await runFlowPreview(flow, {
      resumeAtNodeId: firstRun.result.currentNodeId,
      context: {
        ...firstRun.result.context,
        input: { kind: "button", optionId: option.id },
      },
    });
    expect(nextRun.result.status).toBe("completed");
    expect(nextRun.result.events.some((event) => event.type === "send_text")).toBe(true);
  });
});

describe("Phase 08 stores", () => {
  it("marks edited project documents dirty and clears the flag after save", () => {
    const session = {
      document: { id: "project-test", name: "Test project" },
      filePath: "C:/Projects/test.zbf",
      fileName: "test.zbf",
    } as unknown as ProjectSession;

    setProjectSession(session, { dirty: false });
    updateProjectDocument({ ...session.document, name: "Renamed project" } as ProjectSession["document"]);
    expect(getProjectStoreSnapshot().isDirty).toBe(true);
    expect(getProjectStoreSnapshot().session?.document.name).toBe("Renamed project");

    const saved = getProjectStoreSnapshot().session!;
    markProjectSaved(saved);
    expect(getProjectStoreSnapshot().isDirty).toBe(false);
    expect(getProjectStoreSnapshot().status).toBe("ready");
  });

  it("tracks active-flow selection and edits in the flow store", () => {
    const flow = makeValidTextFlow();
    synchronizeActiveFlow(flow);
    selectFlowNode(flow.nodes[1]!.id);
    expect(getFlowStoreSnapshot().selectedNodeId).toBe(flow.nodes[1]!.id);
    const changed = { ...flow, name: "Updated name" };
    recordFlowChange(changed);
    expect(getFlowStoreSnapshot().activeFlow?.name).toBe("Updated name");
    expect(getFlowStoreSnapshot().isDirty).toBe(true);
  });
});
