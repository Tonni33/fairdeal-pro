/**
 * useNotifications Hook
 * Manages push notification registration and handling
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
import { useApp } from "../contexts/AppContext";
import { useAuth } from "../contexts/AuthContext";
import {
  registerForPushNotificationsAsync,
  savePushToken,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  scheduleAllEventReminders,
  areNotificationsEnabled,
} from "../services/notificationService";

interface UseNotificationsResult {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  notificationsEnabled: boolean;
  refreshNotifications: () => Promise<void>;
}

export function useNotifications(): UseNotificationsResult {
  const { user } = useAuth();
  const { events, teams } = useApp();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] =
    useState<Notifications.Notification | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  // Register for push notifications
  useEffect(() => {
    const registerNotifications = async () => {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        setExpoPushToken(token);

        // Save token to Firestore if user is logged in
        if (user?.uid) {
          await savePushToken(user.uid, token);
        }
      }

      // Check if notifications are enabled
      const enabled = await areNotificationsEnabled();
      setNotificationsEnabled(enabled);
    };

    registerNotifications();

    // Listen for incoming notifications
    notificationListener.current = addNotificationReceivedListener(
      (notification) => {
        console.log("Notification received:", notification);
        setNotification(notification);
      }
    );

    // Listen for notification responses (user taps)
    responseListener.current = addNotificationResponseReceivedListener(
      (response) => {
        console.log("Notification response:", response);
        const data = response.notification.request.content.data;

        // Handle navigation based on notification type
        if (
          data?.type === "event-reminder" ||
          data?.type === "roster-promotion"
        ) {
          // Could navigate to event details here
          console.log("Navigate to event:", data.eventId);
        }
      }
    );

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(
          notificationListener.current
        );
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [user?.uid]);

  // Schedule event reminders when events or user changes
  useEffect(() => {
    const scheduleReminders = async () => {
      if (
        !user?.uid ||
        !events ||
        events.length === 0 ||
        !notificationsEnabled
      ) {
        return;
      }

      // Filter future events
      const now = new Date();
      const futureEvents = events.filter((event) => {
        const eventDateRaw = event.date as Date | { toDate: () => Date };
        const eventDate =
          eventDateRaw instanceof Date ? eventDateRaw : eventDateRaw.toDate();
        return eventDate > now;
      });

      // Get team info for events
      const teamInfo = teams?.map((t) => ({ id: t.id, name: t.name })) || [];

      await scheduleAllEventReminders(user.uid, futureEvents, teamInfo);
    };

    scheduleReminders();
  }, [user?.uid, events, teams, notificationsEnabled]);

  // Check notification permission status when app comes to foreground
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        const enabled = await areNotificationsEnabled();
        setNotificationsEnabled(enabled);
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );
    return () => subscription.remove();
  }, []);

  const refreshNotifications = useCallback(async () => {
    const enabled = await areNotificationsEnabled();
    setNotificationsEnabled(enabled);

    if (enabled && user?.uid) {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        setExpoPushToken(token);
        await savePushToken(user.uid, token);
      }
    }
  }, [user?.uid]);

  return {
    expoPushToken,
    notification,
    notificationsEnabled,
    refreshNotifications,
  };
}
