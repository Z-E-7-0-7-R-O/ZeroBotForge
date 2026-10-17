import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CURRENT_PROJECT_FORMAT_VERSION,
  ERROR_CODES,
  PROJECT_FILE_FORMAT,
} from "@zerobotforge/shared/constants";
import { ProjectFormatError } from "@zerobotforge/shared/errors";
import {
  edgeIdSchema,
  flowIdSchema,
  nodeIdSchema,
  projectIdSchema,
} from "@zerobotforge/shared/validators";
import {
  createEmptyProject,
  type ProjectDocument,
} from "@zerobotforge/project-format";
import { migrateProjectData } from "@zerobotforge/project-format/migrations";
import {
  ProjectDocumentSchema,
  validateProjectSemantics,
} from "@zerobotforge/project-format/schema";
import {
  deserializeProject,
  serializeProject,
} from "@zerobotforge/project-format/serialization";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PROJECT_PATH = path.resolve(
  CURRENT_DIR,
  "../fixtures/sample-project.json",
);

describe("Phase 12 unit: project-format schema, serialization, and migration", () => {
  it("loads, validates, and round-trips sample-project.json without data loss", () => {
    const rawJson = readFileSync(SAMPLE_PROJECT_PATH, "utf8");
    const parsed = deserializeProject(rawJson);

    expect(parsed.format).toBe(PROJECT_FILE_FORMAT);
    expect(parsed.formatVersion).toBe(CURRENT_PROJECT_FORMAT_VERSION);
    expect(validateProjectSemantics(parsed)).toEqual([]);

    const serialized = serializeProject(parsed);
    const roundTripped = deserializeProject(serialized);
    expect(roundTripped).toEqual(parsed);
  });

  it("enforces strict schema validation and rejects unknown root or nested properties", () => {
    const project = createEmptyProject({
      id: projectIdSchema.parse("project-strict"),
      name: "Strict Schema Test",
      now: "2026-01-01T00:00:00.000Z",
    });

    expect(ProjectDocumentSchema.safeParse(project).success).toBe(true);

    const withUnexpectedField = {
      ...project,
      uiEphemeralState: { zoom: 1.25 },
    };
    expect(ProjectDocumentSchema.safeParse(withUnexpectedField).success).toBe(
      false,
    );
  });

  it("migrates legacy version 0 documents to formatVersion 1 with defaults", () => {
    const legacyV0 = {
      format: PROJECT_FILE_FORMAT,
      formatVersion: 0,
      id: "project-legacy-v0",
      name: "Legacy Bot",
      createdAt: "2025-06-01T00:00:00.000Z",
      updatedAt: "2025-06-01T00:00:00.000Z",
      bot: {
        displayName: "Legacy Assistant",
      },
      flows: [],
      activeFlowId: null,
    };

    const migrated = migrateProjectData(legacyV0);
    expect(migrated.formatVersion).toBe(CURRENT_PROJECT_FORMAT_VERSION);
    expect(migrated.bot.tokenEnvVar).toBe("TELEGRAM_BOT_TOKEN");
    expect(migrated.generation.nodeVersion).toBe(22);
    expect(migrated.generation.moduleFormat).toBe("esm");
  });

  it("rejects unsupported format versions and malformed JSON with typed error codes", () => {
    expect(() => deserializeProject("{invalid-json")).toThrowError(
      expect.objectContaining({
        code: ERROR_CODES.PROJECT_JSON_INVALID,
      }),
    );

    expect(() =>
      migrateProjectData({
        format: PROJECT_FILE_FORMAT,
        formatVersion: 42,
      }),
    ).toThrow(ProjectFormatError);
  });

  it("detects semantic violations including missing activeFlowId and duplicate flow/node IDs", () => {
    const flowId = flowIdSchema.parse("flow-1");
    const startNodeId = nodeIdSchema.parse("node-start");

    const base = createEmptyProject({
      id: projectIdSchema.parse("project-semantics"),
      name: "Semantics Check",
      now: "2026-01-01T00:00:00.000Z",
    });

    const semanticallyInvalid: ProjectDocument = {
      ...base,
      activeFlowId: flowIdSchema.parse("flow-missing"),
      flows: [
        {
          id: flowId,
          name: "Flow One",
          nodes: [
            {
              id: startNodeId,
              type: "start",
              label: "Start A",
              position: { x: 0, y: 0 },
              data: {},
            },
            {
              id: startNodeId,
              type: "text",
              label: "Duplicate ID Node",
              position: { x: 100, y: 0 },
              data: { text: "Duplicate" },
            },
          ],
          edges: [
            {
              id: edgeIdSchema.parse("edge-broken"),
              sourceNodeId: startNodeId,
              targetNodeId: nodeIdSchema.parse("node-absent"),
            },
          ],
        },
      ],
    };

    const issues = validateProjectSemantics(semanticallyInvalid);
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(
      issues.some((issue) => issue.path.includes("activeFlowId")),
    ).toBe(true);
    expect(
      issues.some((issue) => issue.message.includes("node-start")),
    ).toBe(true);
    expect(
      issues.some((issue) => issue.message.includes("node-absent")),
    ).toBe(true);
  });
});