import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  Modal,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDoc,
} from "firebase/firestore";

import { RootStackParamList, Event, Team } from "../types";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import { useApp, getUserTeams } from "../contexts/AppContext";
import AdminMenuButton from "../components/AdminMenuButton";

type EventsScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "Events"
>;

const EventsScreen: React.FC = () => {
  const [isTeamModalVisible, setIsTeamModalVisible] = useState(false);
  const { selectedTeamId, setSelectedTeamId } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  // Helper functions for player counting by position
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

  // Helper function to sort players - goalkeepers at the end
  const sortPlayersByPosition = (playerData: any[]) => {
    return playerData.sort((a, b) => {
      if (a.position === "MV" && b.position !== "MV") return 1;
      if (a.position !== "MV" && b.position === "MV") return -1;
      return a.name.localeCompare(b.name);
    });
  };

  const navigation = useNavigation<EventsScreenNavigationProp>();
  const { user } = useAuth();
  const { events, teams, loading, refreshData } = useApp();

  // Filtteröi joukkueet joissa nykyinen käyttäjä on mukana (sähköpostilla)
  const userTeams = useMemo(() => getUserTeams(user, teams), [user, teams]);

  // Filtteröi tapahtumat valitun joukkueen mukaan
  const filteredEvents = useMemo(() => {
    let filteredList = selectedTeamId
      ? events.filter((event) => event.teamId === selectedTeamId)
      : events;

    // Järjestä tapahtumat ajan mukaan (uusin ylhäällä)
    return filteredList.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [events, selectedTeamId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  const getSelectedTeamName = () => {
    if (!selectedTeamId) return "Kaikki joukkueet";
    const team = userTeams.find((t) => t.id === selectedTeamId);
    return team ? team.name : "Kaikki joukkueet";
  };

  const handleAdminNavigation = (screen: string) => {
    if (screen === "CreateEvent") {
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
      // Navigate to team generation - we'll need to select an event there
      navigation.navigate("TeamGeneration", { eventId: "" });
    } else if (screen === "Settings") {
      navigation.navigate("Settings");
    } else {
      Alert.alert(
        "Tulossa pian",
        `${screen} -toiminto toteutetaan seuraavaksi`
      );
    }
  };

  // Modalin tila ja valittu tapahtuma
  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isReserve, setIsReserve] = useState(false);
  const [registrationLoading, setRegistrationLoading] = useState(false);
  const [registeredPlayers, setRegisteredPlayers] = useState<any[]>([]);
  const [reservePlayers, setReservePlayers] = useState<any[]>([]);

  const { players } = useApp();

  // Hae nykyinen pelaaja käyttäjän sähköpostilla
  const currentPlayer = useMemo(() => {
    if (!user) return null;
    return players.find((p) => p.email === user.email);
  }, [user, players]);

  // Päivitä valittu tapahtuma kun events-data muuttuu
  useEffect(() => {
    if (selectedEvent) {
      const updatedEvent = events.find(
        (event) => event.id === selectedEvent.id
      );
      if (updatedEvent) {
        setSelectedEvent(updatedEvent);
      }
    }
  }, [events, selectedEvent?.id]);

  useEffect(() => {
    if (selectedEvent && currentPlayer) {
      console.log("EventsScreen: Checking registration status");
      console.log(
        "EventsScreen: selectedEvent.registeredPlayers:",
        selectedEvent.registeredPlayers
      );
      console.log(
        "EventsScreen: selectedEvent.reservePlayers:",
        selectedEvent.reservePlayers
      );
      console.log("EventsScreen: currentPlayer.id:", currentPlayer.id);

      setIsRegistered(
        selectedEvent.registeredPlayers?.includes(currentPlayer.id) || false
      );
      setIsReserve(
        selectedEvent.reservePlayers?.includes(currentPlayer.id) || false
      );
      // Update registered players list
      const registeredPlayerData = players.filter((player) =>
        selectedEvent.registeredPlayers?.includes(player.id)
      );
      setRegisteredPlayers(registeredPlayerData);
      // Update reserve players list
      const reservePlayerData = players.filter((player) =>
        selectedEvent.reservePlayers?.includes(player.id)
      );
      setReservePlayers(reservePlayerData);

      console.log("EventsScreen: reservePlayerData:", reservePlayerData);
    } else {
      setIsRegistered(false);
      setIsReserve(false);
      setRegisteredPlayers([]);
      setReservePlayers([]);
    }
  }, [selectedEvent, currentPlayer, players]);

  const handleRegistration = async () => {
    if (!selectedEvent || !currentPlayer) return;
    setRegistrationLoading(true);
    try {
      const eventRef = doc(db, "events", selectedEvent.id);

      if (isRegistered) {
        // Unregister from main registration
        await updateDoc(eventRef, {
          registeredPlayers: arrayRemove(currentPlayer.id),
        });

        // Check if there are reserve players to promote
        const eventDoc = await getDoc(eventRef);
        const eventData = eventDoc.data();
        const reservePlayers = eventData?.reservePlayers || [];

        if (reservePlayers.length > 0) {
          // Find a suitable reserve player to promote
          const isGoalkeeper = currentPlayer.position === "MV";
          const suitableReserve = reservePlayers.find((reserveId: string) => {
            const reservePlayer = players.find((p) => p.id === reserveId);
            return (
              reservePlayer &&
              (reservePlayer.position === "MV") === isGoalkeeper
            );
          });

          if (suitableReserve) {
            // Promote reserve player
            await updateDoc(eventRef, {
              registeredPlayers: arrayUnion(suitableReserve),
              reservePlayers: arrayRemove(suitableReserve),
            });

            const promotedPlayer = players.find(
              (p) => p.id === suitableReserve
            );
            Alert.alert(
              "Ilmoittautuminen peruttu",
              `Paikkasi otettiin varamieheksi ilmoittautuneelta pelaajalta: ${
                promotedPlayer?.name || "Tuntematon"
              }`
            );
          } else {
            Alert.alert("Onnistui", "Ilmoittautuminen peruttu");
          }
        } else {
          Alert.alert("Onnistui", "Ilmoittautuminen peruttu");
        }

        setIsRegistered(false);
      } else if (isReserve) {
        // Unregister from reserve list
        await updateDoc(eventRef, {
          reservePlayers: arrayRemove(currentPlayer.id),
        });
        setIsReserve(false);
        Alert.alert("Onnistui", "Varamies-ilmoittautuminen peruttu");
      } else {
        // Check if event is full based on player position
        const eventDoc = await getDoc(eventRef);
        const eventData = eventDoc.data();
        const currentRegistered = eventData?.registeredPlayers || [];

        const currentFieldPlayers = getFieldPlayers(currentRegistered);
        const currentGoalkeepers = getGoalkeepers(currentRegistered);

        const isGoalkeeper = currentPlayer.position === "MV";
        const isEventFull = isGoalkeeper
          ? selectedEvent.maxGoalkeepers &&
            currentGoalkeepers.length >= selectedEvent.maxGoalkeepers
          : currentFieldPlayers.length >= selectedEvent.maxPlayers;

        if (isEventFull) {
          // Event is full, offer reserve position
          Alert.alert(
            "Tapahtuma on täynnä",
            "Haluatko ilmoittautua varamieheksi? Saat paikan jos joku luopuu.",
            [
              { text: "Ei", style: "cancel" },
              {
                text: "Kyllä, varamieheksi",
                onPress: async () => {
                  try {
                    await updateDoc(eventRef, {
                      reservePlayers: arrayUnion(currentPlayer.id),
                    });
                    setIsReserve(true);
                    Alert.alert("Onnistui", "Ilmoittautunut varamieheksi");
                  } catch (error) {
                    console.error("Error registering as reserve:", error);
                    Alert.alert(
                      "Virhe",
                      "Varamies-ilmoittautuminen epäonnistui"
                    );
                  }
                },
              },
            ]
          );
        } else {
          // Register normally
          await updateDoc(eventRef, {
            registeredPlayers: arrayUnion(currentPlayer.id),
          });
          setIsRegistered(true);
          Alert.alert("Onnistui", "Ilmoittautuminen tallennettu");
        }
      }
    } catch (error) {
      console.error("Error updating registration:", error);
      Alert.alert("Virhe", "Ilmoittautumisen tallennus epäonnistui");
    } finally {
      setRegistrationLoading(false);
    }
  };

  // Muotoilufunktiot (kuten HomeScreenissä)
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
    const isUpcoming = eventDate > new Date();

    // Calculate position-based participant counts
    const registeredPlayerIds = item.registeredPlayers || [];
    const fieldPlayerCount = getFieldPlayers(registeredPlayerIds).length;
    const goalkeeperCount = getGoalkeepers(registeredPlayerIds).length;

    // Hae joukkueen väri
    const team = teams.find((t) => t.id === item.teamId);
    const teamColor = team?.color || "#1976d2";
    return (
      <TouchableOpacity
        style={[styles.eventCard, { borderColor: teamColor, borderWidth: 2 }]}
        onPress={() => {
          setSelectedEvent(item);
          setEventModalVisible(true);
        }}
      >
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

          <View style={styles.participantInfo}>
            <Ionicons
              name="people-outline"
              size={16}
              color="#4CAF50"
              style={{ marginRight: 4 }}
            />
            <Text style={styles.participantCount}>
              {fieldPlayerCount} / {item.maxPlayers || "∞"} pelaajaa
              {item.maxGoalkeepers && item.maxGoalkeepers > 0 && (
                <Text style={{ color: "#ff9800", fontWeight: "500" }}>
                  {" • "}
                  {goalkeeperCount} / {item.maxGoalkeepers} MV
                </Text>
              )}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="calendar-outline" size={64} color="#ccc" />
      <Text style={styles.emptyStateTitle}>Ei tapahtumia</Text>
      <Text style={styles.emptyStateText}>
        Admin voi luoda tapahtumia Admin-valikosta
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tapahtumat</Text>
        <AdminMenuButton onNavigate={handleAdminNavigation} />
      </View>

      {/* Joukkuevalitsin */}
      <View style={styles.selectorContainer}>
        <TouchableOpacity
          style={styles.selectorButton}
          onPress={() => setIsTeamModalVisible(true)}
        >
          <View style={styles.selectorContent}>
            <Text style={styles.selectorLabel}>Joukkue:</Text>
            <Text style={styles.selectorValue}>{getSelectedTeamName()}</Text>
          </View>
          <Ionicons name="chevron-down" size={20} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Tapahtumien lista */}
      <FlatList
        data={filteredEvents}
        renderItem={renderEventItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          filteredEvents.length === 0
            ? styles.emptyContainer
            : styles.listContainer
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={!loading ? <EmptyState /> : null}
      />

      {/* Joukkuevalinta modal */}
      <Modal
        visible={isTeamModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsTeamModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Valitse joukkue</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsTeamModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Kaikki joukkueet -vaihtoehto */}
            <TouchableOpacity
              style={[
                styles.teamOption,
                !selectedTeamId && styles.selectedTeamOption,
              ]}
              onPress={() => {
                setSelectedTeamId(null);
                setIsTeamModalVisible(false);
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

            {/* Käyttäjän joukkueet */}
            {userTeams.map((team) => (
              <TouchableOpacity
                key={team.id}
                style={[
                  styles.teamOption,
                  selectedTeamId === team.id && styles.selectedTeamOption,
                ]}
                onPress={() => {
                  setSelectedTeamId(team.id);
                  setIsTeamModalVisible(false);
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
      {/* Tapahtuman tiedot -modal */}
      <Modal
        visible={eventModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setEventModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 400, width: "90%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tapahtuman tiedot</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setEventModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScrollView}
              showsVerticalScrollIndicator={false}
            >
              {selectedEvent && (
                <>
                  <Text style={styles.eventTitle}>{selectedEvent.title}</Text>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color="#1976d2"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.eventDate}>
                      {formatFullDateTime(selectedEvent.date)}
                    </Text>
                  </View>

                  {selectedEvent.location && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <Ionicons
                        name="location-outline"
                        size={18}
                        color="#1976d2"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.eventLocation}>
                        {selectedEvent.location}
                      </Text>
                    </View>
                  )}

                  {selectedEvent.description && (
                    <Text style={styles.eventDescription}>
                      {selectedEvent.description}
                    </Text>
                  )}

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: 8,
                      marginBottom: 16,
                    }}
                  >
                    <Ionicons
                      name="people-outline"
                      size={18}
                      color="#1976d2"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.participantText}>
                      {
                        getFieldPlayers(selectedEvent.registeredPlayers || [])
                          .length
                      }{" "}
                      / {selectedEvent.maxPlayers} pelaajaa
                      {selectedEvent.maxGoalkeepers &&
                        selectedEvent.maxGoalkeepers > 0 && (
                          <Text style={{ color: "#ff9800", fontWeight: "500" }}>
                            {" • "}
                            {
                              getGoalkeepers(
                                selectedEvent.registeredPlayers || []
                              ).length
                            }{" "}
                            / {selectedEvent.maxGoalkeepers} MV
                          </Text>
                        )}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.registrationButton,
                      isRegistered
                        ? styles.unregisterButton
                        : isReserve
                        ? styles.reserveButton
                        : styles.registerButton,
                      registrationLoading && styles.disabledButton,
                    ]}
                    onPress={handleRegistration}
                    disabled={registrationLoading}
                  >
                    <Ionicons
                      name={
                        isRegistered
                          ? "checkmark-circle"
                          : isReserve
                          ? "time-outline"
                          : "add-circle"
                      }
                      size={20}
                      color="white"
                      style={styles.buttonIcon}
                    />
                    <Text style={styles.buttonText}>
                      {registrationLoading
                        ? "Tallennetaan..."
                        : isRegistered
                        ? "Peru ilmoittautuminen"
                        : isReserve
                        ? "Peru varamies-ilmoittautuminen"
                        : "Ilmoittaudu"}
                    </Text>
                  </TouchableOpacity>

                  {selectedEvent.registeredPlayers &&
                    selectedEvent.registeredPlayers.length > 0 && (
                      <View style={styles.registeredSection}>
                        <Text style={styles.registeredTitle}>
                          Ilmoittautuneet
                        </Text>

                        <View style={styles.playersList}>
                          {sortPlayersByPosition(registeredPlayers).map(
                            (player, index) => {
                              const isGoalkeeper = player?.position === "MV";
                              return (
                                <View
                                  key={player.id}
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
                                      {index + 1}
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
                                    {player.email && (
                                      <Text style={styles.playerEmail}>
                                        {player.email}
                                      </Text>
                                    )}
                                  </View>
                                </View>
                              );
                            }
                          )}
                        </View>
                      </View>
                    )}

                  {selectedEvent.reservePlayers &&
                    selectedEvent.reservePlayers.length > 0 && (
                      <View style={styles.registeredSection}>
                        <Text
                          style={[styles.registeredTitle, styles.reserveTitle]}
                        >
                          Varamiehet ({reservePlayers.length})
                        </Text>

                        <View style={styles.playersList}>
                          {sortPlayersByPosition(reservePlayers).map(
                            (player, index) => {
                              const isGoalkeeper = player?.position === "MV";
                              return (
                                <View
                                  key={player.id}
                                  style={[
                                    styles.playerItem,
                                    styles.reservePlayerItem,
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
                                      styles.reservePlayerIcon,
                                      isGoalkeeper && {
                                        backgroundColor: "#ff9800",
                                      },
                                    ]}
                                  >
                                    <Ionicons
                                      name="time-outline"
                                      size={16}
                                      color={isGoalkeeper ? "#fff" : "#ff9800"}
                                    />
                                  </View>
                                  <View style={styles.playerInfo}>
                                    <Text
                                      style={[
                                        styles.playerName,
                                        styles.reservePlayerName,
                                        isGoalkeeper && {
                                          color: "#ff9800",
                                          fontWeight: "600",
                                        },
                                      ]}
                                    >
                                      {player.name}
                                      {isGoalkeeper && " 🥅"}
                                    </Text>
                                    {player.email && (
                                      <Text
                                        style={[
                                          styles.playerEmail,
                                          styles.reservePlayerEmail,
                                        ]}
                                      >
                                        {player.email}
                                      </Text>
                                    )}
                                  </View>
                                </View>
                              );
                            }
                          )}
                        </View>
                      </View>
                    )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  eventName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  upcomingBadge: {
    backgroundColor: "#4caf50",
  },
  pastBadge: {
    backgroundColor: "#757575",
  },
  statusText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  eventDate: {
    fontSize: 16,
    color: "#1976d2",
    fontWeight: "600",
    marginBottom: 4,
  },
  eventLocation: {
    fontSize: 14,
    color: "#666",
  },
  participantInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  participantText: {
    fontSize: 14,
    color: "#666",
    marginLeft: 4,
  },
  eventDescription: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
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
    maxHeight: "70%",
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
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  closeButton: {
    padding: 8,
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
  eventTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  eventTimeAndTitle: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1976d2",
    marginRight: 8,
  },
  eventLocationRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  eventInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  participantCount: {
    fontSize: 14,
    color: "#4CAF50",
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
  registrationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  registerButton: {
    backgroundColor: "#4caf50",
  },
  unregisterButton: {
    backgroundColor: "#f44336",
  },
  reserveButton: {
    backgroundColor: "#ff9800",
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  registeredSection: {
    marginTop: 8,
  },
  registeredTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#4caf50",
    borderRadius: 4,
  },
  playersList: {
    marginTop: 16,
  },
  playerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    marginBottom: 8,
  },
  playerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  playerNumber: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  playerEmail: {
    fontSize: 12,
    color: "#666",
  },
  availableSlots: {
    padding: 12,
    backgroundColor: "#e8f5e8",
    borderRadius: 8,
    alignItems: "center",
  },
  availableSlotsText: {
    fontSize: 14,
    color: "#4caf50",
    fontWeight: "500",
  },
  reserveTitle: {
    color: "#ff9800",
    fontWeight: "600",
  },
  reservePlayerItem: {
    backgroundColor: "#fff8f0",
    borderLeftWidth: 3,
    borderLeftColor: "#ff9800",
  },
  reservePlayerIcon: {
    backgroundColor: "#fff8f0",
    borderColor: "#ff9800",
  },
  reservePlayerName: {
    color: "#e65100",
  },
  reservePlayerEmail: {
    color: "#f57c00",
  },
});

export default EventsScreen;
