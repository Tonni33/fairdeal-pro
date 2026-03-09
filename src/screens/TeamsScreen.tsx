import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
  ScrollView,
  Alert,
  Clipboard,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";

import { RootStackParamList, Event, BottomTabParamList } from "../types";
import { useApp, getUserTeams } from "../contexts/AppContext";
import { useAuth } from "../contexts/AuthContext";
import { CompositeNavigationProp } from "@react-navigation/native";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import AdminMenuButton from "../components/AdminMenuButton";

type TeamsScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<BottomTabParamList, "Teams">,
  StackNavigationProp<RootStackParamList>
>;

const TeamsScreen: React.FC = () => {
  const [isTeamSelectorVisible, setIsTeamSelectorVisible] = useState(false);
  const [isTeamModalVisible, setIsTeamModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showPositionGroups, setShowPositionGroups] = useState(false);

  const navigation = useNavigation<TeamsScreenNavigationProp>();
  const { user } = useAuth();
  const {
    events,
    teams,
    players,
    loading,
    refreshData,
    selectedTeamId,
    setSelectedTeamId,
  } = useApp();

  // Fetch team settings (showPositionGroups) when selectedEvent changes
  useEffect(() => {
    const loadTeamSettings = async () => {
      if (!selectedEvent?.teamId) {
        setShowPositionGroups(false);
        return;
      }
      try {
        const settingsRef = doc(db, "settings", `team-${selectedEvent.teamId}`);
        const settingsDoc = await getDoc(settingsRef);
        if (settingsDoc.exists()) {
          const data = settingsDoc.data();
          setShowPositionGroups(data.showPositionGroups === true);
        } else {
          setShowPositionGroups(false);
        }
      } catch (error) {
        console.error("Error loading team settings:", error);
        setShowPositionGroups(false);
      }
    };
    loadTeamSettings();
  }, [selectedEvent?.teamId]);

  // Helper: determine display group (attacker / defender / goalkeeper) for a player
  const getPlayerDisplayGroup = (
    playerId: string,
    team: any,
  ): "attacker" | "defender" | "goalkeeper" => {
    // 1. Check event-specific role
    const playerRole = selectedEvent?.playerRoles?.[playerId];
    if (playerRole === "MV") return "goalkeeper";
    if (playerRole === "H") return "attacker";
    if (playerRole === "P") return "defender";

    // 2. If H/P (or no explicit role), check assignedRole saved in team data
    const teamPlayerEntry = (team.players || []).find(
      (p: any) => (typeof p === "string" ? p : p.id) === playerId,
    );
    const assignedRole =
      typeof teamPlayerEntry === "object"
        ? (teamPlayerEntry as any)?.assignedRole
        : undefined;
    if (assignedRole === "defender") return "defender";
    if (assignedRole === "attacker") return "attacker";

    // 3. Fallback to player's default positions
    const player = getPlayerById(playerId);
    if (!player) return "attacker";
    const hasFieldPositions = player.positions.some((pos) =>
      ["H", "P", "H/P"].includes(pos),
    );
    if (player.positions.includes("MV") && !hasFieldPositions)
      return "goalkeeper";
    if (player.positions.includes("P") && !player.positions.includes("H"))
      return "defender";
    return "attacker";
  };

  // Helper functions for player data
  const getPlayerById = (playerId: string) => {
    const player = players.find((p) => p.id === playerId);

    if (!player) {
      console.log("TeamsScreen:getPlayerById - player not found", {
        playerId,
        playersCount: players.length,
        sampleIds: players
          .slice(0, 5)
          .map((p) => ({ id: p.id, email: p.email, name: p.name })),
      });
    }

    return player;
  };

  const getFieldPlayers = (playerIds: string[]) => {
    return playerIds.filter((id) => {
      const player = getPlayerById(id);
      return (
        player &&
        player.positions.some((pos) => ["H", "P", "H/P"].includes(pos))
      );
    });
  };

  const getGoalkeepers = (playerIds: string[]) => {
    return playerIds.filter((id) => {
      const player = getPlayerById(id);
      return player && player.positions.includes("MV");
    });
  };

  // Function to get shuffled players for display (stable version)
  const getShuffledPlayersForDisplay = (team: any, event: Event) => {
    const playerIds = team.playerIds || [];

    // Check if we have a saved shuffle and if it contains all players
    const hasSavedShuffle =
      team.shuffledPlayerIds && Array.isArray(team.shuffledPlayerIds);
    const savedShuffleIds = hasSavedShuffle
      ? new Set(team.shuffledPlayerIds)
      : new Set();
    const allPlayersIncluded = playerIds.every((id: string) =>
      savedShuffleIds.has(id),
    );

    // If saved shuffle exists and contains all players, use it
    if (
      hasSavedShuffle &&
      allPlayersIncluded &&
      savedShuffleIds.size === playerIds.length
    ) {
      console.log("✅ Using existing shuffle - all players present");
      return team.shuffledPlayerIds;
    }

    // Log if shuffle needs regeneration
    if (hasSavedShuffle && !allPlayersIncluded) {
      const missingIds = playerIds.filter(
        (id: string) => !savedShuffleIds.has(id),
      );
      console.warn("⚠️ Regenerating shuffle - missing players:", {
        missingCount: missingIds.length,
        missingIds,
        savedCount: team.shuffledPlayerIds.length,
        totalCount: playerIds.length,
      });
    }

    // Create a new shuffle from all playerIds
    const shuffled = [...playerIds];

    // Separate into goalkeepers and field players using event-specific roles
    const goalkeepers: string[] = [];
    const fieldPlayers: string[] = [];

    shuffled.forEach((id) => {
      const player = getPlayerById(id);
      if (!player) {
        console.warn(`⚠️ Player not found for ID: ${id}`);
        // Still include the ID in field players to avoid losing data
        fieldPlayers.push(id);
        return;
      }

      // Check event-specific role first, then fall back to positions
      const playerRole = event.playerRoles?.[id];

      // Determine if player is a goalkeeper
      const isGoalkeeper = playerRole
        ? playerRole === "MV"
        : player.positions.includes("MV");

      // If player is ONLY a goalkeeper (no field positions), add to goalkeepers
      // Otherwise add to field players (even if they can play MV)
      if (isGoalkeeper) {
        const hasFieldPositions = playerRole
          ? ["H", "P"].includes(playerRole)
          : player.positions.some((pos) => ["H", "P", "H/P"].includes(pos));

        if (hasFieldPositions) {
          fieldPlayers.push(id);
        } else {
          goalkeepers.push(id);
        }
      } else {
        fieldPlayers.push(id);
      }
    });

    // Shuffle field players using Fisher-Yates
    for (let i = fieldPlayers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fieldPlayers[i], fieldPlayers[j]] = [fieldPlayers[j], fieldPlayers[i]];
    }

    // Always put pure goalkeepers last
    const shuffledResult = [...fieldPlayers, ...goalkeepers];

    console.log("🔀 Created new shuffle:", {
      totalPlayers: shuffledResult.length,
      fieldPlayers: fieldPlayers.length,
      goalkeepers: goalkeepers.length,
      allIdsIncluded: playerIds.every((id: string) =>
        shuffledResult.includes(id),
      ),
    });

    // Save the shuffled result back to the team
    team.shuffledPlayerIds = shuffledResult;

    // Save to database asynchronously
    saveShuffleToDatabase(event.id, team);

    return shuffledResult;
  };

  const saveShuffleToDatabase = async (eventId: string, updatedTeam: any) => {
    try {
      const eventRef = doc(db, "events", eventId);
      const eventDoc = await getDoc(eventRef);

      if (eventDoc.exists()) {
        const eventData = eventDoc.data();
        if (eventData.generatedTeams && eventData.generatedTeams.teams) {
          // Find and update the specific team
          const updatedTeams = eventData.generatedTeams.teams.map(
            (team: any) =>
              team.name === updatedTeam.name ? updatedTeam : team,
          );

          await updateDoc(eventRef, {
            "generatedTeams.teams": updatedTeams,
          });
        }
      }
    } catch (error) {
      console.error("Error saving shuffle to database:", error);
    }
  };

  const reshuffleAllTeams = async () => {
    if (
      !selectedEvent ||
      !selectedEvent.generatedTeams ||
      !selectedEvent.generatedTeams.teams
    )
      return;

    Alert.alert(
      "Sekoita uudelleen",
      "Haluatko sekoittaa kaikkien joukkueiden pelaajat uudelleen? Tämä muuttaa nykyisen järjestyksen.",
      [
        { text: "Peruuta", style: "cancel" },
        {
          text: "Sekoita",
          onPress: async () => {
            try {
              const updatedTeams = selectedEvent.generatedTeams!.teams.map(
                (team: any) => {
                  // Remove existing shuffle
                  delete team.shuffledPlayerIds;
                  // Create new shuffle
                  getShuffledPlayersForDisplay(team, selectedEvent);
                  return team;
                },
              );

              // Update the local state
              const currentGeneratedTeams = selectedEvent.generatedTeams!;
              setSelectedEvent({
                ...selectedEvent,
                generatedTeams: {
                  eventId: currentGeneratedTeams.eventId,
                  generatedAt: currentGeneratedTeams.generatedAt,
                  generatedBy: currentGeneratedTeams.generatedBy,
                  balanceScore: currentGeneratedTeams.balanceScore,
                  teams: updatedTeams,
                },
              });

              // Update database
              const eventRef = doc(db, "events", selectedEvent.id);
              await updateDoc(eventRef, {
                "generatedTeams.teams": updatedTeams,
              });
            } catch (error) {
              console.error("Error reshuffling teams:", error);
              Alert.alert("Virhe", "Sekoittaminen epäonnistui");
            }
          },
        },
      ],
    );
  };

  const copyTeamsToClipboard = async () => {
    if (
      !selectedEvent ||
      !selectedEvent.generatedTeams ||
      !selectedEvent.generatedTeams.teams
    )
      return;

    try {
      const teams = selectedEvent.generatedTeams.teams;
      let textToCopy = `${selectedEvent.title}\n`;
      textToCopy += `${formatFullDateTime(selectedEvent.date)}\n\n`;

      teams.forEach((team, index) => {
        textToCopy += `${team.name}:\n`;

        const shuffledPlayers = getShuffledPlayersForDisplay(
          team,
          selectedEvent,
        );

        shuffledPlayers.forEach((playerId: string) => {
          const player = getPlayerById(playerId);
          if (player) {
            // Check event-specific role first, then fall back to positions
            const playerRole = selectedEvent.playerRoles?.[playerId];
            const isGoalkeeper = playerRole
              ? playerRole === "MV"
              : player.positions.includes("MV");
            textToCopy += `- ${player.name}`;
            if (isGoalkeeper) {
              textToCopy += " 🥅";
            }
            textToCopy += "\n";
          }
        });

        // Add empty line between teams (except after last team)
        if (index < teams.length - 1) {
          textToCopy += "\n";
        }
      });

      Clipboard.setString(textToCopy);
      Alert.alert("Kopioitu!", "Joukkueet kopioitu leikepöydälle");
    } catch (error) {
      console.error("Error copying teams to clipboard:", error);
      Alert.alert("Virhe", "Kopiointi epäonnistui");
    }
  };

  const sendTeamsToWhatsAppGroup = async () => {
    if (
      !selectedEvent ||
      !selectedEvent.generatedTeams ||
      !selectedEvent.generatedTeams.teams
    )
      return;

    try {
      const generatedTeams = selectedEvent.generatedTeams.teams;
      let message = `🏒 ${selectedEvent.title}\n`;
      message += `📅 ${formatFullDateTime(selectedEvent.date)}\n\n`;

      generatedTeams.forEach((team, index) => {
        message += `⭐ ${team.name}:\n`;

        const shuffledPlayers = getShuffledPlayersForDisplay(
          team,
          selectedEvent,
        );

        shuffledPlayers.forEach((playerId: string) => {
          const player = getPlayerById(playerId);
          if (player) {
            // Check event-specific role first, then fall back to positions
            const playerRole = selectedEvent.playerRoles?.[playerId];
            const isGoalkeeper = playerRole
              ? playerRole === "MV"
              : player.positions.includes("MV");
            message += `• ${player.name}`;
            if (isGoalkeeper) {
              message += " 🥅";
            }
            message += "\n";
          }
        });

        // Add empty line between teams (except after last team)
        if (index < generatedTeams.length - 1) {
          message += "\n";
        }
      });

      // Add footer
      message += "\n📱 Lähetetty FairDealPro-appista";

      // Find team data from teams context using selectedEvent.teamId
      const selectedTeamData = selectedEvent.teamId
        ? teams.find((t) => t.id === selectedEvent.teamId)
        : null;

      let url: string;

      if (selectedTeamData?.whatsappGroupInviteLink) {
        // Use specific group chat if invite link is saved
        if (
          selectedTeamData.whatsappGroupInviteLink.includes("chat.whatsapp.com")
        ) {
          // Check if WhatsApp can be opened first
          const canOpen = await Linking.canOpenURL("whatsapp://send");
          if (!canOpen) {
            Alert.alert(
              "WhatsApp ei ole asennettu",
              "Asenna WhatsApp-sovellus lähettääksesi viestejä ryhmään.",
            );
            return;
          }

          // Copy message to clipboard
          Clipboard.setString(message);

          // Show alert and then open WhatsApp group
          Alert.alert(
            "Viesti kopioitu! 📋",
            `Joukkuejako on kopioitu leikepöydälle.\n\nWhatsApp avautuu ja voit liittää viestin ryhmään pitkällä painalluksella.`,
            [
              {
                text: "OK",
                onPress: () => {
                  // Open the WhatsApp group
                  if (selectedTeamData.whatsappGroupInviteLink) {
                    Linking.openURL(
                      selectedTeamData.whatsappGroupInviteLink,
                    ).catch((err) => {
                      console.error("Error opening WhatsApp group:", err);
                      Alert.alert(
                        "Virhe",
                        "WhatsApp-ryhmän avaaminen ei onnistunut. Tarkista kutsulinkin oikeellisuus.",
                      );
                    });
                  }
                },
              },
            ],
          );
          return;
        }
      }

      // Default behavior - open WhatsApp for general sharing
      url = `whatsapp://send?text=${encodeURIComponent(message)}`;

      Linking.canOpenURL(url)
        .then((supported) => {
          if (supported) {
            return Linking.openURL(url);
          } else {
            Alert.alert(
              "WhatsApp ei ole asennettu",
              "Asenna WhatsApp-sovellus lähettääksesi viestejä ryhmään.",
            );
          }
        })
        .catch((err) => {
          console.error("WhatsApp error:", err);
          Alert.alert("Virhe", "WhatsApp-viestin lähettäminen ei onnistunut");
        });
    } catch (error) {
      console.error("Error sending teams to WhatsApp:", error);
      Alert.alert("Virhe", "Viestin lähettäminen epäonnistui");
    }
  };

  // Filter user teams
  const userTeams = useMemo(
    () => getUserTeams(user, teams, players),
    [user, teams, players],
  );

  // Filter events with generated teams
  const eventsWithTeams = useMemo(() => {
    let filteredEvents: Event[];

    // Jos käyttäjä on valinnut tietyn joukkueen, näytä sen tapahtumat
    if (selectedTeamId) {
      filteredEvents = events.filter(
        (event) => event.teamId === selectedTeamId,
      );
    } else {
      // Jos joukkuetta ei ole valittu, näytä vain niiden joukkueiden tapahtumat joissa käyttäjä on jäsenenä
      if (userTeams.length > 0) {
        const userTeamIds = userTeams.map((team) => team.id);
        filteredEvents = events.filter(
          (event) => event.teamId && userTeamIds.includes(event.teamId),
        );
      } else {
        // Jos käyttäjä ei kuulu mihinkään joukkueeseen, älä näytä tapahtumia
        filteredEvents = [];
      }
    }

    // Debug: Log all events and their generatedTeams
    console.log("=== TEAMS SCREEN DEBUG ===");
    console.log("Total events:", events.length);
    console.log(
      "All events:",
      events.map((e) => ({
        id: e.id,
        title: e.title,
        hasGeneratedTeams: !!e.generatedTeams,
        generatedTeamsStructure: e.generatedTeams
          ? {
              hasTeamsArray: !!e.generatedTeams.teams,
              teamsCount: e.generatedTeams.teams?.length || 0,
              eventId: e.generatedTeams.eventId,
              generatedAt: e.generatedTeams.generatedAt,
            }
          : null,
      })),
    );

    // Only show events that have generated teams
    filteredEvents = filteredEvents.filter((event) => {
      const hasGeneratedTeams =
        event.generatedTeams &&
        event.generatedTeams.teams &&
        Array.isArray(event.generatedTeams.teams) &&
        event.generatedTeams.teams.length > 0;

      if (!hasGeneratedTeams) {
        console.log(`⚠️ Event ${event.title} (${event.id}) filtered out:`, {
          hasGeneratedTeams: !!event.generatedTeams,
          hasTeamsProperty: event.generatedTeams?.teams !== undefined,
          isTeamsArray: Array.isArray(event.generatedTeams?.teams),
          teamsLength: event.generatedTeams?.teams?.length || 0,
        });
      }

      return hasGeneratedTeams;
    });

    console.log("Filtered events with teams:", filteredEvents.length);

    // Sort by date (newest first)
    return filteredEvents.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [events, selectedTeamId, userTeams]);

  const onRefresh = async () => {
    setRefreshing(true);
    console.log("🔄 TeamsScreen: Starting refresh...");
    try {
      await refreshData();
      console.log("✅ TeamsScreen: Refresh completed");
    } catch (error) {
      console.error("❌ TeamsScreen: Refresh failed:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const getSelectedTeamName = () => {
    if (!selectedTeamId) return "Kaikki joukkueet";
    const team = userTeams.find((t) => t.id === selectedTeamId);
    return team ? team.name : "Kaikki joukkueet";
  };

  const handleAdminNavigation = (screen: string) => {
    if (screen === "AdminMenu") {
      navigation.navigate("AdminMenu");
    } else if (screen === "CreateEvent") {
      navigation.navigate("CreateEvent");
    } else if (screen === "CreatePlayer") {
      navigation.navigate("CreatePlayer");
    } else if (screen === "UserManagement") {
      navigation.navigate("UserManagement");
    } else if (screen === "TeamManagement") {
      navigation.navigate("TeamManagement");
    } else if (screen === "EventManagementScreen") {
      navigation.navigate("EventManagementScreen");
    } else if (screen === "TeamGeneration") {
      navigation.navigate("TeamGeneration", { eventId: "" });
    } else if (screen === "Settings") {
      navigation.navigate("Settings");
    } else {
      Alert.alert(
        "Tulossa pian",
        `${screen} -toiminto toteutetaan seuraavaksi`,
      );
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("fi-FI", {
      weekday: "short",
      day: "numeric",
      month: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (date: Date) => {
    return new Date(date)
      .toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" })
      .replace(":", ".");
  };

  const formatFullDateTime = (date: Date) => {
    return `${formatDate(date)} klo ${formatTime(date)}`;
  };

  const renderEventItem = ({ item }: { item: Event }) => {
    const eventDate = new Date(item.date);
    const team = teams.find((t) => t.id === item.teamId);
    const teamColor = team?.color || "#1976d2";
    const generatedTeams = item.generatedTeams?.teams || [];

    return (
      <TouchableOpacity
        style={[styles.eventCard, { borderColor: teamColor, borderWidth: 2 }]}
        onPress={() => {
          setSelectedEvent(item);
          setIsTeamModalVisible(true);
        }}
      >
        <View style={styles.eventHeader}>
          <View style={styles.eventTimeAndTitle}>
            <Ionicons
              name="calendar-outline"
              size={16}
              color="#1976d2"
              style={{ marginRight: 6 }}
            />
            <Text style={styles.eventTime}>
              {formatDate(eventDate)} klo {formatTime(eventDate)}
            </Text>
          </View>
          <Text style={styles.eventName}>{item.title}</Text>
        </View>

        <View style={styles.eventInfoRow}>
          {item.location && (
            <View style={styles.eventLocationRow}>
              <Ionicons
                name="location-outline"
                size={16}
                color="#666"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.eventLocation}>{item.location}</Text>
            </View>
          )}

          <View style={styles.teamsInfo}>
            <Ionicons
              name="people-outline"
              size={16}
              color="#4CAF50"
              style={{ marginRight: 4 }}
            />
            <Text style={styles.teamsCount}>
              {generatedTeams.length} joukkuetta luotu
            </Text>
          </View>
        </View>

        {item.lastTeamGeneration && (
          <View style={styles.lastGenerationInfo}>
            <Ionicons
              name="time-outline"
              size={14}
              color="#666"
              style={{ marginRight: 4 }}
            />
            <Text style={styles.lastGenerationText}>
              Viimeksi luotu: {formatFullDateTime(item.lastTeamGeneration)}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderTeamModal = () => {
    if (
      !selectedEvent ||
      !selectedEvent.generatedTeams ||
      !selectedEvent.generatedTeams.teams
    )
      return null;

    const teams = selectedEvent.generatedTeams.teams;

    return (
      <Modal
        visible={isTeamModalVisible && !!selectedEvent}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setIsTeamModalVisible(false);
          setSelectedEvent(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 400, width: "90%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Luodut joukkueet</Text>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={copyTeamsToClipboard}
                >
                  <Ionicons name="copy-outline" size={20} color="#2196F3" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.whatsappButton}
                  onPress={sendTeamsToWhatsAppGroup}
                >
                  <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => {
                    setIsTeamModalVisible(false);
                    setSelectedEvent(null);
                  }}
                >
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              style={styles.modalScrollView}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.eventTitle}>{selectedEvent.title}</Text>
              <Text style={styles.eventDate}>
                {formatFullDateTime(selectedEvent.date)}
              </Text>

              <View style={styles.teamsContainer}>
                {teams.map((team, index) => (
                  <View key={`team-${index}`} style={styles.teamContainer}>
                    <View style={styles.teamHeader}>
                      <Text style={styles.teamName}>{team.name}</Text>
                    </View>

                    <View style={styles.playersList}>
                      {(() => {
                        const shuffledIds = getShuffledPlayersForDisplay(
                          team,
                          selectedEvent,
                        );

                        if (!showPositionGroups) {
                          // Original flat display
                          return shuffledIds.map(
                            (playerId: string, playerIndex: number) => {
                              const player = getPlayerById(playerId);
                              if (!player) return null;
                              const playerRole =
                                selectedEvent.playerRoles?.[playerId];
                              const isGoalkeeper = playerRole
                                ? playerRole === "MV"
                                : player.positions.includes("MV");
                              return (
                                <View
                                  key={`team-${index}-player-${playerId}`}
                                  style={[
                                    styles.playerItem,
                                    isGoalkeeper && {
                                      borderLeftWidth: 4,
                                      borderLeftColor: "#ff9800",
                                      backgroundColor: "#fff8e1",
                                    },
                                  ]}
                                >
                                  <View
                                    style={[
                                      styles.playerIcon,
                                      isGoalkeeper && {
                                        backgroundColor: "#ff9800",
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.playerNumber,
                                        isGoalkeeper && { color: "#fff" },
                                      ]}
                                    >
                                      {playerIndex + 1}
                                    </Text>
                                  </View>
                                  <View style={styles.playerInfo}>
                                    <Text
                                      style={[
                                        styles.playerName,
                                        isGoalkeeper && {
                                          color: "#ff9800",
                                          fontWeight: "600",
                                        },
                                      ]}
                                    >
                                      {player.name}
                                      {isGoalkeeper && " 🥅"}
                                    </Text>
                                  </View>
                                </View>
                              );
                            },
                          );
                        }

                        // Grouped display: attackers → defenders → goalkeepers
                        const attackers: string[] = [];
                        const defenders: string[] = [];
                        const goalkeepers: string[] = [];
                        shuffledIds.forEach((id: string) => {
                          const group = getPlayerDisplayGroup(id, team);
                          if (group === "goalkeeper") goalkeepers.push(id);
                          else if (group === "defender") defenders.push(id);
                          else attackers.push(id);
                        });

                        const renderGroupItem = (
                          playerId: string,
                          groupIndex: number,
                          group: "attacker" | "defender" | "goalkeeper",
                        ) => {
                          const player = getPlayerById(playerId);
                          if (!player) return null;
                          const isGoalkeeper = group === "goalkeeper";
                          const isDefender = group === "defender";
                          const bgColor = isGoalkeeper
                            ? "#fff8e1"
                            : isDefender
                              ? "#e8f5e9"
                              : "#e3f2fd";
                          const borderColor = isGoalkeeper
                            ? "#ff9800"
                            : isDefender
                              ? "#4caf50"
                              : "#1976d2";
                          const textColor = isGoalkeeper
                            ? "#ff9800"
                            : isDefender
                              ? "#2e7d32"
                              : "#1565c0";
                          return (
                            <View
                              key={`team-${index}-player-${playerId}`}
                              style={[
                                styles.playerItem,
                                {
                                  borderLeftWidth: 4,
                                  borderLeftColor: borderColor,
                                  backgroundColor: bgColor,
                                },
                              ]}
                            >
                              <View
                                style={[
                                  styles.playerIcon,
                                  { backgroundColor: borderColor },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.playerNumber,
                                    { color: "#fff" },
                                  ]}
                                >
                                  {groupIndex + 1}
                                </Text>
                              </View>
                              <View style={styles.playerInfo}>
                                <Text
                                  style={[
                                    styles.playerName,
                                    { color: textColor, fontWeight: "600" },
                                  ]}
                                >
                                  {player.name}
                                  {isGoalkeeper && " 🥅"}
                                </Text>
                              </View>
                            </View>
                          );
                        };

                        const renderSectionHeader = (
                          label: string,
                          color: string,
                          count: number,
                        ) =>
                          count > 0 ? (
                            <View
                              key={`header-${label}`}
                              style={{
                                paddingVertical: 4,
                                paddingHorizontal: 8,
                                backgroundColor: color,
                                borderRadius: 6,
                                marginTop: 8,
                                marginBottom: 4,
                              }}
                            >
                              <Text
                                style={{
                                  fontWeight: "700",
                                  fontSize: 12,
                                  color: "#fff",
                                }}
                              >
                                {label} ({count})
                              </Text>
                            </View>
                          ) : null;

                        return [
                          renderSectionHeader(
                            "🏒 Hyökkääjät",
                            "#1976d2",
                            attackers.length,
                          ),
                          ...attackers.map((id, i) =>
                            renderGroupItem(id, i, "attacker"),
                          ),
                          renderSectionHeader(
                            "🛡️ Puolustajat",
                            "#4caf50",
                            defenders.length,
                          ),
                          ...defenders.map((id, i) =>
                            renderGroupItem(id, i, "defender"),
                          ),
                          renderSectionHeader(
                            "🥅 Maalivahdit",
                            "#ff9800",
                            goalkeepers.length,
                          ),
                          ...goalkeepers.map((id, i) =>
                            renderGroupItem(id, i, "goalkeeper"),
                          ),
                        ];
                      })()}
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="people-outline" size={64} color="#ccc" />
      <Text style={styles.emptyStateTitle}>Ei luotuja joukkueita</Text>
      <Text style={styles.emptyStateText}>
        Admin voi luoda joukkueita tapahtumille Admin-valikosta
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Joukkueet</Text>
        <AdminMenuButton onNavigate={handleAdminNavigation} />
      </View>

      {/* Team selector */}
      <View style={styles.selectorContainer}>
        <TouchableOpacity
          style={styles.selectorButton}
          onPress={() => setIsTeamSelectorVisible(true)}
        >
          <View style={styles.selectorContent}>
            <Text style={styles.selectorLabel}>Joukkue:</Text>
            <Text style={styles.selectorValue}>{getSelectedTeamName()}</Text>
          </View>
          <Ionicons name="chevron-down" size={20} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Events with teams list */}
      <FlatList
        data={eventsWithTeams}
        renderItem={renderEventItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          eventsWithTeams.length === 0
            ? styles.emptyContainer
            : styles.listContainer
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={!loading ? <EmptyState /> : null}
      />

      {/* Team selection modal */}
      <Modal
        visible={isTeamSelectorVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsTeamSelectorVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Valitse joukkue</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsTeamSelectorVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {/* All teams option */}
            <TouchableOpacity
              style={[
                styles.teamOption,
                !selectedTeamId && styles.selectedTeamOption,
              ]}
              onPress={() => {
                setSelectedTeamId(null);
                setIsTeamSelectorVisible(false);
              }}
            >
              <Text
                style={[
                  styles.teamOptionText,
                  !selectedTeamId && styles.selectedTeamOptionText,
                ]}
              >
                Kaikki joukkueet
              </Text>
              {!selectedTeamId && (
                <Ionicons name="checkmark" size={20} color="#007AFF" />
              )}
            </TouchableOpacity>

            {/* User teams */}
            {userTeams.map((team) => (
              <TouchableOpacity
                key={team.id}
                style={[
                  styles.teamOption,
                  selectedTeamId === team.id && styles.selectedTeamOption,
                ]}
                onPress={() => {
                  setSelectedTeamId(team.id);
                  setIsTeamSelectorVisible(false);
                }}
              >
                <View style={styles.teamOptionLeft}>
                  <View
                    style={[
                      styles.teamColorIndicator,
                      { backgroundColor: team.color || "#1976d2" },
                    ]}
                  />
                  <Text
                    style={[
                      styles.teamOptionText,
                      selectedTeamId === team.id &&
                        styles.selectedTeamOptionText,
                    ]}
                  >
                    {team.name}
                  </Text>
                </View>
                {selectedTeamId === team.id && (
                  <Ionicons name="checkmark" size={20} color="#007AFF" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {renderTeamModal()}
    </View>
  );
};

const shadowOffset = { width: 0, height: 2 };
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9f9f9",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
  },
  listContainer: {
    padding: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  eventCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: shadowOffset,
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  eventHeader: {
    marginBottom: 8,
  },
  eventTimeAndTitle: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1976d2",
  },
  eventName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginTop: 4,
  },
  eventInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  eventLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  eventLocation: {
    fontSize: 14,
    color: "#666",
  },
  teamsInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamsCount: {
    fontSize: 14,
    color: "#4CAF50",
    fontWeight: "500",
  },
  lastGenerationInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  lastGenerationText: {
    fontSize: 12,
    color: "#666",
  },
  emptyState: {
    alignItems: "center",
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 24,
  },
  debugText: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
    marginTop: 8,
  },
  selectorContainer: {
    backgroundColor: "#f5f5f5",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  selectorButton: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  selectorContent: {
    flex: 1,
  },
  selectorLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  selectorValue: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
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
    padding: 20,
    width: "80%",
    maxHeight: "80%",
  },
  modalScrollView: {
    flexGrow: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  copyButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: "#e3f2fd",
  },
  whatsappButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: "rgba(37, 211, 102, 0.1)",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  closeButton: {
    padding: 8,
  },
  eventTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 16,
    color: "#1976d2",
    fontWeight: "600",
    marginBottom: 8,
  },
  teamsContainer: {
    gap: 16,
  },
  teamContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  teamHeader: {
    marginBottom: 12,
  },
  teamName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  playersList: {
    gap: 8,
  },
  playerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
  },
  playerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  playerNumber: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  teamOption: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectedTeamOption: {
    backgroundColor: "#f0f8ff",
  },
  teamOptionText: {
    fontSize: 16,
    color: "#333",
  },
  selectedTeamOptionText: {
    color: "#007AFF",
    fontWeight: "500",
  },
  teamOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  teamColorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
});

export default TeamsScreen;
