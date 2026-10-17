import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { transpileModule, ScriptTarget, ModuleKind, DiagnosticCategory } from "typescript";
import { createEmptyProject } from "@zerobotforge/project-format";
import type { ProjectId } from "@zerobotforge/shared";
import { edgeIdSchema, flowIdSchema, nodeIdSchema } from "@zerobotforge/shared/validators";
import type { FlowDefinition } from "@zerobotforge/flow-engine";
import { generateProjectFiles } from "./generator";

const FIXED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

function makeValidFlow(text = "Hello from ZeroBotForge"): FlowDefinition {
  const startId = nodeIdSchema.parse("node-start");
  const textId = nodeIdSchema.parse("node-text");
  return {
    id: flowIdSchema.parse("flow-main"),
    name: "Main flow",
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
        label: "Welcome message",
        position: { x: 220, y: 0 },
        data: { text },
      },
    ],
    edges: [
      {
        id: edgeIdSchema.parse("edge-start-text"),
        sourceNodeId: startId,
        sourceHandle: "next",
        targetNodeId: textId,
        targetHandle: "in",
      },
    ],
  };
}

function makeProject(options: { name?: string; text?: string } = {}) {
  const project = createEmptyProject({
    id: randomUUID() as ProjectId,
    name: options.name ?? "Support Bot",
    now: FIXED_TIMESTAMP,
  });
  project.bot.tokenEnvVar = "ZBF_CUSTOM_TOKEN";
  const flow = makeValidFlow(options.text);
  return {
    ...project,
    flows: [flow],
    activeFlowId: flow.id,
  };
}

function readFile(files: ReturnType<typeof generateProjectFiles>, path: string): string {
  const file = files.find((entry) => entry.path === path);
  if (!file) throw new Error(`Generated file not found in test: ${path}`);
  return file.content;
}

describe("standalone code generator", () => {
  it("rejects a project without flows instead of exporting an incomplete runtime", () => {
    const project = createEmptyProject({ id: randomUUID() as ProjectId, name: "Empty Project" });
    expect(() => generateProjectFiles(project)).toThrow(/does not contain a flow/i);
  });

  it("rejects non-project input before generating files", () => {
    expect(() => generateProjectFiles({ arbitrary: true })).toThrow(/project document is invalid/i);
  });

  it("assembles the exact fixed manifest including the standalone handlers module", () => {
    const files = generateProjectFiles(makeProject());
    expect(files.map((file) => file.path)).toEqual([
      "package.json",
      "tsconfig.json",
      ".env.example",
      "project.json",
      "src/bot.ts",
      "src/handlers.ts",
      "README.md",
    ]);
  });

  it("emits parseable project manifests and a blank environment-token placeholder", () => {
    const files = generateProjectFiles(makeProject());
    const packageJson = JSON.parse(readFile(files, "package.json")) as Record<string, unknown>;
    const tsconfig = JSON.parse(readFile(files, "tsconfig.json")) as Record<string, unknown>;
    const projectJson = JSON.parse(readFile(files, "project.json")) as { name: string };

    expect(packageJson).toMatchObject({ name: "support-bot", private: true, type: "module" });
    expect(tsconfig).toHaveProperty("compilerOptions.module", "NodeNext");
    expect(projectJson.name).toBe("Support Bot");
    expect(readFile(files, ".env.example")).toContain("ZBF_CUSTOM_TOKEN=\n");
    expect(readFile(files, ".env.example")).not.toMatch(/ZBF_CUSTOM_TOKEN=.+/);
  });

  it("keeps user content out of generated TypeScript source and escapes names for templates", () => {
    const injectedText = 'hello"; console.log("unexpected-source"); //';
    const project = makeProject({
      name: "Support Bot\n# injected heading *metadata*",
      text: injectedText,
    });
    const files = generateProjectFiles(project);
    const botSource = readFile(files, "src/bot.ts");
    const handlersSource = readFile(files, "src/handlers.ts");
    const readme = readFile(files, "README.md");
    const storedProject = JSON.parse(readFile(files, "project.json")) as {
      name: string;
      flows: Array<{ nodes: Array<{ data: Record<string, unknown> }> }>;
    };

    expect(botSource).not.toContain(injectedText);
    expect(handlersSource).not.toContain(injectedText);
    expect(storedProject.name).toBe("Support Bot\n# injected heading *metadata*");
    expect(storedProject.flows[0]?.nodes[1]?.data.text).toBe(injectedText);
    expect(readme).not.toContain("\n# injected heading");
  });

  it("rejects content matching a Telegram token pattern before returning output", () => {
    const tokenLikeValue = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi";
    expect(() => generateProjectFiles(makeProject({ text: tokenLikeValue }))).toThrow(/token pattern/i);
  });

  it("reports unsupported node types explicitly instead of silently omitting them", () => {
    const project = makeProject();
    const unsupportedFlow = {
      ...project.flows[0]!,
      nodes: project.flows[0]!.nodes.map((node) =>
        node.type === "text" ? { ...node, type: "condition", data: {} } : node,
      ),
    } as unknown as FlowDefinition;
    const invalidProject = { ...project, flows: [unsupportedFlow] };
    expect(() => generateProjectFiles(invalidProject)).toThrow(/does not support node type "condition"/i);
  });

  it("generates syntactically valid TypeScript files without unresolved template tokens", () => {
    const files = generateProjectFiles(makeProject());
    const tsFiles = files.filter((file) => file.path.endsWith(".ts"));

    expect(tsFiles.length).toBeGreaterThanOrEqual(2);
    for (const file of tsFiles) {
      expect(file.content).not.toMatch(/\{\{[A-Z][A-Z0-9_]*\}\}/);
      const result = transpileModule(file.content, {
        fileName: file.path,
        compilerOptions: {
          target: ScriptTarget.ES2022,
          module: ModuleKind.ESNext,
        },
        reportDiagnostics: true,
      });
      const errors = (result.diagnostics ?? []).filter(
        (diagnostic) => diagnostic.category === DiagnosticCategory.Error,
      );
      expect(errors, `${file.path}: ${errors.map((error) => error.messageText).join("; ")}`).toHaveLength(0);
    }
  });

  it("declares every external runtime dependency in the generated package manifest", () => {
    const files = generateProjectFiles(makeProject());
    const manifest = JSON.parse(readFile(files, "package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    expect(manifest.dependencies).toHaveProperty("telegraf");
    expect(manifest.dependencies).toHaveProperty("dotenv");
    expect(manifest.devDependencies).toHaveProperty("typescript");
    expect(manifest.scripts).toHaveProperty("build");
    expect(manifest.scripts).toHaveProperty("start");
  });
});
