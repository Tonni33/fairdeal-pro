import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
  Image,
  TextInput,
} from "react-native";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDoc,
  addDoc,
  deleteDoc,
} from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { db } from "../services/firebase";
import { Event, Player, Team, Message, RootStackParamList } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useApp, getUserTeams } from "../contexts/AppContext";
import AdminMenuButton from "../components/AdminMenuButton";

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList>;

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isReserve, setIsReserve] = useState(false);
  const [registrationLoading, setRegistrationLoading] = useState(false);
  const [registeredPlayers, setRegisteredPlayers] = useState<Player[]>([]);
  const [imageError, setImageError] = useState(false);
  const [reservePlayers, setReservePlayers] = useState<Player[]>([]);
  const [isTeamModalVisible, setIsTeamModalVisible] = useState(false);
  const [isPlayersModalVisible, setIsPlayersModalVisible] = useState(false);
  const [isMessageModalVisible, setIsMessageModalVisible] = useState(false);
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const [editMessageText, setEditMessageText] = useState("");
  const [messageLoading, setMessageLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const { selectedTeamId, setSelectedTeamId } = useApp();
  const { user } = useAuth();
  const { players, events, teams, refreshData } = useApp();

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

  // Hae nykyinen pelaaja käyttäjän sähköpostilla
  const currentPlayer = useMemo(() => {
    if (!user) return null;
    return players.find((p) => p.email === user.email);
  }, [user, players]);

  // Filtteröi joukkueet joissa nykyinen käyttäjä on mukana (sähköpostilla)
  const userTeams = useMemo(
    () => getUserTeams(user, teams, players),
    [user, teams, players]
  );

  const getSelectedTeamName = () => {
    if (!selectedTeamId) return "Kaikki joukkueet";
    const team = userTeams.find((t) => t.id === selectedTeamId);
    return team ? team.name : "Kaikki joukkueet";
  };

  // Find the next upcoming event
  const nextEvent = useMemo(() => {
    console.log("HomeScreen: nextEvent calculation");
    console.log("HomeScreen: events count:", events.length);
    console.log(
      "HomeScreen: userTeams:",
      userTeams.map((t) => ({ id: t.id, name: t.name }))
    );
    console.log("HomeScreen: selectedTeamId:", selectedTeamId);

    const now = new Date();
    let filteredEvents = events;

    // Jos käyttäjä on valinnut tietyn joukkueen, näytä sen tapahtumat
    if (selectedTeamId) {
      filteredEvents = events.filter(
        (event) => event.teamId === selectedTeamId
      );
      console.log(
        "HomeScreen: filtered by selectedTeamId, count:",
        filteredEvents.length
      );
    } else {
      // Jos joukkuetta ei ole valittu, näytä vain niiden joukkueiden tapahtumat joissa käyttäjä on jäsenenä
      if (userTeams.length > 0) {
        const userTeamIds = userTeams.map((team) => team.id);
        console.log("HomeScreen: userTeamIds:", userTeamIds);
        filteredEvents = events.filter(
          (event) => event.teamId && userTeamIds.includes(event.teamId)
        );
        console.log(
          "HomeScreen: filtered by user teams, count:",
          filteredEvents.length
        );
        if (filteredEvents.length > 0) {
          console.log(
            "HomeScreen: filtered events:",
            filteredEvents.map((e) => ({
              id: e.id,
              teamId: e.teamId,
              title: e.title,
            }))
          );
        }
      } else {
        // Jos käyttäjä ei kuulu mihinkään joukkueeseen, älä näytä tapahtumia
        console.log("HomeScreen: user has no teams, showing no events");
        filteredEvents = [];
      }
    }

    const upcomingEvents = filteredEvents
      .filter((event) => event.date >= now)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const result = upcomingEvents.length > 0 ? upcomingEvents[0] : null;
    console.log(
      "HomeScreen: nextEvent result:",
      result
        ? { id: result.id, teamId: result.teamId, title: result.title }
        : null
    );
    return result;
  }, [events, selectedTeamId, userTeams]);

  useEffect(() => {
    if (nextEvent && currentPlayer) {
      console.log("HomeScreen: Checking registration status");
      console.log("HomeScreen: players array length:", players.length);
      console.log(
        "HomeScreen: sample players:",
        players.slice(0, 3).map((p) => ({
          id: p.id,
          name: p.name,
          email: p.email,
          playerId: p.playerId,
        }))
      );
      console.log(
        "HomeScreen: nextEvent.registeredPlayers:",
        nextEvent.registeredPlayers
      );
      console.log(
        "HomeScreen: nextEvent.reservePlayers:",
        nextEvent.reservePlayers
      );
      console.log("HomeScreen: currentPlayer.id:", currentPlayer.id);
      console.log(
        "HomeScreen: currentPlayer.playerId:",
        currentPlayer.playerId
      );
      console.log("HomeScreen: currentPlayer.email:", currentPlayer.email);

      // Käytä Firebase user ID:tä ilmoittautumistilan tarkistuksessa
      const userIdForCheck = user?.id;
      setIsRegistered(
        (userIdForCheck &&
          nextEvent.registeredPlayers?.includes(userIdForCheck)) ||
          nextEvent.registeredPlayers?.includes(currentPlayer.id) ||
          nextEvent.registeredPlayers?.includes(currentPlayer.playerId) ||
          nextEvent.registeredPlayers?.includes(currentPlayer.email) ||
          false
      );
      setIsReserve(
        (userIdForCheck &&
          nextEvent.reservePlayers?.includes(userIdForCheck)) ||
          nextEvent.reservePlayers?.includes(currentPlayer.id) ||
          nextEvent.reservePlayers?.includes(currentPlayer.playerId) ||
          nextEvent.reservePlayers?.includes(currentPlayer.email) ||
          false
      );

      // Helper function to find player by various IDs and enrich with legacy data
      const findPlayerByAnyId = (searchId: string) => {
        console.log("HomeScreen: searching for player with ID:", searchId);

        // Etsi pelaaja ensisijaisesti ID:n perusteella
        let foundPlayer = players.find(
          (p) =>
            p.id === searchId || p.playerId === searchId || p.email === searchId
        );

        // Jos löytyi Firebase Auth dokumentti mutta siinä ei ole nimeä, etsi legacy dokumentti
        if (foundPlayer && !foundPlayer.name) {
          const legacyPlayer = players.find(
            (p) =>
              p.email === foundPlayer!.email &&
              p.name &&
              p.name !== foundPlayer!.name
          );

          if (legacyPlayer) {
            console.log("HomeScreen: found legacy player data, merging:", {
              firebase: { id: foundPlayer.id, name: foundPlayer.name },
              legacy: { id: legacyPlayer.id, name: legacyPlayer.name },
            });

            // Yhdistä tiedot: käytä Firebase Auth dokumentin ID:tä mutta legacy dokumentin nimeä
            foundPlayer = {
              ...foundPlayer,
              name: legacyPlayer.name,
              phone: legacyPlayer.phone || foundPlayer.phone,
              // Säilytä Firebase Auth dokumentin ID ja muut tiedot
            };
          }
        }

        console.log(
          "HomeScreen: final found player:",
          foundPlayer
            ? {
                id: foundPlayer.id,
                name: foundPlayer.name,
                email: foundPlayer.email,
                playerId: foundPlayer.playerId,
              }
            : "NOT FOUND"
        );
        return foundPlayer;
      };

      // Update registered players list
      console.log(
        "HomeScreen: nextEvent.registeredPlayers:",
        nextEvent.registeredPlayers
      );
      const registeredPlayerData = (nextEvent.registeredPlayers || [])
        .map((playerId) => findPlayerByAnyId(playerId))
        .filter(Boolean) as any[];
      setRegisteredPlayers(registeredPlayerData);

      // Update reserve players list
      console.log(
        "HomeScreen: nextEvent.reservePlayers:",
        nextEvent.reservePlayers
      );
      const reservePlayerData = (nextEvent.reservePlayers || [])
        .map((playerId) => findPlayerByAnyId(playerId))
        .filter(Boolean) as any[];
      setReservePlayers(reservePlayerData);

      console.log(
        "HomeScreen: registeredPlayerData:",
        registeredPlayerData.map((p) => ({
          id: p.id,
          name: p.name,
          email: p.email,
          playerId: p.playerId,
        }))
      );
      console.log(
        "HomeScreen: reservePlayerData:",
        reservePlayerData.map((p) => ({
          id: p.id,
          name: p.name,
          email: p.email,
          playerId: p.playerId,
        }))
      );
    } else {
      setIsRegistered(false);
      setIsReserve(false);
      setRegisteredPlayers([]);
      setReservePlayers([]);
    }
    setLoading(false);
  }, [nextEvent, currentPlayer, players]);

  // Listen to messages for the current event
  useEffect(() => {
    if (!nextEvent) {
      setMessages([]);
      return;
    }

    setMessagesLoading(true);
    const messagesQuery = query(
      collection(db, "messages"),
      where("eventId", "==", nextEvent.id)
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const messagesData: Message[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Filter out deleted messages on the client side
        if (!data.isDeleted) {
          messagesData.push({
            id: doc.id,
            eventId: data.eventId,
            message: data.message,
            createdAt: data.createdAt?.toDate() || new Date(),
            createdBy: data.createdBy,
            updatedAt: data.updatedAt?.toDate(),
            updatedBy: data.updatedBy,
            isDeleted: data.isDeleted || false,
          });
        }
      });

      // Sort messages by creation date (newest first) on the client side
      messagesData.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );

      setMessages(messagesData);
      setMessagesLoading(false);
    });

    return () => unsubscribe();
  }, [nextEvent]);

  const handleRegistration = async () => {
    if (!nextEvent || !currentPlayer || !user) return;

    // Käytä aina Firebase user ID:tä ilmoittautumisessa johdonmukaisuuden vuoksi
    const playerIdToUse = user.id;
    console.log("HomeScreen: Registration - using player ID:", playerIdToUse);

    setRegistrationLoading(true);
    try {
      const eventRef = doc(db, "events", nextEvent.id);

      // Get team data for guest registration rules
      const team = teams.find((t) => t.id === nextEvent.teamId);
      const guestRegistrationHours = team?.guestRegistrationHours || 24;

      // Calculate hours until event
      const now = new Date();
      const eventDate = new Date(nextEvent.date);
      const hoursUntilEvent =
        (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Check if current player is a team member
      const teamId = nextEvent.teamId || "";
      const isTeamMember =
        teamId && currentPlayer.teamMember?.[teamId] === true;

      if (isRegistered) {
        // Unregister from main registration
        await updateDoc(eventRef, {
          registeredPlayers: arrayRemove(playerIdToUse),
        });

        // Check if there are reserve players to promote
        const eventDoc = await getDoc(eventRef);
        const eventData = eventDoc.data();
        const reservePlayerIds = eventData?.reservePlayers || [];

        if (reservePlayerIds.length > 0) {
          // Find a suitable reserve player to promote
          const isGoalkeeper = currentPlayer.position === "MV";

          let suitableReserve: string | undefined;

          // Priority queue logic for promotion
          if (hoursUntilEvent > guestRegistrationHours) {
            // Before threshold: Skip guests, only promote team members
            for (const reserveId of reservePlayerIds) {
              const reservePlayer = players.find((p) => p.id === reserveId);
              if (!reservePlayer) continue;

              const isReserveTeamMember =
                teamId && reservePlayer.teamMember?.[teamId] === true;
              const positionMatches =
                (reservePlayer.position === "MV") === isGoalkeeper;

              if (isReserveTeamMember && positionMatches) {
                suitableReserve = reserveId;
                break;
              }
            }
          } else {
            // After threshold: Pure FIFO - promote first player with matching position
            suitableReserve = reservePlayerIds.find((reserveId: string) => {
              const reservePlayer = players.find((p) => p.id === reserveId);
              return (
                reservePlayer &&
                (reservePlayer.position === "MV") === isGoalkeeper
              );
            });
          }

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
              `Paikkasi otettiin varalla ilmoittautuneelta pelaajalta: ${
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
          reservePlayers: arrayRemove(playerIdToUse),
        });
        setIsReserve(false);
        Alert.alert("Onnistui", "Varalla-ilmoittautuminen peruttu");
      } else {
        // Check if event is full based on player position
        const eventDoc = await getDoc(eventRef);
        const eventData = eventDoc.data();
        const currentRegistered = eventData?.registeredPlayers || [];
        const currentReserves = eventData?.reservePlayers || [];

        const currentFieldPlayers = getFieldPlayers(currentRegistered);
        const currentGoalkeepers = getGoalkeepers(currentRegistered);

        const isGoalkeeper = currentPlayer.position === "MV";
        const isEventFull = isGoalkeeper
          ? nextEvent.maxGoalkeepers &&
            currentGoalkeepers.length >= nextEvent.maxGoalkeepers
          : currentFieldPlayers.length >= nextEvent.maxPlayers;

        // Check if guest is trying to register to main list before threshold
        if (
          !isEventFull &&
          !isTeamMember &&
          hoursUntilEvent > guestRegistrationHours
        ) {
          // Guest trying to register too early - redirect to waitlist
          Alert.alert(
            "Vakiokävijöillä etuoikeus",
            `Vakiokävijöillä on etuoikeus seuraavat ${Math.round(
              hoursUntilEvent
            )} tuntia. Voit ilmoittautua varallistalle.`,
            [
              { text: "Peruuta", style: "cancel" },
              {
                text: "Varallistalle",
                onPress: async () => {
                  try {
                    // Always append to end (guest before threshold)
                    await updateDoc(eventRef, {
                      reservePlayers: arrayUnion(playerIdToUse),
                    });
                    setIsReserve(true);
                    Alert.alert("Onnistui", "Ilmoittautunut varallistalle");
                  } catch (error) {
                    console.error("Error registering as reserve:", error);
                    Alert.alert(
                      "Virhe",
                      "Varalla-ilmoittautuminen epäonnistui"
                    );
                  }
                },
              },
            ]
          );
        } else if (isEventFull) {
          // Event is full, offer reserve position with priority queue logic
          Alert.alert(
            "Tapahtuma on täynnä",
            "Haluatko ilmoittautua varalla olevaksi? Saat paikan jos joku luopuu.",
            [
              { text: "Ei", style: "cancel" },
              {
                text: "Kyllä, ilmoittaudun varalla olijaksi",
                onPress: async () => {
                  try {
                    // Priority queue insertion logic
                    if (
                      hoursUntilEvent > guestRegistrationHours &&
                      isTeamMember
                    ) {
                      // Team member before threshold - insert before first guest
                      let insertPosition = currentReserves.length; // Default: append to end

                      for (let i = 0; i < currentReserves.length; i++) {
                        const reservePlayer = players.find(
                          (p) => p.id === currentReserves[i]
                        );
                        const isReserveTeamMember =
                          teamId &&
                          reservePlayer?.teamMember?.[teamId] === true;

                        if (!isReserveTeamMember) {
                          insertPosition = i;
                          break;
                        }
                      }

                      // Create new array with player inserted at correct position
                      const newReserves = [...currentReserves];
                      newReserves.splice(insertPosition, 0, playerIdToUse);

                      await updateDoc(eventRef, {
                        reservePlayers: newReserves,
                      });
                    } else {
                      // After threshold OR guest: append to end (pure FIFO)
                      await updateDoc(eventRef, {
                        reservePlayers: arrayUnion(playerIdToUse),
                      });
                    }

                    setIsReserve(true);
                    Alert.alert("Onnistui", "Ilmoittautunut varalla olijaksi");
                  } catch (error) {
                    console.error("Error registering as reserve:", error);
                    Alert.alert(
                      "Virhe",
                      "Varalla-ilmoittautuminen epäonnistui"
                    );
                  }
                },
              },
            ]
          );
        } else {
          // Register normally (event not full and either team member or after threshold)
          await updateDoc(eventRef, {
            registeredPlayers: arrayUnion(playerIdToUse),
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

  const onRefresh = async () => {
    setRefreshing(true);
    // Data refreshes automatically through AppContext
    setTimeout(() => setRefreshing(false), 1000);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("fi-FI", {
      weekday: "short",
      day: "numeric",
      month: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (date: Date) => {
    return date
      .toLocaleTimeString("fi-FI", {
        hour: "2-digit",
        minute: "2-digit",
      })
      .replace(":", ".");
  };

  const formatFullDateTime = (date: Date) => {
    return `${formatDate(date)} klo ${formatTime(date)}`;
  };

  const formatMessageTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return diffMins <= 1 ? "juuri nyt" : `${diffMins} min sitten`;
    } else if (diffHours < 24) {
      return `${diffHours} h sitten`;
    } else if (diffDays < 7) {
      return `${diffDays} pv sitten`;
    } else {
      return formatDate(date);
    }
  };

  // Check if current user is admin - check both role and isAdmin fields
  const isAdmin = user?.role === "admin" || user?.isAdmin === true;

  // Debug function to log user data
  const debugUser = () => {
    console.log("=== USER DEBUG ===");
    console.log("Full user object:", user);
    console.log("user.role:", user?.role);
    console.log("user.isAdmin:", user?.isAdmin);
    console.log("isAdmin calculated:", isAdmin);
    console.log("================");
    Alert.alert(
      "User Debug",
      `Role: ${user?.role}\nisAdmin: ${user?.isAdmin}\nCalculated isAdmin: ${isAdmin}`
    );
  }; // Message handling functions
  const handleEditMessage = () => {
    // Always start with empty text for new messages
    setEditMessageText("");
    setIsEditingMessage(true);
  };

  const handleCancelEdit = () => {
    setIsEditingMessage(false);
    setEditMessageText("");
  };

  const handleSaveMessage = async () => {
    if (!nextEvent) return;

    setMessageLoading(true);
    try {
      if (editMessageText.trim()) {
        // Add new message to messages collection
        await addDoc(collection(db, "messages"), {
          eventId: nextEvent.id,
          message: editMessageText.trim(),
          createdAt: new Date(),
          createdBy: user?.displayName || user?.email || "Tuntematon",
          isDeleted: false,
        });

        Alert.alert("Onnistui", "Viesti lisätty");
      } else {
        Alert.alert("Virhe", "Viesti ei voi olla tyhjä");
      }

      setIsEditingMessage(false);
      setEditMessageText("");
    } catch (error) {
      console.error("Error adding message:", error);
      Alert.alert("Virhe", "Viestin tallentaminen epäonnistui");
    } finally {
      setMessageLoading(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    Alert.alert("Poista viesti", "Haluatko varmasti poistaa tämän viestin?", [
      { text: "Peruuta", style: "cancel" },
      {
        text: "Poista",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "messages", messageId));
            Alert.alert("Onnistui", "Viesti poistettu");
          } catch (error) {
            console.error("Error deleting message:", error);
            Alert.alert("Virhe", "Viestin poistaminen epäonnistui");
          }
        },
      },
    ]);
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
      // Navigate to team generation - we'll need to select an event there
      navigation.navigate("TeamGeneration", { eventId: "" });
    } else if (screen === "Settings") {
      navigation.navigate("Settings");
    } else if (screen === "Migration") {
      navigation.navigate("Migration");
    } else {
      Alert.alert(
        "Tulossa pian",
        `${screen} -toiminto toteutetaan seuraavaksi`
      );
    }
  };

  const formatDateTime = (date: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const isToday = date.toDateString() === today.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    const isThisWeek =
      Math.abs(date.getTime() - today.getTime()) < 7 * 24 * 60 * 60 * 1000;

    if (isToday) {
      return `Tänään ${formatTime(date)}`;
    } else if (isTomorrow) {
      return `Huomenna ${formatTime(date)}`;
    } else if (isThisWeek) {
      const weekday = date.toLocaleDateString("fi-FI", { weekday: "long" });
      return `${weekday} ${formatTime(date)}`;
    } else {
      return `${formatDate(date)} ${formatTime(date)}`;
    }
  };
  const getTimeUntilEvent = (date: Date) => {
    const now = new Date();
    const timeDiff = date.getTime() - now.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    if (daysDiff <= 0) {
      const hoursDiff = Math.ceil(timeDiff / (1000 * 60 * 60));
      if (hoursDiff <= 0) {
        const minutesDiff = Math.ceil(timeDiff / (1000 * 60));
        return minutesDiff > 0 ? `${minutesDiff} min` : "Käynnissä";
      }
      return `${hoursDiff} h`;
    } else if (daysDiff === 1) {
      return "Huomenna";
    } else {
      return `${daysDiff} päivää`;
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.logoContainer}>
              {!imageError ? (
                <Image
                  source={require("../../assets/fairdealLogo.png")}
                  style={styles.logo}
                  resizeMode="contain"
                  onError={() => setImageError(true)}
                />
              ) : (
                <Text style={styles.logoText}>FairDeal Pro</Text>
              )}
            </View>
            <AdminMenuButton onNavigate={handleAdminNavigation} />
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Ladataan...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.logoContainer}>
            {!imageError ? (
              <Image
                source={require("../../assets/fairdealLogo.png")}
                style={styles.logo}
                resizeMode="contain"
                onError={() => setImageError(true)}
              />
            ) : (
              <Text style={styles.logoText}>FairDeal Pro</Text>
            )}
          </View>
          <AdminMenuButton onNavigate={handleAdminNavigation} />
        </View>
      </View>

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

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {nextEvent ? (
          <View style={styles.eventCard}>
            <View style={styles.eventHeader}>
              <View style={styles.eventHeaderLeft}>
                <Ionicons name="calendar" size={24} color="#1976d2" />
                <Text style={styles.eventLabel}>Seuraava tapahtuma</Text>
              </View>
              <View style={styles.timeUntilBadge}>
                <Text style={styles.timeUntilText}>
                  {getTimeUntilEvent(nextEvent.date)}
                </Text>
              </View>
            </View>

            {(() => {
              const eventTeam = teams.find(
                (team) => team.id === nextEvent.teamId
              );
              return (
                <Text
                  style={[
                    styles.eventTitle,
                    { color: eventTeam?.color || "#1976d2" },
                  ]}
                >
                  {eventTeam?.name || nextEvent.title}
                </Text>
              );
            })()}

            <View style={styles.eventDetails}>
              <View style={styles.eventDetailRow}>
                <View style={styles.detailIconContainer}>
                  <Ionicons name="time-outline" size={18} color="#1976d2" />
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Aika</Text>
                  <Text style={styles.detailText}>
                    {formatFullDateTime(nextEvent.date)}
                  </Text>
                </View>
              </View>

              {nextEvent.location && (
                <View style={styles.eventDetailRow}>
                  <View style={styles.detailIconContainer}>
                    <Ionicons
                      name="location-outline"
                      size={18}
                      color="#1976d2"
                    />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Paikka</Text>
                    <Text style={styles.detailText}>{nextEvent.location}</Text>
                  </View>
                </View>
              )}

              <View style={styles.eventDetailRow}>
                <View style={styles.detailIconContainer}>
                  <Ionicons name="people-outline" size={18} color="#1976d2" />
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Osallistujat</Text>
                  <Text style={styles.detailText}>
                    {getFieldPlayers(nextEvent.registeredPlayers || []).length}{" "}
                    / {nextEvent.maxPlayers} pelaajaa
                    {nextEvent.maxGoalkeepers &&
                      nextEvent.maxGoalkeepers > 0 && (
                        <Text style={{ color: "#ff9800", fontWeight: "500" }}>
                          {" • "}
                          {
                            getGoalkeepers(nextEvent.registeredPlayers || [])
                              .length
                          }{" "}
                          / {nextEvent.maxGoalkeepers} MV
                        </Text>
                      )}
                  </Text>
                  <View style={styles.capacityBar}>
                    <View
                      style={[
                        styles.capacityFill,
                        {
                          width: `${Math.min(
                            (getFieldPlayers(nextEvent.registeredPlayers || [])
                              .length /
                              nextEvent.maxPlayers) *
                              100,
                            100
                          )}%`,
                          backgroundColor:
                            getFieldPlayers(nextEvent.registeredPlayers || [])
                              .length >= nextEvent.maxPlayers
                              ? "#f44336"
                              : getFieldPlayers(
                                  nextEvent.registeredPlayers || []
                                ).length /
                                  nextEvent.maxPlayers >
                                0.8
                              ? "#ff9800"
                              : "#4caf50",
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>
            </View>

            {nextEvent.description && (
              <Text style={styles.eventDescription}>
                {nextEvent.description}
              </Text>
            )}

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
                  ? "Peru ilmoittautuminen"
                  : "Ilmoittaudu"}
              </Text>
            </TouchableOpacity>

            {/* Reserve players list */}
            {nextEvent.reservePlayers &&
              nextEvent.reservePlayers.length > 0 && (
                <View style={styles.reservePlayersSection}>
                  <View style={styles.reservePlayersHeader}>
                    <Ionicons name="time-outline" size={18} color="#ff9800" />
                    <Text style={styles.reservePlayersTitle}>
                      Varalla ({reservePlayers.length})
                    </Text>
                  </View>
                  <View style={styles.reservePlayersList}>
                    {sortPlayersByPosition(reservePlayers).map(
                      (player, index) => {
                        const isGoalkeeper = player?.position === "MV";
                        return (
                          <View
                            key={player.id}
                            style={styles.reservePlayersListItem}
                          >
                            <View style={styles.reservePlayerNumber}>
                              <Text style={styles.reservePlayerNumberText}>
                                {index + 1}
                              </Text>
                            </View>
                            <Text style={styles.reservePlayersListName}>
                              {player.name}
                              {isGoalkeeper && " 🥅"}
                            </Text>
                          </View>
                        );
                      }
                    )}
                  </View>
                </View>
              )}

            {/* Generated teams banner */}
            {nextEvent.generatedTeams &&
              nextEvent.generatedTeams.teams &&
              nextEvent.generatedTeams.teams.length > 0 && (
                <TouchableOpacity
                  style={styles.generatedTeamsBanner}
                  onPress={() => {
                    // Navigate to Teams tab - since we're already in a tab navigator,
                    // we can navigate directly to the Teams tab
                    (navigation as any).navigate("Teams");
                  }}
                >
                  <View style={styles.participantsBannerContent}>
                    <View style={styles.participantsBannerLeft}>
                      <Ionicons name="trophy" size={24} color="#4CAF50" />
                      <View style={styles.participantsBannerText}>
                        <Text style={styles.generatedTeamsBannerTitle}>
                          Joukkueet arvottu
                        </Text>
                        <Text style={styles.participantsBannerSubtitle}>
                          Tasapaino:{" "}
                          {nextEvent.generatedTeams.balanceScore || 0}/100
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                  </View>
                </TouchableOpacity>
              )}

            {/* Participants banner */}
            {nextEvent.registeredPlayers &&
              nextEvent.registeredPlayers.length > 0 && (
                <TouchableOpacity
                  style={styles.participantsBanner}
                  onPress={() => setIsPlayersModalVisible(true)}
                >
                  <View style={styles.participantsBannerContent}>
                    <View style={styles.participantsBannerLeft}>
                      <Ionicons name="people" size={24} color="#1976d2" />
                      <View style={styles.participantsBannerText}>
                        <Text style={styles.participantsBannerTitle}>
                          Osallistujat
                        </Text>
                        <Text style={styles.participantsBannerSubtitle}>
                          {
                            getFieldPlayers(nextEvent.registeredPlayers || [])
                              .length
                          }{" "}
                          pelaajaa
                          {nextEvent.maxGoalkeepers &&
                            nextEvent.maxGoalkeepers > 0 && (
                              <Text
                                style={{ color: "#ff9800", fontWeight: "500" }}
                              >
                                {" • "}
                                {
                                  getGoalkeepers(
                                    nextEvent.registeredPlayers || []
                                  ).length
                                }{" "}
                                MV
                              </Text>
                            )}
                          {nextEvent.reservePlayers &&
                            nextEvent.reservePlayers.length > 0 && (
                              <Text style={styles.reserveCount}>
                                {" • "}
                                {nextEvent.reservePlayers.length} varalla
                              </Text>
                            )}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                  </View>
                </TouchableOpacity>
              )}

            {/* Separate message card */}
            <View style={styles.eventCard}>
              <TouchableOpacity
                style={styles.messageButton}
                onPress={() => setIsMessageModalVisible(true)}
              >
                <Ionicons
                  name={
                    messages.length > 0 ? "chatbubble" : "chatbubble-outline"
                  }
                  size={20}
                  color={messages.length > 0 ? "#1976d2" : "#666"}
                />
                <Text
                  style={[
                    styles.messageButtonText,
                    messages.length > 0 && styles.messageButtonTextActive,
                  ]}
                >
                  {messages.length > 0
                    ? `Viestit (${messages.length})`
                    : "Ei viestejä"}
                </Text>
                {messages.length > 0 && (
                  <Text style={styles.messageUpdateTime}>
                    {formatMessageTime(messages[0].createdAt)}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.noEventCard}>
            <Ionicons name="calendar-outline" size={48} color="#ccc" />
            <Text style={styles.noEventTitle}>Ei tulevia tapahtumia</Text>
            <Text style={styles.noEventSubtitle}>
              Seuraava tapahtuma näkyy tässä kun se on luotu
            </Text>
          </View>
        )}
      </ScrollView>

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
                      { backgroundColor: team.color || "#666" },
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

      {/* Players modal */}
      <Modal
        visible={isPlayersModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsPlayersModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.playersModalContent]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Osallistujat</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsPlayersModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.playersModalScroll}>
              {nextEvent &&
                nextEvent.registeredPlayers &&
                nextEvent.registeredPlayers.length > 0 && (
                  <View style={styles.modalPlayersSection}>
                    <Text style={styles.modalSectionTitle}>
                      Ilmoittautuneet ({registeredPlayers.length})
                    </Text>

                    <View style={styles.modalPlayersList}>
                      {(() => {
                        console.log(
                          "HomeScreen Modal: registeredPlayers state:",
                          registeredPlayers.map((p) => ({
                            id: p.id,
                            name: p.name,
                            email: p.email,
                            playerId: p.playerId,
                          }))
                        );
                        return sortPlayersByPosition(registeredPlayers).map(
                          (player, index) => {
                            console.log("HomeScreen Modal: rendering player:", {
                              id: player.id,
                              name: player.name,
                              email: player.email,
                            });
                            const isGoalkeeper = player?.position === "MV";
                            return (
                              <View
                                key={player.id}
                                style={[
                                  styles.modalPlayerItem,
                                  isGoalkeeper && styles.modalGoalkeeperItem,
                                ]}
                              >
                                <View
                                  style={[
                                    styles.modalPlayerIcon,
                                    isGoalkeeper && styles.modalGoalkeeperIcon,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.modalPlayerNumber,
                                      isGoalkeeper &&
                                        styles.modalGoalkeeperNumber,
                                    ]}
                                  >
                                    {index + 1}
                                  </Text>
                                </View>
                                <View style={styles.modalPlayerInfo}>
                                  <Text
                                    style={[
                                      styles.modalPlayerName,
                                      isGoalkeeper &&
                                        styles.modalGoalkeeperName,
                                    ]}
                                  >
                                    {player.name ||
                                      player.email ||
                                      `ID: ${player.id}`}
                                    {isGoalkeeper && " 🥅"}
                                  </Text>
                                  {player.email && (
                                    <Text style={styles.modalPlayerEmail}>
                                      {player.email}
                                    </Text>
                                  )}
                                </View>
                              </View>
                            );
                          }
                        );
                      })()}
                    </View>
                  </View>
                )}

              {nextEvent &&
                nextEvent.reservePlayers &&
                nextEvent.reservePlayers.length > 0 && (
                  <View style={styles.modalPlayersSection}>
                    <Text
                      style={[
                        styles.modalSectionTitle,
                        styles.modalReserveTitle,
                      ]}
                    >
                      Varalla ({reservePlayers.length})
                    </Text>

                    <View style={styles.modalPlayersList}>
                      {sortPlayersByPosition(reservePlayers).map(
                        (player, index) => {
                          const isGoalkeeper = player?.position === "MV";
                          return (
                            <View
                              key={player.id}
                              style={[
                                styles.modalPlayerItem,
                                styles.modalReserveItem,
                                isGoalkeeper && styles.modalGoalkeeperItem,
                              ]}
                            >
                              <View
                                style={[
                                  styles.modalPlayerIcon,
                                  styles.modalReserveIcon,
                                  isGoalkeeper && styles.modalGoalkeeperIcon,
                                ]}
                              >
                                <Ionicons
                                  name="time-outline"
                                  size={16}
                                  color={isGoalkeeper ? "#fff" : "#ff9800"}
                                />
                              </View>
                              <View style={styles.modalPlayerInfo}>
                                <Text
                                  style={[
                                    styles.modalPlayerName,
                                    styles.modalReserveName,
                                    isGoalkeeper && styles.modalGoalkeeperName,
                                  ]}
                                >
                                  {player.name}
                                  {isGoalkeeper && " 🥅"}
                                </Text>
                                {player.email && (
                                  <Text
                                    style={[
                                      styles.modalPlayerEmail,
                                      styles.modalReserveEmail,
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
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Message modal */}
      <Modal
        visible={isMessageModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsMessageModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.messageModalContent]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tapahtuman viestit</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsMessageModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.messageModalScroll}>
              {messagesLoading ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Ladataan viestejä...</Text>
                </View>
              ) : isEditingMessage ? (
                // Edit mode
                <View style={styles.messageEditContainer}>
                  <Text style={styles.messageEditLabel}>
                    Tapahtuman viesti:
                  </Text>
                  <TextInput
                    style={styles.messageEditInput}
                    value={editMessageText}
                    onChangeText={setEditMessageText}
                    placeholder="Kirjoita viesti tapahtuman osallistujille..."
                    placeholderTextColor="#999"
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                  />
                  <View style={styles.messageEditButtons}>
                    <TouchableOpacity
                      style={styles.messageEditCancelButton}
                      onPress={handleCancelEdit}
                      disabled={messageLoading}
                    >
                      <Text style={styles.messageEditCancelText}>Peruuta</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.messageEditSaveButton,
                        messageLoading && styles.disabledButton,
                      ]}
                      onPress={handleSaveMessage}
                      disabled={messageLoading}
                    >
                      <Text style={styles.messageEditSaveText}>
                        {messageLoading ? "Tallennetaan..." : "Tallenna"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                // View mode - show messages list
                <>
                  {messages.length > 0 ? (
                    <View style={styles.messagesContainer}>
                      {messages.map((message) => (
                        <View key={message.id} style={styles.messageItem}>
                          <View style={styles.messageHeader}>
                            {isAdmin && (
                              <View style={styles.messageHeaderTop}>
                                <View style={{ flex: 1 }} />
                                <TouchableOpacity
                                  style={styles.deleteButton}
                                  onPress={() =>
                                    handleDeleteMessage(message.id)
                                  }
                                >
                                  <Ionicons
                                    name="close"
                                    size={20}
                                    color="#f44336"
                                  />
                                </TouchableOpacity>
                              </View>
                            )}
                            <Text style={styles.messageText}>
                              {message.message}
                            </Text>
                          </View>
                          <View style={styles.messageFooter}>
                            <Text style={styles.messageTimestamp}>
                              {formatMessageTime(message.createdAt)}
                            </Text>
                            <Text style={styles.messageAuthor}>
                              {message.createdBy}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.noMessageContainer}>
                      <Ionicons
                        name="chatbubble-outline"
                        size={48}
                        color="#ccc"
                      />
                      <Text style={styles.noMessageTitle}>Ei viestejä</Text>
                      <Text style={styles.noMessageSubtitle}>
                        Tähän tapahtumaan ei ole lisätty viestejä
                      </Text>
                    </View>
                  )}

                  {/* Add message button - available for all users */}
                  <View style={styles.messageAdminActions}>
                    <TouchableOpacity
                      style={styles.messageEditButton}
                      onPress={handleEditMessage}
                    >
                      <Ionicons
                        name="add-circle-outline"
                        size={20}
                        color="#007AFF"
                      />
                      <Text style={styles.messageEditButtonText}>
                        Lisää viesti
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectorContainer: {
    padding: 16,
    paddingBottom: 0,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
  },
  eventCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  eventHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeUntilBadge: {
    backgroundColor: "#e3f2fd",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1976d2",
  },
  timeUntilText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1976d2",
  },
  eventLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1976d2",
    marginLeft: 8,
  },
  eventTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 16,
  },
  eventDetails: {
    marginBottom: 16,
  },
  eventDetailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  detailIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e3f2fd",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailText: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
    lineHeight: 20,
  },
  capacityBar: {
    height: 6,
    backgroundColor: "#e0e0e0",
    borderRadius: 3,
    marginTop: 8,
    overflow: "hidden",
  },
  capacityFill: {
    height: "100%",
    borderRadius: 3,
  },
  eventDetailText: {
    fontSize: 14,
    color: "#666",
    marginLeft: 8,
    flex: 1,
  },
  eventDescription: {
    fontSize: 14,
    color: "#777",
    lineHeight: 20,
    marginBottom: 20,
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
  reservePlayersSection: {
    marginTop: 16,
    backgroundColor: "#fff8e1",
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#ff9800",
  },
  reservePlayersHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 6,
  },
  reservePlayersTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#f57c00",
  },
  reservePlayersList: {
    gap: 6,
  },
  reservePlayersListItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reservePlayerNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ff9800",
    alignItems: "center",
    justifyContent: "center",
  },
  reservePlayerNumberText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  reservePlayersListName: {
    fontSize: 14,
    color: "#333",
    flex: 1,
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
  noEventCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 40,
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  noEventTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#666",
    marginTop: 16,
    marginBottom: 8,
  },
  noEventSubtitle: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
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
  selectorLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  teamChip: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  selectedChip: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  chipText: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },
  selectedChipText: {
    color: "#fff",
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
  logoContainer: {
    flex: 1,
    height: 50,
    width: "100%",
    justifyContent: "center",
    alignItems: "flex-start",
    overflow: "hidden",
  },
  logo: {
    height: 100,
    width: 160,
  },
  logoText: {
    color: "#1976d2",
    fontSize: 16,
    fontWeight: "bold",
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
  participantsBanner: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e3f2fd",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  participantsBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  participantsBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  participantsBannerText: {
    marginLeft: 12,
    flex: 1,
  },
  participantsBannerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  participantsBannerSubtitle: {
    fontSize: 14,
    color: "#666",
  },
  reserveCount: {
    color: "#ff9800",
    fontWeight: "500",
  },
  playersModalContent: {
    maxHeight: "80%",
    width: "90%",
  },
  playersModalScroll: {
    maxHeight: 400,
  },
  modalPlayersSection: {
    marginBottom: 20,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  modalReserveTitle: {
    color: "#ff9800",
  },
  modalPlayersList: {
    gap: 8,
  },
  modalPlayerItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 12,
  },
  modalGoalkeeperItem: {
    backgroundColor: "#fff8e1",
    borderLeftWidth: 3,
    borderLeftColor: "#ff9800",
  },
  modalReserveItem: {
    backgroundColor: "#fff8f0",
    borderLeftWidth: 3,
    borderLeftColor: "#ff9800",
  },
  modalPlayerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1976d2",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  modalGoalkeeperIcon: {
    backgroundColor: "#ff9800",
  },
  modalReserveIcon: {
    backgroundColor: "#fff8f0",
    borderColor: "#ff9800",
    borderWidth: 1.5,
  },
  modalPlayerNumber: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  modalGoalkeeperNumber: {
    color: "#fff",
  },
  modalPlayerInfo: {
    flex: 1,
  },
  modalPlayerName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#333",
    marginBottom: 2,
  },
  modalGoalkeeperName: {
    color: "#ff9800",
    fontWeight: "600",
  },
  modalReserveName: {
    color: "#e65100",
  },
  modalPlayerEmail: {
    fontSize: 13,
    color: "#666",
  },
  modalReserveEmail: {
    color: "#f57c00",
  },
  messageButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  messageButtonText: {
    fontSize: 14,
    color: "#666",
    marginLeft: 8,
    flex: 1,
  },
  messageButtonTextActive: {
    color: "#1976d2",
    fontWeight: "500",
  },
  messageUpdateTime: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
  },
  // Message modal styles
  messageModalContent: {
    maxHeight: "80%",
    height: 500, // Lisätään kiinteä korkeus
  },
  messageModalScroll: {
    flex: 1,
    minHeight: 200, // Lisätään minimikorkeus
  },
  messagesContainer: {
    padding: 6,
  },
  messageItem: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#1976d2",
  },
  messageHeader: {
    flexDirection: "column",
    marginBottom: 8,
  },
  messageHeaderTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  deleteButton: {
    padding: 4,
    marginLeft: 8,
    alignSelf: "flex-start",
  },
  messageContent: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 8,
    margin: 16,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#333",
  },
  messageFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  messageTimestamp: {
    fontSize: 12,
    color: "#666",
  },
  messageAuthor: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
    fontStyle: "italic",
  },
  noMessageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  noMessageTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#666",
    marginTop: 16,
  },
  noMessageSubtitle: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginTop: 8,
  },
  // Message edit styles
  messageEditContainer: {
    padding: 16,
  },
  messageEditLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  messageEditInput: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#333",
    minHeight: 120,
    marginBottom: 16,
  },
  messageEditButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  messageEditCancelButton: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  messageEditCancelText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
  messageEditSaveButton: {
    flex: 1,
    backgroundColor: "#1976d2",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  messageEditSaveText: {
    fontSize: 16,
    color: "white",
    fontWeight: "600",
  },
  messageAdminActions: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  messageEditButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0f8ff",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  messageEditButtonText: {
    fontSize: 16,
    color: "#007AFF",
    fontWeight: "500",
    marginLeft: 8,
  },
  generatedTeamsBanner: {
    backgroundColor: "#f8fdf8",
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e8f5e8",
  },
  generatedTeamsBannerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2e7d32",
    marginBottom: 2,
  },
});

export default HomeScreen;
