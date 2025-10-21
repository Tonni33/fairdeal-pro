import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

interface QuickAuthProps {
  onSuccess: () => void;
  onFallback: () => void;
}

const QuickAuth: React.FC<QuickAuthProps> = ({ onSuccess, onFallback }) => {
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState<string>("");
  const [showPinInput, setShowPinInput] = useState(false);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkAuthSettings();
  }, []);

  const checkAuthSettings = async () => {
    try {
      // Check biometric availability
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
      } else {
        setBiometricType("Biometrinen tunnistus");
      }

      // Check user settings
      const biometricSetting = await AsyncStorage.getItem("biometric_enabled");
      const pinSetting = await AsyncStorage.getItem("pin_enabled");

      setBiometricEnabled(biometricSetting === "true");
      setPinEnabled(pinSetting === "true");

      // Don't auto-trigger biometric auth - let user choose when to use it
      console.log("Biometric auth available, waiting for user action");
    } catch (error) {
      console.error("Error checking auth settings:", error);
    }
  };

  const hashPin = async (pinCode: string): Promise<string> => {
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      pinCode + "fairdealpro_salt",
      { encoding: Crypto.CryptoEncoding.HEX }
    );
  };

  const handleBiometricAuth = async () => {
    setLoading(true);
    console.log("Starting biometric authentication...");
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Kirjaudu sisään",
        fallbackLabel: "Käytä salasanaa",
        cancelLabel: "Peruuta",
        disableDeviceFallback: false,
      });

      console.log("Biometric auth result:", result);

      if (result.success) {
        console.log("Biometric auth successful!");
        // Wait a moment for Firebase to fully initialize if needed
        setTimeout(() => {
          onSuccess();
        }, 100);
      } else if (result.error === "user_fallback") {
        console.log("User chose fallback option");
        onFallback();
      } else {
        console.log("Biometric auth failed:", result.error);
        // Don't show error alert for cancelled authentication
        if (result.error !== "user_cancel") {
          Alert.alert("Virhe", "Biometrinen tunnistus epäonnistui");
        }
      }
    } catch (error) {
      console.error("Biometric auth error:", error);
      Alert.alert("Virhe", "Biometrinen tunnistus epäonnistui");
    } finally {
      setLoading(false);
    }
  };

  const handlePinAuth = async () => {
    handlePinAuthWithValue(pin);
  };

  const handlePinAuthWithValue = async (pinValue: string) => {
    console.log(
      "PIN auth attempt - PIN length:",
      pinValue.length,
      "PIN:",
      pinValue
    );

    if (pinValue.length !== 4) {
      console.log("PIN validation failed - wrong length");
      Alert.alert("Virhe", "PIN-koodin täytyy olla 4-numeroinen");
      return;
    }

    setLoading(true);
    try {
      const storedHashedPin = await AsyncStorage.getItem("user_pin");
      const enteredHashedPin = await hashPin(pinValue);

      console.log("PIN auth - stored hash exists:", !!storedHashedPin);
      console.log(
        "PIN auth - entered hash:",
        enteredHashedPin.substring(0, 10) + "..."
      );

      if (storedHashedPin === enteredHashedPin) {
        console.log("PIN auth successful!");
        // Wait a moment for any state updates
        setTimeout(() => {
          onSuccess();
        }, 100);
      } else {
        console.log("PIN auth failed - hash mismatch");
        Alert.alert("Virhe", "Väärä PIN-koodi");
        setPin("");
      }
    } catch (error) {
      console.error("PIN auth error:", error);
      Alert.alert("Virhe", "PIN-tunnistus epäonnistui");
    } finally {
      setLoading(false);
    }
  };

  const handlePinInput = (digit: string) => {
    console.log(
      "PIN digit input:",
      digit,
      "current pin:",
      pin,
      "pin length:",
      pin.length
    );

    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      console.log("New PIN value:", newPin, "length:", newPin.length);

      if (newPin.length === 4) {
        console.log("PIN complete, triggering auth in 100ms...");
        // Store the complete PIN value to avoid state race conditions
        const completePinValue = newPin;

        // Auto-submit when 4 digits entered
        setTimeout(() => {
          console.log(
            "About to call handlePinAuth with PIN:",
            completePinValue
          );
          // Use the stored PIN value instead of current state
          handlePinAuthWithValue(completePinValue);
        }, 100);
      }
    } else {
      console.log("PIN already at max length, ignoring input");
    }
  };

  const handlePinBackspace = () => {
    console.log("PIN backspace, current pin:", pin, "length:", pin.length);
    const newPin = pin.slice(0, -1);
    setPin(newPin);
    console.log("PIN after backspace:", newPin, "length:", newPin.length);
  };

  const getPinDisplayText = (pinValue: string, maxLength: number = 4) => {
    return (
      "●".repeat(pinValue.length) + "○".repeat(maxLength - pinValue.length)
    );
  };

  if (!biometricEnabled && !pinEnabled) {
    return null; // No quick auth options available
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nopea kirjautuminen</Text>

      {showPinInput ? (
        <View style={styles.pinContainer}>
          <Text style={styles.pinLabel}>Syötä PIN-koodi</Text>

          <View style={styles.pinDisplayContainer}>
            <Text style={styles.pinDisplay}>{getPinDisplayText(pin)}</Text>
          </View>

          <View style={styles.keypadContainer}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <TouchableOpacity
                key={digit}
                style={styles.keypadButton}
                onPress={() => handlePinInput(digit.toString())}
                disabled={loading}
              >
                <Text style={styles.keypadButtonText}>{digit}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.keypadButton} /> {/* Empty space */}
            <TouchableOpacity
              style={styles.keypadButton}
              onPress={() => handlePinInput("0")}
              disabled={loading}
            >
              <Text style={styles.keypadButtonText}>0</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.keypadButton}
              onPress={handlePinBackspace}
              disabled={loading}
            >
              <Ionicons name="backspace-outline" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.pinActionsContainer}>
            <TouchableOpacity
              style={styles.pinCancelButton}
              onPress={() => {
                setShowPinInput(false);
                setPin("");
              }}
            >
              <Text style={styles.pinCancelButtonText}>Takaisin</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.authOptionsContainer}>
          {/* Show biometric status message */}
          {biometricAvailable && (
            <View
              style={[
                styles.biometricStatusContainer,
                biometricEnabled
                  ? styles.biometricStatusActive
                  : styles.biometricStatusInactive,
              ]}
            >
              <Ionicons
                name={biometricEnabled ? "checkmark-circle" : "alert-circle"}
                size={20}
                color={biometricEnabled ? "#4caf50" : "#ff9800"}
              />
              <Text
                style={[
                  styles.biometricStatusText,
                  biometricEnabled
                    ? styles.biometricStatusTextActive
                    : styles.biometricStatusTextInactive,
                ]}
              >
                {biometricEnabled
                  ? `${biometricType} aktiivinen`
                  : `${biometricType} ei käytössä`}
              </Text>
            </View>
          )}

          {/* PIN option as backup */}
          {pinEnabled && (
            <TouchableOpacity
              style={styles.authButton}
              onPress={() => setShowPinInput(true)}
              disabled={loading}
            >
              <Ionicons name="keypad-outline" size={32} color="#1976d2" />
              <Text style={styles.authButtonText}>Käytä PIN-koodia</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.fallbackButton} onPress={onFallback}>
            <Ionicons name="mail-outline" size={20} color="#666" />
            <Text style={styles.fallbackButtonText}>
              Kirjaudu sähköpostilla
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 12,
    margin: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 20,
  },
  authOptionsContainer: {
    gap: 15,
  },
  authButton: {
    backgroundColor: "#f0f8ff",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#1976d2",
  },
  authButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1976d2",
    marginTop: 8,
  },
  fallbackButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 15,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    marginTop: 10,
  },
  fallbackButtonText: {
    fontSize: 14,
    color: "#666",
    marginLeft: 8,
  },
  pinContainer: {
    alignItems: "center",
  },
  pinLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    marginBottom: 20,
  },
  pinDisplayContainer: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
    minWidth: 150,
    alignItems: "center",
  },
  pinDisplay: {
    fontSize: 32,
    letterSpacing: 12,
    color: "#1976d2",
    fontWeight: "bold",
  },
  keypadContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    width: 240,
    marginBottom: 20,
  },
  keypadButton: {
    width: 70,
    height: 70,
    backgroundColor: "#f8f9fa",
    borderRadius: 35,
    justifyContent: "center",
    alignItems: "center",
    margin: 5,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  keypadButtonText: {
    fontSize: 24,
    fontWeight: "500",
    color: "#333",
  },
  pinActionsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 10,
  },
  pinCancelButton: {
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    paddingHorizontal: 20,
  },
  pinCancelButtonText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  biometricStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 15,
  },
  biometricStatusActive: {
    backgroundColor: "#f1f8e9",
    borderColor: "#c8e6c9",
  },
  biometricStatusInactive: {
    backgroundColor: "#fff8e1",
    borderColor: "#ffcc02",
  },
  biometricStatusText: {
    fontSize: 16,
    marginLeft: 8,
    fontWeight: "500",
  },
  biometricStatusTextActive: {
    color: "#4caf50",
  },
  biometricStatusTextInactive: {
    color: "#ff9800",
  },
});

export default QuickAuth;
