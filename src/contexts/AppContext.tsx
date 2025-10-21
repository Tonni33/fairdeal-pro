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
import {
  Player,
  Team,
  Event,
  AppContextType,
  TeamClub,
  TeamPlayer,
} from "../types";
import { useAuth } from "./AuthContext";

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: React.ReactNode;
}

// Palauttaa kaikki joukkueet, joissa käyttäjän sähköposti löytyy members-listasta tai on adminId
// Ottaa myös huomioon pelaajan teamIds-kentän
export function getUserTeams(
  user: { email: string; id?: string } | null | undefined,
  teams: Team[],
  players: Player[] = []
): Team[] {
  if (!user || !user.email) return [];
  const email = user.email;
  const userId = user.id;

  // Find user's player record to get teamIds
  const userPlayer = players.find((p) => p.email === email);
  const playerTeamIds = userPlayer?.teamIds || [];

  const userTeams = teams.filter(
    (team) =>
      // Check if user is admin by email
      team.adminId === email ||
      // Check if user is member by email (legacy support)
      (Array.isArray(team.members) && team.members.includes(email)) ||
      // Check if user is member by user ID (current format)
      (userId &&
        Array.isArray(team.members) &&
        team.members.includes(userId)) ||
      // Check if user is member by playerId (for backwards compatibility)
      (userPlayer?.playerId &&
        Array.isArray(team.members) &&
        team.members.includes(userPlayer.playerId)) ||
      // Check if user's player record has this team ID
      playerTeamIds.includes(team.id)
  );

  console.log(
    `getUserTeams: Käyttäjä ${email} (ID: ${userId}) kuuluu ${userTeams.length} joukkueeseen:`,
    userTeams.map((t) => t.name)
  );
  console.log(`getUserTeams: Pelaajan teamIds:`, playerTeamIds);
  return userTeams;
}

// Palauttaa vain ne joukkueet joissa käyttäjä on admin
export function getUserAdminTeams(
  user: { uid: string; isMasterAdmin?: boolean } | null | undefined,
  teams: Team[]
): Team[] {
  if (!user?.uid) return [];

  // MasterAdmin näkee kaikki joukkueet
  if (user.isMasterAdmin) return teams;

  // Palauta vain joukkueet joissa käyttäjä on admin
  const adminTeams = teams.filter(
    (team) => team.adminIds?.includes(user.uid) || team.adminId === user.uid
  );

  console.log(
    `getUserAdminTeams: Käyttäjä ${user.uid} on admin ${adminTeams.length} joukkueessa:`,
    adminTeams.map((t) => t.name)
  );
  return adminTeams;
}

// Hakee pelaajan joukkuekohtaiset taidot
export function getPlayerTeamSkills(
  playerId: string,
  teamId: string,
  teamPlayers: TeamPlayer[]
): { category: number; multiplier: number; position: string } | null {
  const teamPlayer = teamPlayers.find(
    (tp) => tp.playerId === playerId && tp.teamId === teamId && tp.isActive
  );

  if (teamPlayer) {
    return {
      category: teamPlayer.category,
      multiplier: teamPlayer.multiplier,
      position: teamPlayer.position,
    };
  }

  return null;
}

// Luo Player objektin joukkuekohtaisilla taidoilla
export function createPlayerWithTeamSkills(
  player: Player,
  teamId: string,
  teamPlayers: TeamPlayer[]
): Player {
  const teamSkills = getPlayerTeamSkills(player.id, teamId, teamPlayers);

  if (teamSkills) {
    return {
      ...player,
      category: teamSkills.category,
      multiplier: teamSkills.multiplier,
      position: teamSkills.position,
      // Update derived fields
      skillLevel: Math.round(teamSkills.multiplier * 2.5) || 1,
      isGoalkeeper: teamSkills.position === "MV",
      points: Math.round(teamSkills.multiplier * 100) || 100,
    };
  }

  // Return player with default skills if no team-specific skills found
  return player;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([]);
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
              teamSkills: data.teamSkills || {}, // Lisätään teamSkills kenttä
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
              adminIds: data.adminIds || (data.adminId ? [data.adminId] : []), // Support multiple admins with legacy fallback
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

      // Listen to team players collection
      const teamPlayersQuery = query(
        collection(db, "teamPlayers"),
        orderBy("joinedAt", "desc")
      );
      const unsubscribeTeamPlayers = onSnapshot(
        teamPlayersQuery,
        (snapshot) => {
          const teamPlayersData: TeamPlayer[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            teamPlayersData.push({
              id: doc.id,
              playerId: data.playerId,
              teamId: data.teamId,
              category: data.category || 2,
              multiplier: data.multiplier || 1.0,
              position: data.position || "H",
              isActive: data.isActive !== false,
              joinedAt: data.joinedAt?.toDate
                ? data.joinedAt.toDate()
                : new Date(data.joinedAt || Date.now()),
              updatedAt: data.updatedAt?.toDate
                ? data.updatedAt.toDate()
                : undefined,
              updatedBy: data.updatedBy || "",
              notes: data.notes || "",
            });
          });
          setTeamPlayers(teamPlayersData);
          console.log(
            `AppContext: Loaded ${teamPlayersData.length} team players relationships`
          );
        },
        (error) => {
          console.error("Error fetching team players:", error);
          setError("Failed to load team players");
        }
      );
      unsubscribes.push(unsubscribeTeamPlayers);

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
    teamPlayers,
    selectedTeamClub,
    setSelectedTeamClub,
    selectedTeamId,
    setSelectedTeamId,
    loading,
    error,
    refreshData,
    getUserAdminTeams,
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
