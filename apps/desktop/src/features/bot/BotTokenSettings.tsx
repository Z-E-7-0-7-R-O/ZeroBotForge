import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, PlugZap, ShieldCheck, Trash2 } from "lucide-react";
import type { DesktopApi, TelegramConnectionStatus } from "../../types/electron-api";
import { BotConnectionStatus } from "./BotConnectionStatus";

export interface BotTokenSettingsProps {
  onStatusChange?: (status: TelegramConnectionStatus) => void;
}

function getTelegramApi(): DesktopApi["telegram"] {
  if (typeof window === "undefined" || !window.zeroBotForge?.telegram) {
    throw new Error(
      "The secure Telegram desktop API is unavailable. Open ZeroBotForge as a desktop application.",
    );
  }
  return window.zeroBotForge.telegram;
}

export function BotTokenSettings({ onStatusChange }: BotTokenSettingsProps = {}) {
  const [tokenInput, setTokenInput] = useState("");
  const [status, setStatus] = useState<TelegramConnectionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const applyStatus = useCallback(
    (nextStatus: TelegramConnectionStatus) => {
      setStatus(nextStatus);
      onStatusChange?.(nextStatus);
    },
    [onStatusChange],
  );

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getTelegramApi().getStatus();
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      applyStatus(result.data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Telegram status could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [applyStatus]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleSaveToken = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      setError("Enter a Telegram bot token first.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await getTelegramApi().setToken({ token: trimmed });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      applyStatus(result.data);
      setTokenInput("");
      setSuccessMessage(
        "Token stored in the desktop secure-storage service. The token value was cleared from this form.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "The token could not be saved.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await getTelegramApi().testConnection();
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      applyStatus(result.data);
      setSuccessMessage(
        result.data.connected
          ? "Telegram connection test succeeded."
          : "The token is saved, but connection is not confirmed.",
      );
    } catch (testError) {
      const message =
        testError instanceof Error
          ? testError.message
          : "Telegram connection test failed.";
      setError(message);
      setStatus((current) => {
        const failedStatus: TelegramConnectionStatus = current
          ? { ...current, connected: false }
          : { configured: true, connected: false };
        onStatusChange?.(failedStatus);
        return failedStatus;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearToken = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    setTokenInput("");
    try {
      const result = await getTelegramApi().clearToken();
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      applyStatus(result.data);
      setSuccessMessage("The saved Telegram token was removed from secure storage.");
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "The saved token could not be removed.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="p8-feature-card" aria-label="Telegram token management">
      <div className="p8-feature-heading">
        <span className="p8-feature-icon">
          <KeyRound size={19} aria-hidden="true" />
        </span>
        <div>
          <h2>Telegram token</h2>
          <p>
            The token is sent only to the restricted desktop API and is never shown again
            after saving.
          </p>
        </div>
      </div>

      <div className="p8-security-note">
        <ShieldCheck size={17} aria-hidden="true" />
        <span>
          Token values are not stored in React stores, localStorage, or the project JSON
          document.
        </span>
      </div>

      <form className="p8-feature-form" onSubmit={(event) => void handleSaveToken(event)}>
        <label className="p8-field">
          <span>Bot token</span>
          <input
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder={
              status?.configured
                ? "Enter a replacement token"
                : "Paste token from BotFather"
            }
            disabled={loading}
          />
        </label>

        <div className="p8-form-actions">
          <button
            className="button-primary"
            type="submit"
            disabled={loading || !tokenInput.trim()}
          >
            <KeyRound size={16} aria-hidden="true" /> Save token securely
          </button>

          <button
            className="button-secondary"
            type="button"
            onClick={() => void handleTestConnection()}
            disabled={loading || !status?.configured}
          >
            <PlugZap size={16} aria-hidden="true" /> Test connection
          </button>

          <button
            className="button-secondary p8-danger-action"
            type="button"
            onClick={() => void handleClearToken()}
            disabled={loading || !status?.configured}
          >
            <Trash2 size={16} aria-hidden="true" /> Clear token
          </button>
        </div>
      </form>

      <BotConnectionStatus status={status} loading={loading} error={error} />

      {successMessage && (
        <p className="p8-inline-success" role="status">
          {successMessage}
        </p>
      )}
    </section>
  );
}