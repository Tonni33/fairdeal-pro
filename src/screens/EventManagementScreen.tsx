import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  arrayRemove,
  arrayUnion,
  getDoc,
  deleteDoc,
} from "firebase/firestore";
import { Button, Dialog, Portal } from "react-native-paper";
import { db } from "../services/firebase";
import { useApp, getUserAdminTeams } from "../contexts/AppContext";
import { useAuth } from "../contexts/AuthContext";

// Web-compatible confirm dialog (Alert.alert doesn't support multiple buttons on web)
const webConfirm = (title: string, message: string): boolean => {
  return window.confirm(`${title}\n\n${message}`);
};

// Web-compatible prompt for role selection
const webPromptRole = (
  title: string,
  message: string,
  options: string[],
): string | null => {
  const result = window.prompt(
    `${title}\n\n${message}\n\nVaihtoehdot: ${options.join(", ")}`,
    options[0],
  );
  if (!result) return null;
  const upper = result.toUpperCase().trim();
  // Map common inputs
  if (
    upper === "KENTTÄPELAAJA" ||
    upper === "KENTTAPELAAJA" ||
    upper === "H" ||
    upper === "P" ||
    upper === "H/P"
  )
    return "field";
  if (upper === "MAALIVAHTI" || upper === "MV") return "MV";
  return null;
};

const EventManagementScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { players, teams } = useApp();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [addingPlayerId, setAddingPlayerId] = useState<string | null>(null);
  const [isPlayerModalVisible, setIsPlayerModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [removingPlayerId, setRemovingPlayerId] = useState<string | null>(null);

  // Multi-select state for adding multiple players
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [isAddingMultiplePlayers, setIsAddingMultiplePlayers] = useState(false);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string | null>(
    null,
  ); // null = kaikki joukkueet
  const [isTeamFilterModalVisible, setIsTeamFilterModalVisible] =
    useState(false);

  // Hae käyttäjän admin-joukkueet (MasterAdmin näkee kaikki)
  const userAdminTeams = getUserAdminTeams(user, teams);

  // Helper function to get player's team-specific skills for the event
  const getPlayerEventSkills = (
    player: any,
    eventTeamId?: string,
    playerRole?: string,
  ) => {
    if (!eventTeamId || !player.teamSkills?.[eventTeamId]) {
      // Return default player skills
      return {
        category: player.category,
        multiplier: player.multiplier,
        position: player.position,
        hasTeamSkills: false,
      };
    }

    // Return team-specific skills
    const teamSkills = player.teamSkills[eventTeamId];
    console.log(
      `📋 EventManagement: Using team skills for ${player.name} in event team ${eventTeamId}:`,
      teamSkills,
    );

    // Determine which role's skills to use
    const roleToUse = playerRole || player.position;
    const isGoalkeeper = roleToUse === "MV";

    // Use role-specific skills if available, otherwise fall back to legacy fields
    const roleSkills = isGoalkeeper
      ? (teamSkills as any).goalkeeper
      : (teamSkills as any).field;

    const category =
      roleSkills?.category || teamSkills.category || player.category;
    const multiplier =
      roleSkills?.multiplier || teamSkills.multiplier || player.multiplier;
    const position = roleToUse || teamSkills.position || player.position;

    return {
      category,
      multiplier,
      position,
      hasTeamSkills: true,
    };
  };

  // Helper function to get players that belong to the event's team
  const getTeamPlayers = () => {
    if (!selectedEvent?.teamId) {
      return players; // If no team specified, show all players
    }
    return players.filter(
      (player) =>
        player.teamIds?.includes(selectedEvent.teamId) ||
        player.teams?.includes(selectedEvent.teamId),
    );
  };

  // Helper function to check if player needs role selection
  const needsRoleSelection = (player: any) => {
    console.log("🔍 needsRoleSelection check:", {
      playerName: player.name,
      hasPositions: !!player.positions,
      positions: player.positions,
      hasTeamSkills: !!player.teamSkills,
      teamId: selectedEvent?.teamId,
      teamSkills: player.teamSkills?.[selectedEvent?.teamId || ""],
    });

    // Check if player has positions array
    if (player.positions && player.positions.length > 0) {
      const hasMV = player.positions.includes("MV");
      const hasFieldPosition = player.positions.some((p: string) =>
        ["H", "P"].includes(p),
      );
      console.log("✅ Using positions array:", { hasMV, hasFieldPosition });
      return hasMV && hasFieldPosition;
    }

    // Fallback: check teamSkills for field and goalkeeper skills
    if (selectedEvent?.teamId && player.teamSkills?.[selectedEvent.teamId]) {
      const teamSkills = player.teamSkills[selectedEvent.teamId];
      const fieldSkills = (teamSkills as any).field;
      const goalkeeperSkills = (teamSkills as any).goalkeeper;
      const hasFieldSkills = !!(fieldSkills && typeof fieldSkills === "object");
      const hasGoalkeeperSkills = !!(
        goalkeeperSkills && typeof goalkeeperSkills === "object"
      );
      console.log("✅ Using teamSkills fallback:", {
        hasFieldSkills,
        hasGoalkeeperSkills,
        fieldSkills,
        goalkeeperSkills,
      });
      return hasFieldSkills && hasGoalkeeperSkills;
    }

    console.log("❌ No role selection needed");
    return false;
  };

  // Helper functions for player counting by position
  const getFieldPlayers = (playerIds: string[], event?: any) => {
    return playerIds.filter((id) => {
      const player = players.find((p) => p.id === id);
      if (!player) return false;
      // Check playerRole first, then fall back to player's primary position
      const eventToCheck = event || selectedEvent;
      const role = eventToCheck?.playerRoles?.[id] || player?.positions[0];
      return ["H", "P", "H/P"].includes(role);
    });
  };

  const getGoalkeepers = (playerIds: string[], event?: any) => {
    return playerIds.filter((id) => {
      const player = players.find((p) => p.id === id);
      if (!player) return false;
      // Check playerRole first, then fall back to player's primary position
      const eventToCheck = event || selectedEvent;
      const role = eventToCheck?.playerRoles?.[id] || player?.positions[0];
      return role === "MV";
    });
  };

  // Helper function to sort players - goalkeepers at the end
  const sortPlayersByPosition = (playerIds: string[]) => {
    const fieldPlayers = getFieldPlayers(playerIds);
    const goalkeepers = getGoalkeepers(playerIds);
    return [...fieldPlayers, ...goalkeepers];
  };

  // Helper function to get player style based on position and teamMember status
  const getPlayerIconColor = (
    player: any,
    teamId?: string,
    isTeamMember?: boolean,
  ) => {
    // Debug logging
    console.log(
      `[getPlayerIconColor] Player: ${player?.name}, ID: ${player?.id}`,
    );
    console.log(`[getPlayerIconColor] Positions:`, player?.positions);
    console.log(
      `[getPlayerIconColor] Has MV:`,
      player?.positions?.includes("MV"),
    );

    // Check if player is actually registered to the event
    const isRegistered =
      selectedEvent?.registeredPlayers?.includes(player?.id) ||
      selectedEvent?.reservePlayers?.includes(player?.id);

    // Only use eventRole if player is actually registered to the event
    const eventRole = isRegistered
      ? selectedEvent?.playerRoles?.[player?.id]
      : null;

    if (eventRole) {
      console.log(`[getPlayerIconColor] Event role found: ${eventRole}`);
      if (eventRole === "MV") {
        return "#4caf50"; // Green for goalkeepers
      }
      // For field players, check teamMember status
      if (isTeamMember === false) {
        return "#ff9800"; // Orange for guests
      }
      return "#1976d2"; // Blue for team members
    }

    // If no event role (or not registered), check if player has MV position
    // (used in "Add players" modal before they're registered)
    if (player?.positions?.includes("MV")) {
      console.log(`[getPlayerIconColor] MV position found, returning green`);
      return "#4caf50"; // Green for potential goalkeepers
    }

    // Check teamMember status for non-goalkeepers
    if (isTeamMember === false) {
      console.log(`[getPlayerIconColor] Guest player, returning orange`);
      return "#ff9800"; // Orange for guests
    }

    console.log(`[getPlayerIconColor] Returning blue (team member)`);
    return "#1976d2"; // Blue for team members
  };

  // Edit form states
  const [editForm, setEditForm] = useState({
    name: "",
    date: "",
    time: "",
    location: "",
  });
  // Date/time pickers for edit modal
  const [editDate, setEditDate] = useState<Date | null>(null);
  const [editTime, setEditTime] = useState<Date | null>(null);
  const [showEditDateDialog, setShowEditDateDialog] = useState(false);
  const [showEditTimeDialog, setShowEditTimeDialog] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  // Refresh events when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      fetchEvents();
    }, []),
  );

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, "events"));
      const eventList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Filter events to show only those from teams where user is admin
      const userAdminTeams = getUserAdminTeams(user, teams);
      const adminTeamIds = userAdminTeams.map((team) => team.id);

      const filteredEvents = eventList.filter((event: any) => {
        // If user is MasterAdmin, show all events
        if (user?.isMasterAdmin) return true;

        // If event has no teamId, don't show it (should belong to a team)
        if (!event.teamId) return false;

        // Show only events from teams where user is admin
        return adminTeamIds.includes(event.teamId);
      });

      // Jaa tapahtumat tuleviin ja menneisiin
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const upcomingEvents = filteredEvents
        .filter((event: any) => {
          const eventDate = new Date(event.date || 0);
          return eventDate >= now;
        })
        .sort((a: any, b: any) => {
          // Tulevat tapahtumat: lähin ensin
          const dateA = new Date(a.date || 0);
          const dateB = new Date(b.date || 0);
          return dateA.getTime() - dateB.getTime();
        });

      const pastEvents = filteredEvents
        .filter((event: any) => {
          const eventDate = new Date(event.date || 0);
          return eventDate < now;
        })
        .sort((a: any, b: any) => {
          // Menneet tapahtumat: uusin ensin
          const dateA = new Date(a.date || 0);
          const dateB = new Date(b.date || 0);
          return dateB.getTime() - dateA.getTime();
        });

      // Yhdistä: tulevat ensin, sitten menneet
      const sortedEvents = [...upcomingEvents, ...pastEvents];

      setEvents(sortedEvents);

      // Update selectedEvent if it exists to reflect latest data
      if (selectedEvent) {
        const updatedSelectedEvent = sortedEvents.find(
          (event: any) => event.id === selectedEvent.id,
        );
        if (updatedSelectedEvent) {
          setSelectedEvent(updatedSelectedEvent);
        }
      }
    } catch (e) {
      console.error("Error fetching events:", e);
      Alert.alert("Virhe", "Tapahtumien haku epäonnistui");
    }
    setLoading(false);
  };

  const handleSelectEvent = (event: any) => {
    setSelectedEvent(event);
    // Initialize edit form with current event data
    let dateObj: Date | null = null;
    let timeObj: Date | null = null;

    if (event.date) {
      try {
        dateObj = new Date(event.date);
        // Check if date is valid
        if (isNaN(dateObj.getTime())) {
          console.warn("Invalid date in event:", event.date);
          dateObj = null;
        } else {
          timeObj = new Date(event.date);
        }
      } catch (error) {
        console.error("Error parsing event date:", error);
        dateObj = null;
      }
    }

    setEditForm({
      name: event.name || event.title || "",
      date:
        dateObj && !isNaN(dateObj.getTime())
          ? `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(
              2,
              "0",
            )}-${String(dateObj.getDate()).padStart(2, "0")}`
          : "",
      time:
        dateObj && !isNaN(dateObj.getTime())
          ? dateObj.toLocaleTimeString("fi-FI", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "",
      location: event.location || "",
    });
    setEditDate(dateObj);
    setEditTime(timeObj);
  };

  const handleAddPlayerToEvent = async (
    playerId: string,
    selectedRole?: string,
  ) => {
    if (!selectedEvent) return;
    setAddingPlayerId(playerId);

    console.log("🚀 handleAddPlayerToEvent CALLED:", {
      playerId,
      selectedRole,
      eventId: selectedEvent.id,
      currentRegistered: selectedEvent.registeredPlayers || [],
    });

    try {
      const eventRef = doc(db, "events", selectedEvent.id);
      const currentPlayers = selectedEvent.registeredPlayers || [];

      console.log("🔍 Duplicate check:", {
        playerId,
        currentPlayers,
        isAlreadyRegistered: currentPlayers.includes(playerId),
      });

      if (currentPlayers.includes(playerId)) {
        console.log("⚠️ Player already registered - returning early");
        Alert.alert("Pelaaja on jo lisätty tapahtumaan");
        setAddingPlayerId(null);
        return;
      }

      // Check player limits based on position
      const player = players.find((p) => p.id === playerId);
      if (!player) {
        Alert.alert("Virhe", "Pelaajaa ei löytynyt");
        setAddingPlayerId(null);
        return;
      }

      console.log("🎯 handleAddPlayerToEvent:", {
        playerId,
        playerName: player.name,
        positions: player.positions,
        needsSelection: needsRoleSelection(player),
        selectedRole,
      });

      // Ask for role if player has multiple positions including MV
      if (!selectedRole && needsRoleSelection(player)) {
        if (Platform.OS === "web") {
          const role = webPromptRole(
            "Valitse rooli",
            "Pelaaja voi pelata useassa roolissa. Missä roolissa lisätään tähän tapahtumaan?",
            ["Kenttäpelaaja", "Maalivahti"],
          );
          if (!role) {
            setAddingPlayerId(null);
            return;
          }
          if (role === "MV") {
            handleAddPlayerToEvent(playerId, "MV");
          } else {
            const hasH = player.positions?.includes("H");
            const hasP = player.positions?.includes("P");
            let fieldPosition = "H";
            if (hasH && hasP) fieldPosition = "H/P";
            else if (hasP) fieldPosition = "P";
            else if (hasH) fieldPosition = "H";
            handleAddPlayerToEvent(playerId, fieldPosition);
          }
          return;
        }
        Alert.alert(
          "Valitse rooli",
          "Pelaaja voi pelata useassa roolissa. Missä roolissa lisätään tähän tapahtumaan?",
          [
            {
              text: "Peruuta",
              style: "cancel",
              onPress: () => setAddingPlayerId(null),
            },
            {
              text: "Kenttäpelaaja",
              onPress: () => {
                // Check if player has both H and P positions
                const hasH = player.positions?.includes("H");
                const hasP = player.positions?.includes("P");

                let fieldPosition = "H"; // Default

                if (hasH && hasP) {
                  // If both H and P, use H/P
                  fieldPosition = "H/P";
                } else if (hasP) {
                  // If only P
                  fieldPosition = "P";
                } else if (hasH) {
                  // If only H
                  fieldPosition = "H";
                }

                handleAddPlayerToEvent(playerId, fieldPosition);
              },
            },
            {
              text: "Maalivahti",
              onPress: () => handleAddPlayerToEvent(playerId, "MV"),
            },
          ],
          { cancelable: false },
        );
        return;
      }

      const currentFieldPlayers = getFieldPlayers(currentPlayers);
      const currentGoalkeepers = getGoalkeepers(currentPlayers);

      // Check guest registration threshold from team settings
      const team = teams.find((t) => t.id === selectedEvent.teamId);
      const guestRegistrationHours = team?.guestRegistrationHours || 24;
      const now = new Date();
      const eventDate = new Date(selectedEvent.date);
      const hoursUntilEvent =
        (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Check if player is a team member
      const teamId = selectedEvent.teamId || "";
      let isTeamMember = false;
      if (teamId && playerId) {
        try {
          const userRef = doc(db, "users", playerId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            const teamMemberValue = userData.teamMember?.[teamId];
            isTeamMember = teamMemberValue === true;
          }
        } catch (error) {
          console.error("Error fetching teamMember status:", error);
        }
      }

      // Use selected role or player's primary position
      const playerRole = selectedRole || player.positions[0];

      if (playerRole === "MV") {
        // Check goalkeeper limit
        if (
          selectedEvent.maxGoalkeepers &&
          currentGoalkeepers.length >= selectedEvent.maxGoalkeepers
        ) {
          // Offer reserve position for goalkeepers
          if (Platform.OS === "web") {
            const confirmed = webConfirm(
              "Maalivahdin paikat täynnä",
              "Haluatko lisätä pelaajan varalle?",
            );
            if (confirmed) {
              try {
                await updateDoc(eventRef, {
                  reservePlayers: [
                    ...(selectedEvent.reservePlayers || []),
                    playerId,
                  ],
                });
                alert("Pelaaja lisätty varalle");
                await fetchEvents();
              } catch (error) {
                alert("Varalle lisääminen epäonnistui");
              }
            }
            setAddingPlayerId(null);
            return;
          }
          Alert.alert(
            "Maalivahdin paikat täynnä",
            "Haluatko lisätä pelaajan varalle?",
            [
              { text: "Ei", style: "cancel" },
              {
                text: "Kyllä, varalle",
                onPress: async () => {
                  try {
                    await updateDoc(eventRef, {
                      reservePlayers: [
                        ...(selectedEvent.reservePlayers || []),
                        playerId,
                      ],
                    });
                    Alert.alert("Onnistui", "Pelaaja lisätty varalle");
                    await fetchEvents();
                  } catch (error) {
                    Alert.alert("Virhe", "Varalle lisääminen epäonnistui");
                  }
                },
              },
            ],
          );
          setAddingPlayerId(null);
          return;
        }
      } else if (["H", "P", "H/P"].includes(playerRole)) {
        // Check field player limit
        if (
          selectedEvent.maxPlayers &&
          currentFieldPlayers.length >= selectedEvent.maxPlayers
        ) {
          // Offer reserve position for field players
          if (Platform.OS === "web") {
            const confirmed = webConfirm(
              "Kenttäpelaajien paikat täynnä",
              "Haluatko lisätä pelaajan varalle?",
            );
            if (confirmed) {
              try {
                await updateDoc(eventRef, {
                  reservePlayers: [
                    ...(selectedEvent.reservePlayers || []),
                    playerId,
                  ],
                });
                alert("Pelaaja lisätty varalle");
                await fetchEvents();
              } catch (error) {
                alert("Varalle lisääminen epäonnistui");
              }
            }
            setAddingPlayerId(null);
            return;
          }
          Alert.alert(
            "Kenttäpelaajien paikat täynnä",
            "Haluatko lisätä pelaajan varalle?",
            [
              { text: "Ei", style: "cancel" },
              {
                text: "Kyllä, varalle",
                onPress: async () => {
                  try {
                    await updateDoc(eventRef, {
                      reservePlayers: [
                        ...(selectedEvent.reservePlayers || []),
                        playerId,
                      ],
                    });
                    Alert.alert("Onnistui", "Pelaaja lisätty varalle");
                    await fetchEvents();
                  } catch (error) {
                    Alert.alert("Virhe", "Varalle lisääminen epäonnistui");
                  }
                },
              },
            ],
          );
          setAddingPlayerId(null);
          return;
        }
      }

      // Check if guest is trying to register before threshold
      if (!isTeamMember && hoursUntilEvent > guestRegistrationHours) {
        if (Platform.OS === "web") {
          const confirmed = webConfirm(
            "Vakiokävijöillä etuoikeus",
            `${player.name} ei ole vakiokävijä. Vakiokävijöillä on vielä etuoikeus tapahtumaan. Haluatko lisätä pelaajan varalle?`,
          );
          if (confirmed) {
            try {
              await updateDoc(eventRef, {
                reservePlayers: [
                  ...(selectedEvent.reservePlayers || []),
                  playerId,
                ],
              });
              alert("Pelaaja lisätty varallistalle");
              await fetchEvents();
            } catch (error) {
              alert("Varalle lisääminen epäonnistui");
            }
          }
          setAddingPlayerId(null);
          return;
        }
        Alert.alert(
          "Vakiokävijöillä etuoikeus",
          `${player.name} ei ole vakiokävijä. Vakiokävijöillä on vielä etuoikeus tapahtumaan. Haluatko lisätä pelaajan varalle?`,
          [
            {
              text: "Peruuta",
              style: "cancel",
              onPress: () => setAddingPlayerId(null),
            },
            {
              text: "Kyllä, varallistalle",
              onPress: async () => {
                try {
                  await updateDoc(eventRef, {
                    reservePlayers: [
                      ...(selectedEvent.reservePlayers || []),
                      playerId,
                    ],
                  });
                  Alert.alert("Onnistui", "Pelaaja lisätty varallistalle");
                  await fetchEvents();
                } catch (error) {
                  Alert.alert("Virhe", "Varalle lisääminen epäonnistui");
                }
                setAddingPlayerId(null);
              },
            },
          ],
        );
        return;
      }

      // Save player and their selected role
      await updateDoc(eventRef, {
        registeredPlayers: [...currentPlayers, playerId],
        ...(selectedRole && {
          [`playerRoles.${playerId}`]: selectedRole,
        }),
      });

      // Update selectedEvent state
      const updatedPlayerRoles = selectedRole
        ? { ...selectedEvent.playerRoles, [playerId]: selectedRole }
        : selectedEvent.playerRoles;
      const updatedEvent = {
        ...selectedEvent,
        registeredPlayers: [...currentPlayers, playerId],
        playerRoles: updatedPlayerRoles,
      };
      setSelectedEvent(updatedEvent);

      // Refresh events list to show updated player count
      await fetchEvents();

      Alert.alert("Onnistui", "Pelaaja lisätty tapahtumaan");
    } catch (e) {
      Alert.alert("Virhe", "Pelaajan lisääminen epäonnistui");
    }
    setAddingPlayerId(null);
  };

  const handleAddMultiplePlayersToEvent = async () => {
    if (!selectedEvent || selectedPlayerIds.length === 0) return;

    setIsAddingMultiplePlayers(true);
    try {
      const eventRef = doc(db, "events", selectedEvent.id);
      const currentPlayers = selectedEvent.registeredPlayers || [];

      console.log("🚀 handleAddMultiplePlayersToEvent CALLED:", {
        eventId: selectedEvent.id,
        selectedPlayerIds,
        currentRegistered: currentPlayers,
      });

      // Filter out players already in the event
      const playersToAdd = selectedPlayerIds.filter(
        (id) => !currentPlayers.includes(id),
      );

      if (playersToAdd.length === 0) {
        Alert.alert(
          "Ei lisättäviä",
          "Kaikki valitut pelaajat ovat jo tapahtumassa",
        );
        setIsAddingMultiplePlayers(false);
        return;
      }

      // Check if any players need role selection
      const playersData = playersToAdd
        .map((id) => players.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => p != null);

      console.log("🔍 handleAddMultiplePlayersToEvent - playersData:", {
        count: playersData.length,
        playerIds: playersData.map((p) => p.id),
      });

      const multiPositionPlayers = playersData.filter((p) =>
        needsRoleSelection(p),
      );

      if (multiPositionPlayers.length > 0) {
        Alert.alert(
          "Valitse roolit erikseen",
          `${multiPositionPlayers.length} pelaajalla on useita positioita. Ole hyvä ja lisää heidät yksi kerrallaan valitsemalla rooli jokaiselle.`,
          [{ text: "OK", onPress: () => setIsAddingMultiplePlayers(false) }],
        );
        setSelectedPlayerIds([]);
        setIsAddingMultiplePlayers(false);
        return;
      }

      // Separate players by position
      const fieldPlayersToAdd = playersData.filter((p) =>
        p.positions.some((pos) => ["H", "P", "H/P"].includes(pos)),
      );
      const goalkeepersToAdd = playersData.filter((p) =>
        p.positions.includes("MV"),
      );

      console.log("🔍 handleAddMultiplePlayersToEvent - position split:", {
        fieldPlayersToAdd: fieldPlayersToAdd.map((p) => p.id),
        goalkeepersToAdd: goalkeepersToAdd.map((p) => p.id),
      });

      const currentFieldPlayers = getFieldPlayers(currentPlayers);
      const currentGoalkeepers = getGoalkeepers(currentPlayers);

      // Guest registration threshold from team settings
      const team = teams.find((t) => t.id === selectedEvent.teamId);
      const guestRegistrationHours = team?.guestRegistrationHours || 24;
      const now = new Date();
      const eventDate = new Date(selectedEvent.date);
      const hoursUntilEvent =
        (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      const teamId = selectedEvent.teamId || "";
      const teamMemberStatus: Record<string, boolean> = {};

      if (teamId) {
        for (const p of playersData) {
          try {
            const userRef = doc(db, "users", p.id);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const userData = userSnap.data();
              teamMemberStatus[p.id] = userData.teamMember?.[teamId] === true;
            } else {
              teamMemberStatus[p.id] = false;
            }
          } catch (error) {
            console.error("Error fetching teamMember status:", error);
            teamMemberStatus[p.id] = false;
          }
        }
      }

      // Separate players into main list and reserves based on limits and threshold
      const playersToMainList: string[] = [];
      const playersToReserve: string[] = [];

      // Handle field players
      if (selectedEvent.maxPlayers) {
        const availableFieldSlots =
          selectedEvent.maxPlayers - currentFieldPlayers.length;
        const fieldPlayerIds = fieldPlayersToAdd.map((p) => p.id);

        fieldPlayerIds.forEach((id, index) => {
          const isGuest = !teamMemberStatus[id];
          const shouldRedirectToReserve =
            isGuest && hoursUntilEvent > guestRegistrationHours;

          if (shouldRedirectToReserve) {
            playersToReserve.push(id);
            return;
          }

          if (index < availableFieldSlots) {
            playersToMainList.push(id);
          } else {
            playersToReserve.push(id);
          }
        });
      } else {
        // No limit, but check guest threshold
        fieldPlayersToAdd.forEach((p) => {
          const isGuest = !teamMemberStatus[p.id];
          const shouldRedirectToReserve =
            isGuest && hoursUntilEvent > guestRegistrationHours;

          if (shouldRedirectToReserve) {
            playersToReserve.push(p.id);
          } else {
            playersToMainList.push(p.id);
          }
        });
      }

      // Handle goalkeepers
      if (selectedEvent.maxGoalkeepers) {
        const availableGoalkeeperSlots =
          selectedEvent.maxGoalkeepers - currentGoalkeepers.length;
        const goalkeeperIds = goalkeepersToAdd.map((p) => p.id);

        goalkeeperIds.forEach((id, index) => {
          const isGuest = !teamMemberStatus[id];
          const shouldRedirectToReserve =
            isGuest && hoursUntilEvent > guestRegistrationHours;

          if (shouldRedirectToReserve) {
            playersToReserve.push(id);
            return;
          }

          if (index < availableGoalkeeperSlots) {
            playersToMainList.push(id);
          } else {
            playersToReserve.push(id);
          }
        });
      } else {
        // No limit, but check guest threshold
        goalkeepersToAdd.forEach((p) => {
          const isGuest = !teamMemberStatus[p.id];
          const shouldRedirectToReserve =
            isGuest && hoursUntilEvent > guestRegistrationHours;

          if (shouldRedirectToReserve) {
            playersToReserve.push(p.id);
          } else {
            playersToMainList.push(p.id);
          }
        });
      }

      // Show info if some players will be added to reserves
      if (playersToReserve.length > 0) {
        const proceed = await new Promise<boolean>((resolve) => {
          if (Platform.OS === "web") {
            const confirmed = webConfirm(
              "Lisätään varalle",
              `${playersToMainList.length} pelaajaa lisätään tapahtumaan ja ${playersToReserve.length} pelaajaa lisätään varalle joko täynnä olevien paikkojen tai vakiokävijöiden etuoikeuden vuoksi. Jatketaanko?`,
            );
            resolve(confirmed);
            return;
          }
          Alert.alert(
            "Lisätään varalle",
            `${playersToMainList.length} pelaajaa lisätään tapahtumaan ja ${playersToReserve.length} pelaajaa lisätään varalle joko täynnä olevien paikkojen tai vakiokävijöiden etuoikeuden vuoksi. Jatketaanko?`,
            [
              {
                text: "Peruuta",
                style: "cancel",
                onPress: () => resolve(false),
              },
              { text: "Jatka", onPress: () => resolve(true) },
            ],
          );
        });

        if (!proceed) {
          setIsAddingMultiplePlayers(false);
          return;
        }
      }

      // Add players to main list and reserves
      const updateData: any = {
        registeredPlayers: [...currentPlayers, ...playersToMainList],
      };

      if (playersToReserve.length > 0) {
        updateData.reservePlayers = [
          ...(selectedEvent.reservePlayers || []),
          ...playersToReserve,
        ];
      }

      await updateDoc(eventRef, updateData);

      await fetchEvents();

      let message = `${playersToMainList.length} pelaajaa lisätty tapahtumaan`;
      if (playersToReserve.length > 0) {
        message += ` ja ${playersToReserve.length} varalle`;
      }

      Alert.alert("Onnistui", message);

      // Reset selection
      setSelectedPlayerIds([]);
      setIsPlayerModalVisible(false);
    } catch (error) {
      console.error("Error adding multiple players:", error);
      Alert.alert("Virhe", "Pelaajien lisääminen epäonnistui");
    }
    setIsAddingMultiplePlayers(false);
  };

  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      } else {
        return [...prev, playerId];
      }
    });
  };

  const handlePlayerClick = (player: any) => {
    // Check if player needs role selection
    if (needsRoleSelection(player)) {
      if (Platform.OS === "web") {
        const role = webPromptRole(
          "Valitse rooli",
          `${player.name} voi pelata useassa roolissa. Missä roolissa lisätään tähän tapahtumaan?`,
          ["Kenttäpelaaja", "Maalivahti"],
        );
        if (!role) return;
        if (role === "MV") {
          handleAddPlayerToEvent(player.id, "MV");
        } else {
          const hasH = player.positions?.includes("H");
          const hasP = player.positions?.includes("P");
          let fieldPosition = "H";
          if (hasH && hasP) fieldPosition = "H/P";
          else if (hasP) fieldPosition = "P";
          else if (hasH) fieldPosition = "H";
          handleAddPlayerToEvent(player.id, fieldPosition);
        }
        return;
      }
      // Show role selection dialog and add player directly
      Alert.alert(
        "Valitse rooli",
        `${player.name} voi pelata useassa roolissa. Missä roolissa lisätään tähän tapahtumaan?`,
        [
          {
            text: "Peruuta",
            style: "cancel",
          },
          {
            text: "Kenttäpelaaja",
            onPress: () => {
              // Check if player has both H and P positions
              const hasH = player.positions?.includes("H");
              const hasP = player.positions?.includes("P");

              let fieldPosition = "H"; // Default

              if (hasH && hasP) {
                // If both H and P, use H/P
                fieldPosition = "H/P";
              } else if (hasP) {
                // If only P
                fieldPosition = "P";
              } else if (hasH) {
                // If only H
                fieldPosition = "H";
              }

              handleAddPlayerToEvent(player.id, fieldPosition);
            },
          },
          {
            text: "Maalivahti",
            onPress: () => handleAddPlayerToEvent(player.id, "MV"),
          },
        ],
      );
    } else {
      // Normal toggle for multi-select
      togglePlayerSelection(player.id);
    }
  };

  const handleRemovePlayerFromEvent = async (playerId: string) => {
    if (!selectedEvent) return;
    setRemovingPlayerId(playerId);
    try {
      const eventRef = doc(db, "events", selectedEvent.id);
      const currentPlayers = selectedEvent.registeredPlayers || [];
      const currentReservePlayers = selectedEvent.reservePlayers || [];

      // Check if player is in reserve list
      const isInReserve = currentReservePlayers.includes(playerId);

      if (isInReserve) {
        // Simply remove from reserve list
        await updateDoc(eventRef, {
          reservePlayers: arrayRemove(playerId),
        });
        Alert.alert("Onnistui", "Varapelaaja poistettu tapahtumasta");
        await fetchEvents();
        setRemovingPlayerId(null);
        return;
      }

      // Find the player being removed to check their position
      const removedPlayer = players.find((p) => p.id === playerId);
      const isRemovedPlayerGoalkeeper = removedPlayer?.positions.includes("MV");

      // Calculate hours until event for priority queue logic
      const team = teams.find((t) => t.id === selectedEvent.teamId);
      const guestRegistrationHours = team?.guestRegistrationHours || 24;
      const eventDate = new Date(selectedEvent.date);
      const now = new Date();
      const hoursUntilEvent =
        (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Remove player from registered players
      await updateDoc(eventRef, {
        registeredPlayers: arrayRemove(playerId),
      });

      // Check if there are reserve players to promote
      const eventDoc = await getDoc(eventRef);
      const eventData = eventDoc.data();
      const reservePlayers = eventData?.reservePlayers || [];

      if (reservePlayers.length > 0) {
        const teamId = selectedEvent.teamId || "";
        let suitableReserve: string | undefined;

        // Priority queue logic for promotion
        if (hoursUntilEvent > guestRegistrationHours) {
          // Before threshold: Skip guests, only promote team members
          for (const reserveId of reservePlayers) {
            const reservePlayer = players.find((p) => p.id === reserveId);
            if (!reservePlayer) continue;

            const isReserveTeamMember =
              teamId && reservePlayer.teamMember?.[teamId] === true;
            const positionMatches =
              reservePlayer.positions.includes("MV") ===
              isRemovedPlayerGoalkeeper;

            if (isReserveTeamMember && positionMatches) {
              suitableReserve = reserveId;
              break;
            }
          }
        } else {
          // After threshold: Pure FIFO - promote first player with matching position
          suitableReserve = reservePlayers.find((reserveId: string) => {
            const reservePlayer = players.find((p) => p.id === reserveId);
            return (
              reservePlayer &&
              reservePlayer.positions.includes("MV") ===
                isRemovedPlayerGoalkeeper
            );
          });
        }

        if (suitableReserve) {
          // Promote reserve player
          await updateDoc(eventRef, {
            registeredPlayers: arrayUnion(suitableReserve),
            reservePlayers: arrayRemove(suitableReserve),
          });

          const promotedPlayer = players.find((p) => p.id === suitableReserve);
          Alert.alert(
            "Pelaaja poistettu",
            `Varamies ${
              promotedPlayer?.name || "Tuntematon"
            } siirrettiin automaattisesti mukaan.`,
          );
        } else {
          Alert.alert("Onnistui", "Pelaaja poistettu tapahtumasta");
        }
      } else {
        Alert.alert("Onnistui", "Pelaaja poistettu tapahtumasta");
      }

      // Update selectedEvent state
      const updatedEvent = {
        ...selectedEvent,
        registeredPlayers: currentPlayers.filter(
          (id: string) => id !== playerId,
        ),
      };
      setSelectedEvent(updatedEvent);

      // Refresh events list to show updated player count
      await fetchEvents();
    } catch (e) {
      console.error("Error removing player:", e);
      Alert.alert("Virhe", "Pelaajan poistaminen epäonnistui");
    }
    setRemovingPlayerId(null);
  };

  const handleUpdateEvent = async () => {
    if (!selectedEvent) return;
    try {
      const eventRef = doc(db, "events", selectedEvent.id);
      const updatedData: any = {
        name: editForm.name,
        location: editForm.location,
      };

      // Käytetään DateTimePickerin arvoja jos ne on asetettu
      if (editDate && editTime) {
        const newDate = new Date(editDate);
        newDate.setHours(editTime.getHours());
        newDate.setMinutes(editTime.getMinutes());
        newDate.setSeconds(0, 0);

        // Käytä lokaalia aikaa eikä UTC-aikaa
        const year = newDate.getFullYear();
        const month = String(newDate.getMonth() + 1).padStart(2, "0");
        const day = String(newDate.getDate()).padStart(2, "0");
        const hours = String(newDate.getHours()).padStart(2, "0");
        const minutes = String(newDate.getMinutes()).padStart(2, "0");

        updatedData.date = `${year}-${month}-${day}T${hours}:${minutes}`;
      } else if (editForm.date) {
        // fallback: käytä tekstikentän arvoa
        updatedData.date = `${editForm.date}T${editForm.time || "00:00"}`;
      }

      await updateDoc(eventRef, updatedData);

      // Refresh events from database to ensure we have latest data
      await fetchEvents();

      // Update selected event for detail view
      setSelectedEvent({
        ...selectedEvent,
        ...updatedData,
      });

      setIsEditModalVisible(false);
      Alert.alert("Onnistui", "Tapahtuma päivitetty");
    } catch (e) {
      console.error("Update error:", e);
      Alert.alert("Virhe", "Tapahtuman päivittäminen epäonnistui");
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;

    Alert.alert(
      "Poista tapahtuma",
      `Haluatko varmasti poistaa tapahtuman "${selectedEvent.title}"? Tätä toimintoa ei voi peruuttaa.`,
      [
        { text: "Peruuta", style: "cancel" },
        {
          text: "Poista",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "events", selectedEvent.id));
              await fetchEvents();
              setSelectedEvent(null);
              Alert.alert("Onnistui", "Tapahtuma poistettu");
            } catch (e) {
              console.error("Delete error:", e);
              Alert.alert("Virhe", "Tapahtuman poistaminen epäonnistui");
            }
          },
        },
      ],
    );
  };

  const formatEventDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("fi-FI", {
        weekday: "short",
        day: "numeric",
        month: "numeric",
        year: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const formatEventTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString("fi-FI", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const getTeamName = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    return team ? team.name : "Tuntematon joukkue";
  };

  const getTeamColor = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    return team?.color || "#1976d2";
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976d2" />
      </View>
    );
  }

  // Jaa tapahtumat tuleviin ja menneisiin näyttöä varten
  // Suodatetaan myös valitun joukkueen mukaan
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const filteredByTeam = selectedTeamFilter
    ? events.filter((event) => event.teamId === selectedTeamFilter)
    : events;

  const upcomingEvents = filteredByTeam.filter((event) => {
    const eventDate = new Date(event.date || 0);
    return eventDate >= now;
  });

  const pastEvents = filteredByTeam.filter((event) => {
    const eventDate = new Date(event.date || 0);
    return eventDate < now;
  });

  // Apufunktio tapahtuman renderöimiseen
  const renderEventCard = (event: any, isPast: boolean = false) => (
    <TouchableOpacity
      key={event.id}
      style={[
        styles.eventCard,
        event.teamId && {
          borderLeftWidth: 4,
          borderLeftColor: getTeamColor(event.teamId),
        },
        isPast && { opacity: 0.7 },
      ]}
      onPress={() => handleSelectEvent(event)}
    >
      <View style={styles.eventCardContent}>
        <View style={styles.eventCardHeader}>
          {(() => {
            const eventTeam = teams.find((team) => team.id === event.teamId);
            return (
              <Text
                style={[
                  styles.eventName,
                  { color: eventTeam?.color || "#1976d2" },
                ]}
              >
                {eventTeam?.name || event.name || event.title}
              </Text>
            );
          })()}
          <Ionicons
            name="chevron-forward"
            size={20}
            color={event.teamId ? getTeamColor(event.teamId) : "#1976d2"}
          />
        </View>
        <View style={styles.eventDetails}>
          <View style={styles.eventDetailRow}>
            <Ionicons
              name="information-circle-outline"
              size={16}
              color="#666"
            />
            <Text style={styles.eventDetailText}>
              {event.name || event.title}
            </Text>
          </View>
          <View style={styles.eventDetailRow}>
            <Ionicons name="calendar-outline" size={16} color="#666" />
            <Text style={styles.eventDetailText}>
              {formatEventDate(event.date)}
            </Text>
          </View>
          <View style={styles.eventDetailRow}>
            <Ionicons name="time-outline" size={16} color="#666" />
            <Text style={styles.eventDetailText}>
              {formatEventTime(event.date)}
            </Text>
          </View>
          <View style={styles.eventDetailRow}>
            <Ionicons name="person-outline" size={16} color="#666" />
            <Text style={styles.eventDetailText}>
              {getFieldPlayers(event.registeredPlayers || [], event).length} /{" "}
              {event.maxPlayers || "∞"} pelaajaa
              {event.maxGoalkeepers && event.maxGoalkeepers > 0 && (
                <Text style={styles.goalkeeperText}>
                  {" • "}
                  {
                    getGoalkeepers(event.registeredPlayers || [], event).length
                  }{" "}
                  / {event.maxGoalkeepers} MV
                </Text>
              )}
            </Text>
          </View>
          {event.location && (
            <View style={styles.eventDetailRow}>
              <Ionicons name="location-outline" size={16} color="#666" />
              <Text style={styles.eventDetailText}>{event.location}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {!selectedEvent ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          {/* <Text style={styles.title}>Tapahtumahallinta</Text> */}
          <Text style={styles.subtitle}>Valitse tapahtuma muokattavaksi</Text>

          {/* Joukkuevalitsin */}
          {userAdminTeams.length > 1 && (
            <TouchableOpacity
              style={styles.teamFilterButton}
              onPress={() => setIsTeamFilterModalVisible(true)}
            >
              <Text style={styles.teamFilterLabel}>Joukkue:</Text>
              <View style={styles.teamFilterValueContainer}>
                {selectedTeamFilter ? (
                  <>
                    <View
                      style={[
                        styles.teamFilterDot,
                        { backgroundColor: getTeamColor(selectedTeamFilter) },
                      ]}
                    />
                    <Text
                      style={[
                        styles.teamFilterValue,
                        { color: getTeamColor(selectedTeamFilter) },
                      ]}
                    >
                      {teams.find((t) => t.id === selectedTeamFilter)?.name ||
                        "Tuntematon"}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.teamFilterValue}>Kaikki joukkueet</Text>
                )}
                <Ionicons name="chevron-down" size={16} color="#666" />
              </View>
            </TouchableOpacity>
          )}

          {filteredByTeam.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>Ei tapahtumia</Text>
              <Text style={styles.emptySubtext}>
                Luo ensin tapahtuma admin-valikosta
              </Text>
            </View>
          ) : (
            <>
              {/* Tulevat tapahtumat */}
              {upcomingEvents.length > 0 && (
                <View style={styles.eventSection}>
                  <Text style={styles.eventSectionTitle}>
                    Tulevat tapahtumat
                  </Text>
                  {upcomingEvents.map((event) => renderEventCard(event, false))}
                </View>
              )}

              {/* Menneet tapahtumat */}
              {pastEvents.length > 0 && (
                <View style={styles.eventSection}>
                  <TouchableOpacity
                    style={styles.pastEventsHeader}
                    onPress={() => setShowPastEvents(!showPastEvents)}
                  >
                    <Text style={styles.eventSectionTitle}>
                      Menneet tapahtumat ({pastEvents.length})
                    </Text>
                    <Ionicons
                      name={showPastEvents ? "chevron-up" : "chevron-down"}
                      size={20}
                      color="#666"
                    />
                  </TouchableOpacity>
                  {showPastEvents &&
                    pastEvents.map((event) => renderEventCard(event, true))}
                </View>
              )}

              {/* Tyhjä tila jos ei tulevia tapahtumia */}
              {upcomingEvents.length === 0 && pastEvents.length > 0 && (
                <View style={styles.noUpcomingContainer}>
                  <Ionicons name="calendar-outline" size={48} color="#ccc" />
                  <Text style={styles.noUpcomingText}>
                    Ei tulevia tapahtumia
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            onPress={() => setSelectedEvent(null)}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#1976d2" />
            <Text style={styles.backText}>Takaisin tapahtumiin</Text>
          </TouchableOpacity>

          <View
            style={[
              styles.eventHeader,
              selectedEvent.teamId && {
                borderLeftWidth: 4,
                borderLeftColor: getTeamColor(selectedEvent.teamId),
              },
            ]}
          >
            {/* Top row: Team name on left, action buttons on right */}
            <View style={styles.eventHeaderTop}>
              {(() => {
                const eventTeam = teams.find(
                  (team) => team.id === selectedEvent.teamId,
                );
                return (
                  <Text
                    style={[
                      styles.eventHeaderTeamName,
                      { color: eventTeam?.color || "#1976d2" },
                    ]}
                  >
                    {eventTeam?.name || "Tuntematon joukkue"}
                  </Text>
                );
              })()}
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[
                    styles.editButton,
                    selectedEvent.teamId && {
                      backgroundColor: getTeamColor(selectedEvent.teamId),
                    },
                  ]}
                  onPress={() => setIsEditModalVisible(true)}
                >
                  <Ionicons name="pencil" size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={handleDeleteEvent}
                >
                  <Ionicons name="trash-outline" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Middle row: Event details and player counts */}
            <View style={styles.eventHeaderMiddle}>
              <View style={styles.eventInfoColumn}>
                <View style={styles.eventInfoItem}>
                  <Ionicons
                    name="information-circle"
                    size={16}
                    color="#1976d2"
                  />
                  <Text style={styles.eventInfoText}>
                    {selectedEvent.name || selectedEvent.title}
                  </Text>
                </View>
                <View style={styles.eventInfoItem}>
                  <Ionicons name="calendar" size={16} color="#1976d2" />
                  <Text style={styles.eventInfoText}>
                    {formatEventDate(selectedEvent.date)}
                  </Text>
                </View>
                <View style={styles.eventInfoItem}>
                  <Ionicons name="time" size={16} color="#1976d2" />
                  <Text style={styles.eventInfoText}>
                    {formatEventTime(selectedEvent.date)}
                  </Text>
                </View>
                {selectedEvent.location && (
                  <View style={styles.eventInfoItem}>
                    <Ionicons name="location" size={16} color="#1976d2" />
                    <Text style={styles.eventInfoText}>
                      {selectedEvent.location}
                    </Text>
                  </View>
                )}
              </View>

              {/* Player count badges on the right */}
              <View style={styles.eventHeaderPlayerCounts}>
                <View style={styles.playerCountBadge}>
                  <Ionicons name="people" size={20} color="#1976d2" />
                  <Text style={styles.playerCountNumber}>
                    {
                      getFieldPlayers(selectedEvent.registeredPlayers || [])
                        .length
                    }
                  </Text>
                </View>

                {(selectedEvent.maxGoalkeepers ?? 0) > 0 && (
                  <View style={[styles.playerCountBadge, { marginLeft: 8 }]}>
                    <Text style={styles.goalkeeperBadgeEmoji}>🥅</Text>
                    <Text style={styles.playerCountNumber}>
                      {
                        getGoalkeepers(selectedEvent.registeredPlayers || [])
                          .length
                      }
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pelaajat tapahtumassa</Text>

            <TouchableOpacity
              style={[
                styles.addButton,
                selectedEvent.teamId && {
                  backgroundColor: getTeamColor(selectedEvent.teamId),
                },
              ]}
              onPress={() => setIsPlayerModalVisible(true)}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Lisää pelaaja</Text>
            </TouchableOpacity>

            <ScrollView style={styles.playerScrollView}>
              {(selectedEvent.registeredPlayers || []).length === 0 ? (
                <View style={styles.emptyPlayersContainer}>
                  <Ionicons name="person-outline" size={48} color="#ccc" />
                  <Text style={styles.emptyPlayersText}>Ei pelaajia</Text>
                  <Text style={styles.emptyPlayersSubtext}>
                    Lisää pelaajia tapahtumaan
                  </Text>
                </View>
              ) : (
                [...(selectedEvent.registeredPlayers || [])]
                  .sort((aId, bId) => {
                    const a = players.find((p) => p.id === aId);
                    const b = players.find((p) => p.id === bId);
                    const teamId = selectedEvent?.teamId || "";
                    const aRole = selectedEvent?.playerRoles?.[aId];
                    const bRole = selectedEvent?.playerRoles?.[bId];
                    const aIsGK =
                      aRole === "MV" ||
                      (!aRole &&
                        a?.positions?.includes("MV") &&
                        !a?.positions?.some((p: string) =>
                          ["H", "P", "H/P"].includes(p),
                        ));
                    const bIsGK =
                      bRole === "MV" ||
                      (!bRole &&
                        b?.positions?.includes("MV") &&
                        !b?.positions?.some((p: string) =>
                          ["H", "P", "H/P"].includes(p),
                        ));
                    if (aIsGK && !bIsGK) return 1;
                    if (!aIsGK && bIsGK) return -1;
                    const aIsMember =
                      teamId && a?.teamMember?.[teamId] === true;
                    const bIsMember =
                      teamId && b?.teamMember?.[teamId] === true;
                    if (aIsMember && !bIsMember) return -1;
                    if (!aIsMember && bIsMember) return 1;
                    const aLast = (a?.name || "").split(" ").pop() || "";
                    const bLast = (b?.name || "").split(" ").pop() || "";
                    return aLast.localeCompare(bLast, "fi");
                  })
                  .map((pid: string) => {
                    const player = players.find((p) => p.id === pid);
                    // Check playerRole from event first, then fall back to player's positions
                    const playerRole = selectedEvent?.playerRoles?.[pid];
                    const isGoalkeeper =
                      playerRole === "MV" ||
                      (!playerRole && player?.positions.includes("MV"));
                    // Check teamMember status
                    const teamId = selectedEvent?.teamId || "";
                    const isTeamMember =
                      teamId && player?.teamMember?.[teamId] === true;
                    return (
                      <View
                        key={pid}
                        style={[
                          styles.playerCard,
                          isGoalkeeper && styles.goalkeeperCard,
                          !isGoalkeeper && {
                            borderLeftWidth: 4,
                            borderLeftColor: isTeamMember
                              ? "#1976d2"
                              : "#ff9800",
                            backgroundColor: isTeamMember
                              ? "#e3f2fd"
                              : "#fff3e0",
                          },
                        ]}
                      >
                        <View style={styles.playerInfo}>
                          <Ionicons
                            name="person"
                            size={20}
                            color={getPlayerIconColor(
                              player,
                              selectedEvent.teamId,
                              isTeamMember,
                            )}
                          />
                          <View style={styles.playerDetails}>
                            <Text
                              style={[
                                styles.playerName,
                                isGoalkeeper && styles.goalkeeperName,
                                !isGoalkeeper &&
                                  !isTeamMember && {
                                    color: "#ff9800",
                                    fontWeight: "500",
                                  },
                              ]}
                            >
                              {player ? player.name : pid}
                              {isGoalkeeper && " 🥅"}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.removeButton}
                          onPress={() => handleRemovePlayerFromEvent(pid)}
                          disabled={removingPlayerId === pid}
                        >
                          {removingPlayerId === pid ? (
                            <ActivityIndicator size="small" color="#dc3545" />
                          ) : (
                            <Ionicons name="close" size={18} color="#dc3545" />
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })
              )}

              {/* Reserve Players Section */}
              {(selectedEvent.reservePlayers || []).length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { fontSize: 16, color: "#ff9800" },
                    ]}
                  >
                    Varalla ({selectedEvent.reservePlayers.length})
                  </Text>
                  {[...(selectedEvent.reservePlayers || [])]
                    .sort((aId, bId) => {
                      const a = players.find((p) => p.id === aId);
                      const b = players.find((p) => p.id === bId);
                      const teamId = selectedEvent?.teamId || "";
                      const aRole = selectedEvent?.playerRoles?.[aId];
                      const bRole = selectedEvent?.playerRoles?.[bId];
                      const aIsGK =
                        aRole === "MV" ||
                        (!aRole &&
                          a?.positions?.includes("MV") &&
                          !a?.positions?.some((p: string) =>
                            ["H", "P", "H/P"].includes(p),
                          ));
                      const bIsGK =
                        bRole === "MV" ||
                        (!bRole &&
                          b?.positions?.includes("MV") &&
                          !b?.positions?.some((p: string) =>
                            ["H", "P", "H/P"].includes(p),
                          ));
                      if (aIsGK && !bIsGK) return 1;
                      if (!aIsGK && bIsGK) return -1;
                      const aIsMember =
                        teamId && a?.teamMember?.[teamId] === true;
                      const bIsMember =
                        teamId && b?.teamMember?.[teamId] === true;
                      if (aIsMember && !bIsMember) return -1;
                      if (!aIsMember && bIsMember) return 1;
                      const aLast = (a?.name || "").split(" ").pop() || "";
                      const bLast = (b?.name || "").split(" ").pop() || "";
                      return aLast.localeCompare(bLast, "fi");
                    })
                    .map((pid: string) => {
                      const player = players.find((p) => p.id === pid);
                      if (!player) return null;
                      const playerRole =
                        selectedEvent?.playerRoles?.[player.id];
                      const isGoalkeeper =
                        playerRole === "MV" ||
                        (!playerRole && player?.positions.includes("MV"));
                      // Check teamMember status
                      const teamId = selectedEvent?.teamId || "";
                      const isTeamMember =
                        teamId && player?.teamMember?.[teamId] === true;
                      return (
                        <View
                          key={player.id}
                          style={[
                            styles.playerCard,
                            !isGoalkeeper && {
                              borderLeftWidth: 4,
                              borderLeftColor: isTeamMember
                                ? "#1976d2"
                                : "#ff9800",
                              backgroundColor: isTeamMember
                                ? "#e3f2fd"
                                : "#fff3e0",
                            },
                            isGoalkeeper && styles.goalkeeperCard,
                          ]}
                        >
                          <View style={styles.playerInfo}>
                            <Ionicons
                              name="person"
                              size={20}
                              color={getPlayerIconColor(
                                player,
                                selectedEvent.teamId,
                                isTeamMember,
                              )}
                            />
                            <View style={styles.playerDetails}>
                              <Text
                                style={[
                                  styles.playerName,
                                  isGoalkeeper && styles.goalkeeperName,
                                  !isGoalkeeper &&
                                    !isTeamMember && {
                                      color: "#ff9800",
                                      fontWeight: "500",
                                    },
                                ]}
                              >
                                {player.name}
                                {isGoalkeeper && " 🥅"}
                              </Text>
                            </View>
                          </View>
                          <TouchableOpacity
                            style={styles.removeButton}
                            onPress={() =>
                              handleRemovePlayerFromEvent(player.id)
                            }
                            disabled={removingPlayerId === player.id}
                          >
                            {removingPlayerId === player.id ? (
                              <ActivityIndicator size="small" color="#dc3545" />
                            ) : (
                              <Ionicons
                                name="close"
                                size={18}
                                color="#dc3545"
                              />
                            )}
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Team Filter Modal */}
      <Modal
        visible={isTeamFilterModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsTeamFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Valitse joukkue</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsTeamFilterModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Kaikki joukkueet -vaihtoehto */}
            <TouchableOpacity
              style={[
                styles.teamFilterOption,
                !selectedTeamFilter && styles.teamFilterOptionSelected,
              ]}
              onPress={() => {
                setSelectedTeamFilter(null);
                setIsTeamFilterModalVisible(false);
              }}
            >
              <Text
                style={[
                  styles.teamFilterOptionText,
                  !selectedTeamFilter && styles.teamFilterOptionTextSelected,
                ]}
              >
                Kaikki joukkueet
              </Text>
              {!selectedTeamFilter && (
                <Ionicons name="checkmark" size={20} color="#1976d2" />
              )}
            </TouchableOpacity>

            {/* Käyttäjän admin-joukkueet */}
            {userAdminTeams.map((team) => (
              <TouchableOpacity
                key={team.id}
                style={[
                  styles.teamFilterOption,
                  selectedTeamFilter === team.id &&
                    styles.teamFilterOptionSelected,
                ]}
                onPress={() => {
                  setSelectedTeamFilter(team.id);
                  setIsTeamFilterModalVisible(false);
                }}
              >
                <View style={styles.teamFilterOptionContent}>
                  <View
                    style={[
                      styles.teamFilterOptionDot,
                      { backgroundColor: team.color || "#1976d2" },
                    ]}
                  />
                  <Text
                    style={[
                      styles.teamFilterOptionText,
                      selectedTeamFilter === team.id &&
                        styles.teamFilterOptionTextSelected,
                      { color: team.color || "#333" },
                    ]}
                  >
                    {team.name}
                  </Text>
                </View>
                {selectedTeamFilter === team.id && (
                  <Ionicons name="checkmark" size={20} color="#1976d2" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Edit Event Modal */}
      <Modal
        visible={isEditModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Muokkaa tapahtumaa</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsEditModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.editModalScrollView}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Tapahtuman nimi</Text>
                <TextInput
                  style={styles.formInput}
                  value={editForm.name || ""}
                  onChangeText={(text) =>
                    setEditForm({ ...editForm, name: text })
                  }
                  placeholder="Syötä tapahtuman nimi"
                />
              </View>

              {/* Päivämäärävalitsin */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Päivämäärä</Text>
                <TouchableOpacity
                  style={styles.formInput}
                  onPress={() => setShowEditDateDialog(true)}
                >
                  <Text style={{ color: editDate ? "#333" : "#999" }}>
                    {editDate
                      ? editDate.toLocaleDateString("fi-FI", {
                          weekday: "short",
                          day: "numeric",
                          month: "numeric",
                          year: "numeric",
                        })
                      : "Valitse päivämäärä"}
                  </Text>
                </TouchableOpacity>
                {showEditDateDialog && (
                  <View>
                    <DateTimePicker
                      value={editDate || new Date()}
                      mode="date"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(event, selectedDate) => {
                        if (Platform.OS === "android") {
                          setShowEditDateDialog(false);
                        }
                        if (selectedDate) {
                          setEditDate(selectedDate);
                        }
                      }}
                    />
                    {Platform.OS === "ios" && (
                      <TouchableOpacity
                        style={styles.pickerCloseButton}
                        onPress={() => setShowEditDateDialog(false)}
                      >
                        <Text style={styles.pickerCloseButtonText}>Valmis</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

              {/* Kellonaikavalitsin */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Aika</Text>
                <TouchableOpacity
                  style={styles.formInput}
                  onPress={() => setShowEditTimeDialog(true)}
                >
                  <Text style={{ color: editTime ? "#333" : "#999" }}>
                    {editTime
                      ? editTime.toLocaleTimeString("fi-FI", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Valitse aika"}
                  </Text>
                </TouchableOpacity>
                {showEditTimeDialog && (
                  <View>
                    <DateTimePicker
                      value={editTime || new Date()}
                      mode="time"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(event, selectedTime) => {
                        if (Platform.OS === "android") {
                          setShowEditTimeDialog(false);
                        }
                        if (selectedTime) {
                          setEditTime(selectedTime);
                        }
                      }}
                    />
                    {Platform.OS === "ios" && (
                      <TouchableOpacity
                        style={styles.pickerCloseButton}
                        onPress={() => setShowEditTimeDialog(false)}
                      >
                        <Text style={styles.pickerCloseButtonText}>Valmis</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Paikka</Text>
                <TextInput
                  style={styles.formInput}
                  value={editForm.location || ""}
                  onChangeText={(text) =>
                    setEditForm({ ...editForm, location: text })
                  }
                  placeholder="Syötä tapahtuman paikka"
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  selectedEvent?.teamId && {
                    backgroundColor: getTeamColor(selectedEvent.teamId),
                  },
                ]}
                onPress={handleUpdateEvent}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Tallenna muutokset</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Player Modal */}
      <Modal
        visible={isPlayerModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setIsPlayerModalVisible(false);
          setSelectedPlayerIds([]);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Lisää pelaajia tapahtumaan</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setIsPlayerModalVisible(false);
                  setSelectedPlayerIds([]);
                }}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Multi-select info and controls */}
            <View style={styles.multiSelectHeader}>
              <Text style={styles.selectedCountText}>
                Valittu: {selectedPlayerIds.length} pelaajaa
              </Text>
              {selectedPlayerIds.length > 0 && (
                <TouchableOpacity
                  style={styles.clearSelectionButton}
                  onPress={() => setSelectedPlayerIds([])}
                >
                  <Text style={styles.clearSelectionText}>Tyhjennä</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={styles.modalScrollView}>
              {getTeamPlayers()
                .filter(
                  (player) =>
                    !(selectedEvent?.registeredPlayers || []).includes(
                      player.id,
                    ) &&
                    !(selectedEvent?.reservePlayers || []).includes(player.id),
                )
                .sort((a, b) => {
                  const teamId = selectedEvent?.teamId || "";
                  const aIsGK =
                    a.positions?.includes("MV") &&
                    !a.positions?.some((p: string) =>
                      ["H", "P", "H/P"].includes(p),
                    );
                  const bIsGK =
                    b.positions?.includes("MV") &&
                    !b.positions?.some((p: string) =>
                      ["H", "P", "H/P"].includes(p),
                    );
                  if (aIsGK && !bIsGK) return 1;
                  if (!aIsGK && bIsGK) return -1;
                  const aIsMember = teamId && a?.teamMember?.[teamId] === true;
                  const bIsMember = teamId && b?.teamMember?.[teamId] === true;
                  if (aIsMember && !bIsMember) return -1;
                  if (!aIsMember && bIsMember) return 1;
                  const aLast = (a.name || "").split(" ").pop() || "";
                  const bLast = (b.name || "").split(" ").pop() || "";
                  return aLast.localeCompare(bLast, "fi");
                })
                .map((player) => {
                  const isGoalkeeper = player.positions.includes("MV");
                  const isSelected = selectedPlayerIds.includes(player.id);
                  const playerNeedsRoleSelection = needsRoleSelection(player);
                  // Check teamMember status
                  const teamId = selectedEvent?.teamId || "";
                  const isTeamMember =
                    teamId && player?.teamMember?.[teamId] === true;
                  return (
                    <TouchableOpacity
                      key={player.id}
                      style={[
                        styles.modalPlayerButton,
                        isGoalkeeper && styles.goalkeeperCard,
                        !isGoalkeeper && {
                          borderLeftWidth: 4,
                          borderLeftColor: isTeamMember ? "#1976d2" : "#ff9800",
                          backgroundColor: isTeamMember ? "#e3f2fd" : "#fff3e0",
                        },
                        isSelected && styles.selectedPlayerCard,
                      ]}
                      onPress={() => handlePlayerClick(player)}
                      disabled={
                        addingPlayerId === player.id || isAddingMultiplePlayers
                      }
                    >
                      <View style={styles.modalPlayerInfo}>
                        <View style={styles.playerSelectionContainer}>
                          <View
                            style={[
                              styles.selectionCheckbox,
                              isSelected && styles.selectedCheckbox,
                            ]}
                          >
                            {isSelected && (
                              <Ionicons
                                name="checkmark"
                                size={16}
                                color="#fff"
                              />
                            )}
                          </View>
                          <Ionicons
                            name="person"
                            size={20}
                            color={getPlayerIconColor(
                              player,
                              selectedEvent?.teamId,
                              isTeamMember,
                            )}
                            style={styles.playerIcon}
                          />
                        </View>
                        <View style={styles.modalPlayerDetails}>
                          <Text
                            style={[
                              styles.modalPlayerName,
                              isGoalkeeper && styles.goalkeeperName,
                              !isGoalkeeper &&
                                !isTeamMember && {
                                  color: "#ff9800",
                                  fontWeight: "500",
                                },
                            ]}
                          >
                            {player.name}
                            {isGoalkeeper && " 🥅"}
                          </Text>
                        </View>
                      </View>
                      {addingPlayerId === player.id ||
                      isAddingMultiplePlayers ? (
                        <ActivityIndicator
                          size="small"
                          color={
                            selectedEvent?.teamId
                              ? getTeamColor(selectedEvent.teamId)
                              : "#1976d2"
                          }
                        />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              {getTeamPlayers().filter(
                (player) =>
                  !(selectedEvent?.registeredPlayers || []).includes(player.id),
              ).length === 0 && (
                <View style={styles.noPlayersContainer}>
                  <Text style={styles.noPlayersText}>
                    Kaikki joukkueen pelaajat on jo lisätty tapahtumaan
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Action buttons */}
            <View style={styles.modalActions}>
              {selectedPlayerIds.length > 0 && (
                <TouchableOpacity
                  style={[
                    styles.addSelectedButton,
                    selectedEvent?.teamId && {
                      backgroundColor: getTeamColor(selectedEvent.teamId),
                    },
                  ]}
                  onPress={handleAddMultiplePlayersToEvent}
                  disabled={isAddingMultiplePlayers}
                >
                  {isAddingMultiplePlayers ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="add" size={20} color="#fff" />
                      <Text style={styles.addSelectedButtonText}>
                        Lisää valitut ({selectedPlayerIds.length})
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9f9f9",
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#1976d2",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    textAlign: "center",
    color: "#666",
    marginTop: 16,
    fontSize: 18,
    fontWeight: "600",
  },
  emptySubtext: {
    textAlign: "center",
    color: "#999",
    marginTop: 8,
    fontSize: 14,
  },
  eventSection: {
    marginBottom: 24,
  },
  eventSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  pastEventsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingVertical: 8,
  },
  noUpcomingContainer: {
    alignItems: "center",
    paddingVertical: 32,
    marginBottom: 24,
  },
  noUpcomingText: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
  },
  teamFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  teamFilterLabel: {
    fontSize: 14,
    color: "#666",
  },
  teamFilterValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  teamFilterDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  teamFilterValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  teamFilterOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  teamFilterOptionSelected: {
    backgroundColor: "#f0f7ff",
  },
  teamFilterOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  teamFilterOptionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  teamFilterOptionText: {
    fontSize: 16,
    color: "#333",
  },
  teamFilterOptionTextSelected: {
    fontWeight: "600",
    color: "#1976d2",
  },
  eventCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  eventCardContent: {
    flex: 1,
  },
  eventCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  eventName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    flex: 1,
  },
  eventDetails: {
    gap: 8,
  },
  eventDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eventDetailText: {
    fontSize: 14,
    color: "#666",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    paddingVertical: 8,
  },
  backText: {
    color: "#1976d2",
    fontSize: 16,
    marginLeft: 8,
    fontWeight: "500",
  },
  eventHeader: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  eventHeaderTeamName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1976d2",
  },
  eventHeaderMiddle: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },
  eventInfoColumn: {
    flex: 1,
    gap: 8,
  },
  eventHeaderPlayerCounts: {
    flexDirection: "row",
    marginLeft: 16,
    alignItems: "center",
  },
  playerCountBadge: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  playerCountNumber: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1976d2",
  },
  goalkeeperBadgeEmoji: {
    fontSize: 20,
  },
  eventInfoRow: {
    flexDirection: "column",
    gap: 8,
    marginTop: 8,
  },
  eventInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eventInfoText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    flex: 1,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
    marginBottom: 16,
  },
  addButton: {
    backgroundColor: "#1976d2",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
    alignSelf: "center",
  },
  addButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  playerScrollView: {
    flex: 1,
  },
  emptyPlayersContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyPlayersText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "600",
    marginTop: 12,
  },
  emptyPlayersSubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 4,
  },
  playerCard: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  playerDetails: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  playerSubinfo: {
    fontSize: 12,
    color: "#666",
  },
  removeButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: "#ffebee",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    width: "90%",
    maxHeight: "80%",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  closeButton: {
    padding: 4,
  },
  modalScrollView: {
    padding: 16,
    maxHeight: 400,
  },
  modalPlayerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    marginBottom: 8,
  },
  modalPlayerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  modalPlayerDetails: {
    flex: 1,
  },
  modalPlayerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  modalPlayerSubinfo: {
    fontSize: 12,
    color: "#666",
  },
  noPlayersContainer: {
    padding: 20,
    alignItems: "center",
  },
  noPlayersText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  // Event header improvements
  eventHeaderTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  editButton: {
    backgroundColor: "#1976d2",
    borderRadius: 8,
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  editButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  deleteButton: {
    backgroundColor: "#f44336",
    borderRadius: 8,
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  // Edit modal styles
  editModalScrollView: {
    padding: 20,
    maxHeight: 500,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  formInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#f9f9f9",
    color: "#333",
  },
  saveButton: {
    backgroundColor: "#1976d2",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
    marginBottom: 20,
    marginHorizontal: 20,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  // Legacy styles to maintain compatibility
  label: {
    fontWeight: "600",
    color: "#333",
    marginTop: 12,
    marginBottom: 4,
  },
  playerList: {
    marginBottom: 12,
  },
  playerItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  addPlayerButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#e3f2fd",
    borderRadius: 6,
    marginBottom: 6,
  },
  goalkeeperText: {
    color: "#4caf50", // Vihreä maalivahdille
    fontWeight: "500",
  },
  goalkeeperCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#4caf50", // Vihreä reunus
    backgroundColor: "#e8f5e9", // Vaaleanvihreä tausta
  },
  goalkeeperName: {
    color: "#4caf50", // Vihreä teksti
    fontWeight: "600",
  },
  // Multi-select styles
  multiSelectHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  selectedCountText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  clearSelectionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f5f5f5",
    borderRadius: 6,
  },
  clearSelectionText: {
    fontSize: 12,
    color: "#666",
    fontWeight: "500",
  },
  selectedPlayerCard: {
    backgroundColor: "#e3f2fd",
    borderColor: "#1976d2",
    borderWidth: 2,
  },
  playerSelectionContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectionCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#ddd",
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  selectedCheckbox: {
    backgroundColor: "#1976d2",
    borderColor: "#1976d2",
  },
  playerIcon: {
    marginLeft: 4,
  },
  modalActions: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  addSelectedButton: {
    backgroundColor: "#1976d2",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addSelectedButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  titleContainer: {
    flex: 1,
  },
  pickerCloseButton: {
    backgroundColor: "#1976d2",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    alignItems: "center",
  },
  pickerCloseButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default EventManagementScreen;
