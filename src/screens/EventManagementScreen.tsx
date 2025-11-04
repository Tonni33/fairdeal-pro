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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
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

  // Helper function to get player's team-specific skills for the event
  const getPlayerEventSkills = (player: any, eventTeamId?: string) => {
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
      teamSkills
    );
    return {
      category: teamSkills.category,
      multiplier: teamSkills.multiplier,
      position: teamSkills.position,
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
        player.teams?.includes(selectedEvent.teamId)
    );
  };

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
  const sortPlayersByPosition = (playerIds: string[]) => {
    const fieldPlayers = getFieldPlayers(playerIds);
    const goalkeepers = getGoalkeepers(playerIds);
    return [...fieldPlayers, ...goalkeepers];
  };

  // Helper function to get player style based on position
  const getPlayerIconColor = (player: any, teamId?: string) => {
    if (player?.position === "MV") {
      return "#ff9800"; // Orange for goalkeepers
    }
    return teamId ? getTeamColor(teamId) : "#1976d2";
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
    }, [])
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

      // Sort events by date, newest first
      const sortedEvents = filteredEvents.sort((a: any, b: any) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        return dateB.getTime() - dateA.getTime(); // Newest first
      });

      setEvents(sortedEvents);

      // Update selectedEvent if it exists to reflect latest data
      if (selectedEvent) {
        const updatedSelectedEvent = sortedEvents.find(
          (event: any) => event.id === selectedEvent.id
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
      dateObj = new Date(event.date);
      timeObj = new Date(event.date);
    }

    setEditForm({
      name: event.name || event.title || "",
      date: dateObj
        ? `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(
            2,
            "0"
          )}-${String(dateObj.getDate()).padStart(2, "0")}`
        : "",
      time: dateObj
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

  const handleAddPlayerToEvent = async (playerId: string) => {
    if (!selectedEvent) return;
    setAddingPlayerId(playerId);
    try {
      const eventRef = doc(db, "events", selectedEvent.id);
      const currentPlayers = selectedEvent.registeredPlayers || [];
      if (currentPlayers.includes(playerId)) {
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

      const currentFieldPlayers = getFieldPlayers(currentPlayers);
      const currentGoalkeepers = getGoalkeepers(currentPlayers);

      if (player.position === "MV") {
        // Check goalkeeper limit
        if (
          selectedEvent.maxGoalkeepers &&
          currentGoalkeepers.length >= selectedEvent.maxGoalkeepers
        ) {
          // Offer reserve position for goalkeepers
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
            ]
          );
          setAddingPlayerId(null);
          return;
        }
      } else if (["H", "P", "H/P"].includes(player.position)) {
        // Check field player limit
        if (
          selectedEvent.maxPlayers &&
          currentFieldPlayers.length >= selectedEvent.maxPlayers
        ) {
          // Offer reserve position for field players
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
            ]
          );
          setAddingPlayerId(null);
          return;
        }
      }

      await updateDoc(eventRef, {
        registeredPlayers: [...currentPlayers, playerId],
      });

      // Update selectedEvent state
      const updatedEvent = {
        ...selectedEvent,
        registeredPlayers: [...currentPlayers, playerId],
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

      // Filter out players already in the event
      const playersToAdd = selectedPlayerIds.filter(
        (id) => !currentPlayers.includes(id)
      );

      if (playersToAdd.length === 0) {
        Alert.alert(
          "Ei lisättäviä",
          "Kaikki valitut pelaajat ovat jo tapahtumassa"
        );
        setIsAddingMultiplePlayers(false);
        return;
      }

      // Check player limits
      const playersData = playersToAdd
        .map((id) => players.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => p != null);
      const fieldPlayersToAdd = playersData.filter((p) =>
        ["H", "P", "H/P"].includes(p.position)
      );
      const goalkeepersToAdd = playersData.filter((p) => p.position === "MV");

      const currentFieldPlayers = getFieldPlayers(currentPlayers);
      const currentGoalkeepers = getGoalkeepers(currentPlayers);

      // Separate players into main list and reserves based on limits
      const playersToMainList: string[] = [];
      const playersToReserve: string[] = [];

      // Handle field players
      if (selectedEvent.maxPlayers) {
        const availableFieldSlots =
          selectedEvent.maxPlayers - currentFieldPlayers.length;
        const fieldPlayerIds = fieldPlayersToAdd.map((p) => p.id);

        fieldPlayerIds.forEach((id, index) => {
          if (index < availableFieldSlots) {
            playersToMainList.push(id);
          } else {
            playersToReserve.push(id);
          }
        });
      } else {
        // No limit, add all to main list
        playersToMainList.push(...fieldPlayersToAdd.map((p) => p.id));
      }

      // Handle goalkeepers
      if (selectedEvent.maxGoalkeepers) {
        const availableGoalkeeperSlots =
          selectedEvent.maxGoalkeepers - currentGoalkeepers.length;
        const goalkeeperIds = goalkeepersToAdd.map((p) => p.id);

        goalkeeperIds.forEach((id, index) => {
          if (index < availableGoalkeeperSlots) {
            playersToMainList.push(id);
          } else {
            playersToReserve.push(id);
          }
        });
      } else {
        // No limit, add all to main list
        playersToMainList.push(...goalkeepersToAdd.map((p) => p.id));
      }

      // Show info if some players will be added to reserves
      if (playersToReserve.length > 0) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Lisätään varalle",
            `${playersToMainList.length} pelaajaa lisätään tapahtumaan ja ${playersToReserve.length} pelaajaa lisätään varallaolioiksi täynnä olevien paikkojen vuoksi. Jatketaanko?`,
            [
              {
                text: "Peruuta",
                style: "cancel",
                onPress: () => resolve(false),
              },
              { text: "Jatka", onPress: () => resolve(true) },
            ]
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

  const handleRemovePlayerFromEvent = async (playerId: string) => {
    if (!selectedEvent) return;
    setRemovingPlayerId(playerId);
    try {
      const eventRef = doc(db, "events", selectedEvent.id);
      const currentPlayers = selectedEvent.registeredPlayers || [];

      // Find the player being removed to check their position
      const removedPlayer = players.find((p) => p.id === playerId);
      const isRemovedPlayerGoalkeeper = removedPlayer?.position === "MV";

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
              (reservePlayer.position === "MV") === isRemovedPlayerGoalkeeper;

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
              (reservePlayer.position === "MV") === isRemovedPlayerGoalkeeper
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
            } siirrettiin automaattisesti mukaan.`
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
          (id: string) => id !== playerId
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
      ]
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

  return (
    <View style={styles.container}>
      {!selectedEvent ? (
        <ScrollView>
          {/* <Text style={styles.title}>Tapahtumahallinta</Text> */}
          <Text style={styles.subtitle}>Valitse tapahtuma muokattavaksi</Text>
          {events.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>Ei tapahtumia</Text>
              <Text style={styles.emptySubtext}>
                Luo ensin tapahtuma admin-valikosta
              </Text>
            </View>
          ) : (
            events.map((event) => (
              <TouchableOpacity
                key={event.id}
                style={[
                  styles.eventCard,
                  event.teamId && {
                    borderLeftWidth: 4,
                    borderLeftColor: getTeamColor(event.teamId),
                  },
                ]}
                onPress={() => handleSelectEvent(event)}
              >
                <View style={styles.eventCardContent}>
                  <View style={styles.eventCardHeader}>
                    {(() => {
                      const eventTeam = teams.find(
                        (team) => team.id === event.teamId
                      );
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
                      color={
                        event.teamId ? getTeamColor(event.teamId) : "#1976d2"
                      }
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
                      <Ionicons
                        name="calendar-outline"
                        size={16}
                        color="#666"
                      />
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
                        {getFieldPlayers(event.registeredPlayers || []).length}{" "}
                        / {event.maxPlayers || "∞"} pelaajaa
                        {event.maxGoalkeepers && event.maxGoalkeepers > 0 && (
                          <Text style={styles.goalkeeperText}>
                            {" • "}
                            {
                              getGoalkeepers(event.registeredPlayers || [])
                                .length
                            }{" "}
                            / {event.maxGoalkeepers} MV
                          </Text>
                        )}
                      </Text>
                    </View>
                    {event.location && (
                      <View style={styles.eventDetailRow}>
                        <Ionicons
                          name="location-outline"
                          size={16}
                          color="#666"
                        />
                        <Text style={styles.eventDetailText}>
                          {event.location}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))
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
            <View style={styles.eventHeaderTop}>
              {(() => {
                const eventTeam = teams.find(
                  (team) => team.id === selectedEvent.teamId
                );
                return (
                  <View style={styles.titleContainer}>
                    <Text
                      style={[
                        styles.title,
                        { color: eventTeam?.color || "#1976d2" },
                      ]}
                    >
                      {eventTeam?.name || "Tuntematon joukkue"}
                    </Text>
                  </View>
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
            <View style={styles.eventInfoRow}>
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
                sortPlayersByPosition(
                  selectedEvent.registeredPlayers || []
                ).map((pid: string) => {
                  const player = players.find((p) => p.id === pid);
                  const isGoalkeeper = player?.position === "MV";
                  return (
                    <View
                      key={pid}
                      style={[
                        styles.playerCard,
                        isGoalkeeper && styles.goalkeeperCard,
                      ]}
                    >
                      <View style={styles.playerInfo}>
                        <Ionicons
                          name="person"
                          size={20}
                          color={getPlayerIconColor(
                            player,
                            selectedEvent.teamId
                          )}
                        />
                        <View style={styles.playerDetails}>
                          <Text
                            style={[
                              styles.playerName,
                              isGoalkeeper && styles.goalkeeperName,
                            ]}
                          >
                            {player ? player.name : pid}
                            {isGoalkeeper && " 🥅"}
                          </Text>
                          {player && (
                            <Text style={styles.playerSubinfo}>
                              {(() => {
                                const eventSkills = getPlayerEventSkills(
                                  player,
                                  selectedEvent?.teamId
                                );
                                return (
                                  <>
                                    {eventSkills.position} • Kat.{" "}
                                    {eventSkills.category} •{" "}
                                    {eventSkills.multiplier?.toFixed(1)}
                                  </>
                                );
                              })()}
                            </Text>
                          )}
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
            </ScrollView>
          </View>
        </View>
      )}

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
                  value={editForm.name}
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
                <Portal>
                  <Dialog
                    visible={showEditDateDialog}
                    onDismiss={() => setShowEditDateDialog(false)}
                  >
                    <Dialog.Title>Valitse päivämäärä</Dialog.Title>
                    <Dialog.Content>
                      <Button
                        onPress={() => {
                          const today = new Date();
                          setEditDate(today);
                          setShowEditDateDialog(false);
                        }}
                      >
                        Tänään
                      </Button>
                      {/* Voit laajentaa tähän oman kalenterin tai päivämäärän valinnan */}
                    </Dialog.Content>
                    <Dialog.Actions>
                      <Button onPress={() => setShowEditDateDialog(false)}>
                        Sulje
                      </Button>
                    </Dialog.Actions>
                  </Dialog>
                </Portal>
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
                <Portal>
                  <Dialog
                    visible={showEditTimeDialog}
                    onDismiss={() => setShowEditTimeDialog(false)}
                  >
                    <Dialog.Title>Valitse aika</Dialog.Title>
                    <Dialog.Content>
                      <Button
                        onPress={() => {
                          const now = new Date();
                          setEditTime(now);
                          setShowEditTimeDialog(false);
                        }}
                      >
                        Nyt
                      </Button>
                      {/* Voit laajentaa tähän oman kellonajan valinnan */}
                    </Dialog.Content>
                    <Dialog.Actions>
                      <Button onPress={() => setShowEditTimeDialog(false)}>
                        Sulje
                      </Button>
                    </Dialog.Actions>
                  </Dialog>
                </Portal>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Paikka</Text>
                <TextInput
                  style={styles.formInput}
                  value={editForm.location}
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
                      player.id
                    )
                )
                .sort((a, b) => {
                  // Sort goalkeepers to the end
                  if (a.position === "MV" && b.position !== "MV") return 1;
                  if (a.position !== "MV" && b.position === "MV") return -1;
                  return (a.name || "").localeCompare(b.name || "");
                })
                .map((player) => {
                  const isGoalkeeper = player.position === "MV";
                  const isSelected = selectedPlayerIds.includes(player.id);
                  return (
                    <TouchableOpacity
                      key={player.id}
                      style={[
                        styles.modalPlayerButton,
                        isGoalkeeper && styles.goalkeeperCard,
                        isSelected && styles.selectedPlayerCard,
                      ]}
                      onPress={() => togglePlayerSelection(player.id)}
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
                              selectedEvent?.teamId
                            )}
                            style={styles.playerIcon}
                          />
                        </View>
                        <View style={styles.modalPlayerDetails}>
                          <Text
                            style={[
                              styles.modalPlayerName,
                              isGoalkeeper && styles.goalkeeperName,
                            ]}
                          >
                            {player.name}
                            {isGoalkeeper && " 🥅"}
                          </Text>
                          <Text style={styles.modalPlayerSubinfo}>
                            {(() => {
                              const eventSkills = getPlayerEventSkills(
                                player,
                                selectedEvent?.teamId
                              );
                              return (
                                <>
                                  {eventSkills.position} • Kat.{" "}
                                  {eventSkills.category} •{" "}
                                  {eventSkills.multiplier?.toFixed(1)}
                                </>
                              );
                            })()}
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
                  !(selectedEvent?.registeredPlayers || []).includes(player.id)
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
    color: "#ff9800",
    fontWeight: "500",
  },
  goalkeeperCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#ff9800",
    backgroundColor: "#fff8e1",
  },
  goalkeeperName: {
    color: "#ff9800",
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
});

export default EventManagementScreen;
