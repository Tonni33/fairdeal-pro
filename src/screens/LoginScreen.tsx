import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { useAuth } from "../contexts/AuthContext";
import { auth } from "../services/firebase";
import { SecureStorage } from "../utils/secureStorage";
import QuickAuth from "../components/QuickAuth";

const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [quickAuthAvailable, setQuickAuthAvailable] = useState(false);
  const [imageError, setImageError] = useState(false);

  const { signIn, signUp } = useAuth();

  useEffect(() => {
    checkQuickAuthAvailability();

    // Listen to Firebase auth state changes
    const unsubscribe = auth.onAuthStateChanged((user) => {
      console.log(
        "LoginScreen - Firebase auth state changed:",
        user ? user.email : "no user"
      );
      if (user) {
        console.log(
          "User is signed in, LoginScreen should navigate away soon..."
        );
      }
    });

    return () => unsubscribe();
  }, []);

  // Auto-trigger biometric auth if available and enabled
  useEffect(() => {
    const autoTriggerBiometric = async () => {
      // Only auto-trigger if:
      // 1. Quick auth is available
      // 2. Not already showing email login
      // 3. Not in register mode
      // 4. User is not already signed in
      if (
        quickAuthAvailable &&
        !showEmailLogin &&
        !isRegister &&
        !auth.currentUser
      ) {
        const biometricEnabled = await AsyncStorage.getItem(
          "biometric_enabled"
        );

        if (biometricEnabled === "true") {
          console.log("Auto-triggering biometric authentication...");
          // Small delay to ensure UI is ready
          setTimeout(() => {
            handleAutoBiometricAuth();
          }, 500);
        }
      }
    };

    autoTriggerBiometric();
  }, [quickAuthAvailable, showEmailLogin, isRegister]);

  // Re-check quick auth when component becomes visible again
  useEffect(() => {
    const focusListener = () => {
      console.log("LoginScreen focused, re-checking quick auth...");
      checkQuickAuthAvailability();
    };

    // Check immediately and set up focus listener
    focusListener();

    // Note: In a real navigation setup, you'd use navigation.addListener('focus', focusListener)
    // For now, we'll just check on mount and when certain conditions change

    return () => {
      // Cleanup would go here if we had navigation listeners
    };
  }, [showEmailLogin]); // Re-check when email login visibility changes

  const checkQuickAuthAvailability = async () => {
    try {
      console.log("=== Checking Quick Auth Availability ===");
      const isAvailable = await SecureStorage.isQuickAuthAvailable();
      console.log("Quick auth available:", isAvailable);

      // If user is already signed in with Firebase, we might not need quick auth UI
      if (auth.currentUser && isAvailable) {
        console.log(
          "User already signed in with Firebase and quick auth available"
        );
      }

      setQuickAuthAvailable(isAvailable);

      // If quick auth is NOT available, show email login directly
      // to avoid the extra "Kirjaudu sähköpostilla" screen
      if (!isAvailable) {
        console.log("Quick auth not available, showing email login directly");
        setShowEmailLogin(true);
      }
    } catch (error) {
      console.error("Error checking quick auth availability:", error);
      setQuickAuthAvailable(false);
      // Show email login on error as well
      setShowEmailLogin(true);
    }
  };

  const handleSubmit = async () => {
    if (loading) return; // Estä useita samanaikaisia pyyntöjä

    if (!email || !password) {
      Alert.alert("Virhe", "Täytä kaikki pakolliset kentät");
      return;
    }

    if (isRegister && password.length < 6) {
      Alert.alert("Virhe", "Salasanan tulee olla vähintään 6 merkkiä pitkä");
      return;
    }

    setLoading(true);

    try {
      if (isRegister) {
        await signUp(email, password, displayName);
        Alert.alert("Onnistui", "Tili luotu onnistuneesti!");
      } else {
        await signIn(email, password);

        // Mark that user has successfully logged in
        await SecureStorage.setWasLoggedIn(true);

        // Store credentials for quick auth if user has biometric/PIN enabled
        const biometricEnabled = await AsyncStorage.getItem(
          "biometric_enabled"
        );
        const pinEnabled = await AsyncStorage.getItem("pin_enabled");

        if (biometricEnabled === "true" || pinEnabled === "true") {
          console.log("Storing credentials for quick auth...");

          // Store credentials securely
          await SecureStorage.storeCredentials(email, password);
          await SecureStorage.storeTempPassword(email, password);

          console.log("Credentials stored for automatic re-authentication");
        }
      }
    } catch (error: any) {
      Alert.alert("Virhe", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAuthSuccess = async () => {
    // Biometric/PIN auth was successful
    console.log("=== Quick Auth Success ===");
    console.log("Checking current Firebase auth state...");

    // Wait a bit for Firebase to initialize properly
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Check if user is still signed in with Firebase
    const currentUser = auth.currentUser;
    console.log(
      "Current Firebase user:",
      currentUser ? currentUser.email : "none"
    );

    if (currentUser) {
      console.log(
        "✅ User is already signed in with Firebase, authentication complete!"
      );
      // User is already signed in, Firebase persistence worked
      // The AuthContext will handle navigation automatically
      return;
    } else {
      console.log(
        "⚠️ User not signed in with Firebase, but quick auth passed..."
      );

      // Check if we have stored credentials for auto re-authentication
      const storedCredentials = await SecureStorage.getStoredCredentials();

      if (storedCredentials) {
        console.log("Found stored credentials, attempting auto re-login...");

        try {
          await signIn(storedCredentials.email, storedCredentials.password);
          console.log("✅ Auto re-login successful!");
          // Mark successful login
          await SecureStorage.setWasLoggedIn(true);
        } catch (error) {
          console.error("Auto re-login failed:", error);
          // Fall back to manual login
          handleFallbackToManualLogin(storedCredentials.email);
        }
      } else {
        console.log("No stored credentials found");
        const quickAuthEmail = await SecureStorage.getQuickAuthEmail();
        handleFallbackToManualLogin(quickAuthEmail);
      }
    }
  };

  const handleFallbackToManualLogin = (storedEmail?: string | null) => {
    Alert.alert(
      "Istunto vanhentunut",
      "Biometrinen tunnistus onnistui! Syötä salasanasi kerran vahvistaaksesi kirjautumisen.",
      [
        {
          text: "OK",
          onPress: () => {
            setShowEmailLogin(true);
            if (storedEmail) {
              setEmail(storedEmail); // Pre-fill email
            }
          },
        },
      ]
    );
  };

  // Auto-trigger biometric authentication
  const handleAutoBiometricAuth = async () => {
    try {
      console.log("Auto-triggering biometric authentication...");

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Kirjaudu sisään",
        fallbackLabel: "Käytä salasanaa",
        cancelLabel: "Peruuta",
        disableDeviceFallback: false,
      });

      console.log("Auto biometric auth result:", result);

      if (result.success) {
        console.log("Auto biometric auth successful!");
        await handleQuickAuthSuccess();
      } else if (result.error === "user_fallback") {
        console.log("User chose fallback option");
        setShowEmailLogin(true);
      } else if (result.error === "user_cancel") {
        console.log(
          "User cancelled biometric auth, showing alternative options"
        );
        // Don't force email login, let user choose
      } else {
        console.log("Auto biometric auth failed:", result.error);
        // Don't show error for auto-triggered auth
      }
    } catch (error) {
      console.error("Auto biometric auth error:", error);
      // Silently fail for auto-triggered auth
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.logoContainer}>
          {!imageError ? (
            <Image
              source={require("../../assets/fairdealLogo.png")}
              style={styles.logo}
              resizeMode="contain"
              onError={(error) => {
                console.log("Logo loading error:", error);
                setImageError(true);
              }}
              onLoad={() => {
                console.log("Logo loaded successfully");
              }}
            />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Text style={styles.logoText}>FairDeal Pro</Text>
            </View>
          )}
          <Text style={styles.subtitle}>
            {isRegister ? "Luo uusi tili" : "Kirjaudu sisään"}
          </Text>
        </View>

        {/* Quick Auth - only show during login if available */}
        {!isRegister && !showEmailLogin && quickAuthAvailable && (
          <QuickAuth
            onSuccess={handleQuickAuthSuccess}
            onFallback={() => setShowEmailLogin(true)}
          />
        )}

        {/* Email/Password Form */}
        {(isRegister || showEmailLogin) && (
          <View style={styles.formContainer}>
            {isRegister && (
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Nimi</Text>
                <TextInput
                  style={styles.input}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Anna nimesi"
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Sähköposti</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="anna@esimerkki.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Salasana</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Salasana"
                secureTextEntry
                autoComplete={isRegister ? "new-password" : "current-password"}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading
                  ? isRegister
                    ? "Luodaan tiliä..."
                    : "Kirjaudutaan..."
                  : isRegister
                  ? "Luo tili"
                  : "Kirjaudu sisään"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => {
                setIsRegister(!isRegister);
                setShowEmailLogin(false); // Reset email login when switching modes
              }}
            >
              <Text style={styles.switchButtonText}>
                {isRegister
                  ? "Onko sinulla jo tili? Kirjaudu sisään"
                  : "Eikö sinulla ole tiliä? Luo tili"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Switch between login and register */}
        {!showEmailLogin && (
          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => setIsRegister(!isRegister)}
          >
            <Text style={styles.switchButtonText}>
              {isRegister
                ? "Onko sinulla jo tili? Kirjaudu sisään"
                : "Eikö sinulla ole tiliä? Luo tili"}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#1976d2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  logoText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
  },
  formContainer: {
    backgroundColor: "white",
    borderRadius: 10,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  button: {
    backgroundColor: "#1976d2",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: "#ccc",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  switchButton: {
    alignItems: "center",
  },
  switchButtonText: {
    color: "#1976d2",
    fontSize: 14,
    textDecorationLine: "underline",
  },
  logo: {
    height: 120,
    width: 120,
    marginBottom: 20,
  },
});

export default LoginScreen;
