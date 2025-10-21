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
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { Team, License, User, TeamCreationRequest } from "../types";
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
  getDoc,
  setDoc,
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

  // Team request states
  const [teamRequests, setTeamRequests] = useState<TeamCreationRequest[]>([]);
  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] =
    useState<TeamCreationRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [rejectModalVisible, setRejectModalVisible] = useState<boolean>(false);

  // Get current user
  const { user: currentUser } = useAuth();

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

  const isUserTeamAdmin = (teamId: string): boolean => {
    if (isMasterAdmin()) return true; // Master admin has access to everything
    if (!currentUser?.uid) return false;

    // Check if user is admin via team's adminIds array
    const team = teams.find((t) => t.id === teamId);
    const isAdmin =
      team?.adminIds?.includes(currentUser.uid) ||
      team?.adminId === currentUser.uid;

    // Debug logging
    console.log("🔍 Admin check for teamId:", teamId);
    console.log("👤 Current user:", currentUser?.uid, currentUser?.email);
    console.log("🏒 Team found:", team?.name);
    console.log("👑 Team adminIds:", team?.adminIds);
    console.log("👑 Team adminId (legacy):", team?.adminId);
    console.log("✅ Is admin:", isAdmin);

    return Boolean(isAdmin);
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
  const adminTeams = teams.filter((team) => {
    const isAdmin = isUserTeamAdmin(team.id);
    console.log(`🔍 Team ${team.name} (${team.id}): isAdmin = ${isAdmin}`);
    return isAdmin;
  });

  console.log("📋 Total teams:", teams.length);
  console.log("👑 Admin teams:", adminTeams.length);
  console.log("🔧 Is master admin:", isMasterAdmin()); // Load team creation requests (only for master admin)
  useEffect(() => {
    if (!user?.isMasterAdmin) return;

    const requestsQuery = query(
      collection(db, "teamCreationRequests"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
      const requestsData: TeamCreationRequest[] = [];
      snapshot.forEach((doc) => {
        requestsData.push({ id: doc.id, ...doc.data() } as TeamCreationRequest);
      });
      setTeamRequests(requestsData);
    });

    return () => unsubscribe();
  }, [user]);

  const generateTeamCode = (): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleTeamPress = async (team: Team) => {
    console.log("🏈 TeamManagement: Opening license manager for team:", {
      id: team.id,
      name: team.name,
      adminIds: team.adminIds,
      adminId: team.adminId, // Legacy support
      members: team.members,
    });
    setSelectedTeamForLicense(team);
    setLicenseManagerVisible(true);
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
        const teamRef = await addDoc(collection(db, "teams"), {
          name: teamName.trim(),
          color: teamColor,
          code: teamCode.trim().toUpperCase(),
          adminIds: [user?.uid || ""], // New array format
          adminId: user?.uid || "", // Legacy support
          members: [user?.uid || ""],
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

  // Team request management functions
  const handleTeamRequest = (request: TeamCreationRequest) => {
    const message = `Joukkue: ${request.teamName}\nPyytäjä: ${
      request.userName
    } (${request.userEmail})\nKuvaus: ${
      request.description || "Ei kuvausta"
    }\nYhteystiedot: ${request.contactInfo || "Ei yhteystietoja"}\nYritys: ${
      request.businessInfo || "Ei yritystietoja"
    }\nArvioitu pelaajamäärä: ${
      request.estimatedPlayerCount || "Ei arvioitu"
    }\nTila: ${request.status}\nPyydetty: ${new Date(
      request.createdAt
    ).toLocaleDateString("fi-FI")}`;

    if (request.status === "pending") {
      Alert.alert(`Joukkuepyyntö: ${request.teamName}`, message, [
        { text: "Peruuta", style: "cancel" },
        {
          text: "Hylkää",
          style: "destructive",
          onPress: () => showRejectDialog(request),
        },
        {
          text: "Hyväksy",
          onPress: () => approveRequest(request),
        },
      ]);
    } else {
      Alert.alert(`Joukkuepyyntö: ${request.teamName}`, message);
    }
  };

  const showRejectDialog = (request: TeamCreationRequest) => {
    Alert.prompt(
      "Hylkää pyyntö",
      "Anna hylkäyksen syy:",
      (reason) => {
        if (reason && reason.trim()) {
          rejectRequest(request, reason.trim());
        }
      },
      "plain-text",
      "",
      "default"
    );
  };

  const approveRequest = async (request: TeamCreationRequest) => {
    try {
      // Create the new team
      const newTeamData: Omit<Team, "id"> = {
        name: request.teamName,
        description: request.description || "",
        color:
          predefinedColors[Math.floor(Math.random() * predefinedColors.length)],
        adminIds: [request.userId],
        members: [request.userId],
        licenceCode: generateTeamCode(),
        licenseStatus: "active",
        licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        totalPoints: 0,
        fieldPlayers: [],
        goalkeepers: [],
        players: [],
      };

      const teamRef = await addDoc(collection(db, "teams"), newTeamData);

      // Update the request status
      await updateDoc(doc(db, "teamCreationRequests", request.id), {
        status: "approved",
        reviewedAt: new Date(),
        reviewedBy: user?.uid,
        approvedTeamId: teamRef.id,
      });

      Alert.alert("Onnistui", `Joukkue "${request.teamName}" on luotu!`);
    } catch (error) {
      console.error("Error approving request:", error);
      Alert.alert("Virhe", "Pyynnön hyväksyminen epäonnistui");
    }
  };

  const rejectRequest = async (
    request: TeamCreationRequest,
    reason: string
  ) => {
    try {
      await updateDoc(doc(db, "teamCreationRequests", request.id), {
        status: "rejected",
        reviewedAt: new Date(),
        reviewedBy: user?.uid,
        rejectionReason: reason,
      });

      Alert.alert("Onnistui", "Pyyntö on hylätty");
    } catch (error) {
      console.error("Error rejecting request:", error);
      Alert.alert("Virhe", "Pyynnön hylkääminen epäonnistui");
    }
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

  // Team request helper functions
  const handleApproveRequest = async (request: TeamCreationRequest) => {
    Alert.alert(
      "Hyväksy pyyntö",
      `Haluatko hyväksyä joukkueen "${request.teamName}" luomisen käyttäjälle ${request.userName}?`,
      [
        { text: "Peruuta", style: "cancel" },
        {
          text: "Hyväksy",
          onPress: () => processApproval(request),
        },
      ]
    );
  };

  const processApproval = async (request: TeamCreationRequest) => {
    try {
      // Create the new team
      const newTeamData: Omit<Team, "id"> = {
        name: request.teamName,
        description: request.description || "",
        color: generateRandomColor(),
        adminIds: [request.userId],
        members: [request.userId],
        licenceCode: generateLicenseCode(),
        licenseStatus: "active",
        licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        createdAt: new Date(),
        totalPoints: 0,
        fieldPlayers: [],
        goalkeepers: [],
        players: [],
      };

      const teamRef = await addDoc(collection(db, "teams"), newTeamData);

      // Update the request status
      await updateDoc(doc(db, "teamCreationRequests", request.id), {
        status: "approved",
        reviewedAt: new Date(),
        reviewedBy: user?.uid,
        approvedTeamId: teamRef.id,
      });

      Alert.alert("Onnistui", `Joukkue "${request.teamName}" on luotu!`);
    } catch (error) {
      console.error("Error approving request:", error);
      Alert.alert("Virhe", "Pyynnön hyväksyminen epäonnistui");
    }
  };

  const generateRandomColor = () => {
    const colors = [
      "#1976d2",
      "#388e3c",
      "#f57c00",
      "#d32f2f",
      "#7b1fa2",
      "#303f9f",
      "#0097a7",
      "#689f38",
      "#f9a825",
      "#e64a19",
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const generateLicenseCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "FD2024-";
    for (let i = 0; i < 7; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Helper functions for team requests
  const formatDate = (timestamp: any): string => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("fi-FI", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "pending":
        return "#FF9800";
      case "approved":
        return "#4CAF50";
      case "rejected":
        return "#f44336";
      default:
        return "#999";
    }
  };

  const getStatusText = (status: string): string => {
    switch (status) {
      case "pending":
        return "Odottaa";
      case "approved":
        return "Hyväksytty";
      case "rejected":
        return "Hylätty";
      default:
        return status;
    }
  };

  const renderTeamItem = ({ item: team }: { item: Team }) => (
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
                  ? "Luo ensimmäinen joukkue painamalla yllä olevaa painiketta"
                  : "Et ole minkään joukkueen admin. Luo uusi joukkue tai pyydä admin-oikeuksia."}
              </Text>
            </View>
          }
        />

        {/* Master Admin Section */}
        {user?.isMasterAdmin && (
          <View style={styles.masterAdminSection}>
            <Text style={styles.masterAdminTitle}>Master Admin -hallinta</Text>

            {/* License Management */}
            <TouchableOpacity
              style={styles.adminControlButton}
              onPress={() => {
                setSelectedTeamForLicense(null);
                setLicenseManagerVisible(true);
              }}
            >
              <View style={styles.adminButtonContent}>
                <Ionicons name="shield-checkmark" size={24} color="#1976d2" />
                <View style={styles.adminButtonText}>
                  <Text style={styles.adminButtonTitle}>Lisenssinhallinta</Text>
                  <Text style={styles.adminButtonSubtitle}>
                    Luo ja hallinnoi lisenssejä
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#666" />
              </View>
            </TouchableOpacity>

            {/* Team Creation Requests */}
            <TouchableOpacity
              style={styles.adminControlButton}
              onPress={() => {
                console.log("🔍 Team requests button pressed");
                console.log("📋 Current requests:", teamRequests);
                if (teamRequests.length === 0) {
                  Alert.alert(
                    "Ei pyyntöjä",
                    "Joukkueiden luomispyyntöjä ei ole vielä lähetetty."
                  );
                  return;
                }

                // Show simple list alert for now
                const requestsList = teamRequests
                  .map(
                    (req, index) =>
                      `${index + 1}. ${req.teamName} (${req.userName}) - ${
                        req.status === "pending"
                          ? "Odottaa"
                          : req.status === "approved"
                          ? "Hyväksytty"
                          : "Hylätty"
                      }`
                  )
                  .join("\n\n");

                Alert.alert(
                  `Joukkuepyynnöt (${teamRequests.length})`,
                  requestsList,
                  [
                    { text: "Sulje", style: "cancel" },
                    ...(teamRequests.filter((r) => r.status === "pending")
                      .length > 0
                      ? [
                          {
                            text: "Hallitse pyyntöjä",
                            onPress: () => {
                              setRequestModalVisible(true);
                            },
                          },
                        ]
                      : []),
                  ]
                );
              }}
            >
              <View style={styles.adminButtonContent}>
                <Ionicons name="document-text" size={24} color="#ff9800" />
                <View style={styles.adminButtonText}>
                  <Text style={styles.adminButtonTitle}>
                    Joukkuepyynnöt
                    {teamRequests.filter((r) => r.status === "pending").length >
                      0 && (
                      <Text style={styles.pendingBadge}>
                        {" "}
                        (
                        {
                          teamRequests.filter((r) => r.status === "pending")
                            .length
                        }
                        )
                      </Text>
                    )}
                  </Text>
                  <Text style={styles.adminButtonSubtitle}>
                    Käsittele käyttäjien joukkueluontipyyntöjä
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#666" />
              </View>
            </TouchableOpacity>
          </View>
        )}
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

      {/* Team Request Management Modal */}
      <Modal
        visible={requestModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setRequestModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalContent, { height: "85%", maxHeight: "85%" }]}
          >
            <View style={styles.modalHeader}>
              {selectedRequest ? (
                <TouchableOpacity
                  style={styles.requestBackButton}
                  onPress={() => {
                    setSelectedRequest(null);
                    setRejectionReason("");
                  }}
                >
                  <Ionicons name="arrow-back" size={24} color="#666" />
                </TouchableOpacity>
              ) : (
                <View style={styles.placeholder} />
              )}

              <Text style={styles.modalTitle}>
                {selectedRequest ? "Pyynnön tiedot" : "Joukkuepyynnöt"}
              </Text>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setRequestModalVisible(false);
                  setSelectedRequest(null);
                  setRejectionReason("");
                }}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {selectedRequest ? (
              // Show request details
              <ScrollView
                style={styles.requestDetailsContainer}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.requestDetailTitle}>
                  {selectedRequest.teamName}
                </Text>

                <View style={styles.requestDetailSection}>
                  <Text style={styles.requestSectionTitle}>
                    Pyytäjän tiedot
                  </Text>
                  <Text style={styles.requestDetailItem}>
                    <Text style={styles.requestLabel}>Nimi: </Text>
                    {selectedRequest.userName}
                  </Text>
                  <Text style={styles.requestDetailItem}>
                    <Text style={styles.requestLabel}>Sähköposti: </Text>
                    {selectedRequest.userEmail}
                  </Text>
                  {selectedRequest.contactInfo && (
                    <Text style={styles.requestDetailItem}>
                      <Text style={styles.requestLabel}>Yhteystiedot: </Text>
                      {selectedRequest.contactInfo}
                    </Text>
                  )}
                  {selectedRequest.businessInfo && (
                    <Text style={styles.requestDetailItem}>
                      <Text style={styles.requestLabel}>Yritys: </Text>
                      {selectedRequest.businessInfo}
                    </Text>
                  )}
                </View>

                <View style={styles.requestDetailSection}>
                  <Text style={styles.requestSectionTitle}>
                    Joukkueen tiedot
                  </Text>
                  {selectedRequest.description && (
                    <Text style={styles.requestDetailItem}>
                      <Text style={styles.requestLabel}>Kuvaus: </Text>
                      {selectedRequest.description}
                    </Text>
                  )}
                  {selectedRequest.estimatedPlayerCount && (
                    <Text style={styles.requestDetailItem}>
                      <Text style={styles.requestLabel}>
                        Arvioitu pelaajamäärä:{" "}
                      </Text>
                      {selectedRequest.estimatedPlayerCount}
                    </Text>
                  )}
                </View>

                <View style={styles.requestDetailSection}>
                  <Text style={styles.requestSectionTitle}>Pyynnön tila</Text>
                  <View style={styles.statusRow}>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: getStatusColor(
                            selectedRequest.status
                          ),
                        },
                      ]}
                    >
                      <Text style={styles.statusBadgeText}>
                        {getStatusText(selectedRequest.status)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.requestDetailItem}>
                    <Text style={styles.requestLabel}>Pyydetty: </Text>
                    {formatDate(selectedRequest.createdAt)}
                  </Text>
                  {selectedRequest.reviewedAt && (
                    <Text style={styles.requestDetailItem}>
                      <Text style={styles.requestLabel}>Käsitelty: </Text>
                      {formatDate(selectedRequest.reviewedAt)}
                    </Text>
                  )}
                  {selectedRequest.rejectionReason && (
                    <Text style={styles.requestDetailItem}>
                      <Text style={styles.requestLabel}>Hylkäyksen syy: </Text>
                      {selectedRequest.rejectionReason}
                    </Text>
                  )}
                </View>

                {selectedRequest.status === "pending" && (
                  <View style={styles.actionButtonsContainer}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.approveButton]}
                      onPress={() => approveRequest(selectedRequest)}
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="white"
                      />
                      <Text style={styles.actionButtonText}>Hyväksy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.rejectButton]}
                      onPress={() => setRejectModalVisible(true)}
                    >
                      <Ionicons name="close-circle" size={20} color="white" />
                      <Text style={styles.actionButtonText}>Hylkää</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            ) : (
              // Show requests list
              <FlatList
                data={teamRequests}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.requestListItem}
                    onPress={() => setSelectedRequest(item)}
                  >
                    <View style={styles.requestListHeader}>
                      <Text style={styles.requestListTitle}>
                        {item.teamName}
                      </Text>
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: getStatusColor(item.status) },
                        ]}
                      >
                        <Text style={styles.statusBadgeText}>
                          {getStatusText(item.status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.requestListSubtitle}>
                      Pyytäjä: {item.userName}
                    </Text>
                    <Text style={styles.requestListDate}>
                      {formatDate(item.createdAt)}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyRequestsContainer}>
                    <Ionicons
                      name="document-text-outline"
                      size={48}
                      color="#ccc"
                    />
                    <Text style={styles.emptyRequestsText}>
                      Ei joukkuepyyntöjä
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Rejection Reason Modal */}
      <Modal
        visible={rejectModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Hylkää pyyntö</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setRejectModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <Text style={styles.rejectReasonLabel}>Anna hylkäyksen syy:</Text>
            <TextInput
              style={styles.rejectReasonInput}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              placeholder="Esim. Puutteelliset tiedot, maksuvaikeudet..."
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[
                styles.rejectConfirmButton,
                !rejectionReason.trim() && styles.disabledButton,
              ]}
              onPress={() => {
                if (selectedRequest && rejectionReason.trim()) {
                  rejectRequest(selectedRequest, rejectionReason.trim());
                  setRejectModalVisible(false);
                  setRejectionReason("");
                }
              }}
              disabled={!rejectionReason.trim()}
            >
              <Text style={styles.rejectConfirmText}>Hylkää pyyntö</Text>
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
  // Master Admin styles
  masterAdminSection: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  masterAdminTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 16,
  },
  adminControlButton: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  adminButtonContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  adminButtonText: {
    flex: 1,
    marginLeft: 12,
  },
  adminButtonTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  adminButtonSubtitle: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  pendingBadge: {
    color: "#ff9800",
    fontWeight: "700",
  },
  // Request Management Modal Styles
  requestBackButton: {
    padding: 8,
    width: 40,
  },
  requestDetailsContainer: {
    flex: 1,
    padding: 16,
  },
  requestDetailTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 20,
  },
  requestDetailSection: {
    marginBottom: 20,
  },
  requestSectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  requestDetailItem: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  requestLabel: {
    fontWeight: "600",
    color: "#333",
  },
  statusRow: {
    marginVertical: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  statusBadgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  actionButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flex: 0.4,
    justifyContent: "center",
  },
  approveButton: {
    backgroundColor: "#4CAF50",
  },
  rejectButton: {
    backgroundColor: "#f44336",
  },
  actionButtonText: {
    color: "white",
    fontWeight: "600",
    marginLeft: 8,
  },
  // Request List Styles
  requestListItem: {
    backgroundColor: "white",
    padding: 16,
    marginVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
  },
  requestListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  requestListTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    flex: 1,
  },
  requestListSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  requestListDate: {
    fontSize: 12,
    color: "#999",
  },
  emptyRequestsContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyRequestsText: {
    fontSize: 16,
    color: "#999",
    marginTop: 16,
  },
  // Rejection Modal Styles
  rejectReasonLabel: {
    fontSize: 16,
    color: "#333",
    marginBottom: 8,
  },
  rejectReasonInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    marginBottom: 16,
    fontSize: 14,
    color: "#333",
  },
  rejectConfirmButton: {
    backgroundColor: "#f44336",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  rejectConfirmText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  disabledButton: {
    backgroundColor: "#ccc",
  },
});

export default TeamManagementScreen;
