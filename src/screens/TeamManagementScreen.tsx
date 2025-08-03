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
import { Team, License } from "../types";
import LicenseManager from "../components/LicenseManager";
import { useAuth } from "../contexts/AuthContext";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { db } from "../services/firebase";

const TeamManagementScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamColor, setTeamColor] = useState("#1976d2");
  const [teamCode, setTeamCode] = useState("");
  const [licenseCode, setLicenseCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [licenseManagerVisible, setLicenseManagerVisible] = useState(false);
  const [selectedTeamForLicense, setSelectedTeamForLicense] =
    useState<Team | null>(null);

  const predefinedColors = [
    "#1976d2", // Blue
    "#388e3c", // Green
    "#f57c00", // Orange
    "#d32f2f", // Red
    "#7b1fa2", // Purple
    "#303f9f", // Indigo
    "#c2185b", // Pink
    "#00796b", // Teal
    "#5d4037", // Brown
    "#616161", // Grey
    "#0097a7", // Cyan
    "#afb42b", // Lime
    "#e64a19", // Deep Orange
    "#455a64", // Blue Grey
  ];

  const isMasterAdmin = (): boolean => {
    return Boolean(user && user.isMasterAdmin === true);
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

  const generateTeamCode = (): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleCreateTeam = () => {
    setEditingTeam(null);
    setTeamName("");
    setTeamColor("#1976d2");
    setTeamCode(generateTeamCode());
    setModalVisible(true);
  };

  const handleEditTeam = (team: Team) => {
    setEditingTeam(team);
    setTeamName(team.name);
    setTeamColor(team.color || "#1976d2");
    setTeamCode(team.code || team.licenceCode || generateTeamCode());
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
        await addDoc(collection(db, "teams"), {
          name: teamName.trim(),
          color: teamColor,
          code: teamCode.trim().toUpperCase(),
          members: [],
          createdAt: new Date(),
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

  const activateLicense = async (team: Team, code: string) => {
    if (!code.trim()) {
      Alert.alert("Virhe", "Syötä lisenssikoodi");
      return;
    }

    try {
      // Etsi lisenssi koodilla
      const licensesQuery = query(
        collection(db, "licenses"),
        where("code", "==", code.trim().toUpperCase()),
        where("isUsed", "==", false)
      );

      const licensesSnapshot = await getDocs(licensesQuery);

      if (licensesSnapshot.empty) {
        Alert.alert("Virhe", "Lisenssiä ei löytynyt tai se on jo käytetty");
        return;
      }

      const licenseDoc = licensesSnapshot.docs[0];
      const license = { id: licenseDoc.id, ...licenseDoc.data() } as License;

      // Aktivoi lisenssi
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + license.duration * 24 * 60 * 60 * 1000
      );

      // Päivitä joukkue
      const teamRef = doc(db, "teams", team.id);
      await updateDoc(teamRef, {
        licenceCode: license.code,
        licenseStatus: "active",
        licenseExpiresAt: expiresAt,
        licenseActivatedAt: now,
        licenseDuration: license.duration,
      });

      // Merkitse lisenssi käytetyksi
      const licenseRef = doc(db, "licenses", license.id);
      await updateDoc(licenseRef, {
        isUsed: true,
        usedByTeamId: team.id,
        usedAt: now,
      });

      Alert.alert(
        "Lisenssi aktivoitu",
        `Lisenssi on aktivoitu joukkueelle ${
          team.name
        }. Voimassa ${expiresAt.toLocaleDateString("fi-FI")} asti.`,
        [{ text: "OK", onPress: () => setLicenseManagerVisible(false) }]
      );
    } catch (error) {
      console.error("Virhe lisenssin aktivoinnissa:", error);
      Alert.alert("Virhe", "Lisenssin aktivointi epäonnistui");
    }
  };

  const renderTeamItem = ({ item: team }: { item: Team }) => (
    <TouchableOpacity
      style={styles.teamItem}
      activeOpacity={0.85}
      onPress={() => {
        setSelectedTeamForLicense(team);
        setLicenseManagerVisible(true);
      }}
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
            Koodi: {team.code || team.licenceCode || "Ei koodia"}
          </Text>
          {/* License status */}
          {team.licenseStatus === "active" && team.licenseExpiresAt ? (
            <View style={styles.licenseInfoContainer}>
              <View style={styles.licenseInfo}>
                <Ionicons name="checkmark-circle" size={16} color="#4caf50" />
                <Text style={styles.licenseText}>
                  Lisenssi: {team.licenceCode}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.licenseRequestBanner}>
              <Ionicons name="alert-circle" size={16} color="#ff9800" />
              <Text style={styles.licenseRequestText}>
                Ei lisenssiä - pyydä tai syötä koodi
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#ff9800" />
            </View>
          )}
          <Text style={styles.memberCount}>
            Jäseniä: {team.members?.length || 0}
          </Text>
        </View>
      </View>
      <View style={styles.teamActions}>
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
        <TouchableOpacity
          style={styles.createButton}
          onPress={handleCreateTeam}
        >
          <Ionicons name="add" size={24} color="#fff" />
          <Text style={styles.createButtonText}>Luo uusi joukkue</Text>
        </TouchableOpacity>

        {/* MasterAdmin banner */}
        {isMasterAdmin() && (
          <TouchableOpacity
            style={styles.masterAdminBanner}
            onPress={() => {
              setSelectedTeamForLicense(null); // Null tarkoittaa yleistä hallintaa
              setLicenseManagerVisible(true);
            }}
          >
            <View style={styles.bannerContent}>
              <Ionicons name="shield-checkmark" size={24} color="#fff" />
              <View style={styles.bannerText}>
                <Text style={styles.bannerTitle}>
                  MasterAdmin - Lisenssinhallinta
                </Text>
                <Text style={styles.bannerSubtitle}>
                  Luo lisenssejä ja käsittele joukkueiden pyyntöjä
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </View>
          </TouchableOpacity>
        )}

        <Text style={styles.sectionTitle}>
          Joukkueita yhteensä: {teams.length}
        </Text>

        <FlatList
          data={teams}
          keyExtractor={(item) => item.id}
          renderItem={renderTeamItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>Ei joukkueita</Text>
              <Text style={styles.emptySubtext}>
                Luo ensimmäinen joukkue painamalla yllä olevaa painiketta
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
  createButton: {
    backgroundColor: "#4CAF50",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 20,
  },
  createButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
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
  licenseButton: {
    padding: 8,
    marginRight: 8,
  },
  licenseManagementBanner: {
    backgroundColor: "#1976d2",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  masterAdminBanner: {
    backgroundColor: "#1976d2", // Purple for MasterAdmin
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  bannerText: {
    flex: 1,
    marginLeft: 12,
  },
  bannerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  bannerSubtitle: {
    color: "#e3f2fd",
    fontSize: 14,
    marginTop: 2,
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
  noLicenseText: {
    fontSize: 12,
    color: "#ff9800",
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
  licenseInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  licenseMgmtButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e8f5e8",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#4caf50",
  },
  licenseMgmtText: {
    fontSize: 11,
    color: "#4caf50",
    marginLeft: 4,
    fontWeight: "600",
  },
});

export default TeamManagementScreen;
