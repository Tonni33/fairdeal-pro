import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase";

interface ChangePasswordModalProps {
  visible: boolean;
  userEmail: string;
  currentPassword: string;
  onPasswordChanged: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  visible,
  userEmail,
  currentPassword,
  onPasswordChanged,
}) => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert("Virhe", "Salasanan tulee olla vähintään 6 merkkiä pitkä");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Virhe", "Salasanat eivät täsmää");
      return;
    }

    if (newPassword === currentPassword) {
      Alert.alert(
        "Virhe",
        "Uuden salasanan tulee olla erilainen kuin nykyinen salasana"
      );
      return;
    }

    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("Käyttäjää ei löytynyt");
      }

      // Re-authenticate user with current password
      const credential = EmailAuthProvider.credential(
        userEmail,
        currentPassword
      );
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPassword);

      // Update needsPasswordChange in Firestore
      await updateDoc(doc(db, "users", user.uid), {
        needsPasswordChange: false,
        passwordChangedAt: new Date(),
      });

      Alert.alert("Onnistui", "Salasana vaihdettu onnistuneesti!", [
        {
          text: "OK",
          onPress: () => {
            setNewPassword("");
            setConfirmPassword("");
            onPasswordChanged();
          },
        },
      ]);
    } catch (error: any) {
      console.error("Error changing password:", error);
      let errorMessage = "Salasanan vaihto epäonnistui";

      if (error.code === "auth/wrong-password") {
        errorMessage = "Nykyinen salasana on virheellinen";
      } else if (error.code === "auth/weak-password") {
        errorMessage = "Salasana on liian heikko";
      } else if (error.code === "auth/requires-recent-login") {
        errorMessage = "Kirjaudu uudelleen sisään ja yritä uudelleen";
      }

      Alert.alert("Virhe", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent={true} animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Ionicons name="lock-closed" size={48} color="#1976d2" />
            <Text style={styles.title}>Vaihda salasana</Text>
            <Text style={styles.subtitle}>
              Järjestelmän admin on luonut sinulle väliaikaisen salasanan.
              Vaihda se henkilökohtaiseen salasanaasi jatkaaksesi.
            </Text>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Nykyinen salasana</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={currentPassword}
                editable={false}
                secureTextEntry={true}
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Uusi salasana</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Vähintään 6 merkkiä"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showNewPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowNewPassword(!showNewPassword)}
              >
                <Ionicons
                  name={showNewPassword ? "eye-off" : "eye"}
                  size={24}
                  color="#666"
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Vahvista uusi salasana</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Kirjoita salasana uudelleen"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <Ionicons
                  name={showConfirmPassword ? "eye-off" : "eye"}
                  size={24}
                  color="#666"
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleChangePassword}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.buttonText}>Vaihda salasana</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.note}>
            ⚠️ Et voi käyttää sovellusta ennen kuin olet vaihtanut salasanasi.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  inputWrapper: {
    position: "relative",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#f9f9f9",
  },
  eyeIcon: {
    position: "absolute",
    right: 12,
    top: 12,
  },
  button: {
    backgroundColor: "#1976d2",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  note: {
    fontSize: 12,
    color: "#ff9800",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 18,
  },
});

export default ChangePasswordModal;
