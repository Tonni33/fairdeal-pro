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
import { collection, addDoc } from "firebase/firestore";
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
  const [estimatedPlayers, setEstimatedPlayers] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [businessInfo, setBusinessInfo] = useState("");

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
              Alert.alert("Virhe", error.message || "Tilin poisto epäonnistui");
            }
          },
        },
      ]
    );
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

    if (!user) {
      Alert.alert("Virhe", "Käyttäjätietoja ei löytynyt");
      return;
    }

    setTeamRequestLoading(true);
    try {
      const requestData: Omit<TeamCreationRequest, "id"> = {
        userId: user.uid,
        userEmail: user.email || "",
        userName:
          enrichedPlayer?.name ||
          user.displayName ||
          user.email?.split("@")[0] ||
          "Tuntematon käyttäjä",
        teamName: requestedTeamName.trim(),
        description: teamDescription.trim() || undefined,
        estimatedPlayerCount: estimatedPlayers
          ? parseInt(estimatedPlayers)
          : undefined,
        contactInfo: contactInfo.trim() || undefined,
        businessInfo: businessInfo.trim() || undefined,
        status: "pending",
        createdAt: new Date(),
      };

      await addDoc(collection(db, "teamCreationRequests"), requestData);

      Alert.alert(
        "Pyyntö lähetetty!",
        "Joukkueen luomispyyntö on lähetetty master adminille tarkistettavaksi. Saat ilmoituksen kun pyyntö on käsitelty.",
        [
          {
            text: "OK",
            onPress: () => {
              setIsTeamRequestModalVisible(false);
              // Clear form
              setRequestedTeamName("");
              setTeamDescription("");
              setEstimatedPlayers("");
              setContactInfo("");
              setBusinessInfo("");
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error submitting team creation request:", error);
      Alert.alert(
        "Virhe",
        "Pyynnön lähettäminen epäonnistui. Yritä uudelleen."
      );
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

        {/* Show team creation request button only if user is not in any teams */}
        {!hasTeamMembership && (
          <TouchableOpacity
            style={styles.createTeamButton}
            onPress={() => setIsTeamRequestModalVisible(true)}
          >
            <Ionicons
              name="people-outline"
              size={20}
              color="white"
              style={styles.buttonIcon}
            />
            <Text style={styles.createTeamText}>
              Pyydä oman joukkueen luomista
            </Text>
          </TouchableOpacity>
        )}

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
              <Text style={styles.modalTitle}>Pyydä joukkueen luomista</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsTeamRequestModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formScrollView}>
              <Text style={styles.formDescription}>
                Lähetä pyyntö master adminille oman joukkueen luomista varten.
                Admin tarkistaa pyynnön ja hyväksyy sen esimerkiksi
                maksusuorituksen jälkeen.
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
                <Text style={styles.inputLabel}>Kuvaus</Text>
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

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Arvioitu pelaajamäärä</Text>
                <TextInput
                  style={styles.textInput}
                  value={estimatedPlayers}
                  onChangeText={setEstimatedPlayers}
                  placeholder="Esim. 20"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Yhteystiedot</Text>
                <TextInput
                  style={[styles.textInput, styles.multilineInput]}
                  value={contactInfo}
                  onChangeText={setContactInfo}
                  placeholder="Puhelinnumero, osoite tms. lisätiedot..."
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Yritys/organisaatio</Text>
                <TextInput
                  style={styles.textInput}
                  value={businessInfo}
                  onChangeText={setBusinessInfo}
                  placeholder="Jos joukkue liittyy yritykseen tai organisaatioon..."
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
                  name="send"
                  size={20}
                  color="white"
                  style={styles.buttonIcon}
                />
                <Text style={styles.submitRequestText}>
                  {teamRequestLoading ? "Lähetetään..." : "Lähetä pyyntö"}
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
});

export default ProfileScreen;
