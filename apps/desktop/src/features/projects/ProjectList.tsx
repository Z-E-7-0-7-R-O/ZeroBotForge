import { useState } from "react";
import {
  FileCheck2,
  FolderCode,
  FolderOpen,
  FolderPlus,
  Hammer,
  Play,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import EmptyState from "../../components/common/EmptyState";
import type { ProjectSession } from "../../types/electron-api";

export interface ProjectListProps {
  session: ProjectSession | null;
  isDirty?: boolean;
  busy?: boolean;
  isGenerated?: boolean;
  isCompiled?: boolean;
  isRunning?: boolean;
  openBotBusy?: boolean;
  generateBusy?: boolean;
  updateBusy?: boolean;
  deleteBusy?: boolean;
  compileBusy?: boolean;
  runBusy?: boolean;
  onOpenProject: () => Promise<void> | void;
  onCreateProject: () => void;
  onSaveProject: () => Promise<void> | void;
  onSaveAsProject?: () => Promise<void> | void;
  onCloseProject?: () => Promise<void> | void;
  onExportJson: () => Promise<void> | void;
  onOpenGeneratedProject?: () => Promise<void> | void;
  onExportGeneratedProject: () => Promise<void> | void;
  onUpdateGeneratedProject?: () => Promise<void> | void;
  onDeleteGeneratedProject?: () => Promise<void> | void;
  onCompileProject?: () => Promise<void> | void;
  onRunProject?: () => Promise<void> | void;
}

export function ProjectList({
  session,
  isDirty = false,
  busy = false,
  isGenerated = false,
  isCompiled = false,
  isRunning = false,
  openBotBusy = false,
  generateBusy = false,
  updateBusy = false,
  deleteBusy = false,
  compileBusy = false,
  runBusy = false,
  onOpenProject,
  onCreateProject,
  onSaveProject,
  onSaveAsProject,
  onCloseProject,
  onExportJson,
  onOpenGeneratedProject,
  onExportGeneratedProject,
  onUpdateGeneratedProject,
  onDeleteGeneratedProject,
  onCompileProject,
  onRunProject,
}: ProjectListProps) {
  const anyProcessBusy =
    busy ||
    openBotBusy ||
    generateBusy ||
    updateBusy ||
    deleteBusy ||
    compileBusy ||
    runBusy;
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  if (!session) {
    return (
      <section className="p8-project-list p6-panel" aria-label="Workspace project status">
        <EmptyState
          icon={<FolderOpen size={24} />}
          title="No active project"
          description="Create a new project or open an existing .zbf / JSON project file from disk."
        />
        <div className="p8-project-actions">
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={() => void onOpenProject()}
          >
            <FolderOpen size={16} aria-hidden="true" /> Open project
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={busy}
            onClick={onCreateProject}
          >
            <FolderPlus size={16} aria-hidden="true" /> Create project
          </button>
        </div>
      </section>
    );
  }

  const descriptionText =
    session.document.metadata.description.trim() ||
    "No project description has been added.";

  return (
    <>
      <section className="p8-project-list p6-panel" aria-label="Active project">
        <div className="p8-project-main">
          <span className="p8-project-mark">
            <FileCheck2 size={23} aria-hidden="true" />
          </span>
          <div className="p8-project-details">
            <span className="p8-overline">ACTIVE PROJECT</span>
            <h2>{session.document.name}</h2>
            <p>{descriptionText}</p>
            <div className="p8-project-meta">
              <span className="p8-status-pill">
                <span />
                {isDirty ? " Unsaved changes in session" : " Active in this session"}
              </span>
              <span>{session.fileName ?? "Not saved to disk yet"}</span>
              <span>
                Bot: @{session.document.bot.username ?? session.document.bot.displayName}
              </span>
              <span>
                Target: Node {session.document.generation.nodeVersion} ·{" "}
                {session.document.generation.packageManager} (
                {session.document.generation.moduleFormat})
              </span>
            </div>
          </div>
        </div>

        <div className="p8-project-actions">
          <div className="p8-project-file-actions">
            <button
              type="button"
              className="button-secondary"
              disabled={anyProcessBusy}
              onClick={() => void onOpenProject()}
            >
              <FolderOpen size={16} aria-hidden="true" /> Open another
            </button>

            <button
              type="button"
              className="button-primary"
              disabled={anyProcessBusy}
              onClick={() => void onSaveProject()}
            >
              <Save size={16} aria-hidden="true" /> Save project
            </button>

            {onSaveAsProject && (
              <button
                type="button"
                className="button-secondary"
                disabled={anyProcessBusy}
                onClick={() => void onSaveAsProject()}
              >
                Save As
              </button>
            )}

            <button
              type="button"
              className="button-secondary"
              disabled={anyProcessBusy}
              onClick={() => void onExportJson()}
            >
              Export JSON
            </button>
          </div>

          <div className="p8-project-export-actions">
            {onOpenGeneratedProject && (
              <button
                type="button"
                className="button-secondary"
                disabled={anyProcessBusy || isRunning}
                onClick={() => void onOpenGeneratedProject()}
                title={
                  isRunning
                    ? "Stop the running bot before opening another bot project folder"
                    : "Select an existing generated bot project folder from disk"
                }
              >
                <FolderOpen size={15} aria-hidden="true" />
                {openBotBusy ? "Opening..." : "Open bot project"}
              </button>
            )}

            <button
              type="button"
              className="button-secondary"
              disabled={anyProcessBusy || isRunning}
              onClick={() => void onExportGeneratedProject()}
              title={
                isRunning
                  ? "Stop the running bot before generating a new project folder"
                  : "Generate standalone bot source files into a selected folder"
              }
            >
              <FolderCode size={15} aria-hidden="true" />
              {generateBusy ? "Generating..." : "Generate bot project"}
            </button>

            {onUpdateGeneratedProject && (
              <button
                type="button"
                className="button-secondary"
                disabled={anyProcessBusy || !isGenerated || isRunning}
                onClick={() => void onUpdateGeneratedProject()}
                title={
                  !isGenerated
                    ? "Generate the bot project first to unlock Update"
                    : isRunning
                      ? "Stop the running bot before updating project files"
                      : "Update the generated bot project files in-place with latest flow and node changes"
                }
              >
                <RefreshCw
                  size={15}
                  className={updateBusy ? "p8-spin" : undefined}
                  aria-hidden="true"
                />
                {updateBusy ? "Updating..." : "Update bot project"}
              </button>
            )}

            {onDeleteGeneratedProject && (
              <button
                type="button"
                className="button-danger"
                disabled={anyProcessBusy || !isGenerated || isRunning}
                onClick={() => void onDeleteGeneratedProject()}
                title={
                  !isGenerated
                    ? "No generated bot project directory to delete"
                    : isRunning
                      ? "Stop the running bot before deleting the generated project"
                      : "Delete the currently generated bot project directory from disk"
                }
              >
                <Trash2 size={15} aria-hidden="true" />
                {deleteBusy ? "Deleting..." : "Delete bot project"}
              </button>
            )}

            {onCompileProject && (
              <button
                type="button"
                className="button-secondary"
                disabled={anyProcessBusy || !isGenerated || isRunning}
                onClick={() => void onCompileProject()}
                title={
                  !isGenerated
                    ? "Generate the bot project first to unlock Compile"
                    : isRunning
                      ? "Stop the running bot before recompiling"
                      : "Run npm install and npm run build in the generated directory"
                }
              >
                <Hammer size={15} className={compileBusy ? "p8-spin" : undefined} aria-hidden="true" />
                {compileBusy ? "Compiling..." : "Compile"}
              </button>
            )}

            {onRunProject && (
              <button
                type="button"
                className="button-primary"
                disabled={anyProcessBusy || (!isRunning && (!isGenerated || !isCompiled))}
                onClick={() => void onRunProject()}
                title={
                  !isGenerated
                    ? "Generate the bot project first"
                    : !isCompiled
                      ? "Compile the generated project first to unlock Run"
                      : isRunning
                        ? "Open Run monitor"
                        : "Start the compiled bot locally"
                }
              >
                <Play size={15} aria-hidden="true" />
                {runBusy ? "Starting..." : isRunning ? "Running (Monitor)" : "Run"}
              </button>
            )}

            {onCloseProject && (
              <button
                type="button"
                className="button-secondary p8-danger-action"
                disabled={anyProcessBusy || isRunning}
                onClick={() => setConfirmCloseOpen(true)}
              >
                <Trash2 size={15} aria-hidden="true" /> Close project
              </button>
            )}
          </div>
        </div>
      </section>

      {onCloseProject && (
        <ConfirmDialog
          open={confirmCloseOpen}
          title="Close active project"
          message={
            <>
              Remove <strong>{session.document.name}</strong> from the current workspace
              session?
              {isDirty
                ? " Unsaved in-memory edits will be discarded unless you save the project first."
                : " Saved files on disk will not be deleted."}
            </>
          }
          confirmLabel="Close project"
          cancelLabel="Keep open"
          pendingLabel="Closing..."
          variant="danger"
          onClose={() => setConfirmCloseOpen(false)}
          onConfirm={async () => {
            await onCloseProject();
          }}
        />
      )}
    </>
  );
}

export default ProjectList;