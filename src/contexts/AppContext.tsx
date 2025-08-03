import React, { createContext, useContext, useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  doc,
  updateDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { Player, Team, Event, AppContextType, TeamClub } from "../types";
import { useAuth } from "./AuthContext";

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: React.ReactNode;
}

// Palauttaa kaikki joukkueet, joissa käyttäjän sähköposti löytyy members-listasta tai on adminId
export function getUserTeams(
  user: { email: string } | null | undefined,
  teams: Team[]
): Team[] {
  if (!user || !user.email) return [];
  const email = user.email;
  const userTeams = teams.filter(
    (team) =>
      (Array.isArray(team.members) && team.members.includes(email)) ||
      team.adminId === email
  );
  console.log(
    `getUserTeams: Käyttäjä ${email} kuuluu ${userTeams.length} joukkueeseen:`,
    userTeams.map((t) => t.name)
  );
  return userTeams;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedTeamClub, setSelectedTeamClub] = useState<TeamClub | null>(
    null
  );
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setPlayers([]);
      setTeams([]);
      setEvents([]);
      setLoading(false);
      return;
    }

    const unsubscribes: (() => void)[] = [];

    try {
      // Subscribe to players (from users collection)
      const usersQuery = query(collection(db, "users"));

      const unsubscribeUsers = onSnapshot(
        usersQuery,
        (snapshot) => {
          const playersData: Player[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            // Use position directly (case-insensitive) if valid, else default to 'H'
            const validPositions = ["H", "P", "H/P", "MV"];
            let normalizedPosition = "H";
            if (typeof data.position === "string") {
              const pos = data.position.trim().toUpperCase();
              normalizedPosition = validPositions.includes(pos) ? pos : "H";
            }
            playersData.push({
              id: doc.id,
              name: data.name,
              email: data.email,
              phone: data.phone || "",
              category: data.category || "Intermediate",
              multiplier: data.multiplier || 1,
              position: normalizedPosition,
              image: data.image || "",
              isAdmin: data.isAdmin || false,
              teamIds: data.teamIds || [],
              teams: data.teams || [],
              playerId: data.playerId || doc.id,
              licenceCode: data.licenceCode || "",
              createdAt: data.createdAt?.toDate
                ? data.createdAt.toDate()
                : new Date(data.createdAt || Date.now()),
              // Legacy compatibility fields - all required
              skillLevel: Math.round((data.multiplier || 1) * 2.5) || 1, // Convert multiplier to 1-5 scale
              isActive: true,
              isGoalkeeper: normalizedPosition === "MV",
              points: Math.round((data.multiplier || 1) * 100) || 100,
              notes: "",
              createdBy: data.createdBy || "",
              updatedAt: data.updatedAt?.toDate
                ? data.updatedAt.toDate()
                : new Date(),
            });
          });
          setPlayers(playersData);
          console.log(
            `AppContext: Loaded ${playersData.length} players from users collection`
          );
          console.log("AppContext: Current user:", user?.id, user?.email);
        },
        (error) => {
          console.error("Error fetching players from users:", error);
          setError("Failed to load players");
        }
      );
      unsubscribes.push(unsubscribeUsers);

      // Subscribe to teams
      const teamsQuery = query(collection(db, "teams"));

      const unsubscribeTeams = onSnapshot(
        teamsQuery,
        (snapshot) => {
          const teamsData: Team[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            teamsData.push({
              id: doc.id,
              name: data.name,
              description: data.description || "",
              color: data.color || "#000000",
              adminId: data.adminId,
              members: data.members || [],
              licenceCode: data.licenceCode || "",
              createdAt: data.createdAt?.toDate
                ? data.createdAt.toDate()
                : new Date(data.createdAt || Date.now()),
              // Legacy compatibility fields
              players: [], // Will be populated later by matching members to players
              totalPoints: 0,
              goalkeepers: [],
              fieldPlayers: [],
            });
          });
          setTeams(teamsData);
          console.log(`AppContext: Loaded ${teamsData.length} teams`);
          console.log(
            "AppContext: Teams data:",
            teamsData.map((t) => ({
              id: t.id,
              name: t.name,
              adminId: t.adminId,
              members: t.members,
            }))
          );
        },
        (error) => {
          console.error("Error fetching teams:", error);
          setError("Failed to load teams");
        }
      );
      unsubscribes.push(unsubscribeTeams);

      // Subscribe to game events
      const eventsQuery = query(collection(db, "events"));

      const unsubscribeEvents = onSnapshot(
        eventsQuery,
        (snapshot) => {
          const eventsData: Event[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();

            eventsData.push({
              id: doc.id,
              title: data.title,
              description: data.description,
              date: data.date?.toDate
                ? data.date.toDate()
                : new Date(data.date || Date.now()),
              location: data.location,
              maxPlayers: data.maxPlayers,
              maxGoalkeepers: data.maxGoalkeepers,
              // Check registeredPlayers, participants, and players for backward compatibility
              registeredPlayers:
                data.registeredPlayers ||
                data.participants ||
                data.players ||
                [],
              reservePlayers: data.reservePlayers || [],
              teams: data.teams || [],
              teamId: data.teamId, // Korjattu: käytetään data.teamId eikä data.teamClubId
              createdBy: data.createdBy,
              createdAt: data.createdAt?.toDate
                ? data.createdAt.toDate()
                : new Date(data.createdAt || Date.now()),
              // Add generatedTeams and lastTeamGeneration fields
              generatedTeams: data.generatedTeams || undefined,
              lastTeamGeneration: data.lastTeamGeneration?.toDate
                ? data.lastTeamGeneration.toDate()
                : data.lastTeamGeneration || undefined,
            });
          });
          setEvents(eventsData);
          console.log(`AppContext: Loaded ${eventsData.length} events`);
          console.log(
            "Events with generatedTeams:",
            eventsData
              .filter((e) => e.generatedTeams)
              .map((e) => ({
                id: e.id,
                title: e.title,
                hasGeneratedTeams: !!e.generatedTeams,
                teamsCount: e.generatedTeams?.teams?.length || 0,
              }))
          );
        },
        (error) => {
          console.error("Error fetching events:", error);
          setError("Failed to load events");
        }
      );
      unsubscribes.push(unsubscribeEvents);

      setLoading(false);
    } catch (error) {
      console.error("Error setting up data subscriptions:", error);
      setError("Failed to initialize data");
      setLoading(false);
    }

    // Cleanup function
    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [user]);

  const refreshData = async (): Promise<void> => {
    // Data is automatically refreshed via real-time listeners
    setError(null);

    // Clean up old event generated teams (older than 24 hours past event date)
    await cleanupOldGeneratedTeams();
  };

  const cleanupOldGeneratedTeams = async () => {
    try {
      const now = new Date();
      const eventsToClean = events.filter((event) => {
        if (!event.generatedTeams) return false;

        const eventDate = new Date(event.date);
        const hoursAfterEvent =
          (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60);

        // Clean up if event was more than 24 hours ago
        return hoursAfterEvent > 24;
      });

      console.log(`Cleaning up ${eventsToClean.length} old generated teams`);

      for (const event of eventsToClean) {
        const eventRef = doc(db, "events", event.id);
        await updateDoc(eventRef, {
          generatedTeams: null,
        });
      }
    } catch (error) {
      console.error("Error cleaning up old generated teams:", error);
    }
  };

  const value: AppContextType = {
    players,
    events,
    teams,
    selectedTeamClub,
    setSelectedTeamClub,
    selectedTeamId,
    setSelectedTeamId,
    loading,
    error,
    refreshData,
    // getUserTeams voidaan käyttää myös contextin kautta, jos halutaan
    // getUserTeams: (userArg, teamsArg) => getUserTeams(userArg, teamsArg ?? teams),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
