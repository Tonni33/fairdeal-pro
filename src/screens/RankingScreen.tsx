import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Player, Team } from "../types";
import { useApp } from "../contexts/AppContext";
import { useAuth } from "../contexts/AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../services/firebase";

const RankingScreen: React.FC = () => {
  const { players, teams } = useApp();
  const { user } = useAuth();

  const [isTeamModalVisible, setIsTeamModalVisible] = useState(false);

  // Get teams where user is admin
  const adminTeams = useMemo(() => {
    if (!user) return [];
    return teams.filter((team) =>
      team.adminIds?.includes(user.uid || user.email || "")
    );
  }, [teams, user]);

  // Auto-select team if only one, otherwise keep null until user selects
  const [selectedTeamId, setSelectedTeamId] = useState<string>(() => {
    const userTeams = teams.filter((team) =>
      team.adminIds?.includes(user?.uid || user?.email || "")
    );
    return userTeams.length === 1 ? userTeams[0].id : "";
  });

  // Get selected team data
  const selectedTeam = useMemo(() => {
    return teams.find((t) => t.id === selectedTeamId);
  }, [teams, selectedTeamId]);

  // Filter and rank players - TEAM SPECIFIC
  const rankedPlayers = useMemo(() => {
    // Must have a team selected
    if (!selectedTeamId) {
      return { goalkeepers: [], fieldPlayers: [] };
    }

    const team = teams.find((t) => t.id === selectedTeamId);
    if (!team) {
      return { goalkeepers: [], fieldPlayers: [] };
    }

    // Filter players by team membership
    // Primary method: Check player's teamIds array (modern approach)
    // Fallback: Check team's members array (legacy compatibility)
    const teamPlayers = players.filter((p) => {
      // Primary: Check if player's teamIds includes this team
      if (p.teamIds?.includes(selectedTeamId)) {
        return true;
      }
      // Legacy fallback: Check if team.members includes player (by id, playerId, or email)
      return (
        team.members?.includes(p.id) ||
        team.members?.includes(p.playerId) ||
        team.members?.includes(p.email || "")
      );
    });

    // Get team-specific multipliers from teamSkills
    const playersWithTeamMultipliers = teamPlayers.map((player) => {
      const teamSkill = player.teamSkills?.[selectedTeamId];
      return {
        ...player,
        multiplier: teamSkill?.multiplier || player.multiplier || 1,
        category: teamSkill?.category || player.category || 1,
      };
    });

    // Separate goalkeepers and field players
    const goalkeepers = playersWithTeamMultipliers.filter(
      (p) => p.position?.toUpperCase().includes("M") || p.position === "MV"
    );
    const fieldPlayers = playersWithTeamMultipliers.filter(
      (p) => !(p.position?.toUpperCase().includes("M") || p.position === "MV")
    );

    // Sort by multiplier (ascending - smallest first)
    const sortedGoalkeepers = [...goalkeepers].sort(
      (a, b) => (a.multiplier || 1) - (b.multiplier || 1)
    );
    const sortedFieldPlayers = [...fieldPlayers].sort(
      (a, b) => (a.multiplier || 1) - (b.multiplier || 1)
    );

    return {
      goalkeepers: sortedGoalkeepers,
      fieldPlayers: sortedFieldPlayers,
    };
  }, [players, teams, selectedTeamId]);

  const handleUpdatePlayer = async (
    player: Player,
    category: number,
    multiplier: number
  ) => {
    if (!selectedTeamId) return;

    try {
      const playerRef = doc(db, "users", player.id);

      // Update team-specific skills
      await updateDoc(playerRef, {
        [`teamSkills.${selectedTeamId}.category`]: category,
        [`teamSkills.${selectedTeamId}.multiplier`]: multiplier,
        [`teamSkills.${selectedTeamId}.updatedAt`]: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error("Error updating player:", error);
      Alert.alert("Virhe", "Tallentaminen epäonnistui");
    }
  };

  const PlayerRow: React.FC<{ item: Player }> = ({ item }) => {
    const isGoalkeeper =
      item.position?.toUpperCase().includes("M") || item.position === "MV";

    // Get team-specific values
    const teamSkill = selectedTeamId ? item.teamSkills?.[selectedTeamId] : null;
    const category = teamSkill?.category || item.category || 1;
    const multiplier = teamSkill?.multiplier || item.multiplier || 1.0;

    // Local state for editing
    const [isLocked, setIsLocked] = useState(true);
    const [editingCategory, setEditingCategory] = useState(category.toString());
    const [editingMultiplier, setEditingMultiplier] = useState(
      multiplier.toFixed(1)
    );

    // Update local state when props change
    React.useEffect(() => {
      setEditingCategory(category.toString());
    }, [category]);

    React.useEffect(() => {
      setEditingMultiplier(multiplier.toFixed(1));
    }, [multiplier]);

    const handleSaveAndLock = () => {
      // Validate and save both fields
      const catValue = parseInt(editingCategory);
      const multValue = parseFloat(editingMultiplier);

      let hasError = false;

      if (isNaN(catValue) || catValue < 1 || catValue > 5) {
        setEditingCategory(category.toString());
        Alert.alert("Virhe", "Kategoria pitää olla välillä 1-5");
        hasError = true;
      }

      if (isNaN(multValue) || multValue < 0.1 || multValue > 3.0) {
        setEditingMultiplier(multiplier.toFixed(1));
        Alert.alert("Virhe", "Kerroin pitää olla välillä 0.1-3.0");
        hasError = true;
      }

      if (!hasError) {
        handleUpdatePlayer(item, catValue, multValue);
        setEditingMultiplier(multValue.toFixed(1));
        setIsLocked(true);
      }
    };

    return (
      <View style={styles.playerRow}>
        <View style={styles.playerMainInfo}>
          <Text
            style={[
              styles.playerName,
              isGoalkeeper && { color: "#ff9800", fontWeight: "600" },
            ]}
          >
            {item.name || item.email || "Tuntematon"}
            {isGoalkeeper && " 🥅"}
          </Text>
        </View>
        <View style={styles.playerStats}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Kategoria</Text>
            <TextInput
              style={[styles.statInput, isLocked && styles.statInputLocked]}
              value={editingCategory}
              onChangeText={setEditingCategory}
              editable={!isLocked}
              keyboardType="number-pad"
              maxLength={1}
            />
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Kerroin</Text>
            <TextInput
              style={[styles.statInput, isLocked && styles.statInputLocked]}
              value={editingMultiplier}
              onChangeText={setEditingMultiplier}
              editable={!isLocked}
              keyboardType="decimal-pad"
              maxLength={3}
            />
          </View>
        </View>
        <TouchableOpacity
          style={styles.lockButton}
          onPress={() => {
            if (isLocked) {
              setIsLocked(false);
            } else {
              handleSaveAndLock();
            }
          }}
        >
          <Ionicons
            name={isLocked ? "lock-closed" : "checkmark"}
            size={20}
            color={isLocked ? "#999" : "#4CAF50"}
          />
        </TouchableOpacity>
      </View>
    );
  };

  const renderPlayerItem = ({ item }: { item: Player }) => {
    return <PlayerRow item={item} />;
  };

  const renderSectionHeader = (title: string, count: number) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>
        {title} ({count})
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Team Filter */}
      <TouchableOpacity
        style={styles.filterButton}
        onPress={() => setIsTeamModalVisible(true)}
      >
        <Ionicons name="filter" size={20} color="#007AFF" />
        <Text style={styles.filterText}>
          {selectedTeam ? selectedTeam.name : "Valitse joukkue"}
        </Text>
        <Ionicons name="chevron-down" size={20} color="#007AFF" />
      </TouchableOpacity>

      {/* Players List */}
      <FlatList
        data={[]}
        ListHeaderComponent={
          <>
            {rankedPlayers.fieldPlayers.length > 0 && (
              <>
                {renderSectionHeader(
                  "Kenttäpelaajat",
                  rankedPlayers.fieldPlayers.length
                )}
                {rankedPlayers.fieldPlayers.map((player) => (
                  <View key={player.id}>
                    {renderPlayerItem({ item: player })}
                  </View>
                ))}
              </>
            )}
            {rankedPlayers.goalkeepers.length > 0 && (
              <>
                {renderSectionHeader(
                  "Maalivahdit",
                  rankedPlayers.goalkeepers.length
                )}
                {rankedPlayers.goalkeepers.map((player) => (
                  <View key={player.id}>
                    {renderPlayerItem({ item: player })}
                  </View>
                ))}
              </>
            )}
            {rankedPlayers.fieldPlayers.length === 0 &&
              rankedPlayers.goalkeepers.length === 0 && (
                <View style={styles.emptyContainer}>
                  <Ionicons name="trophy-outline" size={60} color="#ccc" />
                  <Text style={styles.emptyText}>
                    {selectedTeamId
                      ? "Ei pelaajia valitussa joukkueessa"
                      : "Valitse joukkue nähdäksesi ranking"}
                  </Text>
                </View>
              )}
          </>
        }
        renderItem={null}
        contentContainerStyle={styles.listContent}
      />

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
            <FlatList
              data={adminTeams}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.teamOption,
                    selectedTeamId === item.id && styles.teamOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedTeamId(item.id);
                    setIsTeamModalVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.teamOptionText,
                      selectedTeamId === item.id &&
                        styles.teamOptionTextSelected,
                    ]}
                  >
                    {item.name}
                  </Text>
                  {selectedTeamId === item.id && (
                    <Ionicons name="checkmark" size={24} color="#007AFF" />
                  )}
                </TouchableOpacity>
              )}
            />
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
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  filterText: {
    fontSize: 16,
    color: "#007AFF",
    marginHorizontal: 8,
    fontWeight: "500",
  },
  listContent: {
    paddingHorizontal: 16,
  },
  sectionHeader: {
    backgroundColor: "#e8e8e8",
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 8,
    marginHorizontal: -16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    marginVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  playerMainInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "500",
  },
  playerStats: {
    flexDirection: "row",
    gap: 12,
    marginRight: 12,
  },
  statBox: {
    alignItems: "center",
    minWidth: 60,
  },
  statLabel: {
    fontSize: 11,
    color: "#666",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
  },
  statInput: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: "center",
    minWidth: 50,
    backgroundColor: "#fff",
  },
  statInputLocked: {
    backgroundColor: "#f8f8f8",
    color: "#666",
  },
  lockButton: {
    padding: 8,
    marginLeft: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    padding: 4,
  },
  teamOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  teamOptionSelected: {
    backgroundColor: "#f0f8ff",
  },
  teamOptionText: {
    fontSize: 16,
  },
  teamOptionTextSelected: {
    fontWeight: "600",
    color: "#007AFF",
  },
});

export default RankingScreen;
