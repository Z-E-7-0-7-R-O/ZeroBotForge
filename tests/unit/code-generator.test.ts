import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DiagnosticCategory,
  ModuleKind,
  ScriptTarget,
  transpileModule,
} from "typescript";
import { describe, expect, it } from "vitest";
import { deserializeProject } from "@zerobotforge/project-format/serialization";
import { generateProjectFiles } from "@zerobotforge/code-generator";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PROJECT_PATH = path.resolve(
  CURRENT_DIR,
  "../fixtures/sample-project.json",
);

function loadSampleProject() {
  return deserializeProject(readFileSync(SAMPLE_PROJECT_PATH, "utf8"));
}

describe("Phase 12 unit: code-generator templates, escaping, and manifest", () => {
  it("generates the complete 7-file manifest from sample-project.json", () => {
    const project = loadSampleProject();
    const files = generateProjectFiles(project);

    expect(files.map((file) => file.path)).toEqual([
      "package.json",
      "tsconfig.json",
      ".env.example",
      "project.json",
      "src/bot.ts",
      "src/handlers.ts",
      "README.md",
    ]);

    for (const file of files) {
      expect(file.content).not.toMatch(/\{\{[A-Z][A-Z0-9_]*\}\}/);
    }
  });

  it("transfers project.generation settings into package.json, tsconfig.json, and README.md", () => {
    const project = loadSampleProject();
    project.generation = {
      ...project.generation,
      packageManager: "pnpm",
      moduleFormat: "commonjs",
      nodeVersion: 24,
      strict: false,
    };

    const files = generateProjectFiles(project);
    const packageJson = JSON.parse(
      files.find((entry) => entry.path === "package.json")!.content,
    ) as {
      type: string;
      engines: { node: string };
    };
    const tsconfigJson = JSON.parse(
      files.find((entry) => entry.path === "tsconfig.json")!.content,
    ) as {
      compilerOptions: { strict: boolean };
    };
    const readme = files.find((entry) => entry.path === "README.md")!.content;

    expect(packageJson.type).toBe("commonjs");
    expect(packageJson.engines.node).toBe(">=24.0.0");
    expect(tsconfigJson.compilerOptions.strict).toBe(false);
    expect(readme).toContain("pnpm install");
  });

  it("isolates untrusted node text in project.json and compiles generated TypeScript cleanly", () => {
    const project = loadSampleProject();
    const untrustedPayload =
      'Welcome `user` \${process.exit(1)} "; import "fs"; //';
    project.flows[0]!.nodes[1]!.data = { text: untrustedPayload };

    const files = generateProjectFiles(project);
    const botTs = files.find((entry) => entry.path === "src/bot.ts")!.content;
    const handlersTs = files.find(
      (entry) => entry.path === "src/handlers.ts",
    )!.content;
    const projectJson = JSON.parse(
      files.find((entry) => entry.path === "project.json")!.content,
    ) as typeof project;

    expect(botTs).not.toContain(untrustedPayload);
    expect(handlersTs).not.toContain(untrustedPayload);
    expect(projectJson.flows[0]!.nodes[1]!.data.text).toBe(untrustedPayload);

    for (const sourceFile of [
      { name: "src/bot.ts", code: botTs },
      { name: "src/handlers.ts", code: handlersTs },
    ]) {
      const transpiled = transpileModule(sourceFile.code, {
        fileName: sourceFile.name,
        compilerOptions: {
          target: ScriptTarget.ES2022,
          module: ModuleKind.ESNext,
        },
        reportDiagnostics: true,
      });
      const errors = (transpiled.diagnostics ?? []).filter(
        (diag) => diag.category === DiagnosticCategory.Error,
      );
      expect(errors).toHaveLength(0);
    }
  });

  it("rejects invalid projects and embedded Telegram bot tokens", () => {
    const projectWithoutFlows = {
      ...loadSampleProject(),
      flows: [],
      activeFlowId: null,
    };
    expect(() => generateProjectFiles(projectWithoutFlows)).toThrow(
      /does not contain a flow/i,
    );

    const projectWithTokenLeak = loadSampleProject();
    projectWithTokenLeak.flows[0]!.nodes[1]!.data = {
      text: "Leaked token 123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi",
    };
    expect(() => generateProjectFiles(projectWithTokenLeak)).toThrow(
      /token pattern/i,
    );
  });
});