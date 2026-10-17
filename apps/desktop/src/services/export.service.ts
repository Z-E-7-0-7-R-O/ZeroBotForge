import { generateProjectFiles } from "@zerobotforge/code-generator";
import type { ProjectDocumentDto, ExportGeneratedProjectResult, ExportProjectResult } from "../types/electron-api";
import { projectService } from "./project.service";
import { telegramService } from "./telegram.service";

export interface ExportServiceResult<T> {
  cancelled: boolean;
  result: T | null;
}

/** Export only the validated project document as JSON. Cancellation is not treated as a failure. */
export async function exportProjectJson(document: ProjectDocumentDto): Promise<ExportServiceResult<ExportProjectResult>> {
  const result = await projectService.exportProjectJson(document);
  return { cancelled: result === null, result };
}

/** Generate source files in memory, then ask Electron to write them into a user-selected folder. */
export async function exportGeneratedProject(document: ProjectDocumentDto): Promise<ExportServiceResult<ExportGeneratedProjectResult>> {
  const flushedDocument = projectService.getFlushableProjectDocument(document);
  const files = generateProjectFiles(flushedDocument);
  const result = await projectService.exportGeneratedProject(flushedDocument.name, files);
  if (result) {
    await telegramService.getRuntimeStatus({ checkTelegram: false }).catch(() => null);
  }
  return { cancelled: result === null, result };
}

/** Regenerate all project source files with the latest flow changes and overwrite them in the active generated directory. */
export async function updateGeneratedProject(
  document: ProjectDocumentDto,
  directoryPath?: string,
): Promise<ExportGeneratedProjectResult> {
  const flushedDocument = projectService.getFlushableProjectDocument(document);
  const files = generateProjectFiles(flushedDocument);
  const result = await projectService.updateGeneratedProject(
    flushedDocument.name,
    files,
    directoryPath,
  );
  await telegramService.getRuntimeStatus({ checkTelegram: false }).catch(() => null);
  return result;
}