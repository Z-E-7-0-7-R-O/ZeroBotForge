import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { FileCheck2, FolderOpen, Save } from "lucide-react";
import EmptyState from "../../components/common/EmptyState";
import type { ProjectDocumentDto } from "../../types/electron-api";

export type ProjectGenerationSettingsDto = ProjectDocumentDto["generation"];

export interface ExportSettingsProps {
  projectName: string | null;
  generation: ProjectGenerationSettingsDto | null;
  disabled?: boolean;
  onSaveGeneration: (generation: ProjectGenerationSettingsDto) => Promise<void> | void;
  onExportGeneratedProject?: (generation: ProjectGenerationSettingsDto) => Promise<void>;
  onExportProjectJson?: (generation: ProjectGenerationSettingsDto) => Promise<void>;
}

const PACKAGE_MANAGERS: readonly ProjectGenerationSettingsDto["packageManager"][] = [
  "npm",
  "pnpm",
  "yarn",
];

const MODULE_FORMATS: readonly {
  value: ProjectGenerationSettingsDto["moduleFormat"];
  label: string;
}[] = [
  { value: "esm", label: "ES Modules (type: module)" },
  { value: "commonjs", label: "CommonJS (type: commonjs)" },
];

const MINIMUM_NODE_VERSION = 22;
const MAXIMUM_NODE_VERSION = 30;

export function ExportSettings({
  projectName,
  generation,
  disabled = false,
  onSaveGeneration,
  onExportGeneratedProject,
  onExportProjectJson,
}: ExportSettingsProps) {
  const [draft, setDraft] = useState<ProjectGenerationSettingsDto | null>(generation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(generation);
    setError(null);
    setSuccessMessage(null);
  }, [generation]);

  if (!generation || !draft) {
    return (
      <section className="p8-feature-card" aria-label="Export settings">
        <EmptyState
          icon={<FolderOpen size={22} />}
          title="No project is open"
          description="Open or create a project in Dashboard to configure its standalone code-generator and export settings."
        />
      </section>
    );
  }

  const validateDraft = (
    candidate: ProjectGenerationSettingsDto,
  ): ProjectGenerationSettingsDto => {
    if (
      !Number.isInteger(candidate.nodeVersion) ||
      candidate.nodeVersion < MINIMUM_NODE_VERSION ||
      candidate.nodeVersion > MAXIMUM_NODE_VERSION
    ) {
      throw new Error(
        `Target Node.js version must be an integer between ${MINIMUM_NODE_VERSION} and ${MAXIMUM_NODE_VERSION}.`,
      );
    }

    if (!PACKAGE_MANAGERS.includes(candidate.packageManager)) {
      throw new Error("Selected package manager is not supported.");
    }

    if (candidate.moduleFormat !== "esm" && candidate.moduleFormat !== "commonjs") {
      throw new Error("Selected module format is not supported.");
    }

    return {
      language: "typescript",
      runtime: "node",
      nodeVersion: candidate.nodeVersion,
      moduleFormat: candidate.moduleFormat,
      packageManager: candidate.packageManager,
      strict: Boolean(candidate.strict),
      includeReadme: Boolean(candidate.includeReadme),
      includeTests: Boolean(candidate.includeTests),
    };
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const validated = validateDraft(draft);
      await onSaveGeneration(validated);
      setSuccessMessage(
        "Export and code-generation settings were applied to the active project.",
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Export settings could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleExportGenerated = async () => {
    if (!onExportGeneratedProject) return;
    setBusy(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const validated = validateDraft(draft);
      await onExportGeneratedProject(validated);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Standalone project generation failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleExportJson = async () => {
    if (!onExportProjectJson) return;
    setBusy(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const validated = validateDraft(draft);
      await onExportProjectJson(validated);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Project JSON export failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const isDisabled = disabled || busy;

  return (
    <section className="p8-feature-card" aria-label="Export and code generation settings">
      <div className="p8-feature-heading">
        <span className="p8-feature-icon">
          <FileCheck2 size={19} aria-hidden="true" />
        </span>
        <div>
          <h2>Export &amp; code generation</h2>
          <p>
            Configure how <strong>{projectName ?? "the active project"}</strong> is emitted
            by the standalone TypeScript bot generator.
          </p>
        </div>
      </div>

      <form className="p8-feature-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="p8-field">
          <span>Package manager</span>
          <select
            value={draft.packageManager}
            disabled={isDisabled}
            onChange={(event) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      packageManager:
                        event.target.value as ProjectGenerationSettingsDto["packageManager"],
                    }
                  : current,
              )
            }
          >
            {PACKAGE_MANAGERS.map((manager) => (
              <option key={manager} value={manager}>
                {manager}
              </option>
            ))}
          </select>
          <small>
            Controls the package manager instructions and install command in generated README.md.
          </small>
        </label>

        <label className="p8-field">
          <span>Package module format</span>
          <select
            value={draft.moduleFormat}
            disabled={isDisabled}
            onChange={(event) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      moduleFormat:
                        event.target.value as ProjectGenerationSettingsDto["moduleFormat"],
                    }
                  : current,
              )
            }
          >
            {MODULE_FORMATS.map((formatOption) => (
              <option key={formatOption.value} value={formatOption.value}>
                {formatOption.label}
              </option>
            ))}
          </select>
          <small>Writes the corresponding module type into generated package.json.</small>
        </label>

        <label className="p8-field">
          <span>Minimum Node.js major version</span>
          <input
            type="number"
            min={MINIMUM_NODE_VERSION}
            max={MAXIMUM_NODE_VERSION}
            step={1}
            required
            disabled={isDisabled}
            value={draft.nodeVersion}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      nodeVersion: Number.isNaN(parsed) ? MINIMUM_NODE_VERSION : parsed,
                    }
                  : current,
              );
            }}
          />
          <small>
            Sets engines.node (&gt;={draft.nodeVersion}.0.0) in the generated package.json
            manifest.
          </small>
        </label>

        <label className="p6-toggle-row">
          <span>
            <strong>TypeScript strict mode</strong>
            <small>
              Enables compilerOptions.strict in the generated tsconfig.json file.
            </small>
          </span>
          <input
            type="checkbox"
            checked={draft.strict}
            disabled={isDisabled}
            onChange={(event) =>
              setDraft((current) =>
                current ? { ...current, strict: event.target.checked } : current,
              )
            }
          />
        </label>

        <label className="p6-toggle-row">
          <span>
            <strong>Include README metadata flag</strong>
            <small>
              Persisted in project.generation.includeReadme alongside the generated README.md.
            </small>
          </span>
          <input
            type="checkbox"
            checked={draft.includeReadme}
            disabled={isDisabled}
            onChange={(event) =>
              setDraft((current) =>
                current ? { ...current, includeReadme: event.target.checked } : current,
              )
            }
          />
        </label>

        <label className="p6-toggle-row">
          <span>
            <strong>Include tests metadata flag</strong>
            <small>
              Persisted in project.generation.includeTests in the exported project schema.
            </small>
          </span>
          <input
            type="checkbox"
            checked={draft.includeTests}
            disabled={isDisabled}
            onChange={(event) =>
              setDraft((current) =>
                current ? { ...current, includeTests: event.target.checked } : current,
              )
            }
          />
        </label>

        {error && (
          <p className="p8-inline-error" role="alert">
            {error}
          </p>
        )}

        {successMessage && (
          <p className="p8-inline-success" role="status">
            {successMessage}
          </p>
        )}

        <div className="p8-form-actions">
          <button type="submit" className="button-primary" disabled={isDisabled}>
            <Save size={16} aria-hidden="true" />
            {busy ? "Saving..." : "Apply export settings"}
          </button>

          {onExportProjectJson && (
            <button
              type="button"
              className="button-secondary"
              disabled={isDisabled}
              onClick={() => void handleExportJson()}
            >
              Export JSON
            </button>
          )}

          {onExportGeneratedProject && (
            <button
              type="button"
              className="button-secondary"
              disabled={isDisabled}
              onClick={() => void handleExportGenerated()}
            >
              Generate bot project
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

export default ExportSettings;