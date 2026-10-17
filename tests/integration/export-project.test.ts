import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DiagnosticCategory,
  ModuleKind,
  ScriptTarget,
  transpileModule,
} from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { deserializeProject } from "@zerobotforge/project-format/serialization";
import { generateProjectFiles } from "@zerobotforge/code-generator";
import { atomicWriteFile } from "../../apps/desktop/electron/services/file-system.service";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PROJECT_PATH = path.resolve(
  CURRENT_DIR,
  "../fixtures/sample-project.json",
);

const temporaryDirs: string[] = [];

async function createTempExportDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "zerobotforge-export-int-"));
  temporaryDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirs
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("Phase 12 integration: standalone bot project export to temporary directory", () => {
  it("generates and atomically writes all required files to a temporary directory", async () => {
    const exportRoot = await createTempExportDir();
    const rawProject = await readFile(SAMPLE_PROJECT_PATH, "utf8");
    const project = deserializeProject(rawProject);

    const generatedFiles = generateProjectFiles(project);

    for (const file of generatedFiles) {
      const destinationPath = path.join(exportRoot, file.path);
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await atomicWriteFile(destinationPath, file.content);
    }

    const expectedPaths = [
      "package.json",
      "tsconfig.json",
      ".env.example",
      "project.json",
      "src/bot.ts",
      "src/handlers.ts",
      "README.md",
    ];

    for (const relativePath of expectedPaths) {
      const fullPath = path.join(exportRoot, relativePath);
      const fileStats = await stat(fullPath);
      expect(fileStats.isFile()).toBe(true);
      expect(fileStats.size).toBeGreaterThan(0);
    }

    const writtenPackageJson = JSON.parse(
      await readFile(path.join(exportRoot, "package.json"), "utf8"),
    ) as {
      name: string;
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(writtenPackageJson.name).toBe("zerobotforge-support-assistant");
    expect(writtenPackageJson.dependencies).toHaveProperty("telegraf");
    expect(writtenPackageJson.scripts).toHaveProperty("build");
    expect(writtenPackageJson.scripts).toHaveProperty("start");

    const writtenEnvExample = await readFile(
      path.join(exportRoot, ".env.example"),
      "utf8",
    );
    expect(writtenEnvExample).toContain("TELEGRAM_BOT_TOKEN=\n");

    const writtenProject = deserializeProject(
      await readFile(path.join(exportRoot, "project.json"), "utf8"),
    );
    expect(writtenProject).toEqual(project);

    const botSource = await readFile(
      path.join(exportRoot, "src/bot.ts"),
      "utf8",
    );
    const handlersSource = await readFile(
      path.join(exportRoot, "src/handlers.ts"),
      "utf8",
    );

    for (const source of [botSource, handlersSource]) {
      const transpiled = transpileModule(source, {
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

  it("refuses to export when the project flow graph is invalid or contains a token leak", async () => {
    const rawProject = await readFile(SAMPLE_PROJECT_PATH, "utf8");
    const project = deserializeProject(rawProject);

    const brokenProject = {
      ...project,
      flows: [
        {
          ...project.flows[0]!,
          nodes: project.flows[0]!.nodes.filter((node) => node.type !== "start"),
        },
      ],
    };

    expect(() => generateProjectFiles(brokenProject)).toThrow(
      /must pass flow-engine validation/i,
    );
  });
});