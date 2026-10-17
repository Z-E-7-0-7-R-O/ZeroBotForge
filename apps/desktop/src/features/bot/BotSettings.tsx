import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Bot, Save } from "lucide-react";
import type { ProjectDocumentDto } from "../../types/electron-api";

export type BotSettingsModel = ProjectDocumentDto["bot"];

export interface BotSettingsProps {
  bot: BotSettingsModel;
  verifiedUsername?: string;
  onSave: (bot: BotSettingsModel) => Promise<void>;
}

const TOKEN_ENV_VAR_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

export function BotSettings({
  bot,
  verifiedUsername,
  onSave,
}: BotSettingsProps) {
  const [draft, setDraft] = useState<BotSettingsModel>(bot);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(bot);
  }, [bot]);

  const handleParseModeChange = (value: string) => {
    const parseMode: BotSettingsModel["parseMode"] =
      value === "HTML" || value === "Markdown" || value === "MarkdownV2"
        ? value
        : null;
    setDraft((current) => ({ ...current, parseMode }));
  };

  const handleUseVerifiedUsername = () => {
    if (!verifiedUsername) return;
    setDraft((current) => ({ ...current, username: verifiedUsername }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const displayName = draft.displayName.trim();
    const normalizedUsername = draft.username?.trim().replace(/^@+/, "") || undefined;
    const candidateEnvVar = draft.tokenEnvVar.trim();
    const tokenEnvVar = TOKEN_ENV_VAR_PATTERN.test(candidateEnvVar)
      ? candidateEnvVar
      : "TELEGRAM_BOT_TOKEN";

    if (!displayName) {
      setError("Bot display name cannot be empty.");
      setSaving(false);
      return;
    }

    try {
      await onSave({
        displayName,
        ...(normalizedUsername ? { username: normalizedUsername } : {}),
        tokenEnvVar,
        parseMode: draft.parseMode,
      });
      setSuccessMessage("Bot settings were validated and saved with the project.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Bot settings could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="p8-feature-card" aria-label="Bot configuration">
      <div className="p8-feature-heading">
        <span className="p8-feature-icon">
          <Bot size={19} aria-hidden="true" />
        </span>
        <div>
          <h2>Bot settings</h2>
          <p>These configuration values belong to the project document.</p>
        </div>
      </div>

      <form className="p8-feature-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="p8-field">
          <span>Bot display name</span>
          <input
            required
            maxLength={100}
            value={draft.displayName}
            onChange={(event) =>
              setDraft((current) => ({ ...current, displayName: event.target.value }))
            }
            disabled={saving}
          />
        </label>

        <label className="p8-field">
          <span>Bot username (optional)</span>
          <input
            maxLength={64}
            value={draft.username ?? ""}
            onChange={(event) =>
              setDraft((current) => ({ ...current, username: event.target.value }))
            }
            placeholder="my_support_bot"
            disabled={saving}
          />
          {verifiedUsername && draft.username !== verifiedUsername && (
            <small>
              Verified by Telegram connection test: <strong>@{verifiedUsername}</strong>{" "}
              <button
                type="button"
                className="flow-editor-mini-button"
                disabled={saving}
                onClick={handleUseVerifiedUsername}
              >
                Use @{verifiedUsername}
              </button>
            </small>
          )}
        </label>

        <label className="p8-field">
          <span>Message parse mode</span>
          <select
            value={draft.parseMode ?? "none"}
            onChange={(event) => handleParseModeChange(event.target.value)}
            disabled={saving}
          >
            <option value="none">None</option>
            <option value="HTML">HTML</option>
            <option value="Markdown">Markdown</option>
            <option value="MarkdownV2">MarkdownV2</option>
          </select>
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
          <button
            className="button-primary"
            type="submit"
            disabled={saving || !draft.displayName.trim()}
          >
            <Save size={16} aria-hidden="true" />
            {saving ? "Saving..." : "Save bot settings"}
          </button>
        </div>
      </form>
    </section>
  );
}