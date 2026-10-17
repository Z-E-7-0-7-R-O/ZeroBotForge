import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { FolderPlus, X } from "lucide-react";

export interface CreateProjectDetails {
  description?: string;
  botDisplayName?: string;
}

export interface CreateProjectDialogProps {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onCreate: (name: string, details?: CreateProjectDetails) => Promise<void>;
}

/**
 * Matches the 1..100 character project name validation rule enforced by project.ipc.ts.
 */
const MAX_PROJECT_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_BOT_DISPLAY_NAME_LENGTH = 100;

export function CreateProjectDialog({
  open,
  busy = false,
  onCancel,
  onCreate,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [botDisplayName, setBotDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setBotDisplayName("");
      setError(null);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Enter a project name before creating it.");
      return;
    }

    if (trimmedName.length > MAX_PROJECT_NAME_LENGTH) {
      setError(`Project name must contain 1–${MAX_PROJECT_NAME_LENGTH} characters.`);
      return;
    }

    setError(null);
    const trimmedDescription = description.trim();
    const trimmedBotName = botDisplayName.trim();

    try {
      await onCreate(trimmedName, {
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
        ...(trimmedBotName ? { botDisplayName: trimmedBotName } : {}),
      });
    } catch (creationError) {
      setError(
        creationError instanceof Error
          ? creationError.message
          : "The project could not be created.",
      );
    }
  };

  return (
    <div
      className="p8-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onCancel();
        }
      }}
    >
      <form
        className="p8-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="p8-create-project-title"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="p8-dialog-heading">
          <span className="p8-dialog-icon">
            <FolderPlus size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 id="p8-create-project-title">Create project</h2>
            <p>Creates a validated ZeroBotForge project document via the desktop service.</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onCancel}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <label className="p8-field">
          <span>Project name</span>
          <input
            autoFocus
            maxLength={MAX_PROJECT_NAME_LENGTH}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Support Bot"
            disabled={busy}
          />
          <small>1–100 characters. Used as the project title and default export name.</small>
        </label>

        <label className="p8-field">
          <span>Bot display name (optional)</span>
          <input
            maxLength={MAX_BOT_DISPLAY_NAME_LENGTH}
            value={botDisplayName}
            onChange={(event) => setBotDisplayName(event.target.value)}
            placeholder="Defaults to the project name"
            disabled={busy}
          />
        </label>

        <label className="p8-field">
          <span>Description (optional)</span>
          <input
            maxLength={MAX_DESCRIPTION_LENGTH}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Short summary stored in project metadata"
            disabled={busy}
          />
        </label>

        {error && (
          <p className="p8-inline-error" role="alert">
            {error}
          </p>
        )}

        <div className="p8-dialog-actions">
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button-primary"
            disabled={busy || !name.trim()}
          >
            <FolderPlus size={16} aria-hidden="true" />
            {busy ? "Creating..." : "Create project"}
          </button>
        </div>
      </form>
    </div>
  );
}