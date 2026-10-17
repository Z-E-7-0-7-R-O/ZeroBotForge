import type { FlowDefinition } from "@zerobotforge/flow-engine";
import {
  createEmptyEditorFlow,
  toEngineFlow,
  toProjectFlow,
} from "../components/flow/flow-editor.model";
import { getFlowStoreSnapshot, synchronizeActiveFlow } from "../store/flow.store";
import {
  getProjectStoreSnapshot,
  markProjectSaved,
  setProjectSession,
  setProjectStoreStatus,
} from "../store/project.store";
import type {
  DesktopApi,
  DesktopApiResult,
  ExportGeneratedProjectResult,
  ExportProjectResult,
  GeneratedProjectFile,
  ProjectDocumentDto,
  ProjectSession,
} from "../types/electron-api";

function getDesktopApi(): DesktopApi {
  if (typeof window === "undefined" || !window.zeroBotForge) {
    throw new Error(
      "The ZeroBotForge desktop API is only available inside the Electron desktop shell.",
    );
  }
  return window.zeroBotForge;
}

function unwrapDesktopResult<T>(
  response: DesktopApiResult<T>,
  fallbackMessage: string,
): T {
  if (!response.ok) {
    throw new Error(response.error.message || fallbackMessage);
  }
  return response.data;
}

export function getPrimaryEngineFlow(document: ProjectDocumentDto): FlowDefinition {
  const matchingActive = document.activeFlowId
    ? document.flows.find((flow) => flow.id === document.activeFlowId)
    : undefined;
  const targetFlow = matchingActive ?? document.flows[0];
  if (targetFlow) {
    return toEngineFlow(targetFlow);
  }
  return createEmptyEditorFlow(`${document.name} Flow`);
}

function mergeActiveFlowIntoDocument(
  document: ProjectDocumentDto,
  activeFlow: FlowDefinition | null,
): ProjectDocumentDto {
  if (!activeFlow) {
    return document;
  }
  const nextFlow = toProjectFlow(activeFlow);
  const existingIndex = document.flows.findIndex((flow) => flow.id === nextFlow.id);
  const nextFlows =
    existingIndex >= 0
      ? document.flows.map((flow, index) =>
          index === existingIndex ? nextFlow : flow,
        )
      : [nextFlow, ...document.flows];
  return {
    ...document,
    activeFlowId: nextFlow.id,
    updatedAt: new Date().toISOString(),
    flows: nextFlows,
  };
}

export const projectService = {
  async createProject(name: string): Promise<ProjectSession> {
    setProjectStoreStatus("loading");
    try {
      const session = unwrapDesktopResult(
        await getDesktopApi().projects.create({ name }),
        "Project creation failed.",
      );
      setProjectSession(session, { dirty: false });
      synchronizeActiveFlow(getPrimaryEngineFlow(session.document));
      return session;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Project creation failed.";
      setProjectStoreStatus("error", message);
      throw error;
    }
  },

  async openProject(): Promise<ProjectSession | null> {
    setProjectStoreStatus("loading");
    try {
      const session = unwrapDesktopResult(
        await getDesktopApi().projects.open(),
        "Opening the project failed.",
      );
      if (!session) {
        setProjectStoreStatus(
          getProjectStoreSnapshot().session ? "ready" : "idle",
        );
        return null;
      }
      setProjectSession(session, { dirty: false });
      synchronizeActiveFlow(getPrimaryEngineFlow(session.document));
      return session;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Opening the project failed.";
      setProjectStoreStatus("error", message);
      throw error;
    }
  },

  async saveProject(
    sessionOverride?: ProjectSession,
  ): Promise<ProjectSession | null> {
    const currentSession = sessionOverride ?? getProjectStoreSnapshot().session;
    if (!currentSession) {
      throw new Error("Open or create a project before saving.");
    }
    const activeFlow = getFlowStoreSnapshot().activeFlow;
    const nextDocument = mergeActiveFlowIntoDocument(
      currentSession.document,
      activeFlow,
    );
    if (!currentSession.filePath) {
      return this.saveProjectAs(nextDocument);
    }
    setProjectStoreStatus("saving");
    try {
      const savedSession = unwrapDesktopResult(
        await getDesktopApi().projects.save({
          document: nextDocument,
        }),
        "Saving the project failed.",
      );
      if (!savedSession) {
        setProjectStoreStatus("ready");
        return null;
      }
      markProjectSaved(savedSession);
      synchronizeActiveFlow(getPrimaryEngineFlow(savedSession.document));
      return savedSession;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Saving the project failed.";
      setProjectStoreStatus("error", message);
      throw error;
    }
  },

  async saveProjectAs(
    documentOverride?: ProjectDocumentDto,
  ): Promise<ProjectSession | null> {
    const currentSession = getProjectStoreSnapshot().session;
    const baseDocument = documentOverride ?? currentSession?.document;
    if (!baseDocument) {
      throw new Error("Open or create a project before saving.");
    }
    const activeFlow = getFlowStoreSnapshot().activeFlow;
    const nextDocument = mergeActiveFlowIntoDocument(baseDocument, activeFlow);
    setProjectStoreStatus("saving");
    try {
      const savedSession = unwrapDesktopResult(
        await getDesktopApi().projects.saveAs({ document: nextDocument }),
        "Saving the project failed.",
      );
      if (!savedSession) {
        setProjectStoreStatus(currentSession ? "ready" : "idle");
        return null;
      }
      markProjectSaved(savedSession);
      synchronizeActiveFlow(getPrimaryEngineFlow(savedSession.document));
      return savedSession;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Saving the project failed.";
      setProjectStoreStatus("error", message);
      throw error;
    }
  },

  async exportProjectJson(
    documentOverride?: ProjectDocumentDto,
  ): Promise<ExportProjectResult | null> {
    const document = this.getFlushableProjectDocument(documentOverride);
    return unwrapDesktopResult(
      await getDesktopApi().exports.projectJson({ document }),
      "Exporting project JSON failed.",
    );
  },

  async exportGeneratedProject(
    projectName: string,
    files: GeneratedProjectFile[],
  ): Promise<ExportGeneratedProjectResult | null> {
    return unwrapDesktopResult(
      await getDesktopApi().exports.generatedProject({ projectName, files }),
      "Exporting generated project failed.",
    );
  },

  async updateGeneratedProject(
    projectName: string,
    files: GeneratedProjectFile[],
    directoryPath?: string,
  ): Promise<ExportGeneratedProjectResult> {
    return unwrapDesktopResult(
      await getDesktopApi().exports.updateGeneratedProject({
        projectName,
        files,
        ...(directoryPath ? { directoryPath } : {}),
      }),
      "Updating the generated bot project failed.",
    );
  },

  synchronizeSession(session: ProjectSession | null): void {
    setProjectSession(session, { dirty: false });
    synchronizeActiveFlow(
      session ? getPrimaryEngineFlow(session.document) : null,
    );
  },

  getFlushableProjectDocument(
    documentOverride?: ProjectDocumentDto,
  ): ProjectDocumentDto {
    const baseDocument =
      documentOverride ?? getProjectStoreSnapshot().session?.document;
    if (!baseDocument) {
      throw new Error("No active project is loaded.");
    }
    return mergeActiveFlowIntoDocument(
      baseDocument,
      getFlowStoreSnapshot().activeFlow,
    );
  },
};