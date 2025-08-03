import { doc, getDoc } from "firebase/firestore";
import { db } from "../services/firebase";

export interface EventDefaults {
  maxPlayers: number;
  maxGoalkeepers: number;
  defaultLocation: string;
  defaultTime: string;
  eventDuration: number; // minuutteina
  defaultTitle: string; // Oletusnimi tapahtumalle
  autoCreateTeams: boolean;
  teamSize: number;
  notificationEnabled: boolean;
}

const DEFAULT_SETTINGS: EventDefaults = {
  maxPlayers: 20,
  maxGoalkeepers: 2,
  defaultLocation: "",
  defaultTime: "19:00",
  eventDuration: 90,
  defaultTitle: "",
  autoCreateTeams: true,
  teamSize: 10,
  notificationEnabled: true,
};

export const getEventDefaults = async (
  teamId?: string
): Promise<EventDefaults> => {
  try {
    // If teamId is provided, try to get team-specific settings first
    if (teamId) {
      const teamSettingsDoc = await getDoc(
        doc(db, "settings", `team-${teamId}`)
      );
      if (teamSettingsDoc.exists()) {
        return {
          ...DEFAULT_SETTINGS,
          ...teamSettingsDoc.data(),
        } as EventDefaults;
      }
    }

    // Fall back to global settings
    const settingsDoc = await getDoc(doc(db, "settings", "eventDefaults"));
    if (settingsDoc.exists()) {
      return { ...DEFAULT_SETTINGS, ...settingsDoc.data() } as EventDefaults;
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error("Error loading event defaults:", error);
    return DEFAULT_SETTINGS;
  }
};

export const formatTimeString = (time: string): string => {
  // Ensure time is in HH:MM format
  const timeParts = time.split(":");
  if (timeParts.length === 2) {
    const hours = timeParts[0].padStart(2, "0");
    const minutes = timeParts[1].padStart(2, "0");
    return `${hours}:${minutes}`;
  }
  return "19:00"; // fallback
};

export const calculateEventEndTime = (
  startTime: string,
  duration: number
): string => {
  try {
    const [hours, minutes] = startTime.split(":").map(Number);
    const startDate = new Date();
    startDate.setHours(hours, minutes, 0, 0);

    const endDate = new Date(startDate.getTime() + duration * 60000); // duration in milliseconds

    const endHours = endDate.getHours().toString().padStart(2, "0");
    const endMinutes = endDate.getMinutes().toString().padStart(2, "0");

    return `${endHours}:${endMinutes}`;
  } catch (error) {
    console.error("Error calculating end time:", error);
    return startTime;
  }
};
