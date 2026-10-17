import { Settings2 } from "lucide-react";
import type { AppSettings } from "../../types/electron-api";

/**
 * Allowed autosave intervals enforced by AppSettingsService in the Electron main process.
 */
export const ALLOWED_AUTOSAVE_INTERVAL_SECONDS = [15, 30, 60, 120] as const;

export type GeneralSettingKey =
  | "autoSaveEnabled"
  | "autoSaveIntervalSeconds"
  | "reopenLastProject";

export interface GeneralSettingsProps {
  settings: Pick<
    AppSettings,
    "autoSaveEnabled" | "autoSaveIntervalSeconds" | "reopenLastProject"
  >;
  disabled?: boolean;
  onChange: <K extends GeneralSettingKey>(key: K, value: AppSettings[K]) => void;
}

export function GeneralSettings({
  settings,
  disabled = false,
  onChange,
}: GeneralSettingsProps) {
  return (
    <section className="p6-panel" aria-label="General project behavior settings">
      <div className="p6-panel-heading">
        <div>
          <h2>Project behavior</h2>
          <p>
            General workspace preferences persisted across application restarts through the
            desktop settings service.
          </p>
        </div>
        <Settings2 size={19} aria-hidden="true" />
      </div>

      <label className="p6-toggle-row">
        <span>
          <strong>Enable autosave preference</strong>
          <small>
            Persists the autosave flag in settings.json for projects that already have a saved
            file path on disk.
          </small>
        </span>
        <input
          type="checkbox"
          checked={settings.autoSaveEnabled}
          disabled={disabled}
          onChange={(event) => onChange("autoSaveEnabled", event.target.checked)}
        />
      </label>

      <label className="p6-field">
        <span>Autosave interval</span>
        <select
          value={settings.autoSaveIntervalSeconds}
          disabled={disabled || !settings.autoSaveEnabled}
          onChange={(event) =>
            onChange("autoSaveIntervalSeconds", Number(event.target.value))
          }
        >
          {ALLOWED_AUTOSAVE_INTERVAL_SECONDS.map((interval) => (
            <option key={interval} value={interval}>
              {interval} seconds
            </option>
          ))}
        </select>
        <small>
          Only intervals validated by the Electron settings service (15, 30, 60, or 120 seconds)
          are selectable.
        </small>
      </label>

      <label className="p6-toggle-row">
        <span>
          <strong>Reopen last project</strong>
          <small>
            Stores whether the workspace should reopen the last active project when session
            restoration is available.
          </small>
        </span>
        <input
          type="checkbox"
          checked={settings.reopenLastProject}
          disabled={disabled}
          onChange={(event) => onChange("reopenLastProject", event.target.checked)}
        />
      </label>
    </section>
  );
}