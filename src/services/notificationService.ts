/**
 * Push Notification Service
 * Handles push notifications for FairDeal Pro
 *
 * Features:
 * - 24h event reminder
 * - Reserve player promoted to roster notification
 */

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "./firebase";
import { Event, Player } from "../types";

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Register for push notifications and get the Expo push token
 */
export async function registerForPushNotificationsAsync(): Promise<
  string | null
> {
  let token: string | null = null;

  // Check if it's a physical device (required for push notifications)
  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return null;
  }

  // Check and request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permission not granted");
    return null;
  }

  try {
    // Get the Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "fairdeal-pro", // Your Expo project ID
    });
    token = tokenData.data;
    console.log("Expo Push Token:", token);
  } catch (error) {
    console.error("Error getting push token:", error);
    return null;
  }

  // Android-specific channel configuration
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "FairDeal Pro",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2196F3",
    });

    await Notifications.setNotificationChannelAsync("event-reminders", {
      name: "Tapahtumamuistutukset",
      description: "Muistutukset tulevista tapahtumista",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4CAF50",
    });

    await Notifications.setNotificationChannelAsync("roster-updates", {
      name: "Kokoonpanopäivitykset",
      description: "Ilmoitukset kun pääset mukaan tapahtumaan",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: "#FF9800",
    });
  }

  return token;
}

/**
 * Save push token to Firestore for the user
 */
export async function savePushToken(
  userId: string,
  token: string
): Promise<void> {
  try {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      pushToken: token,
      pushTokenUpdatedAt: new Date(),
    });
    console.log("Push token saved for user:", userId);
  } catch (error) {
    console.error("Error saving push token:", error);
  }
}

/**
 * Get push token for a user from Firestore
 */
export async function getPushToken(userId: string): Promise<string | null> {
  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      return userDoc.data().pushToken || null;
    }
    return null;
  } catch (error) {
    console.error("Error getting push token:", error);
    return null;
  }
}

/**
 * Schedule a local notification for event reminder (24h before)
 */
export async function scheduleEventReminder(
  event: Event,
  teamName: string
): Promise<string | null> {
  try {
    const eventDateRaw = event.date as Date | { toDate: () => Date };
    const eventDate =
      eventDateRaw instanceof Date ? eventDateRaw : eventDateRaw.toDate();
    const reminderTime = new Date(eventDate.getTime() - 24 * 60 * 60 * 1000); // 24 hours before

    // Don't schedule if the reminder time has already passed
    if (reminderTime <= new Date()) {
      console.log("Reminder time has already passed for event:", event.title);
      return null;
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "📅 Tapahtuma huomenna!",
        body: `${event.title} (${teamName}) - ${formatTime(eventDate)}`,
        data: { eventId: event.id, type: "event-reminder" },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderTime,
        channelId: Platform.OS === "android" ? "event-reminders" : undefined,
      },
    });

    console.log(
      "Scheduled event reminder:",
      notificationId,
      "for",
      reminderTime
    );
    return notificationId;
  } catch (error) {
    console.error("Error scheduling event reminder:", error);
    return null;
  }
}

/**
 * Cancel a scheduled notification
 */
export async function cancelNotification(
  notificationId: string
): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    console.log("Cancelled notification:", notificationId);
  } catch (error) {
    console.error("Error cancelling notification:", error);
  }
}

/**
 * Cancel all scheduled notifications for a specific event
 */
export async function cancelEventNotifications(eventId: string): Promise<void> {
  try {
    const scheduledNotifications =
      await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of scheduledNotifications) {
      if (notification.content.data?.eventId === eventId) {
        await Notifications.cancelScheduledNotificationAsync(
          notification.identifier
        );
        console.log("Cancelled notification for event:", eventId);
      }
    }
  } catch (error) {
    console.error("Error cancelling event notifications:", error);
  }
}

/**
 * Send immediate notification when player is promoted from reserve to roster
 * This should be called from Firebase Cloud Functions for remote notifications
 * For now, we'll use local notifications for testing
 */
export async function sendPromotedToRosterNotification(
  playerId: string,
  event: Event,
  teamName: string
): Promise<void> {
  try {
    const eventDateRaw = event.date as Date | { toDate: () => Date };
    const eventDate =
      eventDateRaw instanceof Date ? eventDateRaw : eventDateRaw.toDate();

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🎉 Pääsit mukaan!",
        body: `${event.title} (${teamName}) - ${formatDate(
          eventDate
        )} klo ${formatTime(eventDate)}`,
        data: { eventId: event.id, type: "roster-promotion", playerId },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(Date.now() + 1000), // 1 second from now (immediate)
        channelId: Platform.OS === "android" ? "roster-updates" : undefined,
      },
    });

    console.log("Sent roster promotion notification to player:", playerId);
  } catch (error) {
    console.error("Error sending roster promotion notification:", error);
  }
}

/**
 * Schedule reminders for all upcoming events the user is registered for
 */
export async function scheduleAllEventReminders(
  userId: string,
  events: Event[],
  teams: { id: string; name: string }[]
): Promise<void> {
  // First, cancel all existing event reminders
  const scheduledNotifications =
    await Notifications.getAllScheduledNotificationsAsync();
  for (const notification of scheduledNotifications) {
    if (notification.content.data?.type === "event-reminder") {
      await Notifications.cancelScheduledNotificationAsync(
        notification.identifier
      );
    }
  }

  // Schedule new reminders for events user is registered for
  for (const event of events) {
    const isRegistered = event.registeredPlayers?.includes(userId);
    if (!isRegistered) continue;

    const team = teams.find((t) => t.id === event.teamId);
    const teamName = team?.name || "Joukkue";

    await scheduleEventReminder(event, teamName);
  }

  console.log("Scheduled reminders for", events.length, "events");
}

/**
 * Add listener for notification received while app is in foreground
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Add listener for notification response (when user taps notification)
 */
export function addNotificationResponseReceivedListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Get all scheduled notifications
 */
export async function getScheduledNotifications(): Promise<
  Notifications.NotificationRequest[]
> {
  return Notifications.getAllScheduledNotificationsAsync();
}

// Helper functions
function formatTime(date: Date): string {
  return date.toLocaleTimeString("fi-FI", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(date: Date): string {
  const days = ["su", "ma", "ti", "ke", "to", "pe", "la"];
  const day = days[date.getDay()];
  return `${day} ${date.getDate()}.${date.getMonth() + 1}.`;
}

/**
 * Check if notifications are enabled in device settings
 */
export async function areNotificationsEnabled(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted";
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}
