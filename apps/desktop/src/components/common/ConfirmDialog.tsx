import {
  useEffect,
  useState,
} from "react";

import type { ReactNode } from "react";

import Modal from "./Modal";

type ConfirmVariant = "danger" | "primary";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;

  confirmLabel?: string;
  cancelLabel?: string;
  pendingLabel?: string;
  variant?: ConfirmVariant;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onClose,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  pendingLabel = "Please wait...",
  variant = "danger",
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setErrorMessage(null);
    }
  }, [open]);

  const handleClose = () => {
    if (busy) {
      return;
    }

    setErrorMessage(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (busy) {
      return;
    }

    setBusy(true);
    setErrorMessage(null);

    try {
      await onConfirm();
      onClose();
    } catch {
      setErrorMessage(
        "The operation could not be completed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      size="sm"
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      footer={
        <>
          <button
            type="button"
            className="button-secondary"
            onClick={handleClose}
            disabled={busy}
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            className={
              variant === "danger"
                ? "button-danger"
                : "button-primary"
            }
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? pendingLabel : confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirmation-message">
        {message}
      </div>

      {errorMessage && (
        <p className="confirmation-error" role="alert">
          {errorMessage}
        </p>
      )}
    </Modal>
  );
}