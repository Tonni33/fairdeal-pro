import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import {
  doc,
  updateDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  getDoc,
} from "firebase/firestore";

import { RootStackParamList, Player, Event, Team } from "../types";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import { useApp } from "../contexts/AppContext";
import { TeamBalancer } from "../utils/teamBalancer";

type TeamGenerationScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "TeamGeneration"
>;

interface RouteParams {
  eventId: string;
}

interface GeneratedTeam {
  id: string;
  name: string;
  players: Player[];
  totalPoints: number;
  goalkeepers: Player[];
  fieldPlayers: Player[];
  color: string;
}

const TeamGenerationScreen: React.FC = () => {
  const navigation = useNavigation<TeamGenerationScreenNavigationProp>();
  const route = useRoute();
  const { eventId } = (route.params as RouteParams) || {};
  const { user } = useAuth();
  const { events, players, teams, refreshData } = useApp();

  // Helper function to get player's team-specific skills
  const getPlayerTeamSkills = (player: Player, teamId?: string) => {
    if (!teamId || !player.teamSkills?.[teamId]) {
      // Return default player skills
      return {
        category: player.category,
        multiplier: player.multiplier,
        position: player.position,
        points: Math.round(player.multiplier * 100),
      };
    }

    // Return team-specific skills
    const teamSkills = player.teamSkills[teamId];
    return {
      category: teamSkills.category,
      multiplier: teamSkills.multiplier,
      position: teamSkills.position,
      points: Math.round(teamSkills.multiplier * 100),
    };
  };

  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [generatedTeams, setGeneratedTeams] = useState<GeneratedTeam[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [balanceScore, setBalanceScore] = useState<number>(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [existingTeams, setExistingTeams] = useState<GeneratedTeam[]>([]);
  const [hasExistingShuffle, setHasExistingShuffle] = useState(false);
  const [isTeamsSaved, setIsTeamsSaved] = useState(false);

  // Helper functions for player counting by position (same as EventsScreen)
  const getFieldPlayers = (playerIds: string[]) => {
    return playerIds.filter((id) => {
      const player = players.find((p) => p.id === id);
      return player && ["H", "P", "H/P"].includes(player.position);
    });
  };

  const getGoalkeepers = (playerIds: string[]) => {
    return playerIds.filter((id) => {
      const player = players.find((p) => p.id === id);
      return player && player.position === "MV";
    });
  };

  // Get upcoming events with registered players
  const availableEvents = useMemo(() => {
    const now = new Date();
    return events
      .filter((event) => {
        const eventDate = new Date(event.date);
        return (
          eventDate >= now &&
          event.registeredPlayers &&
          event.registeredPlayers.length >= 4 // Minimum 4 players to generate teams
        );
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events]);

  // Auto-select next event if no eventId provided
  useEffect(() => {
    if (!selectedEventId && availableEvents.length > 0) {
      setSelectedEventId(availableEvents[0].id);
    } else if (eventId && eventId !== "") {
      setSelectedEventId(eventId);
    }
  }, [eventId, availableEvents, selectedEventId]);

  // Reset save state when changing events
  useEffect(() => {
    setIsTeamsSaved(false);
    setGeneratedTeams([]);
  }, [selectedEventId]);

  // Load existing generated teams when event is selected
  useEffect(() => {
    const loadExistingTeams = () => {
      if (!selectedEventId) {
        setExistingTeams([]);
        setHasExistingShuffle(false);
        return;
      }

      const event = events.find((e) => e.id === selectedEventId);
      if (event && event.generatedTeams && event.generatedTeams.teams) {
        const teams = event.generatedTeams.teams.map((team: any) => {
          const teamPlayers = team.playerIds.map((id: string) => {
            const player = players.find((p) => p.id === id);
            if (!player) {
              return {
                id,
                name: "Unknown",
                points: 0,
                position: "H",
                multiplier: 1,
              };
            }

            // Get team-specific skills for this player
            const teamSkills = getPlayerTeamSkills(player, event.teamId);
            return {
              ...player,
              category: teamSkills.category,
              multiplier: teamSkills.multiplier,
              position: teamSkills.position,
              points: teamSkills.points,
            };
          });

          return {
            id: team.name || `team-${Math.random()}`,
            name: team.name || "Team",
            players: teamPlayers,
            totalPoints: teamPlayers.reduce(
              (sum: number, p: any) => sum + (p.points || p.multiplier * 100),
              0
            ),
            goalkeepers: teamPlayers.filter((p: any) => p.position === "MV"),
            fieldPlayers: teamPlayers.filter((p: any) =>
              ["H", "P", "H/P"].includes(p.position)
            ),
            color: team.color || "#666",
          };
        });

        setExistingTeams(teams);
        setHasExistingShuffle(
          event.generatedTeams.teams.some(
            (team: any) =>
              team.shuffledPlayerIds && team.shuffledPlayerIds.length > 0
          )
        );
      } else {
        setExistingTeams([]);
        setHasExistingShuffle(false);
      }
    };

    loadExistingTeams();
  }, [selectedEventId, events, players]);

  // Get selected event data
  const selectedEvent = useMemo(() => {
    return events.find((event) => event.id === selectedEventId);
  }, [events, selectedEventId]);

  // Get registered players for selected event
  const registeredPlayers = useMemo(() => {
    if (!selectedEvent || !selectedEvent.registeredPlayers) return [];

    return players
      .filter((player) => selectedEvent.registeredPlayers?.includes(player.id))
      .map((player) => {
        // Apply team-specific skills for this event's team
        const teamSkills = getPlayerTeamSkills(player, selectedEvent.teamId);
        return {
          ...player,
          category: teamSkills.category,
          multiplier: teamSkills.multiplier,
          position: teamSkills.position,
          points: teamSkills.points,
        };
      });
  }, [selectedEvent, players]);

  const fieldPlayerCount = getFieldPlayers(
    selectedEvent?.registeredPlayers || []
  ).length;
  const goalkeeperCount = getGoalkeepers(
    selectedEvent?.registeredPlayers || []
  ).length;

  const handleGenerateTeams = async () => {
    if (!selectedEvent || registeredPlayers.length < 4) {
      Alert.alert(
        "Virhe",
        "Tarvitaan vähintään 4 pelaajaa joukkueiden luomiseen"
      );
      return;
    }

    setIsGenerating(true);
    try {
      // Get selected event to access team settings
      const selectedEvent = events.find((e) => e.id === selectedEventId);

      // Load team settings to get custom team names
      let teamAName = "Joukkue A";
      let teamBName = "Joukkue B";

      if (selectedEvent?.teamId) {
        // Try to load team-specific settings first
        const teamSettingsDoc = await getDoc(
          doc(db, "settings", `team-${selectedEvent.teamId}`)
        );
        if (teamSettingsDoc.exists()) {
          const teamSettings = teamSettingsDoc.data();
          teamAName = teamSettings.teamAName || "Joukkue A";
          teamBName = teamSettings.teamBName || "Joukkue B";
        } else {
          // Fall back to global settings
          const globalSettingsDoc = await getDoc(
            doc(db, "settings", "eventDefaults")
          );
          if (globalSettingsDoc.exists()) {
            const globalSettings = globalSettingsDoc.data();
            teamAName = globalSettings.teamAName || "Joukkue A";
            teamBName = globalSettings.teamBName || "Joukkue B";
          }
        }
      }

      // Use TeamBalancer to generate balanced teams
      const options = {
        playersPerTeam: Math.floor(registeredPlayers.length / 2), // Split into 2 teams
        goalkeepersPerTeam: 1, // Preferred goalkeepers per team
        considerPositions: true,
        balanceMethod: "points" as const,
        allowPartialTeams: false,
      };

      const result = TeamBalancer.generateBalancedTeams(
        registeredPlayers,
        options,
        teamAName,
        teamBName
      );

      // Debug: Log players with their team-specific skills
      console.log(
        "🎯 Team generation using players with team-specific skills:"
      );
      registeredPlayers.forEach((player) => {
        const hasTeamSkills =
          selectedEvent?.teamId && player.teamSkills?.[selectedEvent.teamId];
        console.log(
          `- ${player.name}: ${player.multiplier.toFixed(1)} (${
            player.points
          } pts)${hasTeamSkills ? " ⚡ team-specific" : " 📋 default"}`
        );
      });

      if (result.teams.length === 0) {
        Alert.alert("Virhe", "Joukkueiden luominen epäonnistui");
        setWarnings(result.warnings);
        return;
      }

      console.log("🎯 TeamBalancer result:", {
        balanceScore: result.balanceScore,
        teamsCount: result.teams.length,
        warnings: result.warnings,
      });

      // Convert to our GeneratedTeam format
      const newGeneratedTeams: GeneratedTeam[] = result.teams.map(
        (team, index) => ({
          id: `team_${index + 1}`,
          name: team.name, // Use the name from TeamBalancer (already has custom names)
          players: team.players,
          totalPoints: team.totalPoints,
          goalkeepers: team.goalkeepers,
          fieldPlayers: team.fieldPlayers,
          color: index === 0 ? "#1976d2" : "#f44336", // Blue vs Red
        })
      );

      setGeneratedTeams(newGeneratedTeams);
      setBalanceScore(result.balanceScore);
      setWarnings(result.warnings);
      setIsTeamsSaved(false); // Reset save state when new teams are generated

      console.log("🔄 Updated state:", {
        newBalanceScore: result.balanceScore,
        teamsGenerated: newGeneratedTeams.length,
      });

      // Clear existing teams when generating new ones
      setExistingTeams([]);
      setHasExistingShuffle(false);

      // Ask if user wants to save the teams to the event
      Alert.alert(
        "Joukkueet luotu!",
        "Joukkueet on arvottu onnistuneesti. Haluatko tallentaa joukkueet tapahtumaan?",
        [
          {
            text: "Älä tallenna",
            style: "cancel",
            onPress: () => {
              // Just show the teams without saving
              console.log("User chose not to save the teams");
            },
          },
          {
            text: "Tallenna",
            onPress: async () => {
              try {
                console.log("🔔 Dialog: About to save teams");
                console.log("🔔 Dialog: newGeneratedTeams:", newGeneratedTeams);
                console.log("🔔 Dialog: generatedTeams state:", generatedTeams);
                console.log(
                  "🔔 Dialog: result.balanceScore:",
                  result.balanceScore
                );

                // Use the newly generated teams directly instead of state
                await handleSaveTeamsWithData(
                  newGeneratedTeams,
                  result.balanceScore
                );
              } catch (error) {
                console.error("Error saving teams after generation:", error);
                Alert.alert("Virhe", "Joukkueiden tallentaminen epäonnistui");
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error generating teams:", error);
      Alert.alert("Virhe", "Joukkueiden luominen epäonnistui");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveTeams = async () => {
    console.log("🔍 HandleSaveTeams called");
    console.log("📊 selectedEvent:", selectedEvent);
    console.log("👥 generatedTeams:", generatedTeams);
    console.log("� Current balanceScore state:", balanceScore);
    console.log("�🆔 selectedEventId:", selectedEventId);

    if (!selectedEvent || !generatedTeams || generatedTeams.length === 0) {
      console.log("❌ Early return - missing selectedEvent or teams");
      console.log("selectedEvent exists:", !!selectedEvent);
      console.log("generatedTeams count:", generatedTeams?.length || 0);
      Alert.alert("Virhe", "Ei joukkueita tallennettavaksi");
      return;
    }

    return handleSaveTeamsWithData(generatedTeams, balanceScore);
  };

  const handleSaveTeamsWithData = async (
    teamsToSave: GeneratedTeam[],
    scoreToSave: number = 0
  ) => {
    console.log("🔍 HandleSaveTeamsWithData called");
    console.log("📊 selectedEvent:", selectedEvent);
    console.log("👥 teamsToSave:", teamsToSave);
    console.log("🎯 scoreToSave:", scoreToSave);
    console.log("🆔 selectedEventId:", selectedEventId);

    if (!selectedEvent || !teamsToSave || teamsToSave.length === 0) {
      console.log("❌ Early return - missing selectedEvent or teams");
      console.log("selectedEvent exists:", !!selectedEvent);
      console.log("teamsToSave count:", teamsToSave?.length || 0);
      Alert.alert("Virhe", "Ei joukkueita tallennettavaksi");
      return;
    }

    try {
      console.log("💾 Starting save process...");
      // Save to Firebase events/generatedTeams
      const teamsData = {
        eventId: selectedEvent.id,
        teams: teamsToSave.map((team: GeneratedTeam) => ({
          name: team.name,
          playerIds: team.players.map((p: Player) => p.id),
          totalPoints: team.totalPoints,
          color: team.color,
        })),
        generatedAt: new Date(),
        generatedBy: user?.email || "",
        balanceScore: scoreToSave, // Use the passed score instead of state
      };

      console.log("📋 Teams data to save:", teamsData);

      // Update the event document
      const eventRef = doc(db, "events", selectedEvent.id);
      console.log("🎯 Updating event document:", selectedEvent.id);
      await updateDoc(eventRef, {
        generatedTeams: teamsData,
        lastTeamGeneration: new Date(),
      });

      console.log("✅ Successfully saved to Firebase!");

      // Mark teams as saved
      setIsTeamsSaved(true);

      // Refresh data to see the changes immediately
      await refreshData();
      console.log("🔄 Data refreshed!");

      Alert.alert("Tallennettu!", "Joukkueet tallennettu tapahtumaan", [
        {
          text: "OK",
          onPress: () => {
            // Navigate to Teams screen to see the saved teams
            navigation.navigate("Teams" as never);
          },
        },
      ]);
    } catch (error) {
      console.error("❌ Error saving teams:", error);
      console.log("Error details:", JSON.stringify(error, null, 2));
      Alert.alert("Virhe", "Joukkueiden tallennus epäonnistui");
    }
  };

  const handleClearExistingTeams = async () => {
    if (!selectedEventId) return;

    Alert.alert(
      "Poista tallennettu arvonta",
      "Haluatko poistaa tämän tapahtuman tallennetun arvonnan tuloksen? Tämä ei vaikuta jo pelattaviin joukkueisiin.",
      [
        { text: "Peruuta", style: "cancel" },
        {
          text: "Poista",
          style: "destructive",
          onPress: async () => {
            try {
              const eventRef = doc(db, "events", selectedEventId);
              await updateDoc(eventRef, {
                generatedTeams: null,
              });

              setExistingTeams([]);
              setHasExistingShuffle(false);
              setIsTeamsSaved(false); // Reset save state when clearing teams
              await refreshData();

              Alert.alert("Poistettu", "Arvonnan tulos on poistettu");
            } catch (error) {
              console.error("Error clearing teams:", error);
              Alert.alert("Virhe", "Arvonnan poisto epäonnistui");
            }
          },
        },
      ]
    );
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

  return (
    <View style={styles.container}>
      {/* <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Joukkueiden luonti</Text>
        <View style={styles.placeholder} />
      </View> */}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Event Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Valitse tapahtuma</Text>
          {availableEvents.length === 0 ? (
            <View style={styles.noEventsContainer}>
              <Text style={styles.noEventsText}>
                Ei sopivia tapahtumia joukkueiden luomiseen
              </Text>
              <Text style={styles.noEventsSubtext}>
                Tarvitaan vähintään 4 ilmoittautunutta pelaajaa
              </Text>
            </View>
          ) : (
            availableEvents.map((event) => (
              <TouchableOpacity
                key={event.id}
                style={[
                  styles.eventCard,
                  selectedEventId === event.id && styles.selectedEventCard,
                  (() => {
                    const eventTeam = teams.find(
                      (team) => team.id === event.teamId
                    );
                    return {
                      borderLeftWidth: 4,
                      borderLeftColor: eventTeam?.color || "#1976d2",
                    };
                  })(),
                ]}
                onPress={() => setSelectedEventId(event.id)}
              >
                <View style={styles.eventHeader}>
                  {(() => {
                    const eventTeam = teams.find(
                      (team) => team.id === event.teamId
                    );
                    return (
                      <Text
                        style={[
                          styles.eventTitle,
                          { color: eventTeam?.color || "#1976d2" },
                        ]}
                      >
                        {eventTeam?.name || event.title}
                      </Text>
                    );
                  })()}
                  {selectedEventId === event.id && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color="#4CAF50"
                    />
                  )}
                </View>
                <Text style={styles.eventDate}>
                  {formatDate(event.date)} klo {formatTime(event.date)}
                </Text>
                <View style={styles.eventPlayersContainer}>
                  <Text style={styles.eventPlayers}>
                    {getFieldPlayers(event.registeredPlayers || []).length}{" "}
                    pelaajaa
                    {event.maxGoalkeepers && event.maxGoalkeepers > 0 && (
                      <Text style={{ color: "#ff9800" }}>
                        {" • "}
                        {
                          getGoalkeepers(event.registeredPlayers || []).length
                        }{" "}
                        MV
                      </Text>
                    )}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Selected Event Details */}
        {selectedEvent && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ilmoittautuneet pelaajat</Text>
            <View style={styles.playersContainer}>
              <View style={styles.playersHeader}>
                <Text style={styles.playersCount}>
                  {fieldPlayerCount} pelaajaa
                  {selectedEvent.maxGoalkeepers &&
                    selectedEvent.maxGoalkeepers > 0 && (
                      <Text style={{ color: "#ff9800" }}>
                        {" • "}
                        {goalkeeperCount} MV
                      </Text>
                    )}
                </Text>
              </View>

              {registeredPlayers.map((player) => {
                const isGoalkeeper = player.position === "MV";
                return (
                  <View
                    key={player.id}
                    style={[
                      styles.playerItem,
                      isGoalkeeper && styles.goalkeeperItem,
                    ]}
                  >
                    <Text
                      style={[
                        styles.playerName,
                        isGoalkeeper && styles.goalkeeperName,
                      ]}
                    >
                      {player.name}
                      {isGoalkeeper && " 🥅"}
                    </Text>
                    <Text style={styles.playerPoints}>
                      {Math.round(player.points || player.multiplier * 100)}{" "}
                      pistettä
                    </Text>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              style={[
                styles.generateButton,
                isGenerating && styles.disabledButton,
              ]}
              onPress={handleGenerateTeams}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Ionicons name="shuffle" size={20} color="white" />
              )}
              <Text style={styles.buttonText}>
                {isGenerating ? "Luodaan..." : "Arvo joukkueet"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Existing Team Results */}
        {existingTeams.length > 0 && generatedTeams.length === 0 && (
          <View style={styles.section}>
            <View style={styles.teamsHeader}>
              <Text style={styles.sectionTitle}>Tallennettu arvonta</Text>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={handleClearExistingTeams}
              >
                <Ionicons name="trash-outline" size={16} color="#f44336" />
                <Text style={styles.clearButtonText}>Poista</Text>
              </TouchableOpacity>
            </View>

            {hasExistingShuffle && (
              <View style={styles.shuffleInfo}>
                <Ionicons name="information-circle" size={16} color="#ff9800" />
                <Text style={styles.shuffleInfoText}>
                  Pelaajajärjestys on sekoitettu ja tallennettu
                </Text>
              </View>
            )}

            {existingTeams.map((team, index) => (
              <View key={team.id} style={styles.teamCard}>
                <View style={styles.teamHeader}>
                  <View
                    style={[
                      styles.teamColorDot,
                      { backgroundColor: team.color },
                    ]}
                  />
                  <Text style={styles.teamName}>{team.name}</Text>
                  <Text style={styles.teamPoints}>
                    {Math.round(team.totalPoints)} pistettä
                  </Text>
                </View>
                <View style={styles.teamPlayers}>
                  {team.players.map((player) => {
                    const isGoalkeeper = player.position === "MV";
                    return (
                      <View
                        key={player.id}
                        style={[
                          styles.teamPlayerItem,
                          isGoalkeeper && styles.teamGoalkeeperItem,
                        ]}
                      >
                        <Text
                          style={[
                            styles.teamPlayerName,
                            isGoalkeeper && styles.teamGoalkeeperName,
                          ]}
                        >
                          {player.name}
                          {isGoalkeeper && " 🥅"}
                        </Text>
                        <Text style={styles.teamPlayerPoints}>
                          {Math.round(player.points || player.multiplier * 100)}
                          p
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Generated Teams */}
        {generatedTeams.length > 0 && (
          <View style={styles.section}>
            <View style={styles.teamsHeader}>
              <Text style={styles.sectionTitle}>Luodut joukkueet</Text>
              <View style={styles.balanceScore}>
                <Text style={styles.balanceScoreText}>
                  Tasapaino: {balanceScore}/100
                </Text>
              </View>
            </View>

            {warnings.length > 0 && (
              <View style={styles.warningsContainer}>
                {warnings.map((warning, index) => (
                  <Text key={index} style={styles.warningText}>
                    ⚠️ {warning}
                  </Text>
                ))}
              </View>
            )}

            {generatedTeams.map((team, index) => (
              <View
                key={team.id}
                style={[
                  styles.teamCard,
                  { borderLeftColor: team.color, borderLeftWidth: 4 },
                ]}
              >
                <View style={styles.teamHeader}>
                  <Text style={styles.teamName}>{team.name}</Text>
                  <Text style={styles.teamPoints}>
                    {team.totalPoints} pistettä
                  </Text>
                </View>

                <View style={styles.teamPlayers}>
                  {team.players.map((player) => {
                    const isGoalkeeper = player.position === "MV";
                    return (
                      <View
                        key={player.id}
                        style={[
                          styles.teamPlayerItem,
                          isGoalkeeper && styles.teamGoalkeeperItem,
                        ]}
                      >
                        <Text
                          style={[
                            styles.teamPlayerName,
                            isGoalkeeper && styles.teamGoalkeeperName,
                          ]}
                        >
                          {player.name}
                          {isGoalkeeper && " 🥅"}
                        </Text>
                        <Text style={styles.teamPlayerPoints}>
                          {Math.round(player.points || player.multiplier * 100)}
                          p
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.regenerateButton}
                onPress={handleGenerateTeams}
              >
                <Ionicons name="refresh" size={20} color="#1976d2" />
                <Text style={styles.regenerateButtonText}>Arvo uudelleen</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveButton, isTeamsSaved && styles.savedButton]}
                onPress={handleSaveTeams}
                disabled={isTeamsSaved}
              >
                <Ionicons
                  name={isTeamsSaved ? "checkmark-circle" : "checkmark"}
                  size={20}
                  color={isTeamsSaved ? "#666" : "white"}
                />
                <Text
                  style={[
                    styles.saveButtonText,
                    isTeamsSaved && styles.savedButtonText,
                  ]}
                >
                  {isTeamsSaved ? "Tallennettu" : "Tallenna joukkueet"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

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
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 16,
  },
  noEventsContainer: {
    padding: 20,
    backgroundColor: "white",
    borderRadius: 12,
    alignItems: "center",
  },
  noEventsText: {
    fontSize: 16,
    color: "#333",
    fontWeight: "600",
    marginBottom: 4,
  },
  noEventsSubtext: {
    fontSize: 14,
    color: "#666",
  },
  eventCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedEventCard: {
    borderColor: "#4CAF50",
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    flex: 1,
  },
  eventDate: {
    fontSize: 14,
    color: "#1976d2",
    fontWeight: "500",
  },
  eventPlayers: {
    fontSize: 14,
    color: "#666",
  },
  eventPlayersContainer: {
    marginTop: 8,
  },
  playersContainer: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  playersHeader: {
    marginBottom: 12,
  },
  playersCount: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  playerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    marginBottom: 8,
  },
  goalkeeperItem: {
    backgroundColor: "#fff8e1",
    borderLeftWidth: 3,
    borderLeftColor: "#ff9800",
  },
  playerName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    flex: 1,
  },
  goalkeeperName: {
    color: "#ff9800",
    fontWeight: "600",
  },
  playerPoints: {
    fontSize: 12,
    color: "#666",
  },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  disabledButtonText: {
    color: "#999",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  teamsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  balanceScore: {
    backgroundColor: "#e8f5e8",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  balanceScoreText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4CAF50",
  },
  warningsContainer: {
    backgroundColor: "#fff3cd",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  warningText: {
    fontSize: 14,
    color: "#856404",
    marginBottom: 4,
  },
  teamCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  teamHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  teamName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  teamPoints: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  teamPlayers: {
    gap: 4,
  },
  teamPlayerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#f8f9fa",
    borderRadius: 6,
  },
  teamGoalkeeperItem: {
    backgroundColor: "#fff8e1",
  },
  teamPlayerName: {
    fontSize: 14,
    color: "#333",
    flex: 1,
  },
  teamGoalkeeperName: {
    color: "#ff9800",
    fontWeight: "500",
  },
  teamPlayerPoints: {
    fontSize: 12,
    color: "#666",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  regenerateButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#1976d2",
    gap: 8,
  },
  regenerateButtonText: {
    color: "#1976d2",
    fontSize: 14,
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  savedButton: {
    backgroundColor: "#e0e0e0",
  },
  savedButtonText: {
    color: "#666",
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#ffebee",
    gap: 4,
  },
  clearButtonText: {
    color: "#f44336",
    fontSize: 12,
    fontWeight: "600",
  },
  shuffleInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff8e1",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  shuffleInfoText: {
    fontSize: 14,
    color: "#e65100",
    flex: 1,
  },
  teamColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
});

export default TeamGenerationScreen;
