import { useCallback, useEffect, useState } from "react";
import {
  CircleCheck,
  CircleHelp,
  LoaderCircle,
  ShieldAlert,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { TelegramConnectionStatus } from "../../types/electron-api";

export interface BotConnectionStatusProps {
  /**
   * When provided, renders the caller's live service state.
   * When omitted, BotConnectionStatus queries window.zeroBotForge.telegram.getStatus() directly.
   */
  status?: TelegramConnectionStatus | null;
  loading?: boolean;
  error?: string | null;
}

export function BotConnectionStatus({
  status: controlledStatus,
  loading: controlledLoading,
  error: controlledError,
}: BotConnectionStatusProps) {
  const isControlled =
    controlledStatus !== undefined ||
    controlledLoading !== undefined ||
    controlledError !== undefined;

  const [fetchedStatus, setFetchedStatus] = useState<TelegramConnectionStatus | null>(null);
  const [fetchedLoading, setFetchedLoading] = useState<boolean>(!isControlled);
  const [fetchedError, setFetchedError] = useState<string | null>(null);

  const loadRealServiceStatus = useCallback(async () => {
    if (typeof window === "undefined" || !window.zeroBotForge?.telegram) {
      setFetchedError(
        "The secure Telegram desktop API is unavailable. Open ZeroBotForge as a desktop application.",
      );
      setFetchedLoading(false);
      return;
    }

    setFetchedLoading(true);
    setFetchedError(null);
    try {
      const response = await window.zeroBotForge.telegram.getStatus();
      if (!response.ok) {
        throw new Error(response.error.message);
      }
      setFetchedStatus(response.data);
    } catch (serviceError) {
      setFetchedError(
        serviceError instanceof Error
          ? serviceError.message
          : "Telegram status could not be loaded from the desktop service.",
      );
    } finally {
      setFetchedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isControlled) {
      void loadRealServiceStatus();
    }
  }, [isControlled, loadRealServiceStatus]);

  const status = isControlled ? (controlledStatus ?? null) : fetchedStatus;
  const loading = isControlled ? Boolean(controlledLoading) : fetchedLoading;
  const error = isControlled ? (controlledError ?? null) : fetchedError;

  let icon = <CircleHelp size={17} aria-hidden="true" />;
  let headline = "Connection not tested";
  let description = "Save a token and test the Telegram Bot API connection.";
  let className = "p8-connection-status is-unknown";

  if (loading) {
    icon = <LoaderCircle size={17} className="p8-spin" aria-hidden="true" />;
    headline = "Checking connection";
    description = "Contacting the Telegram Bot API securely through Electron.";
    className = "p8-connection-status is-loading";
  } else if (error) {
    icon = <ShieldAlert size={17} aria-hidden="true" />;
    headline = "Telegram operation failed";
    description = error;
    className = "p8-connection-status is-error";
  } else if (status && !status.configured) {
    icon = <WifiOff size={17} aria-hidden="true" />;
    headline = "Bot token not configured";
    description = "No Telegram bot token is stored in secure storage.";
    className = "p8-connection-status is-unknown";
  } else if (status?.connected === true) {
    icon = <CircleCheck size={17} aria-hidden="true" />;
    headline = status.botUsername
      ? `Connected as @${status.botUsername}`
      : "Telegram connection successful";
    description = "Telegram accepted the saved token.";
    className = "p8-connection-status is-connected";
  } else if (status?.connected === false) {
    icon = <WifiOff size={17} aria-hidden="true" />;
    headline = "Not connected";
    description = "The last connection attempt did not succeed.";
    className = "p8-connection-status is-error";
  } else if (status?.configured) {
    icon = <Wifi size={17} aria-hidden="true" />;
    headline = "Token stored; connection not tested";
    description =
      "The secure storage contains a token, but connectivity has not been verified.";
    className = "p8-connection-status is-configured";
  }

  return (
    <div className={className} role={error ? "alert" : "status"}>
      <span className="p8-connection-icon">{icon}</span>
      <div>
        <strong>{headline}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}