import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ERROR_CODES } from "@zerobotforge/shared/constants";
import { deserializeProject } from "@zerobotforge/project-format/serialization";
import {
  MAX_PROJECT_FILE_BYTES,
  ProjectFileSystemService,
} from "../../apps/desktop/electron/services/file-system.service";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PROJECT_PATH = path.resolve(
  CURRENT_DIR,
  "../fixtures/sample-project.json",
);

const temporaryDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "zerobotforge-storage-int-"));
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

describe("Phase 12 integration: project storage lifecycle and IO error handling", () => {
  const fileService = new ProjectFileSystemService();

  it("creates, saves, reopens, updates, and recovers sample-project.json in a temporary directory", async () => {
    const dir = await createTempDir();
    const projectFilePath = path.join(dir, "support-assistant.zbf");

    const sampleRaw = await readFile(SAMPLE_PROJECT_PATH, "utf8");
    const sampleProject = deserializeProject(sampleRaw);

    const saved = await fileService.writeProject(projectFilePath, sampleProject);
    expect(saved).toEqual(sampleProject);

    const loaded = await fileService.readProject(projectFilePath);
    expect(loaded).toEqual(sampleProject);

    const updatedProject = {
      ...loaded,
      name: "ZeroBotForge Support Assistant v2",
      updatedAt: "2026-02-01T00:00:00.000Z",
      generation: {
        ...loaded.generation,
        packageManager: "pnpm" as const,
      },
    };

    await fileService.writeProject(projectFilePath, updatedProject);
    const reloaded = await fileService.readProject(projectFilePath);

    expect(reloaded.name).toBe("ZeroBotForge Support Assistant v2");
    expect(reloaded.generation.packageManager).toBe("pnpm");
  });

  it("migrates a legacy v0 project file on read and persists it as formatVersion 1 on save", async () => {
    const dir = await createTempDir();
    const legacyPath = path.join(dir, "legacy-project.json");

    const legacyPayload = JSON.stringify(
      {
        format: "zerobotforge.project",
        formatVersion: 0,
        id: "project-legacy-disk",
        name: "Disk Legacy Project",
        createdAt: "2025-05-01T00:00:00.000Z",
        updatedAt: "2025-05-01T00:00:00.000Z",
        bot: {
          displayName: "Disk Legacy Bot",
        },
        flows: [],
        activeFlowId: null,
      },
      null,
      2,
    );

    await writeFile(legacyPath, legacyPayload, "utf8");

    const migrated = await fileService.readProject(legacyPath);
    expect(migrated.formatVersion).toBe(1);
    expect(migrated.bot.tokenEnvVar).toBe("TELEGRAM_BOT_TOKEN");

    await fileService.writeProject(legacyPath, migrated);
    const persistedRaw = JSON.parse(await readFile(legacyPath, "utf8")) as {
      formatVersion: number;
    };
    expect(persistedRaw.formatVersion).toBe(1);
  });

  it("handles IO and validation errors for missing files, corrupt JSON, invalid extensions, and oversized files", async () => {
    const dir = await createTempDir();

    await expect(
      fileService.readProject(path.join(dir, "missing.zbf")),
    ).rejects.toMatchObject({
      code: "PROJECT_FILE_READ_FAILED",
    });

    const sampleRaw = await readFile(SAMPLE_PROJECT_PATH, "utf8");
    const sampleProject = deserializeProject(sampleRaw);

    await expect(
      fileService.writeProject(path.join(dir, "bad.txt"), sampleProject),
    ).rejects.toMatchObject({
      code: "PROJECT_FILE_EXTENSION_INVALID",
    });

    const corruptPath = path.join(dir, "corrupt.zbf");
    await writeFile(corruptPath, "{broken-json", "utf8");
    await expect(fileService.readProject(corruptPath)).rejects.toMatchObject({
      code: ERROR_CODES.PROJECT_JSON_INVALID,
    });
    expect(await readFile(corruptPath, "utf8")).toBe("{broken-json");

    const oversizedPath = path.join(dir, "huge.zbf");
    await writeFile(
      oversizedPath,
      Buffer.alloc(MAX_PROJECT_FILE_BYTES + 16, 0x20),
    );
    await expect(fileService.readProject(oversizedPath)).rejects.toMatchObject({
      code: "PROJECT_FILE_TOO_LARGE",
    });
  });
});