import {
  useEffect,
  useId,
  useRef,
} from "react";

import type {
  MouseEvent,
  ReactNode,
} from "react";

import { createPortal } from "react-dom";
import { X } from "lucide-react";

export type ModalSize = "sm" | "md" | "lg" | "xl";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  ariaLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  lockBodyScroll?: boolean;
  className?: string;
}

export default function Modal({
  open,
  onClose,
  title,
  ariaLabel,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
  closeOnEscape = true,
  lockBodyScroll = true,
  className = "",
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousOverflow = document.body.style.overflow;

    if (lockBodyScroll) {
      document.body.style.overflow = "hidden";
    }

    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeOnEscape) {
        event.preventDefault();
        onCloseRef.current();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);

      if (lockBodyScroll) {
        document.body.style.overflow = previousOverflow;
      }

      previouslyFocused?.focus();
    };
  }, [open, closeOnEscape, lockBodyScroll]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const hasTitle =
    title !== undefined &&
    title !== null &&
    title !== false;

const handleBackdropMouseDown = (
  event: MouseEvent<HTMLDivElement>,
) => {
        if (
      closeOnBackdrop &&
      event.target === event.currentTarget
    ) {
      onClose();
    }
  };

  const modalContent = (
    <div
      className="modal-overlay"
      onMouseDown={handleBackdropMouseDown}
      role="presentation"
    >
      <section
        ref={dialogRef}
        className={[
          "modal-panel",
          `modal-panel--${size}`,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hasTitle ? titleId : undefined}
        aria-label={!hasTitle ? ariaLabel ?? "Dialog" : undefined}
        tabIndex={-1}
      >
        {hasTitle && (
          <header className="modal-header">
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>

            <button
              type="button"
              className="modal-close"
              aria-label="Close dialog"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </header>
        )}

        <div className="modal-body">{children}</div>

        {footer !== undefined && footer !== null && (
          <footer className="modal-footer">
            {footer}
          </footer>
        )}
      </section>
    </div>
  );

  return createPortal(modalContent, document.body);
}