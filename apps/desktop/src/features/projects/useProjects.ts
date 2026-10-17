import { useCallback, useState } from "react";
import type { ProjectSession } from "../../types/electron-api";
import type { CreateProjectDetails } from "./CreateProjectDialog";

export interface UseProjectsOptions {
  onCreateProject: (name: string) => Promise<ProjectSession | null>;
  onOpenProject: () => Promise<ProjectSession | null>;
  onSaveProject: () => Promise<void>;
  onSaveAsProject?: () => Promise<ProjectSession | null>;
  onSessionChange: (session: ProjectSession | null) => void;
}

/**
 * Page-level orchestration for project create, open, save, save-as, and close operations.
 * Persistent I/O remains delegated to projectService and useProject.
 */
export function useProjects(options: UseProjectsOptions) {
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  const createProject = useCallback(
    async (
      name: string,
      details?: CreateProjectDetails,
    ): Promise<ProjectSession | null> => {
      setBusy(true);
      setOperationError(null);
      try {
        const session = await options.onCreateProject(name);
        if (!session) {
          return null;
        }

        const hasCustomMetadata = Boolean(details?.description?.trim());
        const hasCustomBotName = Boolean(details?.botDisplayName?.trim());

        const enrichedSession: ProjectSession =
          hasCustomMetadata || hasCustomBotName
            ? {
                ...session,
                document: {
                  ...session.document,
                  metadata: {
                    ...session.document.metadata,
                    ...(details?.description?.trim()
                      ? { description: details.description.trim() }
                      : {}),
                  },
                  bot: {
                    ...session.document.bot,
                    ...(details?.botDisplayName?.trim()
                      ? { displayName: details.botDisplayName.trim() }
                      : {}),
                  },
                },
              }
            : session;

        options.onSessionChange(enrichedSession);
        return enrichedSession;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Project creation failed.";
        setOperationError(message);
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [options],
  );

  const openProject = useCallback(async (): Promise<ProjectSession | null> => {
    setBusy(true);
    setOperationError(null);
    try {
      const session = await options.onOpenProject();
      if (session) {
        options.onSessionChange(session);
      }
      return session;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Project opening failed.";
      setOperationError(message);
      throw error;
    } finally {
      setBusy(false);
    }
  }, [options]);

  const saveProject = useCallback(async (): Promise<void> => {
    setBusy(true);
    setOperationError(null);
    try {
      await options.onSaveProject();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Project saving failed.";
      setOperationError(message);
      throw error;
    } finally {
      setBusy(false);
    }
  }, [options]);

  const saveAsProject = useCallback(async (): Promise<ProjectSession | null> => {
    if (!options.onSaveAsProject) {
      return null;
    }
    setBusy(true);
    setOperationError(null);
    try {
      const saved = await options.onSaveAsProject();
      if (saved) {
        options.onSessionChange(saved);
      }
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save As failed.";
      setOperationError(message);
      throw error;
    } finally {
      setBusy(false);
    }
  }, [options]);

  const closeProject = useCallback(async (): Promise<void> => {
    setBusy(true);
    setOperationError(null);
    try {
      options.onSessionChange(null);
    } finally {
      setBusy(false);
    }
  }, [options]);

  return {
    busy,
    operationError,
    createProject,
    openProject,
    saveProject,
    saveAsProject,
    closeProject,
  };
}