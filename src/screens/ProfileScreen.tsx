import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { collection, addDoc, doc, updateDoc } from "firebase/firestore";
import UserProfileEditor from "../components/UserProfileEditor";
import AdminMenuButton from "../components/AdminMenuButton";
import BiometricAuthSetup from "../components/BiometricAuthSetup";
import { useAuth } from "../contexts/AuthContext";
import { useApp, getUserTeams } from "../contexts/AppContext";
import { RootStackParamList, TeamCreationRequest } from "../types";
import { db } from "../services/firebase";

type ProfileScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "Profile"
>;

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { user, signOut, changePassword, deleteAccount } = useAuth();
  const { players, teams, refreshData, isUserSoleAdminInAnyTeam } = useApp();

  // Password change state
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [isBiometricModalVisible, setIsBiometricModalVisible] = useState(false);
  const [isTeamRequestModalVisible, setIsTeamRequestModalVisible] =
    useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);

  // Team creation request state
  const [teamRequestLoading, setTeamRequestLoading] = useState(false);
  const [requestedTeamName, setRequestedTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPhone, setAdminPhone] = useState("");

  // Hae pelaaja käyttäjän sähköpostilla tai ID:llä
  console.log("ProfileScreen: user =", user);
  console.log("ProfileScreen: players count =", players.length);
  console.log(
    "ProfileScreen: players =",
    players.map((p) => ({ id: p.id, email: p.email, name: p.name }))
  );

  const player = players.find(
    (p) => p.email === user?.email || p.id === user?.uid
  );

  // Jos löydettiin pelaaja mutta nimi puuttuu, yritä löytää toinen dokumentti samalla emaililla
  let enrichedPlayer = player;
  if (player && !player.name && user?.email) {
    const playerWithName = players.find(
      (p) => p.email === user.email && p.name && p.id !== player.id
    );
    if (playerWithName) {
      console.log(
        "ProfileScreen: Found player with name, merging data:",
        playerWithName
      );
      enrichedPlayer = {
        ...player,
        name: playerWithName.name,
        phone: playerWithName.phone || player.phone,
        image: playerWithName.image || player.image,
        // Säilytä alkuperäisen pelaajan teamIds ja muut Firebase Auth -dokumentin tiedot
      };
    }
  }

  console.log("ProfileScreen: found player =", player);
  console.log("ProfileScreen: enriched player =", enrichedPlayer);

  // Check if user is already in any teams
  const userTeams = getUserTeams(user, teams, players);
  const hasTeamMembership = userTeams.length > 0;

  const handleProfileSave = async () => {
    // Refresh data after profile changes
    await refreshData();
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) {
      Alert.alert("Virhe", "Käyttäjätietoja ei löytynyt");
      return;
    }

    // Tarkista onko käyttäjä ainoa admin jossain joukkueessa
    const isSoleAdmin = isUserSoleAdminInAnyTeam(user, teams);

    if (isSoleAdmin) {
      Alert.alert(
        "Tilin poisto estetty",
        "Et voi poistaa tiliäsi, koska olet ainoa admin ainakin yhdessä joukkueessa. Lisää ensin toinen admin joukkueeseen tai siirry joukkueen hallinta oikeudet toiselle käyttäjälle.",
        [{ text: "Ymmärrän", style: "default" }]
      );
      return;
    }

    // Vahvistus dialogi
    Alert.alert(
      "Poista tili",
      "Haluatko varmasti poistaa tilisi? Tämä toiminto on peruuttamaton ja kaikki tietosi poistetaan pysyvästi.",
      [
        {
          text: "Peruuta",
          style: "cancel",
        },
        {
          text: "Poista tili",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount();
              Alert.alert(
                "Tili poistettu",
                "Tilisi on poistettu onnistuneesti."
              );
            } catch (error: any) {
              console.error("Account deletion error:", error);

              // Show user-friendly error message with guidance
              if (error.message.includes("kirjautua uudelleen")) {
                Alert.alert("Uudelleenkirjautuminen vaaditaan", error.message, [
                  { text: "OK", style: "default" },
                  {
                    text: "Kirjaudu ulos",
                    style: "default",
                    onPress: () => handleSignOut(),
                  },
                ]);
              } else {
                Alert.alert(
                  "Virhe",
                  error.message || "Tilin poisto epäonnistui"
                );
              }
            }
          },
        },
      ]
    );
  };

  // Pre-fill admin info when opening team creation modal
  const openTeamCreationModal = () => {
    // Use enrichedPlayer data first (from Firestore), fallback to user (from Auth)
    setAdminName(enrichedPlayer?.name || user?.name || "");
    setAdminEmail(enrichedPlayer?.email || user?.email || "");
    setAdminPhone(enrichedPlayer?.phone || user?.phoneNumber || "");
    setIsTeamRequestModalVisible(true);
  };

  const handlePasswordChange = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert("Virhe", "Täytä kaikki kentät");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Virhe", "Salasanat eivät täsmää");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Virhe", "Salasanan tulee olla vähintään 6 merkkiä pitkä");
      return;
    }

    setPasswordChangeLoading(true);
    try {
      await changePassword(newPassword);
      Alert.alert("Onnistui", "Salasana vaihdettu onnistuneesti");
      setIsPasswordModalVisible(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      console.error("Password change error:", error);
      Alert.alert("Virhe", error.message || "Salasanan vaihto epäonnistui");
    } finally {
      setPasswordChangeLoading(false);
    }
  };

  const handleTeamCreationRequest = async () => {
    if (!requestedTeamName.trim()) {
      Alert.alert("Virhe", "Joukkueen nimi on pakollinen");
      return;
    }

    if (!adminName.trim()) {
      Alert.alert("Virhe", "Admin-nimi on pakollinen");
      return;
    }

    if (!adminEmail.trim()) {
      Alert.alert("Virhe", "Admin-sähköposti on pakollinen");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(adminEmail.trim())) {
      Alert.alert("Virhe", "Syötä kelvollinen sähköpostiosoite");
      return;
    }

    if (!adminPhone.trim()) {
      Alert.alert("Virhe", "Puhelinnumero on pakollinen");
      return;
    }

    if (!user) {
      Alert.alert("Virhe", "Käyttäjätietoja ei löytynyt");
      return;
    }

    setTeamRequestLoading(true);
    try {
      // Update user profile with admin info
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        name: adminName.trim(),
        phoneNumber: adminPhone.trim() || "",
      });

      console.log("User profile updated with admin info");
      // Generate team code
      const generateTeamCode = (): string => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let code = "";
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
      };

      const teamCode = generateTeamCode();

      // Create the new team WITHOUT license (user will request it from Team Management)
      const newTeam = {
        name: requestedTeamName.trim(),
        description: teamDescription.trim() || "",
        adminIds: [user.uid],
        members: [user.uid],
        players: [],
        totalPoints: 0,
        code: teamCode,
        color: "#1976d2", // Default color
        licenseStatus: "inactive" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const teamRef = await addDoc(collection(db, "teams"), newTeam);

      Alert.alert(
        "Joukkue luotu! 🎉",
        `Joukkue "${requestedTeamName.trim()}" on luotu onnistuneesti!\n\n` +
          `🎫 Liittymiskoodi: ${teamCode}\n\n` +
          `Sinusta tuli joukkueen admin. Voit nyt:\n` +
          `• Hallita pelaajia\n` +
          `• Pyytää lisenssiä joukkuehallinnas ta\n` +
          `• Luoda tapahtumia kun lisenssi on aktiivinen`,
        [
          {
            text: "OK",
            onPress: () => {
              setIsTeamRequestModalVisible(false);
              // Clear form
              setRequestedTeamName("");
              setTeamDescription("");
              setAdminName("");
              setAdminEmail("");
              setAdminPhone("");
              // Navigate to Team Management
              navigation.navigate("TeamManagement" as never);
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error creating team:", error);
      Alert.alert("Virhe", "Joukkueen luominen epäonnistui. Yritä uudelleen.");
    } finally {
      setTeamRequestLoading(false);
    }
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
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profiili</Text>
        <AdminMenuButton onNavigate={handleAdminNavigation} />
      </View>
      <ScrollView style={styles.content}>
        {/* User Info Card */}
        {(user || enrichedPlayer) && (
          <View style={styles.userInfoCard}>
            <Text style={styles.userInfoTitle}>Yhteystiedot</Text>
            {(enrichedPlayer?.name || user?.name) && (
              <View style={styles.userInfoRow}>
                <Ionicons name="person" size={18} color="#666" />
                <Text style={styles.userInfoText}>
                  {enrichedPlayer?.name || user?.name}
                </Text>
              </View>
            )}
            <View style={styles.userInfoRow}>
              <Ionicons name="mail" size={18} color="#666" />
              <Text style={styles.userInfoText}>
                {enrichedPlayer?.email || user?.email}
              </Text>
            </View>
            {(enrichedPlayer?.phone || user?.phoneNumber) && (
              <View style={styles.userInfoRow}>
                <Ionicons name="call" size={18} color="#666" />
                <Text style={styles.userInfoText}>
                  {enrichedPlayer?.phone || user?.phoneNumber}
                </Text>
              </View>
            )}
            {(!enrichedPlayer?.name && !user?.name) ||
            (!enrichedPlayer?.phone && !user?.phoneNumber) ? (
              <View style={styles.infoNotice}>
                <Ionicons name="information-circle" size={18} color="#FF9800" />
                <Text style={styles.infoNoticeText}>
                  Täydennä tietosi luodessasi uutta joukkuetta
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {enrichedPlayer ? (
          <UserProfileEditor
            player={enrichedPlayer}
            teams={teams}
            onSave={handleProfileSave}
          />
        ) : (
          <View style={styles.noPlayerContainer}>
            <Text style={styles.noPlayerText}>
              Käyttäjätietoja ei löytynyt.
              {user
                ? ` (Email: ${user.email}, ID: ${user.id})`
                : " (Ei kirjauduttu sisään)"}
            </Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={() => refreshData()}
            >
              <Text style={styles.refreshButtonText}>Päivitä tiedot</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Team creation request button - available for all users */}
        <TouchableOpacity
          style={styles.createTeamButton}
          onPress={openTeamCreationModal}
        >
          <Ionicons
            name="people-outline"
            size={20}
            color="white"
            style={styles.buttonIcon}
          />
          <Text style={styles.createTeamText}>Luo uusi joukkue</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.changePasswordButton}
          onPress={() => setIsPasswordModalVisible(true)}
        >
          <Ionicons
            name="lock-closed-outline"
            size={20}
            color="white"
            style={styles.buttonIcon}
          />
          <Text style={styles.changePasswordText}>Vaihda salasana</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.biometricButton}
          onPress={() => setIsBiometricModalVisible(true)}
        >
          <Ionicons
            name="finger-print"
            size={20}
            color="white"
            style={styles.buttonIcon}
          />
          <Text style={styles.biometricButtonText}>Turvallisuusasetukset</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Kirjaudu ulos</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteAccountButton}
          onPress={handleDeleteAccount}
        >
          <Ionicons
            name="trash-outline"
            size={20}
            color="white"
            style={styles.buttonIcon}
          />
          <Text style={styles.deleteAccountText}>Poista tili</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Team Creation Request Modal */}
      <Modal
        visible={isTeamRequestModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsTeamRequestModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Luo uusi joukkue</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setIsTeamRequestModalVisible(false);
                  // Clear form
                  setRequestedTeamName("");
                  setTeamDescription("");
                  setAdminName("");
                  setAdminEmail("");
                  setAdminPhone("");
                }}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formScrollView}>
              <Text style={styles.modalDescription}>
                Luo uusi joukkue ja sinusta tulee automaattisesti sen admin.
                Voit pyytää lisenssiä joukkuehallinnan kautta.
              </Text>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Joukkueen nimi *</Text>
                <TextInput
                  style={styles.textInput}
                  value={requestedTeamName}
                  onChangeText={setRequestedTeamName}
                  placeholder="Esim. HC Kiekkoilijat"
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Kuvaus (valinnainen)</Text>
                <TextInput
                  style={[styles.textInput, styles.multilineInput]}
                  value={teamDescription}
                  onChangeText={setTeamDescription}
                  placeholder="Kuvaile joukkuettasi lyhyesti..."
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              <Text style={styles.sectionTitle}>Admin-tiedot</Text>
              <Text style={styles.sectionDescription}>
                Nämä tiedot näkyvät MasterAdminille lisenssipyynnössä
              </Text>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Nimi *</Text>
                <TextInput
                  style={styles.textInput}
                  value={adminName}
                  onChangeText={setAdminName}
                  placeholder="Esim. Matti Meikäläinen"
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Sähköposti *</Text>
                <TextInput
                  style={styles.textInput}
                  value={adminEmail}
                  onChangeText={setAdminEmail}
                  placeholder="esim. matti@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Puhelinnumero *</Text>
                <TextInput
                  style={styles.textInput}
                  value={adminPhone}
                  onChangeText={setAdminPhone}
                  placeholder="Esim. +358 40 123 4567"
                  keyboardType="phone-pad"
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.submitRequestButton,
                  teamRequestLoading && styles.disabledButton,
                ]}
                onPress={handleTeamCreationRequest}
                disabled={teamRequestLoading}
              >
                <Ionicons
                  name="add-circle"
                  size={20}
                  color="white"
                  style={styles.buttonIcon}
                />
                <Text style={styles.submitRequestText}>
                  {teamRequestLoading ? "Luodaan..." : "Luo joukkue"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Biometric Auth Setup Modal */}
      <BiometricAuthSetup
        visible={isBiometricModalVisible}
        onClose={() => setIsBiometricModalVisible(false)}
      />

      {/* Password Change Modal */}
      <Modal
        visible={isPasswordModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsPasswordModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Vaihda salasana</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsPasswordModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Uusi salasana</Text>
              <TextInput
                style={styles.textInput}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Syötä uusi salasana"
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Vahvista uusi salasana</Text>
              <TextInput
                style={styles.textInput}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Vahvista uusi salasana"
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[
                styles.savePasswordButton,
                passwordChangeLoading && styles.disabledButton,
              ]}
              onPress={handlePasswordChange}
              disabled={passwordChangeLoading}
            >
              <Text style={styles.savePasswordText}>
                {passwordChangeLoading ? "Tallennetaan..." : "Vaihda salasana"}
              </Text>
            </TouchableOpacity>
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
  content: {
    flex: 1,
    padding: 20,
  },
  userInfo: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    alignItems: "center",
  },
  userName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  userEmail: {
    fontSize: 16,
    color: "#666",
  },
  signOutButton: {
    backgroundColor: "#f44336",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 12,
  },
  signOutText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  changePasswordButton: {
    backgroundColor: "#2196F3",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 12,
  },
  changePasswordText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  buttonIcon: {
    marginRight: 8,
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
  modalDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
    lineHeight: 20,
  },
  closeButton: {
    padding: 8,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  savePasswordButton: {
    backgroundColor: "#4CAF50",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  savePasswordText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  disabledButton: {
    opacity: 0.6,
  },
  biometricButton: {
    backgroundColor: "#ff9800",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  biometricButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  noPlayerContainer: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    alignItems: "center",
  },
  noPlayerText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 24,
  },
  refreshButton: {
    backgroundColor: "#2196F3",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  refreshButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  createTeamButton: {
    backgroundColor: "#4CAF50",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  createTeamText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  formScrollView: {
    maxHeight: 400,
  },
  formDescription: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginBottom: 20,
    textAlign: "center",
  },
  multilineInput: {
    height: 80,
    paddingTop: 12,
  },
  submitRequestButton: {
    backgroundColor: "#2196F3",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  submitRequestText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  deleteAccountButton: {
    backgroundColor: "#d32f2f",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 12,
  },
  deleteAccountText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  licenseTypeContainer: {
    gap: 12,
  },
  licenseTypeButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderWidth: 2,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    marginBottom: 8,
  },
  licenseTypeButtonActive: {
    borderColor: "#4CAF50",
    backgroundColor: "#E8F5E9",
  },
  licenseTypeTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  licenseTypeTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  licenseTypeSubtitle: {
    fontSize: 14,
    color: "#666",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginTop: 20,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 13,
    color: "#666",
    marginBottom: 16,
    lineHeight: 18,
  },
  userInfoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userInfoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  userInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 10,
  },
  userInfoText: {
    fontSize: 15,
    color: "#333",
  },
  infoNotice: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF3E0",
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  infoNoticeText: {
    fontSize: 13,
    color: "#E65100",
    flex: 1,
  },
});

export default ProfileScreen;
