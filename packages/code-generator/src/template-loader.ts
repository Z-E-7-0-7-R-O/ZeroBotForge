import packageJsonTemplate from "./templates/package.json.tpl?raw";
import tsconfigTemplate from "./templates/tsconfig.json.tpl?raw";
import envExampleTemplate from "./templates/env.example.tpl?raw";
import botTemplate from "./templates/bot.ts.tpl?raw";
import handlersTemplate from "./templates/handlers.ts.tpl?raw";
import readmeTemplate from "./templates/README.md.tpl?raw";
import type { GeneratorContext } from "./generator-context";

export const GENERATOR_TEMPLATE_NAMES = [
  "package.json",
  "tsconfig.json",
  ".env.example",
  "bot.ts",
  "handlers.ts",
  "README.md",
] as const;

export type GeneratorTemplateName = (typeof GENERATOR_TEMPLATE_NAMES)[number];

const TEMPLATE_SOURCES: Record<GeneratorTemplateName, string> = {
  "package.json": packageJsonTemplate,
  "tsconfig.json": tsconfigTemplate,
  ".env.example": envExampleTemplate,
  "bot.ts": botTemplate,
  "handlers.ts": handlersTemplate,
  "README.md": readmeTemplate,
};

const PLACEHOLDER_PATTERN = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

export interface RenderedGeneratorTemplates {
  packageJson: string;
  tsconfigJson: string;
  envExample: string;
  botTs: string;
  handlersTs: string;
  readmeMd: string;
}

export function renderGeneratorTemplate(
  name: GeneratorTemplateName,
  context: GeneratorContext,
): string {
  const template = TEMPLATE_SOURCES[name];
  if (typeof template !== "string" || template.length === 0) {
    throw new Error(`Generator template "${name}" is missing or empty.`);
  }

  const rendered = template.replace(PLACEHOLDER_PATTERN, (_match, key: string) => {
    const value = context[key as keyof GeneratorContext];
    if (typeof value !== "string") {
      throw new Error(`Generator template "${name}" requires an unknown context value "${key}".`);
    }
    return value;
  });

  const unresolved = rendered.match(/\{\{[^{}]+\}\}/);
  if (unresolved) {
    throw new Error(`Generator template "${name}" contains an unresolved placeholder.`);
  }

  const normalizedLineEndings = rendered.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalizedLineEndings.endsWith("\n")
    ? normalizedLineEndings
    : `${normalizedLineEndings}\n`;
}

export function renderGeneratorTemplates(
  context: GeneratorContext,
): RenderedGeneratorTemplates {
  return {
    packageJson: renderGeneratorTemplate("package.json", context),
    tsconfigJson: renderGeneratorTemplate("tsconfig.json", context),
    envExample: renderGeneratorTemplate(".env.example", context),
    botTs: renderGeneratorTemplate("bot.ts", context),
    handlersTs: renderGeneratorTemplate("handlers.ts", context),
    readmeMd: renderGeneratorTemplate("README.md", context),
  };
}
