import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({
  title,
  description,
  icon,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={["empty-state", className]
        .filter(Boolean)
        .join(" ")}
      role="status"
    >
      {icon && (
        <div className="empty-icon" aria-hidden="true">
          {icon}
        </div>
      )}

      <strong>{title}</strong>
      <span>{description}</span>

      {action && (
        <div className="empty-state-action">
          {action}
        </div>
      )}
    </div>
  );
}