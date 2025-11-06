import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Modal,
  Alert,
  Image,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { doc, getDoc } from "firebase/firestore";
import { Player, Team, RootStackParamList } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useApp, getUserTeams } from "../contexts/AppContext";
import { db } from "../services/firebase";
import AdminMenuButton from "../components/AdminMenuButton";

type PlayersScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "Players"
>;

const PlayersScreen: React.FC = () => {
  const navigation = useNavigation<PlayersScreenNavigationProp>();
  const { user } = useAuth();
  const { players, teams, loading, refreshData } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [isTeamModalVisible, setIsTeamModalVisible] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [enrichedPlayers, setEnrichedPlayers] = useState<Player[]>([]);
  const { selectedTeamId, setSelectedTeamId } = useApp();

  // Välimuisti Firebase Auth -kyselyille
  const [playerCache] = useState(new Map<string, Player>());

  // Helper function to check if user is admin of selected team
  const isSelectedTeamAdmin = (): boolean => {
    if (!selectedTeamId || !user?.uid) return false;

    // Check if user is master admin
    if (user.isMasterAdmin) return true;

    // Check if user is admin of the selected team
    const team = teams.find((t) => t.id === selectedTeamId);
    return team?.adminIds?.includes(user.uid) || team?.adminId === user.uid;
  };

  // Helper function to find player by any ID and enrich with Firebase Auth data
  const findPlayerByAnyId = async (playerId: string) => {
    // Tarkista ensin välimuistista
    if (playerCache.has(playerId)) {
      return playerCache.get(playerId)!;
    }

    // First try to find in players array
    let player = players.find((p) => p.id === playerId);

    // Always try to enrich with Firebase Auth data, even if found in players array
    try {
      const userRef = doc(db, "users", playerId);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();

        // Create enriched player object - prioritize legacy player name, then Firebase Auth displayName
        const enrichedPlayer: Player = {
          ...player, // Include all player data
          id: playerId,
          // Override with proper name resolution - prioritize player name, then Firebase displayName
          name:
            player?.name ||
            userData.displayName ||
            userData.email?.split("@")[0] ||
            "Nimeä ei löydy",
          email: userData.email || player?.email || "",
          phone: userData.phone || player?.phone || undefined,
          // Ensure required fields
          positions: player?.positions || ["H"], // Default to field player
          teamIds: player?.teamIds || [],
          isAdmin: player?.isAdmin || false,
          playerId: player?.playerId || playerId,
          teamSkills: player?.teamSkills || {},
          teams: player?.teams || [],
          createdAt: player?.createdAt || new Date(),
        };

        // Tallenna välimuistiin
        playerCache.set(playerId, enrichedPlayer);
        return enrichedPlayer;
      }
    } catch (error: any) {
      // Ignore "Missing or insufficient permissions" errors for deleted users
      if (error?.code !== "permission-denied") {
        console.error("DEBUG - PlayersScreen error fetching user:", error);
      }
    }

    if (player) {
      // If found in players but no Firebase Auth data, cache and return player as-is
      playerCache.set(playerId, player);
      return player;
    }

    // Return basic object with ID if nothing found
    const basicPlayer: Player = {
      id: playerId,
      name: `ID: ${playerId}`,
      email: "",
      positions: ["H"], // Default to field player
      teamIds: [],
      isAdmin: false,
      playerId: playerId,
      teamSkills: {},
      teams: [],
      phone: "",
      image: "",
      notes: "",
      licenceCode: "",
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "",
    };

    playerCache.set(playerId, basicPlayer);
    return basicPlayer;
  };

  // Enrich players with Firebase Auth data when players data changes
  useEffect(() => {
    const enrichPlayers = async () => {
      if (!players || players.length === 0) {
        setEnrichedPlayers([]);
        return;
      }

      // Lataa kaikki pelaajat rinnakkain Promise.all:lla - PALJON nopeampaa!
      const enriched = await Promise.all(
        players.map((player) => findPlayerByAnyId(player.id))
      );

      setEnrichedPlayers(enriched);
    };

    enrichPlayers();
  }, [players]);

  // Filtteröi joukkueet joissa nykyinen käyttäjä on mukana (sähköpostilla)
  const userTeams = useMemo(() => {
    try {
      console.log("PlayersScreen DEBUG - Current user:", {
        email: user?.email,
        uid: user?.uid,
      });
      console.log(
        "PlayersScreen DEBUG - Players array length:",
        players.length
      );
      const userPlayer = players.find((p) => p.email === user?.email);
      console.log("PlayersScreen DEBUG - Found user in players:", {
        found: !!userPlayer,
        playerData: userPlayer
          ? {
              id: userPlayer.id,
              email: userPlayer.email,
              teamIds: userPlayer.teamIds,
            }
          : null,
      });
      const result = getUserTeams(user, teams, players);
      console.log(
        "PlayersScreen DEBUG - User teams:",
        result.map((t) => t.name)
      );
      return result;
    } catch (error) {
      console.error("PlayersScreen: Error in getUserTeams:", error);
      return [];
    }
  }, [user, teams, players]);

  const getSelectedTeamName = () => {
    if (!selectedTeamId) return "Kaikki joukkueet";
    const team = userTeams.find((t) => t.id === selectedTeamId);
    return team ? team.name : "Kaikki joukkueet";
  };

  // Filtteröi pelaajat valitun joukkueen mukaan
  const filteredPlayers = useMemo(() => {
    try {
      if (!enrichedPlayers || !Array.isArray(enrichedPlayers)) {
        return [];
      }

      let playersToFilter: Player[];

      if (selectedTeamId) {
        const selectedTeam = teams.find((team) => team.id === selectedTeamId);
        if (!selectedTeam) return [];

        // Use teamIds for filtering
        playersToFilter = enrichedPlayers.filter((player) => {
          return player.teamIds?.includes(selectedTeamId);
        });
      } else {
        // Jos "Kaikki joukkueet" valittu, näytä vain käyttäjän joukkueiden pelaajat
        const userTeamIds = userTeams.map((team) => team.id).filter(Boolean);
        playersToFilter = enrichedPlayers.filter((player) => {
          // Pelaaja kuuluu johonkin käyttäjän joukkueeseen
          return player.teamIds?.some((teamId) => userTeamIds.includes(teamId));
        });
      }

      // Varmista että kirjautunut käyttäjä näkyy aina listassa jos kuuluu johonkin joukkueeseen
      const currentUserInList = playersToFilter.some(
        (p) => p.id === user?.uid || p.email === user?.email
      );

      if (!currentUserInList && user && userTeams.length > 0) {
        // Käyttäjä kuuluu joukkueeseen mutta ei ole listassa - lisätään
        const currentUserPlayer = enrichedPlayers.find(
          (p) => p.id === user.uid || p.email === user.email
        );
        if (currentUserPlayer) {
          playersToFilter.push(currentUserPlayer);
        }
      }

      // Lajittele pelaajat aakkosjärjestykseen sukunimen perusteella
      const sorted = playersToFilter.sort((a, b) => {
        const aName = a.name || a.email || "Tuntematon";
        const bName = b.name || b.email || "Tuntematon";
        const aLastName = aName.split(" ").pop() || aName;
        const bLastName = bName.split(" ").pop() || bName;
        return aLastName.localeCompare(bLastName, "fi");
      });

      return sorted;
    } catch (error) {
      console.error("PlayersScreen: Error in filteredPlayers:", error);
      return [];
    }
  }, [enrichedPlayers, teams, selectedTeamId, userTeams]);

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
    } else {
      Alert.alert(
        "Tulossa pian",
        `${screen} -toiminto toteutetaan seuraavaksi`
      );
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // Tyhjennä välimuisti kun data päivitetään
    playerCache.clear();
    await refreshData();
    setRefreshing(false);
  };

  const renderTeamSelector = () => {
    return (
      <View style={styles.teamSelector}>
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
    );
  };
  const renderPlayer = ({ item }: { item: Player }) => {
    // Hae pelaajan joukkueet - tarkista kaikki ID-muodot
    const playerTeams = teams.filter((team) => item.teamIds?.includes(team.id));

    return (
      <TouchableOpacity
        style={styles.playerCard}
        onPress={() => setSelectedPlayer(item)}
      >
        {/* Jos valittu tietty joukkue, näytä värikoodi vasemmalla */}
        {selectedTeamId && (
          <View style={styles.playerTeamIndicator}>
            {playerTeams
              .filter((team) => team.id === selectedTeamId)
              .map((team) => (
                <View
                  key={team.id}
                  style={[
                    styles.teamColorBar,
                    { backgroundColor: team.color || "#1976d2" },
                  ]}
                />
              ))}
          </View>
        )}

        <View style={styles.playerContent}>
          <View style={styles.playerHeader}>
            <Text style={styles.playerName}>{item.name}</Text>
            {/* Jos näytetään kaikki joukkueet, näytä väripallukat nimen perässä */}
            {!selectedTeamId && playerTeams.length > 0 && (
              <View style={styles.teamColorDots}>
                {playerTeams.map((team) => (
                  <View
                    key={team.id}
                    style={[
                      styles.teamColorDot,
                      { backgroundColor: team.color || "#1976d2" },
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
          <View style={styles.playerDetails}>
            {item.email && (
              <View style={styles.contactRow}>
                <Ionicons name="mail-outline" size={16} color="#666" />
                <Text style={styles.contactText}>{item.email}</Text>
              </View>
            )}
            {item.phone && (
              <View style={styles.contactRow}>
                <Ionicons name="call-outline" size={16} color="#666" />
                <Text style={styles.contactText}>{item.phone}</Text>
                <TouchableOpacity
                  style={styles.whatsappQuickButton}
                  onPress={() => handleWhatsApp(item.phone || "", item.name)}
                >
                  <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };
  // Pelaajamodaali funktiot
  const handleCall = (phone: string) => {
    if (!phone) return;
    const url = `tel:${phone}`;
    Linking.openURL(url).catch((err) =>
      Alert.alert("Virhe", "Soittaminen ei onnistunut")
    );
  };

  const handleEmail = (email: string) => {
    if (!email) return;
    const url = `mailto:${email}`;
    Linking.openURL(url).catch((err) =>
      Alert.alert("Virhe", "Sähköpostin avaaminen ei onnistunut")
    );
  };

  const handleWhatsApp = (phone: string, playerName: string) => {
    if (!phone) {
      Alert.alert("Virhe", "Pelaajalla ei ole puhelinnumeroa");
      return;
    }

    // Poista kaikki muut merkit paitsi numerot ja + merkki
    const cleanPhone = phone.replace(/[^\d+]/g, "");

    // Jos numero alkaa 0:lla, korvaa se +358:lla (Suomen maakoodi)
    let formattedPhone = cleanPhone;
    if (cleanPhone.startsWith("0")) {
      formattedPhone = "+358" + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith("358")) {
      formattedPhone = "+" + cleanPhone;
    } else if (!cleanPhone.startsWith("+")) {
      formattedPhone = "+" + cleanPhone;
    }

    // Oletus viesti
    const message = `Hei ${playerName}! 👋 Terveisiä FairDealPro-appista.`;

    const url = `whatsapp://send?phone=${formattedPhone}&text=${encodeURIComponent(
      message
    )}`;

    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url);
        } else {
          Alert.alert(
            "WhatsApp ei ole asennettu",
            "Asenna WhatsApp-sovellus lähettääksesi viestejä."
          );
        }
      })
      .catch((err) => {
        console.error("WhatsApp error:", err);
        Alert.alert("Virhe", "WhatsApp-viestin lähettäminen ei onnistunut");
      });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Pelaajat</Text>
        </View>
        <View style={styles.content}>
          <Text style={styles.placeholder}>Ladataan pelaajia...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>Pelaajat</Text>
            <Text style={styles.headerSubtitle}>
              {filteredPlayers.length} pelaajaa
              {selectedTeamId ? ` joukkueessa` : ` yhteensä`}
            </Text>
          </View>
          <View style={styles.headerButtons}>
            <AdminMenuButton onNavigate={handleAdminNavigation} />
          </View>
        </View>
      </View>

      {renderTeamSelector()}

      <FlatList
        data={filteredPlayers}
        renderItem={renderPlayer}
        keyExtractor={(item) => item.id}
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>Ei pelaajia</Text>
            <Text style={styles.emptySubtext}>
              {selectedTeamId
                ? "Valitussa joukkueessa ei ole pelaajia"
                : "Pelaajia ei ole vielä lisätty järjestelmään"}
            </Text>
          </View>
        )}
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

      {/* Pelaajan tiedot modal */}
      <Modal
        visible={!!selectedPlayer}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedPlayer(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pelaajan tiedot</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSelectedPlayer(null)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            {selectedPlayer && (
              <>
                <View style={{ alignItems: "center", marginBottom: 16 }}>
                  {selectedPlayer.image ? (
                    <Image
                      source={{ uri: selectedPlayer.image }}
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 40,
                        marginBottom: 8,
                      }}
                    />
                  ) : (
                    <Ionicons
                      name="person-circle"
                      size={80}
                      color="#bbb"
                      style={{ marginBottom: 8 }}
                    />
                  )}
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "bold",
                      color: "#333",
                      marginBottom: 4,
                    }}
                  >
                    {selectedPlayer.name}
                  </Text>
                </View>

                {/* Contact buttons */}
                <View style={styles.contactButtonsContainer}>
                  {selectedPlayer.email && (
                    <TouchableOpacity
                      style={styles.contactButton}
                      onPress={() => handleEmail(selectedPlayer.email)}
                    >
                      <Ionicons name="mail" size={20} color="white" />
                      <Text style={styles.contactButtonText}>
                        Lähetä sähköposti
                      </Text>
                    </TouchableOpacity>
                  )}
                  {selectedPlayer.phone && (
                    <>
                      <TouchableOpacity
                        style={[styles.contactButton, styles.callButton]}
                        onPress={() => handleCall(selectedPlayer.phone || "")}
                      >
                        <Ionicons name="call" size={20} color="white" />
                        <Text style={styles.contactButtonText}>Soita</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.contactButton, styles.whatsappButton]}
                        onPress={() =>
                          handleWhatsApp(
                            selectedPlayer.phone || "",
                            selectedPlayer.name
                          )
                        }
                      >
                        <Ionicons
                          name="logo-whatsapp"
                          size={20}
                          color="white"
                        />
                        <Text style={styles.contactButtonText}>
                          Lähetä WhatsApp-viesti
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </>
            )}
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
    justifyContent: "center",
    alignItems: "center",
  },
  placeholder: {
    fontSize: 16,
    color: "#666",
  },
  list: {
    flex: 1,
    padding: 16,
  },
  playerCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    position: "relative",
    flexDirection: "row",
  },
  playerHeader: {
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playerName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
    flex: 1,
  },
  playerDetails: {
    gap: 6,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    justifyContent: "space-between",
  },
  contactText: {
    fontSize: 14,
    color: "#666",
    marginLeft: 8,
    flex: 1,
  },
  whatsappQuickButton: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: "rgba(37, 211, 102, 0.1)",
    marginLeft: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#666",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginTop: 8,
    marginHorizontal: 40,
  },
  teamSelector: {
    backgroundColor: "#f5f5f5",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  teamTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  teamChips: {
    flexDirection: "row",
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
  playerTeamIndicator: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  teamColorBar: {
    flex: 1,
    width: 4,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  playerContent: {
    flex: 1,
    marginLeft: 8,
  },
  teamColorDots: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
    gap: 6,
  },
  teamColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  contactButtonsContainer: {
    marginTop: 20,
    gap: 12,
  },
  contactButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1976d2",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
  },
  callButton: {
    backgroundColor: "#4CAF50",
  },
  whatsappButton: {
    backgroundColor: "#25D366", // WhatsApp:n virallinen vihreä
  },
  contactButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "500",
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});

export default PlayersScreen;
