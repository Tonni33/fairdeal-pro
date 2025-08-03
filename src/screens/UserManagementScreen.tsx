import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { collection, doc, updateDoc, deleteDoc } from "firebase/firestore";

import { RootStackParamList, Team, Player } from "../types";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import { useApp, getUserTeams } from "../contexts/AppContext";

type UserManagementScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "UserManagement"
>;

const UserManagementScreen: React.FC = () => {
  const navigation = useNavigation<UserManagementScreenNavigationProp>();
  const { user } = useAuth();
  const { teams, players: allPlayers, refreshData } = useApp();

  // Filtteröi joukkueet joissa nykyinen käyttäjä on mukana
  const userTeams = useMemo(() => getUserTeams(user, teams), [user, teams]);

  // State
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filtteröi pelaajat valitun joukkueen mukaan
  const filteredPlayers = useMemo(() => {
    console.log("UserManagement: Filtering players for team:", selectedTeam);
    console.log("UserManagement: Total players:", allPlayers.length);

    if (!selectedTeam) return [];

    const selectedTeamData = teams.find((team) => team.id === selectedTeam);
    if (!selectedTeamData) {
      console.log("UserManagement: Selected team not found");
      return [];
    }

    console.log(
      "UserManagement: Selected team data:",
      selectedTeamData.name,
      "members:",
      selectedTeamData.members
    );

    // Käytetään sekä teamIds että members-kenttää varmuuden vuoksi
    const filtered = allPlayers.filter((player) => {
      const inTeamByTeamIds = player.teamIds?.includes(selectedTeam);
      const inTeamByMembers = selectedTeamData.members.includes(player.id);
      const inTeamByTeams = player.teams?.includes(selectedTeam);

      console.log(`UserManagement: Player ${player.name}:`, {
        teamIds: player.teamIds,
        teams: player.teams,
        inTeamByTeamIds,
        inTeamByMembers,
        inTeamByTeams,
      });

      return inTeamByTeamIds || inTeamByMembers || inTeamByTeams;
    });

    console.log("UserManagement: Filtered players count:", filtered.length);
    return filtered;
  }, [selectedTeam, allPlayers, teams]);

  // Modal states
  const [isTeamModalVisible, setIsTeamModalVisible] = useState(false);
  const [isPlayerModalVisible, setIsPlayerModalVisible] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // Edit form states
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPosition, setEditPosition] = useState("H");
  const [editCategory, setEditCategory] = useState(1);
  const [editMultiplier, setEditMultiplier] = useState(1.0);
  // Rooli: "member" | "admin" | "eventManager"
  const [editRole, setEditRole] = useState<"member" | "admin" | "eventManager">(
    "member"
  );
  const [editSelectedTeams, setEditSelectedTeams] = useState<string[]>([]);

  // Yksi dropdown-tila: mikä valinta auki ('position' | 'category' | 'multiplier' | 'role' | 'teams' | null)
  const [editDropdown, setEditDropdown] = useState<null | string>(null);

  const positions = [
    { value: "H", label: "Hyökkääjä" },
    { value: "P", label: "Puolustaja" },
    { value: "H/P", label: "Hyökkääjä/Puolustaja" },
    { value: "MV", label: "Maalivahti" },
  ];

  const categories = [1, 2, 3];

  // Kerroin vaihtoehdot kategoriaperusteisesti
  const getMultiplierOptions = () => {
    if (editCategory === 1) {
      return [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9];
    } else if (editCategory === 2) {
      return [2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9];
    } else {
      return [3.0, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9];
    }
  };

  // Päivitä kerroin automaattisesti kategorian muuttuessa
  const handleCategoryChange = (newCategory: number) => {
    setEditCategory(newCategory);
    if (newCategory === 1) {
      setEditMultiplier(1.0);
    } else if (newCategory === 2) {
      setEditMultiplier(2.0);
    } else {
      setEditMultiplier(3.0);
    }
  };

  // Avaa pelaajan muokkausmodaali
  const openPlayerModal = (player: Player) => {
    console.log("UserManagement: Opening player modal for:", player.name);
    console.log("UserManagement: Player data:", {
      teams: player.teams,
      teamIds: player.teamIds,
      category: player.category,
      multiplier: player.multiplier,
      role: (player as any).role,
      isAdmin: player.isAdmin,
    });

    setSelectedPlayer(player);
    setEditName(player.name);
    setEditEmail(player.email);
    setEditPhone(player.phone || "");
    setEditPosition(player.position);
    setEditCategory(player.category);
    setEditMultiplier(player.multiplier);
    // Määritä rooli: jos player.role on olemassa ja eventManager, käytä sitä, muuten isAdmin, muuten member
    const playerRole = (player as any).role;
    if (playerRole === "eventManager") {
      setEditRole("eventManager");
    } else if (player.isAdmin) {
      setEditRole("admin");
    } else {
      setEditRole("member");
    }
    setEditSelectedTeams(player.teamIds || player.teams || []);
    setIsPlayerModalVisible(true);
  };

  // Sulje pelaajan modaali ja nollaa tiedot
  const closePlayerModal = () => {
    console.log("UserManagement: Closing player modal");
    setIsPlayerModalVisible(false);
    setSelectedPlayer(null);
    setEditName("");
    setEditEmail("");
    setEditPhone("");
    setEditPosition("H");
    setEditCategory(1);
    setEditMultiplier(1.0);
    setEditRole("member");
    setEditSelectedTeams([]);
    // Ei enää erillisiä edit-modaaleja
  };

  // Tallenna pelaajan muutokset
  const savePlayerChanges = async () => {
    if (!selectedPlayer) return;

    console.log("UserManagement: Saving player changes:", {
      name: editName,
      teams: editSelectedTeams,
      category: editCategory,
      multiplier: editMultiplier,
      role: editRole,
    });

    if (!editName.trim()) {
      Alert.alert("Virhe", "Nimi on pakollinen");
      return;
    }
    if (!editEmail.trim()) {
      Alert.alert("Virhe", "Sähköposti on pakollinen");
      return;
    }
    if (editSelectedTeams.length === 0) {
      Alert.alert("Virhe", "Valitse vähintään yksi joukkue");
      return;
    }

    try {
      // Käytä users collectioa players sijasta
      const playerRef = doc(db, "users", selectedPlayer.id);
      await updateDoc(playerRef, {
        name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        phone: editPhone.trim(),
        position: editPosition,
        category: editCategory,
        multiplier: editMultiplier,
        isAdmin: editRole === "admin",
        role: editRole,
        teams: editSelectedTeams,
        teamIds: editSelectedTeams, // Päivitä molemmat kentät varmuuden vuoksi
        updatedAt: new Date(),
      });

      Alert.alert("Onnistui", "Pelaajan tiedot päivitetty");
      closePlayerModal();
      refreshData(); // Päivitä globaali data
    } catch (error) {
      console.error("Error updating player:", error);
      Alert.alert("Virhe", "Pelaajan päivittäminen epäonnistui");
    }
  };

  // Poista pelaaja
  const deletePlayer = async () => {
    if (!selectedPlayer) return;

    Alert.alert(
      "Poista pelaaja",
      `Haluatko varmasti poistaa pelaajan ${selectedPlayer.name}?`,
      [
        { text: "Peruuta", style: "cancel" },
        {
          text: "Poista",
          style: "destructive",
          onPress: async () => {
            try {
              // Käytä users collectioa players sijasta
              await deleteDoc(doc(db, "users", selectedPlayer.id));
              Alert.alert("Onnistui", "Pelaaja poistettu");
              closePlayerModal();
              refreshData();
            } catch (error) {
              console.error("Error deleting player:", error);
              Alert.alert("Virhe", "Pelaajan poistaminen epäonnistui");
            }
          },
        },
      ]
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    refreshData().finally(() => setRefreshing(false));
  };

  const getSelectedTeamName = () => {
    if (!selectedTeam) return "Valitse joukkue";
    const team = userTeams.find((t) => t.id === selectedTeam);
    return team?.name || "Tuntematon joukkue";
  };

  const getPositionLabel = () => {
    return (
      positions.find((p) => p.value === editPosition)?.label || editPosition
    );
  };

  const toggleEditTeamSelection = (teamId: string) => {
    console.log("UserManagement: Toggling team selection for:", teamId);
    console.log("UserManagement: Current selected teams:", editSelectedTeams);

    setEditSelectedTeams((prev) => {
      const newSelection = prev.includes(teamId)
        ? prev.filter((id) => id !== teamId)
        : [...prev, teamId];

      console.log("UserManagement: New selected teams:", newSelection);
      return newSelection;
    });
  };

  const getEditSelectedTeamsText = () => {
    console.log("UserManagement: Getting teams text for:", editSelectedTeams);

    if (editSelectedTeams.length === 0) return "Valitse joukkueet";
    if (editSelectedTeams.length === 1) {
      const team = userTeams.find((t) => t.id === editSelectedTeams[0]);
      return team?.name || "Tuntematon joukkue";
    }
    return `${editSelectedTeams.length} joukkuetta valittu`;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.content}>
          {/* <Text style={styles.title}>Käyttäjähallinta</Text> */}

          {/* Team Selection */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Valitse joukkue</Text>
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setIsTeamModalVisible(true)}
            >
              <Text
                style={[
                  styles.selectorText,
                  !selectedTeam && styles.placeholderText,
                ]}
              >
                {getSelectedTeamName()}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Players List */}
          {selectedTeam && (
            <View style={styles.playersSection}>
              <Text style={styles.sectionTitle}>
                Pelaajat ({filteredPlayers.length})
              </Text>

              {loading ? (
                <Text style={styles.loadingText}>Ladataan pelaajia...</Text>
              ) : filteredPlayers.length === 0 ? (
                <Text style={styles.emptyText}>
                  Ei pelaajia valitussa joukkueessa
                </Text>
              ) : (
                filteredPlayers.map((player) => {
                  const isGoalkeeper = player.position === "MV";
                  // Käytä valittua joukkuetta värikoodaukseen
                  const selectedTeamData = teams.find(
                    (team) => team.id === selectedTeam
                  );

                  return (
                    <TouchableOpacity
                      key={player.id}
                      style={[
                        styles.playerCard,
                        isGoalkeeper && {
                          borderLeftWidth: 4,
                          borderLeftColor: "#ff9800",
                          backgroundColor: "#fff8e1",
                        },
                      ]}
                      onPress={() => openPlayerModal(player)}
                    >
                      {!isGoalkeeper && selectedTeamData && (
                        <View
                          style={[
                            styles.playerTeamIndicator,
                            {
                              backgroundColor:
                                selectedTeamData.color || "#1976d2",
                            },
                          ]}
                        />
                      )}
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
                        {/* <Text style={styles.playerDetails}>
                          {player.position} • Kat. {player.category} •{" "}
                          {player.multiplier.toFixed(1)}
                        </Text> */}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#666" />
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Team Selection Modal */}
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

            {userTeams.map((team) => (
              <TouchableOpacity
                key={team.id}
                style={[
                  styles.option,
                  selectedTeam === team.id && styles.selectedOption,
                ]}
                onPress={() => {
                  setSelectedTeam(team.id);
                  setIsTeamModalVisible(false);
                }}
              >
                <View style={styles.teamOptionContent}>
                  <View
                    style={[
                      styles.teamColorIndicator,
                      { backgroundColor: team.color || "#1976d2" },
                    ]}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      selectedTeam === team.id && styles.selectedOptionText,
                    ]}
                  >
                    {team.name}
                  </Text>
                </View>
                {selectedTeam === team.id && (
                  <Ionicons name="checkmark" size={20} color="#007AFF" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Player Edit Modal - Implementation continues in next part */}

      {/* Player Details/Edit Modal */}
      <Modal
        visible={isPlayerModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={closePlayerModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.editModalContent]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Muokkaa pelaajaa</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closePlayerModal}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.editScrollView}>
              {/* Name */}
              <View style={styles.editInputGroup}>
                <Text style={styles.label}>Nimi *</Text>
                <TextInput
                  style={styles.input}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Pelaajan nimi"
                  placeholderTextColor="#999"
                />
              </View>

              {/* Email */}
              <View style={styles.editInputGroup}>
                <Text style={styles.label}>Sähköposti *</Text>
                <TextInput
                  style={styles.input}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="pelaaja@example.com"
                  placeholderTextColor="#999"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              {/* Phone */}
              <View style={styles.editInputGroup}>
                <Text style={styles.label}>Puhelinnumero</Text>
                <TextInput
                  style={styles.input}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="+358 XX XXX XXXX"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                />
              </View>

              {/* Team Selection */}
              <View style={styles.editInputGroup}>
                <Text style={styles.label}>Joukkueet *</Text>
                <TouchableOpacity
                  style={styles.selector}
                  onPress={() =>
                    setEditDropdown(editDropdown === "teams" ? null : "teams")
                  }
                >
                  <Text
                    style={[
                      styles.selectorText,
                      editSelectedTeams.length === 0 && styles.placeholderText,
                    ]}
                  >
                    {getEditSelectedTeamsText()}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>
                {editDropdown === "teams" && (
                  <View style={styles.dropdownList}>
                    {userTeams.map((team) => (
                      <TouchableOpacity
                        key={team.id}
                        style={styles.dropdownOption}
                        onPress={() => toggleEditTeamSelection(team.id)}
                      >
                        <View style={styles.teamOptionLeft}>
                          <View style={styles.checkbox}>
                            {editSelectedTeams.includes(team.id) && (
                              <Ionicons
                                name="checkmark"
                                size={16}
                                color="#007AFF"
                              />
                            )}
                          </View>
                          <View
                            style={[
                              styles.teamColorIndicator,
                              { backgroundColor: team.color || "#1976d2" },
                            ]}
                          />
                          <Text style={styles.teamOptionText}>{team.name}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={styles.modalConfirmButton}
                      onPress={() => setEditDropdown(null)}
                    >
                      <Text style={styles.modalConfirmText}>Valmis</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Position */}
              <View style={styles.editInputGroup}>
                <Text style={styles.label}>Pelipaikka</Text>
                <TouchableOpacity
                  style={styles.selector}
                  onPress={() =>
                    setEditDropdown(
                      editDropdown === "position" ? null : "position"
                    )
                  }
                >
                  <Text style={styles.selectorText}>{getPositionLabel()}</Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>
                {editDropdown === "position" && (
                  <View style={styles.dropdownList}>
                    {positions.map((pos) => (
                      <TouchableOpacity
                        key={pos.value}
                        style={styles.dropdownOption}
                        onPress={() => {
                          setEditPosition(pos.value);
                          setEditDropdown(null);
                        }}
                      >
                        <Text style={styles.optionText}>{pos.label}</Text>
                        {editPosition === pos.value && (
                          <Ionicons
                            name="checkmark"
                            size={20}
                            color="#007AFF"
                          />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Category */}
              <View style={styles.editInputGroup}>
                <Text style={styles.label}>Kategoria</Text>
                <TouchableOpacity
                  style={styles.selector}
                  onPress={() =>
                    setEditDropdown(
                      editDropdown === "category" ? null : "category"
                    )
                  }
                >
                  <Text style={styles.selectorText}>
                    Kategoria {editCategory}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>
                {editDropdown === "category" && (
                  <View style={styles.dropdownList}>
                    {categories.map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={styles.dropdownOption}
                        onPress={() => {
                          handleCategoryChange(cat);
                          setEditDropdown(null);
                        }}
                      >
                        <Text style={styles.optionText}>Kategoria {cat}</Text>
                        {editCategory === cat && (
                          <Ionicons
                            name="checkmark"
                            size={20}
                            color="#007AFF"
                          />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Multiplier */}
              <View style={styles.editInputGroup}>
                <Text style={styles.label}>Kerroin</Text>
                <TouchableOpacity
                  style={styles.selector}
                  onPress={() =>
                    setEditDropdown(
                      editDropdown === "multiplier" ? null : "multiplier"
                    )
                  }
                >
                  <Text style={styles.selectorText}>
                    {editMultiplier.toFixed(1)}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>
                {editDropdown === "multiplier" && (
                  <View style={styles.dropdownList}>
                    {getMultiplierOptions().map((mult) => (
                      <TouchableOpacity
                        key={mult}
                        style={styles.dropdownOption}
                        onPress={() => {
                          setEditMultiplier(mult);
                          setEditDropdown(null);
                        }}
                      >
                        <Text style={styles.optionText}>{mult.toFixed(1)}</Text>
                        {editMultiplier === mult && (
                          <Ionicons
                            name="checkmark"
                            size={20}
                            color="#007AFF"
                          />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Role */}
              <View style={styles.editInputGroup}>
                <Text style={styles.label}>Rooli</Text>
                <TouchableOpacity
                  style={styles.selector}
                  onPress={() =>
                    setEditDropdown(editDropdown === "role" ? null : "role")
                  }
                >
                  <Text style={styles.selectorText}>
                    {editRole === "admin"
                      ? "Admin"
                      : editRole === "eventManager"
                      ? "Tapahtumahallinta"
                      : "Jäsen"}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>
                {editDropdown === "role" && (
                  <View style={styles.dropdownList}>
                    <TouchableOpacity
                      style={styles.dropdownOption}
                      onPress={() => {
                        setEditRole("member");
                        setEditDropdown(null);
                      }}
                    >
                      <Text style={styles.optionText}>Jäsen</Text>
                      {editRole === "member" && (
                        <Ionicons name="checkmark" size={20} color="#007AFF" />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.dropdownOption}
                      onPress={() => {
                        setEditRole("admin");
                        setEditDropdown(null);
                      }}
                    >
                      <Text style={styles.optionText}>Admin</Text>
                      {editRole === "admin" && (
                        <Ionicons name="checkmark" size={20} color="#007AFF" />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.dropdownOption}
                      onPress={() => {
                        setEditRole("eventManager");
                        setEditDropdown(null);
                      }}
                    >
                      <Text style={styles.optionText}>Tapahtumahallinta</Text>
                      {editRole === "eventManager" && (
                        <Ionicons name="checkmark" size={20} color="#007AFF" />
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={deletePlayer}
              >
                <Ionicons name="trash" size={20} color="white" />
                <Text style={styles.deleteButtonText}>Poista</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={savePlayerChanges}
              >
                <Ionicons name="checkmark" size={20} color="white" />
                <Text style={styles.saveButtonText}>Tallenna</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom dropdown styles for editDropdown */}
      {/* ...dropdown styles are added below ... */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9f9f9",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 24,
    textAlign: "center",
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  selector: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectorText: {
    fontSize: 16,
    color: "#333",
  },
  placeholderText: {
    color: "#999",
  },
  dropdownList: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 100,
  },
  dropdownOption: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playersSection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 16,
  },
  loadingText: {
    textAlign: "center",
    color: "#666",
    fontSize: 16,
    marginTop: 20,
  },
  emptyText: {
    textAlign: "center",
    color: "#666",
    fontSize: 16,
    marginTop: 20,
  },
  playerCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    elevation: 3,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  playerDetails: {
    fontSize: 14,
    color: "#666",
  },
  playerTeamIndicator: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
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
  option: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectedOption: {
    backgroundColor: "#f0f8ff",
  },
  teamOptionContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamColorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  optionText: {
    fontSize: 16,
    color: "#333",
  },
  selectedOptionText: {
    color: "#007AFF",
    fontWeight: "500",
  },
  editModalContent: {
    maxHeight: "85%",
  },
  editScrollView: {
    maxHeight: 400,
  },
  editInputGroup: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: "#333",
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  deleteButton: {
    backgroundColor: "#dc3545",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    flex: 0.45,
  },
  deleteButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  saveButton: {
    backgroundColor: "#1976d2",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    flex: 0.45,
  },
  saveButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  teamOption: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  teamOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  teamOptionText: {
    fontSize: 16,
    color: "#333",
  },
  modalConfirmButton: {
    backgroundColor: "#1976d2",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
  },
  modalConfirmText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  modalScrollView: {
    maxHeight: 300,
  },
});

export default UserManagementScreen;
