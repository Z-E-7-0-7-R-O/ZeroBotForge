import type { ProjectDocument } from "@zerobotforge/project-format";

export interface GeneratorContext {
  PACKAGE_NAME_JSON: string;
  MODULE_TYPE_JSON: string;
  NODE_ENGINE_RANGE_JSON: string;
  STRICT_MODE_JSON: string;
  TOKEN_ENV_VAR: string;
  TOKEN_ENV_VAR_JSON: string;
  PROJECT_NAME_MARKDOWN: string;
  NODE_VERSION: string;
  PACKAGE_MANAGER: string;
  INSTALL_COMMAND: string;
  PROJECT_JSON: string;
}

function toPackageName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "zerobotforge-bot";
}

function escapeMarkdownText(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}\[\]()#+.!|>~-])/g, "\\$1");
}

function packageManagerInstallCommand(
  packageManager: ProjectDocument["generation"]["packageManager"],
): string {
  switch (packageManager) {
    case "pnpm":
      return "pnpm install";
    case "yarn":
      return "yarn install";
    case "npm":
      return "npm install";
  }
}

/**
 * Converts user-controlled project data to values with explicit output-context
 * escaping. Values interpolated into JSON or TypeScript source are JSON strings,
 * not untrusted raw source fragments.
 */
export function createGeneratorContext(
  project: ProjectDocument,
  serializedProject: string,
): GeneratorContext {
  const tokenEnvironmentVariable = project.bot.tokenEnvVar;
  const nodeVersion = project.generation.nodeVersion;
  const moduleType = project.generation.moduleFormat === "esm" ? "module" : "commonjs";

  return {
    PACKAGE_NAME_JSON: JSON.stringify(toPackageName(project.name)),
    MODULE_TYPE_JSON: JSON.stringify(moduleType),
    NODE_ENGINE_RANGE_JSON: JSON.stringify(`>=${nodeVersion}.0.0`),
    STRICT_MODE_JSON: JSON.stringify(project.generation.strict),
    TOKEN_ENV_VAR: tokenEnvironmentVariable,
    TOKEN_ENV_VAR_JSON: JSON.stringify(tokenEnvironmentVariable),
    PROJECT_NAME_MARKDOWN: escapeMarkdownText(project.name),
    NODE_VERSION: String(nodeVersion),
    PACKAGE_MANAGER: project.generation.packageManager,
    INSTALL_COMMAND: packageManagerInstallCommand(project.generation.packageManager),
    PROJECT_JSON: serializedProject,
  };
}
