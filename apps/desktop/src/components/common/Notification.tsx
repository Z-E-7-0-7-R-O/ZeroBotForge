import { createPortal } from "react-dom";

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

import type {
  AppNotification,
  NotificationType,
} from "../../hooks/useNotifications";

interface NotificationProps {
  notifications: AppNotification[];
  onDismiss: (id: string) => void;
}

const notificationIcons: Record<NotificationType, LucideIcon> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const notificationLabels: Record<NotificationType, string> = {
  success: "Success",
  error: "Error",
  warning: "Warning",
  info: "Information",
};

export default function Notification({
  notifications,
  onDismiss,
}: NotificationProps) {
  if (
    typeof document === "undefined" ||
    notifications.length === 0
  ) {
    return null;
  }

  return createPortal(
    <div
      className="notification-region"
      aria-label="Notifications"
      aria-live="polite"
      aria-relevant="additions removals"
    >
      {notifications.map((notification) => {
        const Icon = notificationIcons[notification.type];

        return (
          <div
            key={notification.id}
            className={`notification-toast notification-${notification.type}`}
            role={
              notification.type === "error"
                ? "alert"
                : "status"
            }
          >
            <div className="notification-icon">
              <Icon size={20} aria-hidden="true" />
            </div>

            <div className="notification-content">
              <strong className="notification-title">
                {notification.title ??
                  notificationLabels[notification.type]}
              </strong>

              <p className="notification-message">
                {notification.message}
              </p>
            </div>

            <button
              type="button"
              className="notification-dismiss"
              aria-label="Dismiss notification"
              onClick={() => onDismiss(notification.id)}
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}