
import { describe, expect, it } from 'vitest';

import {
  CURRENT_PROJECT_FORMAT_VERSION,
  ERROR_CODES,
  PROJECT_FILE_FORMAT,
} from '@zerobotforge/shared/constants';

import { ProjectFormatError } from '@zerobotforge/shared/errors';

import {
  edgeIdSchema,
  flowIdSchema,
  nodeIdSchema,
  projectIdSchema,
} from '@zerobotforge/shared/validators';

import { createEmptyProject } from './project.model';
import type { ProjectDocument } from './project.model';

import { migrateProjectData } from './project.migrations';

import {
  ProjectDocumentSchema,
  validateProjectSemantics,
} from './project.schema';

import {
  deserializeProject,
  serializeProject,
} from './project.serialization';

const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

function makeProject(): ProjectDocument {
  const flowId = flowIdSchema.parse('flow-main');
  const startNodeId = nodeIdSchema.parse('node-start');

  const project = createEmptyProject({
    id: projectIdSchema.parse('project-demo'),
    name: 'Example Project',
    now: FIXED_TIMESTAMP,
  });

  return {
    ...project,

    flows: [
      {
        id: flowId,
        name: 'Main flow',

        nodes: [
          {
            id: startNodeId,
            type: 'start',
            label: 'Start',
            position: {
              x: 80,
              y: 120,
            },
            data: {},
          },
        ],

        edges: [],
      },
    ],

    activeFlowId: flowId,
  };
}

describe('project format structural schema', () => {
  it('accepts a valid current project document', () => {
    expect(
      ProjectDocumentSchema.safeParse(makeProject()).success,
    ).toBe(true);
  });

  it('rejects missing required fields and incorrect data types', () => {
    const valid = makeProject();
    const invalid = {
      ...valid,
      name: 42,
    };

    expect(
      ProjectDocumentSchema.safeParse(invalid).success,
    ).toBe(false);

    const missingVersion: Record<string, unknown> = {
      ...valid,
    };

    delete missingVersion.formatVersion;

    expect(
      ProjectDocumentSchema.safeParse(missingVersion).success,
    ).toBe(false);
  });

  it('rejects unexpected fields instead of silently stripping them', () => {
    const valid = makeProject();

    expect(
      ProjectDocumentSchema.safeParse({
        ...valid,
        rendererStoreSnapshot: {},
      }).success,
    ).toBe(false);
  });
});

describe('project serialization', () => {
  it('round-trips a valid project through JSON without changing domain data', () => {
    const project = makeProject();

    const json = serializeProject(project);
    const restored = deserializeProject(json);

    expect(restored).toEqual(project);

    expect(JSON.parse(json)).toMatchObject({
      format: PROJECT_FILE_FORMAT,
      formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
    });
  });

  it('rejects invalid data when serializing', () => {
    const invalid = {
      ...makeProject(),
      name: '',
    };

    expect(() => serializeProject(invalid)).toThrow(
      ProjectFormatError,
    );
  });

  it('reports malformed JSON with a recognizable error code', () => {
    try {
      deserializeProject('{not-json');

      throw new Error(
        'Expected malformed JSON to be rejected.',
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectFormatError);

      expect(error).toMatchObject({
        code: ERROR_CODES.PROJECT_JSON_INVALID,
      });
    }
  });

  it('rejects missing and unsupported format versions clearly', () => {
    const withoutVersion: Record<string, unknown> = {
      ...makeProject(),
    };

    delete withoutVersion.formatVersion;

    expect(() =>
      migrateProjectData(withoutVersion),
    ).toThrow(/missing the required formatVersion/i);

    expect(() =>
      migrateProjectData({
        format: PROJECT_FILE_FORMAT,
        formatVersion: 99,
      }),
    ).toThrow(/version 99 is not supported/i);
  });

  it('migrates a supported version 0 project to the current format', () => {
    const legacy = {
      format: PROJECT_FILE_FORMAT,
      formatVersion: 0,

      id: 'project-v0',
      name: 'Legacy Project',

      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,

      bot: {
        displayName: 'Legacy Bot',
      },

      flows: [],
      activeFlowId: null,
    };

    const migrated = migrateProjectData(legacy);

    expect(migrated.formatVersion).toBe(
      CURRENT_PROJECT_FORMAT_VERSION,
    );

    expect(migrated.metadata).toEqual({
      description: '',
      tags: [],
    });

    expect(migrated.bot.tokenEnvVar).toBe(
      'TELEGRAM_BOT_TOKEN',
    );

    expect(migrated.bot.parseMode).toBeNull();
    expect(migrated.generation.language).toBe('typescript');
    expect(migrated.generation.nodeVersion).toBeGreaterThanOrEqual(22);

    expect(
      ProjectDocumentSchema.safeParse(migrated).success,
    ).toBe(true);
  });
});

describe('separate semantic validation', () => {
  it('allows structural parsing but reports dangling edge references separately', () => {
    const project = makeProject();
    const flow = project.flows[0];

    if (!flow) {
      throw new Error('Test fixture must have a flow.');
    }

    const structurallyValidButSemanticallyInvalid: ProjectDocument = {
      ...project,

      flows: [
        {
          ...flow,

          edges: [
            {
              id: edgeIdSchema.parse('edge-dangling'),
              sourceNodeId: nodeIdSchema.parse('missing-source'),
              targetNodeId: flow.nodes[0]!.id,
            },
          ],
        },
      ],
    };

    expect(
      ProjectDocumentSchema.safeParse(
        structurallyValidButSemanticallyInvalid,
      ).success,
    ).toBe(true);

    expect(
      validateProjectSemantics(
        structurallyValidButSemanticallyInvalid,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'EDGE_SOURCE_NODE_NOT_FOUND',
        }),
      ]),
    );
  });
});
