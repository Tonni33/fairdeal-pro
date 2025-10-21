import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { auth } from "../services/firebase";
import { SecureStorage } from "../utils/secureStorage";

interface BiometricAuthSetupProps {
  visible: boolean;
  onClose: () => void;
}

const BiometricAuthSetup: React.FC<BiometricAuthSetupProps> = ({
  visible,
  onClose,
}) => {
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string>("");
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [loading, setLoading] = useState(false);

  // Refs for TextInputs
  const pinInputRef = useRef<TextInput>(null);
  const confirmPinInputRef = useRef<TextInput>(null);

  useEffect(() => {
    checkBiometricSupport();
    checkCurrentSettings();

    // Set was_logged_in flag immediately if user is currently authenticated
    const setLoginFlag = async () => {
      try {
        // Check if user is currently authenticated with Firebase
        const currentUser = auth.currentUser;
        if (currentUser) {
          console.log("User is authenticated, setting was_logged_in flag");
          await SecureStorage.setWasLoggedIn(true);
        }
      } catch (error) {
        console.error("Error setting login flag:", error);
      }
    };

    setLoginFlag();
  }, [visible]);

  // Log when component closes to see what settings were applied
  const handleClose = () => {
    console.log("BiometricAuthSetup closing with settings:", {
      biometricEnabled,
      pinEnabled,
    });

    // Double-check was_logged_in flag before closing with a delay
    setTimeout(async () => {
      try {
        const wasLoggedIn = await AsyncStorage.getItem("was_logged_in");
        const biometricEnabledFinal = await AsyncStorage.getItem(
          "biometric_enabled"
        );
        const pinEnabledFinal = await AsyncStorage.getItem("pin_enabled");

        console.log("Final AsyncStorage state:", {
          wasLoggedIn,
          biometricEnabled: biometricEnabledFinal,
          pinEnabled: pinEnabledFinal,
        });

        // Force set was_logged_in if biometric or PIN is enabled but was_logged_in is null
        if (
          (biometricEnabledFinal === "true" || pinEnabledFinal === "true") &&
          wasLoggedIn !== "true"
        ) {
          console.log("Force setting was_logged_in flag...");
          await AsyncStorage.setItem("was_logged_in", "true");
        }
      } catch (error) {
        console.error("Error checking final login state:", error);
      }
    }, 500);

    onClose();
  };
  const checkBiometricSupport = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes =
        await LocalAuthentication.supportedAuthenticationTypesAsync();

      setBiometricAvailable(hasHardware && isEnrolled);

      if (
        supportedTypes.includes(
          LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
        )
      ) {
        setBiometricType("Face ID");
      } else if (
        supportedTypes.includes(
          LocalAuthentication.AuthenticationType.FINGERPRINT
        )
      ) {
        setBiometricType("Sormenjälki");
      } else if (
        supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)
      ) {
        setBiometricType("Iiris");
      } else {
        setBiometricType("Biometrinen tunnistus");
      }
    } catch (error) {
      console.error("Error checking biometric support:", error);
      setBiometricAvailable(false);
    }
  };

  const checkCurrentSettings = async () => {
    try {
      const biometricSetting = await AsyncStorage.getItem("biometric_enabled");
      const pinSetting = await AsyncStorage.getItem("pin_enabled");

      setBiometricEnabled(biometricSetting === "true");
      setPinEnabled(pinSetting === "true");
    } catch (error) {
      console.error("Error checking current settings:", error);
    }
  };

  const hashPin = async (pinCode: string): Promise<string> => {
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      pinCode + "fairdealpro_salt", // Lisätään salt turvallisuuden vuoksi
      { encoding: Crypto.CryptoEncoding.HEX }
    );
  };

  const handleBiometricToggle = async () => {
    setLoading(true);
    try {
      if (!biometricEnabled) {
        // Ota biometrinen tunnistus käyttöön
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Vahvista biometrinen tunnistus",
          fallbackLabel: "Käytä PIN-koodia",
          cancelLabel: "Peruuta",
        });

        if (result.success) {
          await AsyncStorage.setItem("biometric_enabled", "true");
          setBiometricEnabled(true);
          console.log("Biometric auth enabled successfully, setting flags...");

          // Store current user's email for quick auth immediately
          const currentUser = auth.currentUser;
          console.log("Current user when setting up biometric:", {
            user: currentUser?.email,
            uid: currentUser?.uid,
          });

          if (currentUser && currentUser.email) {
            await AsyncStorage.setItem("quick_auth_email", currentUser.email);
            console.log("Stored email for quick auth:", currentUser.email);

            // Check if we already have stored credentials from recent login
            const existingPassword = await AsyncStorage.getItem("temp_password");
            if (existingPassword) {
              console.log("Found existing password, keeping for biometric auth");
              // Keep the existing stored password for biometric auth
            } else {
              console.log("No existing password found - user will need to re-enter on session expiry");
            }

            // Verify email was stored
            const storedEmail = await AsyncStorage.getItem("quick_auth_email");
            console.log("Verified stored email:", storedEmail);
          } else {
            console.log("No current user or email when setting up biometric!");
          }

          // Set was_logged_in flag with a slight delay to ensure it persists
          // even if the auth state changes due to biometric setup
          setTimeout(async () => {
            try {
              await AsyncStorage.setItem("was_logged_in", "true");
              console.log("was_logged_in flag set successfully");
            } catch (error) {
              console.error("Failed to set was_logged_in flag:", error);
            }
          }, 1000);

          Alert.alert(
            "Onnistui",
            `${biometricType} on nyt käytössä kirjautumisessa`
          );
        } else {
          console.log("Biometric auth setup failed:", result);
          Alert.alert(
            "Virhe",
            "Biometrisen tunnistuksen käyttöönotto epäonnistui"
          );
        }
      } else {
        // Poista biometrinen tunnistus käytöstä
        await AsyncStorage.setItem("biometric_enabled", "false");
        setBiometricEnabled(false);
        console.log("Biometric auth disabled");
        
        // Check if PIN is also disabled - if so, clear stored credentials
        const pinEnabled = await AsyncStorage.getItem("pin_enabled");
        if (pinEnabled !== "true") {
          console.log("No quick auth methods remaining, clearing stored credentials");
          await AsyncStorage.removeItem("encrypted_password");
          await AsyncStorage.removeItem("temp_password");
        }
        
        Alert.alert("Poistettu", "Biometrinen tunnistus poistettu käytöstä");
      }
    } catch (error) {
      console.error("Error toggling biometric auth:", error);
      Alert.alert("Virhe", "Asetuksen muuttaminen epäonnistui");
    } finally {
      setLoading(false);
    }
  };

  const handlePinSetup = async () => {
    console.log("PIN setup attempt:", {
      pin,
      confirmPin,
      pinLength: pin.length,
      confirmPinLength: confirmPin.length,
    });

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      Alert.alert("Virhe", "PIN-koodin täytyy olla 4-numeroinen");
      return;
    }

    if (pin !== confirmPin) {
      Alert.alert("Virhe", "PIN-koodit eivät täsmää");
      console.log("PIN mismatch:", { pin, confirmPin });
      return;
    }

    setLoading(true);
    try {
      const hashedPin = await hashPin(pin);
      await AsyncStorage.setItem("user_pin", hashedPin);
      await AsyncStorage.setItem("pin_enabled", "true");

      console.log("PIN setup successful, setting flags...");
      setPinEnabled(true);
      setIsSettingPin(false);
      setPin("");
      setConfirmPin("");

      // Store current user's email for quick auth immediately
      const currentUser = auth.currentUser;
      console.log("Current user when setting up PIN:", {
        user: currentUser?.email,
        uid: currentUser?.uid,
      });

      if (currentUser && currentUser.email) {
        await AsyncStorage.setItem("quick_auth_email", currentUser.email);
        console.log("Stored email for quick auth:", currentUser.email);

        // Check if we already have stored credentials from recent login
        const existingPassword = await AsyncStorage.getItem("temp_password");
        if (existingPassword) {
          console.log("Found existing password, keeping for PIN auth");
          // Keep the existing stored password for PIN auth
        } else {
          console.log("No existing password found - user will need to re-enter on session expiry");
        }

        // Verify email was stored
        const storedEmail = await AsyncStorage.getItem("quick_auth_email");
        console.log("Verified stored email:", storedEmail);
      } else {
        console.log("No current user or email when setting up PIN!");
      }

      // Set was_logged_in flag with a slight delay to ensure it persists
      setTimeout(async () => {
        try {
          await AsyncStorage.setItem("was_logged_in", "true");
          console.log("was_logged_in flag set successfully after PIN setup");
        } catch (error) {
          console.error("Failed to set was_logged_in flag:", error);
        }
      }, 1000);

      Alert.alert("Onnistui", "PIN-koodi asetettu onnistuneesti");
    } catch (error) {
      console.error("Error setting PIN:", error);
      Alert.alert("Virhe", "PIN-koodin asettaminen epäonnistui");
    } finally {
      setLoading(false);
    }
  };

  const handlePinDisable = async () => {
    if (!currentPin) {
      Alert.alert("Virhe", "Syötä nykyinen PIN-koodi");
      return;
    }

    setLoading(true);
    try {
      const storedHashedPin = await AsyncStorage.getItem("user_pin");
      const enteredHashedPin = await hashPin(currentPin);

      if (storedHashedPin === enteredHashedPin) {
        await AsyncStorage.removeItem("user_pin");
        await AsyncStorage.setItem("pin_enabled", "false");

        setPinEnabled(false);
        setCurrentPin("");

        // Check if biometric is also disabled - if so, clear stored credentials
        const biometricEnabled = await AsyncStorage.getItem("biometric_enabled");
        if (biometricEnabled !== "true") {
          console.log("No quick auth methods remaining, clearing stored credentials");
          await AsyncStorage.removeItem("encrypted_password");
          await AsyncStorage.removeItem("temp_password");
        }

        Alert.alert("Onnistui", "PIN-koodi poistettu käytöstä");
      } else {
        Alert.alert("Virhe", "Väärä PIN-koodi");
      }
    } catch (error) {
      console.error("Error disabling PIN:", error);
      Alert.alert("Virhe", "PIN-koodin poistaminen epäonnistui");
    } finally {
      setLoading(false);
    }
  };

  const getPinDisplayText = (pinValue: string, maxLength: number = 4) => {
    return (
      "●".repeat(pinValue.length) + "○".repeat(maxLength - pinValue.length)
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Turvallisuusasetukset</Text>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.settingsContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Biometric Authentication Section */}
            {biometricAvailable && (
              <View style={styles.settingSection}>
                <View style={styles.settingHeader}>
                  <View style={styles.settingInfo}>
                    <Ionicons
                      name={
                        Platform.OS === "ios" ? "scan-outline" : "finger-print"
                      }
                      size={24}
                      color="#1976d2"
                    />
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingTitle}>{biometricType}</Text>
                      <Text style={styles.settingSubtitle}>
                        Kirjaudu nopeasti {biometricType.toLowerCase()}lla
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.toggleButton,
                      biometricEnabled && styles.toggleButtonActive,
                    ]}
                    onPress={handleBiometricToggle}
                    disabled={loading}
                  >
                    <Text
                      style={[
                        styles.toggleButtonText,
                        biometricEnabled && styles.toggleButtonTextActive,
                      ]}
                    >
                      {biometricEnabled ? "Käytössä" : "Ei käytössä"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* PIN Code Section */}
            <View style={styles.settingSection}>
              <View style={styles.settingHeader}>
                <View style={styles.settingInfo}>
                  <Ionicons name="keypad-outline" size={24} color="#1976d2" />
                  <View style={styles.settingTextContainer}>
                    <Text style={styles.settingTitle}>PIN-koodi</Text>
                    <Text style={styles.settingSubtitle}>
                      4-numeroinen PIN-koodi kirjautumiseen
                    </Text>
                  </View>
                </View>
                {!isSettingPin && (
                  <TouchableOpacity
                    style={[
                      styles.toggleButton,
                      pinEnabled && styles.toggleButtonActive,
                    ]}
                    onPress={() => {
                      if (pinEnabled) {
                        // Jos PIN on käytössä, näytä poistamislomake
                        setCurrentPin("");
                      } else {
                        // Jos PIN ei ole käytössä, näytä asettamislomake
                        setIsSettingPin(true);
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.toggleButtonText,
                        pinEnabled && styles.toggleButtonTextActive,
                      ]}
                    >
                      {pinEnabled ? "Käytössä" : "Ei käytössä"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* PIN Setup Form */}
              {isSettingPin && (
                <View style={styles.pinSetupContainer}>
                  <Text style={styles.pinLabel}>Uusi PIN-koodi:</Text>
                  <TextInput
                    ref={pinInputRef}
                    style={styles.visibleInput}
                    value={pin}
                    onChangeText={(text) => {
                      if (/^\d*$/.test(text) && text.length <= 4) {
                        setPin(text);
                        console.log("PIN input:", text);
                      }
                    }}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry={true}
                    autoFocus={true}
                    placeholder="Syötä 4-numeroinen PIN"
                  />

                  <Text style={styles.pinLabel}>Vahvista PIN-koodi:</Text>
                  <TextInput
                    ref={confirmPinInputRef}
                    style={styles.visibleInput}
                    value={confirmPin}
                    onChangeText={(text) => {
                      if (/^\d*$/.test(text) && text.length <= 4) {
                        setConfirmPin(text);
                        console.log("Confirm PIN input:", text);
                      }
                    }}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry={true}
                    placeholder="Vahvista PIN-koodi"
                  />

                  <View style={styles.pinButtonContainer}>
                    <TouchableOpacity
                      style={styles.pinCancelButton}
                      onPress={() => {
                        setIsSettingPin(false);
                        setPin("");
                        setConfirmPin("");
                      }}
                    >
                      <Text style={styles.pinCancelButtonText}>Peruuta</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.pinSaveButton,
                        loading && styles.disabledButton,
                      ]}
                      onPress={handlePinSetup}
                      disabled={
                        loading || pin.length !== 4 || confirmPin.length !== 4
                      }
                    >
                      <Text style={styles.pinSaveButtonText}>
                        {loading ? "Asetetaan..." : "Aseta PIN"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* PIN Disable Form */}
              {pinEnabled && !isSettingPin && (
                <View style={styles.pinDisableContainer}>
                  <Text style={styles.pinLabel}>
                    Syötä nykyinen PIN poistaaksesi:
                  </Text>
                  <TextInput
                    style={styles.visibleInput}
                    value={currentPin}
                    onChangeText={(text) => {
                      if (/^\d*$/.test(text) && text.length <= 4) {
                        setCurrentPin(text);
                      }
                    }}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry={true}
                    autoFocus={true}
                    placeholder="Syötä nykyinen PIN"
                  />

                  <View style={styles.pinButtonContainer}>
                    <TouchableOpacity
                      style={styles.pinCancelButton}
                      onPress={() => setCurrentPin("")}
                    >
                      <Text style={styles.pinCancelButtonText}>Peruuta</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.pinRemoveButton,
                        loading && styles.disabledButton,
                      ]}
                      onPress={handlePinDisable}
                      disabled={loading || currentPin.length !== 4}
                    >
                      <Text style={styles.pinRemoveButtonText}>
                        {loading ? "Poistetaan..." : "Poista PIN"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Security Info */}
            <View style={styles.infoSection}>
              <Ionicons
                name="information-circle-outline"
                size={20}
                color="#666"
              />
              <Text style={styles.infoText}>
                Biometrinen tunnistus ja PIN-koodi tekevät kirjautumisesta
                nopeampaa. Voit silti aina kirjautua sähköpostilla ja
                salasanalla.
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "85%",
    minHeight: 300,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  closeButton: {
    padding: 5,
  },
  settingsContainer: {
    flexGrow: 1,
  },
  settingSection: {
    marginBottom: 25,
    padding: 15,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
  },
  settingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  settingInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  settingTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 14,
    color: "#666",
  },
  toggleButton: {
    backgroundColor: "#e0e0e0",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    minWidth: 80,
  },
  toggleButtonActive: {
    backgroundColor: "#1976d2",
  },
  toggleButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#666",
    textAlign: "center",
  },
  toggleButtonTextActive: {
    color: "#fff",
  },
  pinSetupContainer: {
    marginTop: 15,
    padding: 15,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  pinDisableContainer: {
    marginTop: 15,
    padding: 15,
    backgroundColor: "#fff8f0",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ff9800",
  },
  pinLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 8,
  },
  pinDisplayContainer: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    alignItems: "center",
  },
  pinDisplay: {
    fontSize: 24,
    letterSpacing: 8,
    color: "#1976d2",
    fontWeight: "bold",
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    height: 0,
    width: 0,
  },
  visibleInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
    marginBottom: 15,
    textAlign: "center",
  },
  pinButtonContainer: {
    flexDirection: "row",
    gap: 10,
  },
  pinCancelButton: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  pinCancelButtonText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  pinSaveButton: {
    flex: 1,
    backgroundColor: "#1976d2",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  pinSaveButtonText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "600",
  },
  pinRemoveButton: {
    flex: 1,
    backgroundColor: "#f44336",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  pinRemoveButtonText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.6,
  },
  infoSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#e3f2fd",
    padding: 15,
    borderRadius: 8,
    marginTop: 10,
  },
  infoText: {
    fontSize: 13,
    color: "#666",
    marginLeft: 10,
    flex: 1,
    lineHeight: 18,
  },
});

export default BiometricAuthSetup;
