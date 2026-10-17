import { useEffect, useState } from "react";
import { Activity, ArrowRight, Bot, MessageSquare } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import type { NavigationPage } from "../components/layout/Sidebar";
import {
  CreateProjectDialog,
  type CreateProjectDetails,
} from "../features/projects/CreateProjectDialog";
import { ProjectList } from "../features/projects/ProjectList";
import { useProjects } from "../features/projects/useProjects";
import { useNotifications } from "../hooks/useNotifications";
import { useProject } from "../hooks/useProject";
import {
  exportGeneratedProject,
  exportProjectJson,
  updateGeneratedProject,
} from "../services/export.service";
import { telegramService } from "../services/telegram.service";
import { useAppStore } from "../store/app.store";
import { synchronizeActiveFlow } from "../store/flow.store";
import type { ProjectSession } from "../types/electron-api";

export interface DashboardPageProps {
  activePage: NavigationPage;
  onNavigate: (page: NavigationPage) => void;
  session: ProjectSession | null;
  onSessionChange: (session: ProjectSession | null) => void;
  onCreateProject: (name: string) => Promise<ProjectSession | null>;
  onOpenProject: () => Promise<ProjectSession | null>;
  onSaveProject: () => Promise<void>;
}

export function DashboardPage({
  activePage,
  onNavigate,
  session,
  onSessionChange,
  onCreateProject,
  onOpenProject,
  onSaveProject,
}: DashboardPageProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [openBotBusy, setOpenBotBusy] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [compileBusy, setCompileBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const { runtimeStatus } = useAppStore();
  const { notifications, notify, dismissNotification } = useNotifications();
  const { isDirty, saveAsProject: saveAsProjectService } = useProject();

  useEffect(() => {
    void telegramService.getRuntimeStatus({ checkTelegram: false }).catch(() => null);
  }, []);

  const {
    busy,
    createProject,
    openProject,
    saveProject,
    saveAsProject,
    closeProject,
  } = useProjects({
    onCreateProject,
    onOpenProject,
    onSaveProject,
    onSaveAsProject: () => saveAsProjectService(),
    onSessionChange,
  });

  const handleCreate = async (name: string, details?: CreateProjectDetails) => {
    const created = await createProject(name, details);
    if (created) {
      setCreateDialogOpen(false);
      notify({
        type: "success",
        title: "Project created",
        message: `“${created.document.name}” is now the active project.`,
      });
    }
  };

  const handleOpen = async () => {
    try {
      const opened = await openProject();
      if (opened) {
        notify({
          type: "success",
          title: "Project opened",
          message: `Loaded “${opened.document.name}”.`,
        });
      }
    } catch (error) {
      notify({
        type: "error",
        title: "Project could not be opened",
        message:
          error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    }
  };

  const handleSave = async () => {
    try {
      await saveProject();
      notify({
        type: "success",
        title: "Project saved",
        message: "The active project was saved through the desktop project service.",
      });
    } catch (error) {
      notify({
        type: "error",
        title: "Project could not be saved",
        message:
          error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    }
  };

  const handleSaveAs = async () => {
    try {
      const saved = await saveAsProject();
      if (saved) {
        notify({
          type: "success",
          title: "Project saved to new path",
          message: saved.filePath ?? saved.document.name,
        });
      }
    } catch (error) {
      notify({
        type: "error",
        title: "Save As failed",
        message:
          error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    }
  };

  const handleCloseProject = async () => {
    const closedName = session?.document.name ?? "Project";
    await closeProject();
    synchronizeActiveFlow(null);
    notify({
      type: "info",
      title: "Project closed",
      message: `“${closedName}” was removed from the active workspace session.`,
    });
  };

  const handleExportJson = async () => {
    if (!session) return;
    try {
      const outcome = await exportProjectJson(session.document);
      if (outcome.cancelled) {
        notify({
          type: "info",
          title: "Export cancelled",
          message: "No JSON file was written.",
        });
      } else if (outcome.result) {
        notify({
          type: "success",
          title: "Project JSON exported",
          message: outcome.result.filePath,
        });
      }
    } catch (error) {
      notify({
        type: "error",
        title: "JSON export failed",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected export error occurred.",
      });
    }
  };

  const handleOpenGeneratedProject = async () => {
    setOpenBotBusy(true);
    try {
      const openedStatus = await telegramService.openGeneratedProject();
      if (!openedStatus) {
        notify({
          type: "info",
          title: "Selection cancelled",
          message: "No bot project directory was selected.",
        });
        return;
      }
      notify({
        type: "success",
        title: "Bot project linked",
        message: openedStatus.isCompiled
          ? `Linked ${openedStatus.directoryPath}. Build artifact verified — Compile and Run are unlocked.`
          : `Linked ${openedStatus.directoryPath}. Click Compile to build the bot.`,
      });
    } catch (error) {
      notify({
        type: "error",
        title: "Could not open bot project",
        message:
          error instanceof Error
            ? error.message
            : "Failed to link the selected bot project folder.",
      });
    } finally {
      setOpenBotBusy(false);
    }
  };

  const handleExportGeneratedProject = async () => {
    if (!session) return;
    setGenerateBusy(true);
    try {
      const outcome = await exportGeneratedProject(session.document);
      if (outcome.cancelled) {
        notify({
          type: "info",
          title: "Export cancelled",
          message: "No generated project files were written.",
        });
      } else if (outcome.result) {
        notify({
          type: "success",
          title: "Bot project generated",
          message: `${outcome.result.filesWritten} files written to ${outcome.result.directoryPath}. Compile is now unlocked.`,
        });
      }
    } catch (error) {
      notify({
        type: "error",
        title: "Source generation failed",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected generation error occurred.",
      });
    } finally {
      setGenerateBusy(false);
    }
  };

  const handleUpdateGeneratedProject = async () => {
    if (!session || !runtimeStatus?.isGenerated) return;
    setUpdateBusy(true);
    try {
      const updated = await updateGeneratedProject(
        session.document,
        runtimeStatus.directoryPath ?? undefined,
      );
      notify({
        type: "success",
        title: "Bot project updated",
        message: `Updated ${updated.filesWritten} source files in ${updated.directoryPath}. Run Compile to rebuild.`,
      });
    } catch (error) {
      notify({
        type: "error",
        title: "Project update failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not update the generated bot project.",
      });
    } finally {
      setUpdateBusy(false);
    }
  };

  const handleDeleteGeneratedProject = async () => {
    if (!runtimeStatus?.isGenerated) return;
    const deletedDir = runtimeStatus.directoryPath ?? "generated folder";
    setDeleteBusy(true);
    try {
      await telegramService.deleteGeneratedProject(
        runtimeStatus.directoryPath ?? undefined,
      );
      notify({
        type: "info",
        title: "Generated bot project deleted",
        message: `Removed ${deletedDir} from disk.`,
      });
    } catch (error) {
      notify({
        type: "error",
        title: "Project deletion failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not delete the generated bot project.",
      });
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleCompileProject = async () => {
    setCompileBusy(true);
    try {
      const status = await telegramService.compileGeneratedProject(
        runtimeStatus?.directoryPath ?? undefined,
      );
      notify({
        type: "success",
        title: "Project compiled",
        message: `Dependencies installed and dist/bot.js built in ${status.directoryName ?? "generated folder"}. Run is now unlocked.`,
      });
    } catch (error) {
      notify({
        type: "error",
        title: "Compilation failed",
        message:
          error instanceof Error ? error.message : "Compilation failed.",
      });
    } finally {
      setCompileBusy(false);
    }
  };

  const handleRunProject = async () => {
    if (runtimeStatus?.isRunning) {
      onNavigate("Run");
      return;
    }
    setRunBusy(true);
    try {
      await telegramService.startBotRuntime(
        runtimeStatus?.directoryPath ?? undefined,
      );
      onNavigate("Run");
    } catch (error) {
      notify({
        type: "error",
        title: "Bot startup failed",
        message:
          error instanceof Error ? error.message : "Could not start the bot.",
      });
    } finally {
      setRunBusy(false);
    }
  };

  const flowCount = session?.document.flows.length ?? 0;
  const nodeCount =
    session?.document.flows.reduce((sum, flow) => sum + flow.nodes.length, 0) ?? 0;

  return (
    <>
      <AppLayout
        activePage={activePage}
        onNavigate={onNavigate}
        onSettingsClick={() => onNavigate("Settings")}
        settingsOpen={false}
        notifications={notifications}
        onDismissNotification={dismissNotification}
      >
        <div className="p6-page">
          <div className="page-heading p6-page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" /> WORKSPACE OVERVIEW
              </div>
              <h1>Dashboard</h1>
              <p className="page-subtitle">
                Create a project or continue with a real project file.
              </p>
            </div>
            <div className="heading-actions">
              <button
                type="button"
                className="button-secondary"
                disabled={busy}
                onClick={() => void handleOpen()}
              >
                Open project
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={busy}
                onClick={() => setCreateDialogOpen(true)}
              >
                New project
              </button>
            </div>
          </div>

          <ProjectList
            session={session}
            isDirty={isDirty}
            busy={busy}
            isGenerated={Boolean(runtimeStatus?.isGenerated)}
            isCompiled={Boolean(runtimeStatus?.isCompiled)}
            isRunning={Boolean(runtimeStatus?.isRunning)}
            openBotBusy={openBotBusy}
            generateBusy={generateBusy}
            updateBusy={updateBusy}
            deleteBusy={deleteBusy}
            compileBusy={compileBusy || runtimeStatus?.state === "compiling"}
            runBusy={runBusy || runtimeStatus?.state === "starting"}
            onOpenProject={handleOpen}
            onCreateProject={() => setCreateDialogOpen(true)}
            onSaveProject={handleSave}
            onSaveAsProject={handleSaveAs}
            onCloseProject={handleCloseProject}
            onExportJson={handleExportJson}
            onOpenGeneratedProject={handleOpenGeneratedProject}
            onExportGeneratedProject={handleExportGeneratedProject}
            onUpdateGeneratedProject={handleUpdateGeneratedProject}
            onDeleteGeneratedProject={handleDeleteGeneratedProject}
            onCompileProject={handleCompileProject}
            onRunProject={handleRunProject}
          />

          {session ? (
            <>
              <section className="p6-stat-grid" aria-label="Active project summary">
                <article className="p6-stat-card">
                  <span className="p6-stat-icon">
                    <Bot size={18} aria-hidden="true" />
                  </span>
                  <span className="p6-stat-label">Flows</span>
                  <strong>{flowCount}</strong>
                  <small>Stored in this project</small>
                </article>

                <article className="p6-stat-card">
                  <span className="p6-stat-icon">
                    <Activity size={18} aria-hidden="true" />
                  </span>
                  <span className="p6-stat-label">Flow nodes</span>
                  <strong>{nodeCount}</strong>
                  <small>Persisted node definitions</small>
                </article>

                <article className="p6-stat-card">
                  <span className="p6-stat-icon">
                    <MessageSquare size={18} aria-hidden="true" />
                  </span>
                  <span className="p6-stat-label">Conversations</span>
                  <strong>—</strong>
                  <small>No conversation repository is connected</small>
                </article>
              </section>

              <section className="p6-panel">
                <div className="p6-panel-heading">
                  <div>
                    <h2>Continue working</h2>
                    <p>
                      Open the editor or review features that still need a real data
                      source.
                    </p>
                  </div>
                </div>

                <div className="p6-link-grid">
                  <button
                    type="button"
                    className="p6-link-card"
                    onClick={() => onNavigate("Bot")}
                  >
                    <span className="p6-link-icon">
                      <Bot size={20} aria-hidden="true" />
                    </span>
                    <span>
                      <strong>Bot Builder</strong>
                      <small>
                        Edit the active project flow, validate it, preview execution, and
                        save changes.
                      </small>
                    </span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    className="p6-link-card"
                    onClick={() => onNavigate("Conversations")}
                  >
                    <span className="p6-link-icon">
                      <MessageSquare size={20} aria-hidden="true" />
                    </span>
                    <span>
                      <strong>Conversations</strong>
                      <small>
                        Review whether a real conversation source is available.
                      </small>
                    </span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    className="p6-link-card"
                    onClick={() => onNavigate("Analytics")}
                  >
                    <span className="p6-link-icon">
                      <Activity size={20} aria-hidden="true" />
                    </span>
                    <span>
                      <strong>Analytics</strong>
                      <small>
                        View actual source availability without fabricated metrics.
                      </small>
                    </span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                </div>
              </section>
            </>
          ) : (
            <p className="p6-footnote">
              The desktop API exposes create/open/save for a single active project. No
              recent-project catalogue is available, so a multi-project list is not
              fabricated.
            </p>
          )}
        </div>
      </AppLayout>

      <CreateProjectDialog
        open={createDialogOpen}
        busy={busy}
        onCancel={() => setCreateDialogOpen(false)}
        onCreate={handleCreate}
      />
    </>
  );
}

export default DashboardPage;