import { useCallback, useSyncExternalStore } from "react";
import {
  getPrimaryEngineFlow,
  projectService,
} from "../services/project.service";
import { synchronizeActiveFlow } from "../store/flow.store";
import {
  getProjectStoreSnapshot,
  subscribeProjectStore,
  updateProjectDocument,
} from "../store/project.store";
import type { ProjectDocumentDto, ProjectSession } from "../types/electron-api";

export function useProject() {
  const snapshot = useSyncExternalStore(
    subscribeProjectStore,
    getProjectStoreSnapshot,
    getProjectStoreSnapshot,
  );

  const createProject = useCallback(async (name: string): Promise<ProjectSession> => {
    return projectService.createProject(name);
  }, []);

  const openProject = useCallback(async (): Promise<ProjectSession | null> => {
    return projectService.openProject();
  }, []);

  const saveProject = useCallback(
    async (sessionOverride?: ProjectSession): Promise<ProjectSession | null> => {
      return projectService.saveProject(sessionOverride);
    },
    [],
  );

  const saveProjectAs = useCallback(
    async (documentOverride?: ProjectDocumentDto): Promise<ProjectSession | null> => {
      return projectService.saveProjectAs(documentOverride);
    },
    [],
  );

  const saveCurrentProject = useCallback(async (): Promise<void> => {
    await projectService.saveProject();
  }, []);

  const setSession = useCallback((session: ProjectSession | null): void => {
    projectService.synchronizeSession(session);
  }, []);

  const updateDocument = useCallback((document: ProjectDocumentDto): void => {
    updateProjectDocument(document, { dirty: true });
    synchronizeActiveFlow(getPrimaryEngineFlow(document));
  }, []);

  return {
    ...snapshot,
    createProject,
    openProject,
    saveProject,
    saveProjectAs,
    saveAsProject: saveProjectAs,
    saveCurrentProject,
    setSession,
    updateDocument,
  };
}

export default useProject;