import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  CircleDot,
  Cpu,
  FolderCode,
  FolderOpen,
  Hammer,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import type { NavigationPage } from "../components/layout/Sidebar";
import { useNotifications } from "../hooks/useNotifications";
import {
  exportGeneratedProject,
  updateGeneratedProject,
} from "../services/export.service";
import { telegramService } from "../services/telegram.service";
import { useAppStore } from "../store/app.store";
import type { BotRuntimeStatus, ProjectSession } from "../types/electron-api";

export interface RunPageProps {
  activePage: NavigationPage;
  onNavigate: (page: NavigationPage) => void;
  session: ProjectSession | null;
}

function formatTimeOnly(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return isoTimestamp;
  }
}

export default function RunPage({
  activePage,
  onNavigate,
  session,
}: RunPageProps) {
  const { runtimeStatus } = useAppStore();
  const { notifications, notify, dismissNotification } = useNotifications();
  const [actionBusy, setActionBusy] = useState<
    "open" | "generate" | "update" | "delete" | "compile" | "run" | "stop" | "status" | null
  >(null);
  const terminalViewportRef = useRef<HTMLDivElement | null>(null);

  const refreshRuntimeState = useCallback(
    async (checkTelegram = false): Promise<BotRuntimeStatus | null> => {
      try {
        return await telegramService.getRuntimeStatus({ checkTelegram });
      } catch {
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    void refreshRuntimeState(true);
  }, [refreshRuntimeState]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshRuntimeState(false);
    }, 1200);
    return () => window.clearInterval(intervalId);
  }, [refreshRuntimeState]);

  useEffect(() => {
    const viewport = terminalViewportRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [runtimeStatus?.logs.length]);

  const isGenerated = Boolean(runtimeStatus?.isGenerated);
  const isCompiled = Boolean(runtimeStatus?.isCompiled);
  const isRunning = Boolean(runtimeStatus?.isRunning);
  const isCompiling = runtimeStatus?.state === "compiling" || actionBusy === "compile";
  const isStarting = runtimeStatus?.state === "starting" || actionBusy === "run";
  const isStopping = runtimeStatus?.state === "stopping" || actionBusy === "stop";

  const anyProcessBusy =
    actionBusy !== null || isCompiling || isStarting || isStopping;
  const canCompile = isGenerated && !isRunning && !anyProcessBusy;
  const canRun = isGenerated && isCompiled && !isRunning && !anyProcessBusy;
  const canStop = isRunning && !anyProcessBusy;
  const canUpdateProject =
    Boolean(session) && isGenerated && !isRunning && !anyProcessBusy;
  const canDeleteProject = isGenerated && !isRunning && !anyProcessBusy;

  const handleOpenBotProject = async () => {
    if (anyProcessBusy || isRunning) return;
    setActionBusy("open");
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
      setActionBusy(null);
    }
  };

  const handleGenerateProject = async () => {
    if (!session) {
      notify({
        type: "warning",
        title: "No active project",
        message: "Open or create a project in Dashboard before generating code.",
      });
      return;
    }

    setActionBusy("generate");
    try {
      const outcome = await exportGeneratedProject(session.document);
      if (outcome.cancelled) {
        notify({
          type: "info",
          title: "Generation cancelled",
          message: "No project folder was selected.",
        });
      } else if (outcome.result) {
        await refreshRuntimeState(false);
        notify({
          type: "success",
          title: "Bot project generated",
          message: `Generated in ${outcome.result.directoryPath}. Compile is now unlocked.`,
        });
      }
    } catch (error) {
      notify({
        type: "error",
        title: "Project generation failed",
        message:
          error instanceof Error ? error.message : "Failed to generate bot project.",
      });
    } finally {
      setActionBusy(null);
    }
  };

  const handleUpdateProject = async () => {
    if (!session || !canUpdateProject) return;
    setActionBusy("update");
    try {
      const updated = await updateGeneratedProject(
        session.document,
        runtimeStatus?.directoryPath ?? undefined,
      );
      await refreshRuntimeState(false);
      notify({
        type: "success",
        title: "Bot project updated",
        message: `Updated ${updated.filesWritten} source files in ${updated.directoryPath}. Click Compile to rebuild.`,
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
      setActionBusy(null);
    }
  };

  const handleDeleteProject = async () => {
    if (!canDeleteProject) return;
    const deletedDir = runtimeStatus?.directoryPath ?? "generated folder";
    setActionBusy("delete");
    try {
      await telegramService.deleteGeneratedProject(
        runtimeStatus?.directoryPath ?? undefined,
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
      setActionBusy(null);
    }
  };

  const handleCompileProject = async () => {
    if (!canCompile) return;
    setActionBusy("compile");
    try {
      const updated = await telegramService.compileGeneratedProject(
        runtimeStatus?.directoryPath ?? undefined,
      );
      notify({
        type: "success",
        title: "Compilation complete",
        message: `Installed packages and built dist/bot.js in ${updated.directoryName ?? "generated folder"}. Run is now unlocked.`,
      });
    } catch (error) {
      notify({
        type: "error",
        title: "Compilation failed",
        message:
          error instanceof Error
            ? error.message
            : "npm install or npm run build failed.",
      });
    } finally {
      setActionBusy(null);
    }
  };

  const handleStartBot = async () => {
    if (!canRun) return;
    setActionBusy("run");
    try {
      const updated = await telegramService.startBotRuntime(
        runtimeStatus?.directoryPath ?? undefined,
      );
      notify({
        type: "success",
        title: "Bot is now running",
        message: updated.botUsername
          ? `Connected to Telegram as @${updated.botUsername} (PID ${String(updated.pid ?? "active")}).`
          : `Local bot process started (PID ${String(updated.pid ?? "active")}).`,
      });
    } catch (error) {
      notify({
        type: "error",
        title: "Bot startup failed",
        message:
          error instanceof Error ? error.message : "Could not start the bot process.",
      });
    } finally {
      setActionBusy(null);
    }
  };

  const handleStopBot = async () => {
    if (!canStop) return;
    setActionBusy("stop");
    try {
      await telegramService.stopBotRuntime();
      notify({
        type: "info",
        title: "Bot stopped",
        message: "The local Telegram bot process was terminated cleanly.",
      });
    } catch (error) {
      notify({
        type: "error",
        title: "Stop failed",
        message:
          error instanceof Error ? error.message : "Could not stop the bot process.",
      });
    } finally {
      setActionBusy(null);
    }
  };

  const handleRefreshStatus = async () => {
    setActionBusy("status");
    try {
      const updated = await telegramService.getRuntimeStatus({
        checkTelegram: true,
      });
      notify({
        type:
          updated.isRunning && updated.telegramConnected === true
            ? "success"
            : updated.telegramConnected === false
              ? "warning"
              : "info",
        title: "Bot status updated",
        message:
          updated.isRunning && updated.telegramConnected === true
            ? `Bot is ONLINE and active on Telegram${updated.botUsername ? ` as @\${updated.botUsername}` : ""} (PID ${String(updated.pid)}).`
            : !updated.isRunning && updated.tokenConfigured
              ? `Bot is currently OFFLINE (stopped)${updated.botUsername ? ` · Configured for @\${updated.botUsername}` : ""}. Click Run to bring the bot online.`
              : updated.telegramConnected === false
                ? "Telegram rejected the token or the Bot API could not be reached."
                : "No Telegram bot token is configured in Settings.",
      });
    } catch (error) {
      notify({
        type: "error",
        title: "Status check failed",
        message:
          error instanceof Error ? error.message : "Unable to query runtime status.",
      });
    } finally {
      setActionBusy(null);
    }
  };

  const handleClearLogs = async () => {
    try {
      await telegramService.clearRuntimeLogs();
    } catch {
      // Ignore log clearing errors if runtime is unavailable.
    }
  };

  const resolvedBotHandle =
    runtimeStatus?.botUsername ??
    session?.document.bot.username ??
    session?.document.bot.displayName ??
    "Unconfigured";

  const logs = runtimeStatus?.logs ?? [];

  return (
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
              <span className="eyebrow-line" /> RUNTIME EXECUTION · PROCESS & TELEGRAM MONITOR
            </div>
            <h1>Run & Live Monitor</h1>
            <p className="page-subtitle">
              Compile the generated bot project, launch the local Node runtime without external terminals, and monitor live Telegram connectivity.
            </p>
          </div>

          <div className="heading-actions p9-run-heading-actions">
            <button
              type="button"
              className="button-secondary"
              disabled={anyProcessBusy}
              onClick={() => void handleRefreshStatus()}
            >
              <RefreshCw
                size={15}
                className={actionBusy === "status" ? "p8-spin" : undefined}
                aria-hidden="true"
              />
              Get bot status
            </button>

            <button
              type="button"
              className="button-secondary"
              disabled={anyProcessBusy || isRunning}
              onClick={() => void handleOpenBotProject()}
              title={
                isRunning
                  ? "Stop the running bot before opening another bot project folder"
                  : "Select an existing generated bot project folder from disk"
              }
            >
              <FolderOpen size={15} aria-hidden="true" />
              {actionBusy === "open" ? "Opening..." : "Open bot project"}
            </button>

            <button
              type="button"
              className="button-secondary"
              disabled={!session || anyProcessBusy || isRunning}
              onClick={() => void handleGenerateProject()}
              title={
                isRunning
                  ? "Stop the running bot before generating a new project folder"
                  : "Generate standalone bot source files into a selected folder"
              }
            >
              <FolderCode size={15} aria-hidden="true" />
              {actionBusy === "generate" ? "Generating..." : "Generate bot project"}
            </button>

            <button
              type="button"
              className="button-secondary"
              disabled={!canUpdateProject}
              onClick={() => void handleUpdateProject()}
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
                className={actionBusy === "update" ? "p8-spin" : undefined}
                aria-hidden="true"
              />
              {actionBusy === "update" ? "Updating..." : "Update bot project"}
            </button>

            <button
              type="button"
              className="button-danger"
              disabled={!canDeleteProject}
              onClick={() => void handleDeleteProject()}
              title={
                !isGenerated
                  ? "No generated bot project directory to delete"
                  : isRunning
                    ? "Stop the running bot before deleting the generated project"
                    : "Delete the currently generated bot project directory from disk"
              }
            >
              <Trash2 size={15} aria-hidden="true" />
              {actionBusy === "delete" ? "Deleting..." : "Delete bot project"}
            </button>
          </div>
        </div>

        {/* Main Runtime Management & Status Panel */}
        <section
          className="p8-feature-card p9-runtime-panel"
          aria-label="Bot runtime control and telemetry"
        >
          <div className="p9-runtime-header">
            <div className="p8-feature-heading" style={{ marginBottom: 0 }}>
              <span className="p8-feature-icon">
                <Cpu size={20} aria-hidden="true" />
              </span>
              <div>
                <span className="p8-overline">LOCAL EXECUTION PIPELINE</span>
                <h2>
                  {runtimeStatus?.projectName ??
                    session?.document.name ??
                    "Bot Runtime Controller"}
                </h2>
                <p>
                  {runtimeStatus?.directoryPath
                    ? `Target directory: ${runtimeStatus.directoryPath}`
                    : "Step 1: Generate the bot project from Dashboard or via the button above to unlock compilation."}
                </p>
              </div>
            </div>

            <div className="p9-runtime-controls">
              <button
                type="button"
                className="button-secondary"
                disabled={!canCompile}
                onClick={() => void handleCompileProject()}
                title={
                  !isGenerated
                    ? "Generate the bot project first to unlock Compile"
                    : isRunning
                      ? "Stop the running bot before recompiling"
                      : "Run npm install and npm run build in the generated directory"
                }
              >
                <Hammer
                  size={15}
                  className={isCompiling ? "p8-spin" : undefined}
                  aria-hidden="true"
                />
                {isCompiling ? "Compiling..." : "Compile"}
              </button>

              <button
                type="button"
                className="button-primary"
                disabled={!canRun}
                onClick={() => void handleStartBot()}
                title={
                  !isGenerated
                    ? "Generate the bot project first"
                    : !isCompiled
                      ? "Compile the generated project first to unlock Run"
                      : "Start the compiled bot process locally"
                }
              >
                <Play size={15} aria-hidden="true" />
                {isStarting ? "Starting..." : "Run"}
              </button>

              <button
                type="button"
                className="button-danger"
                disabled={!canStop}
                onClick={() => void handleStopBot()}
                title="Stop the active local bot process"
              >
                <Square size={14} aria-hidden="true" />
                {isStopping ? "Stopping..." : "Stop"}
              </button>
            </div>
          </div>

          {/* Protective Pipeline Stepper */}
          <div className="p9-pipeline-steps" aria-label="Execution pipeline stages">
            <div className={`p9-pipeline-step ${isGenerated ? "is-complete" : "is-pending"}`}>
              <CheckCircle2 size={15} aria-hidden="true" />
              <div>
                <strong>1. Generate Project</strong>
                <span>
                  {isGenerated
                    ? `Ready (${runtimeStatus?.directoryName ?? "folder linked"})`
                    : "Required before Compile"}
                </span>
              </div>
            </div>

            <div className={`p9-pipeline-step ${isCompiled ? "is-complete" : isCompiling ? "is-active" : "is-pending"}`}>
              <Hammer size={15} aria-hidden="true" />
              <div>
                <strong>2. Compile (npm install & build)</strong>
                <span>
                  {isCompiling
                    ? "Installing packages & building TypeScript..."
                    : isCompiled
                      ? "dist/bot.js verified — Run unlocked"
                      : "Locked until Step 1 completes"}
                </span>
              </div>
            </div>

            <div className={`p9-pipeline-step ${isRunning ? "is-online" : "is-pending"}`}>
              <CircleDot size={15} aria-hidden="true" />
              <div>
                <strong>3. Local Bot Execution</strong>
                <span>
                  {isRunning
                    ? `Online (PID ${String(runtimeStatus?.pid ?? "active")})`
                    : "Locked until Step 2 completes"}
                </span>
              </div>
            </div>
          </div>

          {/* 4 Telemetry Status Cards */}
          <div className="p9-telemetry-grid">
            <article className="p9-telemetry-card">
              <div className="p9-telemetry-top">
                <span>LOCAL RUN STATUS</span>
                <Activity size={15} aria-hidden="true" />
              </div>
              <div className="p9-telemetry-badge-row">
                <span
                  className={`p9-status-badge ${
                    isRunning
                      ? "is-online"
                      : isCompiling
                        ? "is-warning"
                        : "is-offline"
                  }`}
                >
                  <span className="p9-status-dot" />
                  {isRunning
                    ? "ONLINE · RUNNING"
                    : isCompiling
                      ? "COMPILING"
                      : "OFFLINE · STOPPED"}
                </span>
              </div>
              <small>
                {isRunning && runtimeStatus?.startedAt
                  ? `PID ${String(runtimeStatus.pid)} · Started at ${formatTimeOnly(runtimeStatus.startedAt)}`
                  : runtimeStatus?.lastExitCode !== null &&
                      runtimeStatus?.lastExitCode !== undefined
                    ? `Process idle · Last exit code: ${String(runtimeStatus.lastExitCode)}`
                    : "No active local bot process is currently running."}
              </small>
            </article>

            <article className="p9-telemetry-card">
              <div className="p9-telemetry-top">
                <span>TELEGRAM BOT STATUS</span>
                {isRunning && runtimeStatus?.telegramConnected === true ? (
                  <Wifi size={15} aria-hidden="true" />
                ) : (
                  <WifiOff size={15} aria-hidden="true" />
                )}
              </div>
              <div className="p9-telemetry-badge-row">
                <span
                  className={`p9-status-badge ${
                    isRunning && runtimeStatus?.telegramConnected === true
                      ? "is-online"
                      : runtimeStatus?.telegramConnected === false
                        ? "is-error"
                        : "is-offline"
                  }`}
                >
                  <span className="p9-status-dot" />
                  {isRunning && runtimeStatus?.telegramConnected === true
                    ? `BOT ONLINE · @${resolvedBotHandle}`
                    : runtimeStatus?.telegramConnected === false
                      ? "TOKEN REJECTED / API ERROR"
                      : runtimeStatus?.tokenConfigured
                        ? `BOT OFFLINE · @${resolvedBotHandle}`
                        : "TOKEN NOT CONFIGURED"}
                </span>
              </div>
              <small>
                {isRunning && runtimeStatus?.telegramConnected === true
                  ? `Active bot process is polling Telegram updates for @${resolvedBotHandle}.`
                  : runtimeStatus?.tokenConfigured
                    ? `Bot is currently offline on Telegram. Click “Run” to start live polling for @${resolvedBotHandle}.`
                    : "Save your BotFather token in Settings to enable automatic .env injection."}
              </small>
            </article>

            <article className="p9-telemetry-card">
              <div className="p9-telemetry-top">
                <span>TOKEN & .ENV SYNC</span>
                <ShieldCheck size={15} aria-hidden="true" />
              </div>
              <div className="p9-telemetry-badge-row">
                <span
                  className={`p9-status-badge ${
                    runtimeStatus?.tokenSyncedToEnv
                      ? "is-online"
                      : runtimeStatus?.tokenConfigured
                        ? "is-warning"
                        : "is-offline"
                  }`}
                >
                  <span className="p9-status-dot" />
                  {runtimeStatus?.tokenSyncedToEnv
                    ? "AUTO-SYNCED TO .ENV"
                    : runtimeStatus?.tokenConfigured
                      ? "READY FOR NEXT EXPORT"
                      : "AWAITING TOKEN IN SETTINGS"}
                </span>
              </div>
              <small>
                {runtimeStatus?.tokenSyncedToEnv
                  ? "Token from Secure Storage is written to .env and injected into runtime env."
                  : "Configure your token once in Settings; manual .env editing is not required."}
              </small>
            </article>

            <article className="p9-telemetry-card">
              <div className="p9-telemetry-top">
                <span>BUILD ARTIFACT STATE</span>
                <Hammer size={15} aria-hidden="true" />
              </div>
              <div className="p9-telemetry-badge-row">
                <span
                  className={`p9-status-badge ${
                    isCompiled
                      ? "is-online"
                      : isGenerated
                        ? "is-warning"
                        : "is-offline"
                  }`}
                >
                  <span className="p9-status-dot" />
                  {isCompiled
                    ? "COMPILED · DIST/BOT.JS READY"
                    : isGenerated
                      ? "GENERATED · AWAITING COMPILE"
                      : "NOT GENERATED YET"}
                </span>
              </div>
              <small>
                {isCompiled && runtimeStatus?.compiledAt
                  ? `Last built at ${formatTimeOnly(runtimeStatus.compiledAt)}`
                  : "Click Compile after generating the project to install npm packages and build."}
              </small>
            </article>
          </div>

          {runtimeStatus?.lastError && (
            <p className="p8-inline-error" role="alert" style={{ marginTop: 14 }}>
              {runtimeStatus.lastError}
            </p>
          )}
        </section>

        {/* Live Terminal Output Monitor */}
        <section
          className="p8-feature-card p9-terminal-card"
          aria-label="Live runtime terminal output"
        >
          <div className="p9-terminal-header">
            <div className="p9-terminal-title">
              <Terminal size={16} aria-hidden="true" />
              <strong>Live Process Terminal</strong>
              <span className="p9-terminal-Meta">
                {logs.length} {logs.length === 1 ? "line" : "lines"} · Token auto-redaction active
              </span>
            </div>

            <div className="p9-terminal-actions">
              <button
                type="button"
                className="button-secondary"
                disabled={logs.length === 0}
                onClick={() => void handleClearLogs()}
              >
                <Trash2 size={14} aria-hidden="true" />
                Clear output
              </button>
            </div>
          </div>

          <div
            ref={terminalViewportRef}
            className="p9-terminal-viewport"
            role="log"
            aria-live="polite"
          >
            {logs.length === 0 ? (
              <div className="p9-terminal-empty">
                No process output recorded yet. Generate a bot project, click{" "}
                <strong>Compile</strong>, and then click <strong>Run</strong> to stream live execution logs here.
              </div>
            ) : (
              logs.map((entry) => (
                <div
                  key={entry.id}
                  className={`p9-terminal-line is-${entry.stream}`}
                >
                  <span className="p9-terminal-time">
                    [{formatTimeOnly(entry.timestamp)}]
                  </span>
                  <span className="p9-terminal-tag">
                    {entry.stream.toUpperCase()}
                  </span>
                  <span className="p9-terminal-text">{entry.message}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}