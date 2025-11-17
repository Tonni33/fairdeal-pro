import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
} from "react-native";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { db } from "../services/firebase";
import { TeamClub, AppSettings } from "../types";
import { useAuth } from "../contexts/AuthContext";

interface TeamClubSelectorProps {
  onTeamClubChange?: (teamClub: TeamClub | null) => void;
}

const TeamClubSelector: React.FC<TeamClubSelectorProps> = ({
  onTeamClubChange,
}) => {
  const [selectedTeamClub, setSelectedTeamClub] = useState<TeamClub | null>(
    null
  );
  const [availableTeamClubs, setAvailableTeamClubs] = useState<TeamClub[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Load user's settings
    const loadUserSettings = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, "settings", user.uid));
        if (settingsDoc.exists()) {
          const settings = settingsDoc.data() as AppSettings;
          if (settings.selectedTeamClub) {
            const teamClubDoc = await getDoc(
              doc(db, "teams", settings.selectedTeamClub)
            );
            if (teamClubDoc.exists()) {
              const teamClub = {
                id: teamClubDoc.id,
                ...teamClubDoc.data(),
              } as TeamClub;
              setSelectedTeamClub(teamClub);
              onTeamClubChange?.(teamClub);
            }
          }
        }
      } catch (error) {
        console.error("Error loading user settings:", error);
      }
    };

    // Subscribe to available team clubs (where user is member or admin)
    const teamClubsQuery = query(collection(db, "teams"));

    const unsubscribe = onSnapshot(
      teamClubsQuery,
      async (snapshot) => {
        const teamClubs: TeamClub[] = [];

        // Get user's teamIds from their player document to check membership
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userTeamIds = userDoc.exists()
          ? userDoc.data().teamIds || []
          : [];

        snapshot.forEach((doc) => {
          const data = doc.data();
          console.log(
            "TeamClubSelector: Checking team:",
            data.name,
            "user.teamIds:",
            userTeamIds,
            "adminIds:",
            data.adminIds,
            "user.uid:",
            user.uid
          );

          // Check if user is member (via player.teamIds) or admin (via team.adminIds)
          const isMember = userTeamIds.includes(doc.id);
          const isAdmin =
            data.adminIds?.includes(user.uid) || data.adminId === user.uid;

          if (isMember || isAdmin) {
            console.log(
              "TeamClubSelector: User is member/admin of:",
              data.name
            );
            teamClubs.push({
              id: doc.id,
              name: data.name,
              description: data.description,
              logoUrl: data.logoUrl,
              settings: data.settings || {
                defaultMaxPlayers: 12,
                defaultMaxGoalkeepers: 2,
                skillLevels: ["1", "2", "3", "4", "5"],
                positions: ["goalkeeper", "field", "both"],
              },
              admins: data.adminIds || (data.adminId ? [data.adminId] : []),
              members: [], // Deprecated field, no longer populated
              isActive: data.isActive !== false,
              createdBy: data.createdBy,
              createdAt: data.createdAt?.toDate?.() || new Date(),
              updatedAt: data.updatedAt?.toDate?.() || new Date(),
            });
          }
        });
        setAvailableTeamClubs(teamClubs);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching team clubs:", error);
        Alert.alert("Virhe", "Joukkueiden lataaminen epäonnistui");
        setLoading(false);
      }
    );

    loadUserSettings();

    return unsubscribe;
  }, [user]);

  const handleTeamClubSelect = async (teamClub: TeamClub | null) => {
    if (!user) return;

    try {
      // Save selection to user settings
      const settingsRef = doc(db, "settings", user.uid);
      await setDoc(
        settingsRef,
        {
          selectedTeamClub: teamClub?.id || null,
          userId: user.uid,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      setSelectedTeamClub(teamClub);
      onTeamClubChange?.(teamClub);
      setIsModalVisible(false);
    } catch (error) {
      console.error("Error saving team club selection:", error);
      Alert.alert("Virhe", "Joukkueen valinnan tallennus epäonnistui");
    }
  };

  const renderTeamClubItem = ({ item }: { item: TeamClub }) => (
    <TouchableOpacity
      style={[
        styles.teamClubItem,
        selectedTeamClub?.id === item.id && styles.selectedTeamClubItem,
      ]}
      onPress={() => handleTeamClubSelect(item)}
    >
      <View style={styles.teamClubInfo}>
        <Text style={styles.teamClubName}>{item.name}</Text>
        {item.description && (
          <Text style={styles.teamClubDescription}>{item.description}</Text>
        )}
        <Text style={styles.teamClubMembers}>
          {item.admins.length} {item.admins.length === 1 ? "admin" : "adminia"}
        </Text>
      </View>
      {selectedTeamClub?.id === item.id && (
        <Ionicons name="checkmark-circle" size={24} color="#4caf50" />
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Ladataan joukkueita...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.selectorButton}
        onPress={() => setIsModalVisible(true)}
      >
        <View style={styles.selectorContent}>
          <View style={styles.selectorInfo}>
            <Text style={styles.selectorLabel}>Valittu joukkue:</Text>
            <Text style={styles.selectorValue}>
              {selectedTeamClub ? selectedTeamClub.name : "Kaikki tiedot"}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={20} color="#666" />
        </View>
      </TouchableOpacity>

      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Valitse joukkue</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.teamClubItem,
                !selectedTeamClub && styles.selectedTeamClubItem,
              ]}
              onPress={() => handleTeamClubSelect(null)}
            >
              <View style={styles.teamClubInfo}>
                <Text style={styles.teamClubName}>Kaikki tiedot</Text>
                <Text style={styles.teamClubDescription}>
                  Näytä kaikkien joukkueiden tiedot
                </Text>
              </View>
              {!selectedTeamClub && (
                <Ionicons name="checkmark-circle" size={24} color="#4caf50" />
              )}
            </TouchableOpacity>

            <FlatList
              data={availableTeamClubs}
              renderItem={renderTeamClubItem}
              keyExtractor={(item) => item.id}
              style={styles.teamClubList}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    padding: 16,
  },
  selectorButton: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  selectorContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectorInfo: {
    flex: 1,
  },
  selectorLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  selectorValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  closeButton: {
    padding: 4,
  },
  teamClubList: {
    padding: 16,
  },
  teamClubItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#f8f9fa",
    marginBottom: 8,
  },
  selectedTeamClubItem: {
    backgroundColor: "#e8f5e8",
    borderColor: "#4caf50",
    borderWidth: 1,
  },
  teamClubInfo: {
    flex: 1,
  },
  teamClubName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  teamClubDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  teamClubMembers: {
    fontSize: 12,
    color: "#999",
  },
});

export default TeamClubSelector;
