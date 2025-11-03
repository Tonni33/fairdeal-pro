import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { Team } from "../types";
import LicenseManager from "../components/LicenseManager";
import { useAuth } from "../contexts/AuthContext";
import { useApp } from "../contexts/AppContext";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../services/firebase";

const TeamManagementScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { players } = useApp();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamColor, setTeamColor] = useState("#1976d2");
  const [teamCode, setTeamCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [licenseManagerVisible, setLicenseManagerVisible] = useState(false);
  const [selectedTeamForLicense, setSelectedTeamForLicense] =
    useState<Team | null>(null);

  const predefinedColors = [
    "#1976d2",
    "#388e3c",
    "#f57c00",
    "#d32f2f",
    "#7b1fa2",
    "#303f9f",
    "#c2185b",
    "#00796b",
    "#5d4037",
    "#616161",
    "#0097a7",
    "#afb42b",
    "#e64a19",
    "#455a64",
  ];

  const isMasterAdmin = (): boolean => {
    return Boolean(user && user.isMasterAdmin === true);
  };

  const isUserTeamAdmin = (teamId: string): boolean => {
    if (isMasterAdmin()) return true; // Master admin has access to everything
    if (!user?.uid) return false;

    // Check if user is admin via team's adminIds array
    const team = teams.find((t) => t.id === teamId);
    return Boolean(
      team?.adminIds?.includes(user.uid) || team?.adminId === user.uid
    );
  };

  useEffect(() => {
    const teamsQuery = query(collection(db, "teams"), orderBy("name", "asc"));

    const unsubscribe = onSnapshot(teamsQuery, (snapshot) => {
      const teamsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Team[];
      setTeams(teamsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Filter teams to show only those where user has admin rights
  const adminTeams = teams.filter((team) => isUserTeamAdmin(team.id));

  const generateTeamCode = (): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleTeamPress = async (team: Team) => {
    setSelectedTeamForLicense(team);
    setLicenseManagerVisible(true);
  };

  const handleEditTeam = (team: Team) => {
    setEditingTeam(team);
    setTeamName(team.name);
    setTeamColor(team.color || "#1976d2");
    setTeamCode(team.code || generateTeamCode());
    setModalVisible(true);
  };

  const handleSaveTeam = async () => {
    if (!teamName.trim()) {
      Alert.alert("Virhe", "Joukkueen nimi on pakollinen");
      return;
    }

    if (!teamCode.trim()) {
      Alert.alert("Virhe", "Joukkuekoodi on pakollinen");
      return;
    }

    setSaving(true);
    try {
      if (editingTeam) {
        // Päivitetään olemassa oleva joukkue
        const teamRef = doc(db, "teams", editingTeam.id);
        await updateDoc(teamRef, {
          name: teamName.trim(),
          color: teamColor,
          code: teamCode.trim().toUpperCase(),
        });
        Alert.alert("Onnistui", "Joukkue päivitetty");
      } else {
        // Luodaan uusi joukkue
        const teamRef = await addDoc(collection(db, "teams"), {
          name: teamName.trim(),
          color: teamColor,
          code: teamCode.trim().toUpperCase(),
          adminIds: [user?.uid || ""], // New array format
          adminId: user?.uid || "", // Legacy support
          members: [user?.uid || ""],
          createdAt: new Date(),
          totalPoints: 0,
          players: [],
        });

        Alert.alert(
          "Onnistui",
          `Joukkue luotu koodilla: ${teamCode.trim().toUpperCase()}`
        );
      }
      setModalVisible(false);
    } catch (error) {
      console.error("Error saving team:", error);
      Alert.alert("Virhe", "Joukkueen tallennus epäonnistui");
    }
    setSaving(false);
  };

  const handleDeleteTeam = (team: Team) => {
    Alert.alert(
      "Vahvista poisto",
      `Haluatko varmasti poistaa joukkueen "${team.name}"?\n\nTämä poistaa joukkueen kaikista jäsenistä ja tapahtumista.`,
      [
        { text: "Peruuta", style: "cancel" },
        {
          text: "Poista",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "teams", team.id));
              Alert.alert("Onnistui", "Joukkue poistettu");
            } catch (error) {
              console.error("Error deleting team:", error);
              Alert.alert("Virhe", "Joukkueen poisto epäonnistui");
            }
          },
        },
      ]
    );
  };

  const renderTeamItem = ({ item: team }: { item: Team }) => {
    // Check if license is expired
    let isExpired = false;
    let expiryDateStr = "";
    if (team.licenseExpiresAt) {
      const expiryDate =
        typeof team.licenseExpiresAt === "object" &&
        "seconds" in team.licenseExpiresAt
          ? new Date((team.licenseExpiresAt as any).seconds * 1000)
          : team.licenseExpiresAt instanceof Date
          ? team.licenseExpiresAt
          : new Date(team.licenseExpiresAt);
      isExpired = expiryDate < new Date();
      expiryDateStr = expiryDate.toLocaleDateString("fi-FI");
    }
    const hasActiveLicense =
      team.licenseStatus === "active" && !isExpired && team.licenseExpiresAt;

    return (
      <TouchableOpacity
        style={styles.teamItem}
        activeOpacity={0.85}
        onPress={() => handleTeamPress(team)}
      >
        <View style={styles.teamInfo}>
          <View
            style={[
              styles.colorIndicator,
              { backgroundColor: team.color || "#666" },
            ]}
          />
          <View style={styles.teamDetails}>
            <Text style={styles.teamName}>{team.name}</Text>
            <Text style={styles.teamCode}>
              Koodi: {team.code || "Ei koodia"}
            </Text>
            {/* License status */}
            {hasActiveLicense ? (
              <View style={styles.licenseInfo}>
                <Ionicons name="checkmark-circle" size={16} color="#4caf50" />
                <Text style={styles.licenseText}>
                  Voimassa {expiryDateStr} saakka
                </Text>
              </View>
            ) : isExpired ? (
              <View style={styles.licenseExpiredBanner}>
                <Ionicons name="alert-circle" size={16} color="#f44336" />
                <Text style={styles.licenseExpiredText}>
                  Lisenssi vanhentunut {expiryDateStr}
                </Text>
              </View>
            ) : (
              <View style={styles.licenseRequestBanner}>
                <Ionicons name="alert-circle" size={16} color="#ff9800" />
                <Text style={styles.licenseRequestText}>
                  Ei lisenssiä - hallinnoi lisenssejä
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#ff9800" />
              </View>
            )}
            <Text style={styles.memberCount}>
              Jäseniä:{" "}
              {players.filter((p) => p.teamIds?.includes(team.id)).length}
            </Text>
          </View>
        </View>
        <View style={styles.teamActions}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={(e) => {
              e.stopPropagation();
              handleEditTeam(team);
            }}
          >
            <Ionicons name="pencil" size={18} color="#1976d2" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={(e) => {
              e.stopPropagation();
              handleDeleteTeam(team);
            }}
          >
            <Ionicons name="trash" size={20} color="#f44336" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>Joukkuehallinta</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1976d2" />
          <Text style={styles.loadingText}>Ladataan joukkueita...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Joukkuehallinta</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>
          {isMasterAdmin()
            ? `Kaikki joukkueet: ${teams.length}`
            : `Omat joukkueet: ${adminTeams.length}`}
        </Text>

        <FlatList
          data={isMasterAdmin() ? teams : adminTeams}
          keyExtractor={(item) => item.id}
          renderItem={renderTeamItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>
                {isMasterAdmin() ? "Ei joukkueita" : "Ei admin-oikeuksia"}
              </Text>
              <Text style={styles.emptySubtext}>
                {isMasterAdmin()
                  ? "Järjestelmässä ei ole vielä joukkueita"
                  : "Et ole minkään joukkueen admin. Luo uusi joukkue Profiili-sivun kautta tai pyydä admin-oikeuksia."}
              </Text>
            </View>
          }
        />
      </View>

      {/* Joukkueen luonti/muokkaus modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingTeam ? "Muokkaa joukkuetta" : "Luo uusi joukkue"}
              </Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Joukkueen nimi</Text>
              <TextInput
                style={styles.input}
                value={teamName}
                onChangeText={setTeamName}
                placeholder="Syötä joukkueen nimi"
                maxLength={50}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Väri</Text>
              <View style={styles.colorPicker}>
                {predefinedColors.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      teamColor === color && styles.selectedColor,
                    ]}
                    onPress={() => setTeamColor(color)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Joukkuekoodi</Text>
              <View style={styles.codeInputContainer}>
                <TextInput
                  style={styles.codeInput}
                  value={teamCode}
                  onChangeText={setTeamCode}
                  placeholder="ABCD12"
                  autoCapitalize="characters"
                  maxLength={10}
                />
                <TouchableOpacity
                  style={styles.generateCodeButton}
                  onPress={() => setTeamCode(generateTeamCode())}
                >
                  <Ionicons name="refresh" size={20} color="#1976d2" />
                </TouchableOpacity>
              </View>
              <Text style={styles.helperText}>
                Pelaajat käyttävät tätä koodia liittyäkseen joukkueeseen
              </Text>
            </View>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveTeam}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons
                  name="save"
                  size={20}
                  color="#fff"
                  style={{ marginRight: 8 }}
                />
              )}
              <Text style={styles.saveButtonText}>
                {editingTeam ? "Tallenna muutokset" : "Luo joukkue"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* License Manager */}
      <LicenseManager
        visible={licenseManagerVisible}
        onClose={() => {
          setLicenseManagerVisible(false);
          setSelectedTeamForLicense(null);
        }}
        team={selectedTeamForLicense || undefined}
        onLicenseUpdated={() => {
          // Refresh teams data if needed
        }}
        isMasterAdmin={isMasterAdmin()}
        currentUserId={user?.uid}
        currentUserEmail={user?.email}
        currentUser={user || undefined}
        currentUserPhone={(() => {
          const currentPlayer = players.find(
            (p) => p.id === user?.uid || p.email === user?.email
          );
          console.log("TeamManagement - Looking for phone:", {
            userId: user?.uid,
            userEmail: user?.email,
            foundPlayer: currentPlayer?.id,
            phone: currentPlayer?.phone,
          });
          return currentPlayer?.phone || "";
        })()}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    flex: 1,
    textAlign: "center",
  },
  backButton: {
    padding: 8,
    width: 40,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
    marginBottom: 16,
  },
  listContainer: {
    paddingBottom: 20,
  },
  teamItem: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  teamInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  colorIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 12,
  },
  teamDetails: {
    flex: 1,
  },
  teamName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  teamCode: {
    fontSize: 14,
    color: "#666",
    marginBottom: 2,
  },
  memberCount: {
    fontSize: 14,
    color: "#666",
  },
  teamActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  editButton: {
    padding: 8,
    marginRight: 4,
    marginLeft: 4,
  },
  deleteButton: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#666",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxWidth: 400,
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
    flex: 1,
    textAlign: "center",
  },
  closeButton: {
    padding: 8,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#f9f9f9",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#333",
  },
  colorPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedColor: {
    borderColor: "#333",
    borderWidth: 3,
  },
  saveButton: {
    backgroundColor: "#1976d2",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  codeInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  codeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    fontFamily: "monospace",
    textAlign: "center",
    backgroundColor: "#f8f8f8",
  },
  generateCodeButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#1976d2",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  helperText: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
    fontStyle: "italic",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  licenseInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  licenseText: {
    fontSize: 12,
    color: "#4caf50",
    marginLeft: 4,
    fontWeight: "500",
  },
  licenseRequestBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff3e0",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: "#ffcc02",
  },
  licenseRequestText: {
    fontSize: 12,
    color: "#ff9800",
    marginLeft: 4,
    marginRight: 4,
    fontWeight: "500",
    flex: 1,
  },
  licenseExpiredBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffebee",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: "#f44336",
  },
  licenseExpiredText: {
    fontSize: 12,
    color: "#f44336",
    marginLeft: 4,
    fontWeight: "500",
    flex: 1,
  },
});

export default TeamManagementScreen;
