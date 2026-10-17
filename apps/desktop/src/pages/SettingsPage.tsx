import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { RotateCw, Save, Settings2 } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import type { NavigationPage } from "../components/layout/Sidebar";
import { ProjectBotSettingsPanel } from "../features/bot/ProjectBotSettingsPanel";
import {
  AppearanceSettings,
  applyAppTheme,
} from "../features/settings/AppearanceSettings";
import {
  ExportSettings,
  type ProjectGenerationSettingsDto,
} from "../features/settings/ExportSettings";
import { GeneralSettings } from "../features/settings/GeneralSettings";
import { useNotifications } from "../hooks/useNotifications";
import { useProject } from "../hooks/useProject";
import { exportGeneratedProject, exportProjectJson } from "../services/export.service";
import type { AppSettings, ProjectSession } from "../types/electron-api";

export interface SettingsPageProps {
  activePage: NavigationPage;
  onNavigate: (page: NavigationPage) => void;
  session?: ProjectSession | null;
  onSessionChange?: (session: ProjectSession | null) => void;
}

export function SettingsPage({
  activePage,
  onNavigate,
  session: sessionProp,
  onSessionChange,
}: SettingsPageProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { notifications, notify, dismissNotification } = useNotifications();
  const projectStore = useProject();

  const activeSession = sessionProp !== undefined ? sessionProp : projectStore.session;

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    if (typeof window === "undefined" || !window.zeroBotForge?.system?.settings) {
      setLoadError(
        "The desktop settings service is unavailable. Open ZeroBotForge inside Electron.",
      );
      setLoading(false);
      return;
    }

    try {
      const response = await window.zeroBotForge.system.settings.get();
      if (!response.ok) {
        setLoadError(
          response.error.message ||
            "The desktop settings service could not load settings.",
        );
        return;
      }
      setSettings(response.data);
      applyAppTheme(response.data.theme);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Settings could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
    if (key === "theme" && typeof value === "string") {
      applyAppTheme(value as AppSettings["theme"]);
    }
  };

  const handleSaveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;

    setSaving(true);
    try {
      const response = await window.zeroBotForge.system.settings.save({
        settings,
      });
      if (!response.ok) {
        notify({
          type: "error",
          title: "Settings not saved",
          message:
            response.error.message ||
            "The desktop settings service rejected the save request.",
        });
        return;
      }
      setSettings(response.data);
      applyAppTheme(response.data.theme);
      notify({
        type: "success",
        title: "Settings saved",
        message: "Preferences were saved using the Electron settings service.",
      });
    } catch (error) {
      notify({
        type: "error",
        title: "Settings not saved",
        message:
          error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setSaving(false);
    }
  };

  const applyGenerationToProject = useCallback(
    async (generation: ProjectGenerationSettingsDto) => {
      if (!activeSession) {
        throw new Error("Open or create a project before updating export settings.");
      }

      const nextDocument = {
        ...activeSession.document,
        generation,
        updatedAt: new Date().toISOString(),
      };
      const nextSession: ProjectSession = {
        ...activeSession,
        document: nextDocument,
      };

      projectStore.updateDocument(nextDocument);
      onSessionChange?.(nextSession);

      if (activeSession.filePath !== null) {
        await projectStore.saveProject(nextSession);
      }
    },
    [activeSession, onSessionChange, projectStore],
  );

  const handleExportGeneratedFromSettings = useCallback(
    async (generation: ProjectGenerationSettingsDto) => {
      if (!activeSession) return;
      const nextDocument = {
        ...activeSession.document,
        generation,
        updatedAt: new Date().toISOString(),
      };
      projectStore.updateDocument(nextDocument);
      onSessionChange?.({
        ...activeSession,
        document: nextDocument,
      });

      const outcome = await exportGeneratedProject(nextDocument);
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
          message: `${outcome.result.filesWritten} files written to ${outcome.result.directoryPath}`,
        });
      }
    },
    [activeSession, notify, onSessionChange, projectStore],
  );

  const handleExportJsonFromSettings = useCallback(
    async (generation: ProjectGenerationSettingsDto) => {
      if (!activeSession) return;
      const nextDocument = {
        ...activeSession.document,
        generation,
        updatedAt: new Date().toISOString(),
      };
      projectStore.updateDocument(nextDocument);
      onSessionChange?.({
        ...activeSession,
        document: nextDocument,
      });

      const outcome = await exportProjectJson(nextDocument);
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
    },
    [activeSession, notify, onSessionChange, projectStore],
  );

  return (
    <AppLayout
      activePage={activePage}
      onNavigate={onNavigate}
      onSettingsClick={() => onNavigate("Settings")}
      settingsOpen={true}
      notifications={notifications}
      onDismissNotification={dismissNotification}
    >
      <div className="p6-page">
        <div className="page-heading p6-page-heading">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" /> PREFERENCES
            </div>
            <h1>Settings</h1>
            <p className="page-subtitle">
              These values are loaded and saved through the desktop settings service.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p6-panel p6-settings-state">
            <RotateCw size={19} className="p6-spin" aria-hidden="true" />
            <span>Loading saved settings...</span>
          </div>
        ) : loadError ? (
          <div className="p6-panel p6-settings-state p6-settings-error">
            <Settings2 size={21} aria-hidden="true" />
            <div>
              <h2>Settings could not be loaded</h2>
              <p>{loadError}</p>
              <button
                type="button"
                className="button-secondary"
                onClick={() => void loadSettings()}
              >
                <RotateCw size={15} aria-hidden="true" /> Try again
              </button>
            </div>
          </div>
        ) : settings ? (
          <form
            className="p6-settings-form"
            onSubmit={(event) => void handleSaveSettings(event)}
          >
            <AppearanceSettings
              theme={settings.theme}
              disabled={saving}
              onChange={(nextTheme) => updateSetting("theme", nextTheme)}
            />

            <GeneralSettings
              settings={settings}
              disabled={saving}
              onChange={updateSetting}
            />

            <div className="p6-settings-footer">
              <span>Changes are local until saved.</span>
              <button type="submit" className="button-primary" disabled={saving}>
                <Save size={16} aria-hidden="true" />{" "}
                {saving ? "Saving..." : "Save settings"}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      <section className="p8-settings-embed">
        <div className="p6-panel-heading p8-settings-intro">
          <div>
            <h2>Export &amp; standalone generator</h2>
            <p>
              Configure Node.js target, module format, and package manager transferred to
              the code generator.
            </p>
          </div>
        </div>
        <ExportSettings
          projectName={activeSession?.document.name ?? null}
          generation={activeSession?.document.generation ?? null}
          onSaveGeneration={applyGenerationToProject}
          onExportGeneratedProject={handleExportGeneratedFromSettings}
          onExportProjectJson={handleExportJsonFromSettings}
        />
      </section>

      <section className="p8-settings-embed">
        <div className="p6-panel-heading p8-settings-intro">
          <div>
            <h2>Bot &amp; Telegram integration</h2>
            <p>Project bot settings and secure Telegram token management.</p>
          </div>
        </div>
        <ProjectBotSettingsPanel />
      </section>
    </AppLayout>
  );
}

export default SettingsPage;