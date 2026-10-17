import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export type NotificationType =
  | "success"
  | "error"
  | "warning"
  | "info";

export interface NotificationInput {
  title?: string;
  message: string;
  type?: NotificationType;

  /**
   * Duration in milliseconds.
   * Use null or 0 to disable automatic dismissal.
   */
  duration?: number | null;
}

export interface AppNotification {
  id: string;
  title?: string;
  message: string;
  type: NotificationType;
  createdAt: number;
}

const DEFAULT_DURATION = 5_000;

export function useNotifications() {
  const [notifications, setNotifications] = useState<
    AppNotification[]
  >([]);

  const sequence = useRef(0);

  const timers = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());

  const dismissNotification = useCallback((id: string) => {
    const timer = timers.current.get(id);

    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }

    setNotifications((current) =>
      current.filter((notification) => notification.id !== id),
    );
  }, []);

  const notify = useCallback(
    (input: NotificationInput): string => {
      const message = input.message.trim();

      if (!message) {
        return "";
      }

      const id = `${Date.now()}-${++sequence.current}`;
      const createdAt = Date.now();

      const notification: AppNotification = {
        id,
        title: input.title,
        message,
        type: input.type ?? "info",
        createdAt,
      };

      setNotifications((current) => [
        ...current,
        notification,
      ]);

      const duration =
        input.duration === undefined
          ? DEFAULT_DURATION
          : input.duration;

      if (duration !== null && duration > 0) {
        const timer = setTimeout(() => {
          dismissNotification(id);
        }, duration);

        timers.current.set(id, timer);
      }

      return id;
    },
    [dismissNotification],
  );

  const clearNotifications = useCallback(() => {
    for (const timer of timers.current.values()) {
      clearTimeout(timer);
    }

    timers.current.clear();
    setNotifications([]);
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) {
        clearTimeout(timer);
      }

      timers.current.clear();
    };
  }, []);

  return {
    notifications,
    notify,
    dismissNotification,
    clearNotifications,
  };
}