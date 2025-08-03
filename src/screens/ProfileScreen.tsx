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
import UserProfileEditor from "../components/UserProfileEditor";
import AdminMenuButton from "../components/AdminMenuButton";
import BiometricAuthSetup from "../components/BiometricAuthSetup";
import { useAuth } from "../contexts/AuthContext";
import { useApp } from "../contexts/AppContext";
import { RootStackParamList } from "../types";

type ProfileScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "Profile"
>;

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { user, signOut, changePassword } = useAuth();
  const { players, teams, refreshData } = useApp();

  // Password change state
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [isBiometricModalVisible, setIsBiometricModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);

  // Hae pelaaja käyttäjän sähköpostilla
  const player = players.find((p) => p.email === user?.email);

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

  const handleAdminNavigation = (screen: string) => {
    if (screen === "CreateEvent") {
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
        {player && (
          <UserProfileEditor
            player={player}
            teams={teams}
            onSave={handleProfileSave}
          />
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
      </ScrollView>

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
});

export default ProfileScreen;
