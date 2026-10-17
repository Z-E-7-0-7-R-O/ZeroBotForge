import type { RenderedGeneratorTemplates } from "./template-loader";

export interface GeneratedProjectFile {
  path: string;
  content: string;
}

export interface OutputAssemblerInput {
  serializedProject: string;
  templates: RenderedGeneratorTemplates;
}

const OUTPUT_MANIFEST = [
  "package.json",
  "tsconfig.json",
  ".env.example",
  "project.json",
  "src/bot.ts",
  "src/handlers.ts",
  "README.md",
] as const;

const ALLOWED_OUTPUT_PATHS = new Set<string>(OUTPUT_MANIFEST);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const TELEGRAM_TOKEN_PATTERN = /\b\d{6,12}:[A-Za-z0-9_-]{25,}\b/;

function validateRelativeOutputPath(path: string): void {
  if (
    !ALLOWED_OUTPUT_PATHS.has(path) ||
    path.includes("\\") ||
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    path.split("/").some((segment) => segment === ".." || segment === "." || segment.length === 0)
  ) {
    throw new Error(`Generated output path "${path}" is not in the fixed output manifest.`);
  }
}

function validateGeneratedContent(files: readonly GeneratedProjectFile[]): void {
  let totalBytes = 0;

  for (const file of files) {
    validateRelativeOutputPath(file.path);
    if (typeof file.content !== "string") {
      throw new Error(`Generated output "${file.path}" does not contain text content.`);
    }

    const bytes = new TextEncoder().encode(file.content).byteLength;
    if (bytes > MAX_FILE_BYTES) {
      throw new Error(`Generated output "${file.path}" exceeds the 2 MB file limit.`);
    }

    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error("The generated project exceeds the 8 MB total output limit.");
    }

    if (TELEGRAM_TOKEN_PATTERN.test(file.content)) {
      throw new Error(
        "Generated output contains a value matching a Telegram bot token pattern. Remove credentials from project content before exporting.",
      );
    }
  }
}

/**
 * Assembles the complete, fixed output manifest in memory. No file is exposed
 * to Electron for writing unless the entire manifest passes validation.
 */
export function assembleGeneratedProject(
  input: OutputAssemblerInput,
): GeneratedProjectFile[] {
  const candidates: GeneratedProjectFile[] = [
    { path: "package.json", content: input.templates.packageJson },
    { path: "tsconfig.json", content: input.templates.tsconfigJson },
    { path: ".env.example", content: input.templates.envExample },
    { path: "project.json", content: input.serializedProject },
    { path: "src/bot.ts", content: input.templates.botTs },
    { path: "src/handlers.ts", content: input.templates.handlersTs },
    { path: "README.md", content: input.templates.readmeMd },
  ];

  const seen = new Set<string>();
  for (const file of candidates) {
    const key = file.path.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Generated output path "${file.path}" is duplicated.`);
    }
    seen.add(key);
  }

  if (candidates.length !== OUTPUT_MANIFEST.length) {
    throw new Error("Generated project output is incomplete; no files have been written.");
  }

  for (const requiredPath of OUTPUT_MANIFEST) {
    if (!seen.has(requiredPath.toLowerCase())) {
      throw new Error(`Generated project output is missing required file "${requiredPath}".`);
    }
  }

  // Fail before returning if either JSON manifest would be invalid.
  try {
    JSON.parse(candidates.find((file) => file.path === "package.json")!.content);
    JSON.parse(candidates.find((file) => file.path === "tsconfig.json")!.content);
    JSON.parse(input.serializedProject);
  } catch (error) {
    throw new Error(
      `Generated project contains invalid JSON: ${error instanceof Error ? error.message : "unknown JSON error"}`,
    );
  }

  validateGeneratedContent(candidates);
  return OUTPUT_MANIFEST.map((path) => candidates.find((file) => file.path === path)!);
}
