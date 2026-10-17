import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Telegraf } from "telegraf";
import { registerProjectHandlers } from "./handlers.js";
import type { ProjectDocument } from "./handlers.js";

const tokenEnvironmentVariable: string = {{TOKEN_ENV_VAR_JSON}};

async function main(): Promise<void> {
  const token = process.env[tokenEnvironmentVariable]?.trim();
  if (!token) {
    throw new Error(
      `${tokenEnvironmentVariable} is missing. Copy .env.example to .env and set your Telegram bot token.`,
    );
  }

  // The generated project is self-contained. Run npm scripts from its root directory.
  const projectPath = resolve(process.cwd(), "project.json");
  const project = JSON.parse(await readFile(projectPath, "utf8")) as ProjectDocument;
  if (!Array.isArray(project.flows) || project.flows.length === 0) {
    throw new Error("project.json does not contain a flow to run.");
  }

  const bot = new Telegraf(token);
  registerProjectHandlers(bot, project);
  bot.catch((error) => {
    // Never print the bot token or the full Telegram update payload.
    console.error(
      "Telegram update failed:",
      error instanceof Error ? error.message : "unknown error",
    );
  });

  await bot.launch();
  console.log(`Bot started for project: ${project.name}`);
}

process.once("SIGINT", () => process.exit(0));
process.once("SIGTERM", () => process.exit(0));

void main().catch((error: unknown) => {
  console.error(
    "Bot startup failed:",
    error instanceof Error ? error.message : "unknown error",
  );
  process.exitCode = 1;
});
