/**
 * NotificationHandler Component
 * Wraps the app content and initializes push notifications
 */

import React, { useEffect } from "react";
import { useNotifications } from "../hooks/useNotifications";

interface NotificationHandlerProps {
  children: React.ReactNode;
}

export function NotificationHandler({
  children,
}: NotificationHandlerProps): React.ReactElement {
  const { expoPushToken, notification, notificationsEnabled } =
    useNotifications();

  useEffect(() => {
    if (expoPushToken) {
      console.log(
        "[Notifications] Push token registered:",
        expoPushToken.substring(0, 30) + "..."
      );
    }
  }, [expoPushToken]);

  useEffect(() => {
    if (notification) {
      console.log(
        "[Notifications] Received:",
        notification.request.content.title
      );
    }
  }, [notification]);

  useEffect(() => {
    console.log("[Notifications] Enabled:", notificationsEnabled);
  }, [notificationsEnabled]);

  return <>{children}</>;
}
