import type { ProjectDocument } from "@zerobotforge/project-format";
import { deserializeProject, serializeProject } from "@zerobotforge/project-format/serialization";
import { validateFlow } from "@zerobotforge/flow-engine/validator";
import { createGeneratorContext } from "./generator-context";
import { assembleGeneratedProject } from "./output-assembler";
import type { GeneratedProjectFile } from "./output-assembler";
import { renderGeneratorTemplates } from "./template-loader";

export type { GeneratedProjectFile } from "./output-assembler";

const GENERATOR_SUPPORTED_NODE_TYPES = new Set([
  "start",
  "text",
  "image",
  "button",
  "choice",
  "menu",
  "action",
]);

/**
 * Validates the persisted document, builds safely escaped template context,
 * renders every template, and assembles a complete output manifest in memory.
 * This function never reads the secure Telegram-token store.
 */
export function generateProjectFiles(input: unknown): GeneratedProjectFile[] {
  let serializedProject: string;
  let project: ProjectDocument;

  try {
    serializedProject = serializeProject(input as ProjectDocument, { indentation: 2 });
    project = deserializeProject(serializedProject);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Project document is invalid: ${error.message}`
        : "Project document is invalid.",
    );
  }

  if (project.flows.length === 0) {
    throw new Error(
      "Project does not contain a flow, so a runnable bot cannot be generated. Add a flow with a Start node first.",
    );
  }

  for (const flow of project.flows) {
    for (const node of flow.nodes) {
      if (!GENERATOR_SUPPORTED_NODE_TYPES.has(node.type)) {
        throw new Error(
          `Code generator does not support node type "${node.type}" in flow "${flow.name}" (node "${node.id}"). The node was not omitted.`,
        );
      }
    }

    const validation = validateFlow(flow);
    if (!validation.valid) {
      const details = validation.issues
        .map((issue) => `${issue.code}: ${issue.message}`)
        .join("\n");
      throw new Error(
        `Flow "${flow.name}" must pass flow-engine validation before source export.\n${details}`,
      );
    }
  }

  if (!/^[A-Z_][A-Z0-9_]*$/.test(project.bot.tokenEnvVar)) {
    throw new Error("The Telegram token environment-variable name is invalid.");
  }

  const context = createGeneratorContext(project, serializedProject);
  const templates = renderGeneratorTemplates(context);
  return assembleGeneratedProject({ serializedProject, templates });
}
