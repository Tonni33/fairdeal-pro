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
import { useAuth } from "../contexts/AuthContext";
import { auth } from "../services/firebase";
import QuickAuth from "../components/QuickAuth";

const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [quickAuthAvailable, setQuickAuthAvailable] = useState(false);

  const { signIn, signUp } = useAuth();

  useEffect(() => {
    checkQuickAuthAvailability();
  }, []);

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
      const biometricEnabled = await AsyncStorage.getItem("biometric_enabled");
      const pinEnabled = await AsyncStorage.getItem("pin_enabled");
      const wasLoggedIn = await AsyncStorage.getItem("was_logged_in");

      console.log("Quick auth check:", {
        biometricEnabled,
        pinEnabled,
        wasLoggedIn,
      });

      // Quick auth is available if:
      // 1. User was previously logged in AND
      // 2. Either biometric auth or PIN is enabled
      const isAvailable =
        wasLoggedIn === "true" &&
        (biometricEnabled === "true" || pinEnabled === "true");

      console.log("Quick auth available:", isAvailable);
      setQuickAuthAvailable(isAvailable);
    } catch (error) {
      console.error("Error checking quick auth availability:", error);
      setQuickAuthAvailable(false);
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
        await AsyncStorage.setItem("was_logged_in", "true");

        // Store encrypted credentials for quick auth (if user has biometric/PIN enabled)
        const biometricEnabled = await AsyncStorage.getItem(
          "biometric_enabled"
        );
        const pinEnabled = await AsyncStorage.getItem("pin_enabled");

        if (biometricEnabled === "true" || pinEnabled === "true") {
          console.log("Storing credentials for quick auth...");
          // Store email for quick auth (password should not be stored for security)
          await AsyncStorage.setItem("quick_auth_email", email);
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
    console.log("Quick auth success, checking Firebase auth state...");

    // Check if user is still signed in with Firebase
    const currentUser = auth.currentUser;
    if (currentUser) {
      console.log("User is already signed in, navigating...");
      // User is already signed in, Firebase persistence worked
      // The AuthContext will handle navigation
    } else {
      console.log(
        "User not signed in, attempting to restore Firebase session..."
      );

      try {
        // Get stored email for re-authentication
        const storedEmail = await AsyncStorage.getItem("quick_auth_email");

        if (storedEmail) {
          console.log("Found stored email, asking user to confirm password...");
          // Show a simplified password prompt for security
          Alert.prompt(
            "Vahvista salasana",
            `Syötä salasanasi tilille ${storedEmail}`,
            [
              {
                text: "Peruuta",
                style: "cancel",
                onPress: () => setShowEmailLogin(true),
              },
              {
                text: "Kirjaudu",
                onPress: async (password) => {
                  if (password) {
                    try {
                      console.log("Attempting to sign in with stored email...");
                      await signIn(storedEmail, password);
                      console.log("Quick auth re-login successful!");
                    } catch (error: any) {
                      console.error("Quick auth re-login failed:", error);
                      Alert.alert(
                        "Virhe",
                        "Salasana virheellinen. Kirjaudu sisään uudelleen."
                      );
                      setShowEmailLogin(true);
                    }
                  }
                },
              },
            ],
            "secure-text"
          );
        } else {
          console.log("No stored email found, showing regular login");
          Alert.alert(
            "Kirjautuminen vaaditaan",
            "Vahvista kirjautumisesi sähköpostilla ja salasanalla.",
            [{ text: "OK", onPress: () => setShowEmailLogin(true) }]
          );
        }
      } catch (error) {
        console.error("Error during quick auth success:", error);
        setShowEmailLogin(true);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.logoContainer}>
          <Image
            source={require("../../assets/fairdealLogo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
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

        {/* Show email login button if no quick auth available */}
        {!isRegister && !showEmailLogin && !quickAuthAvailable && (
          <View style={styles.noQuickAuthContainer}>
            <Text style={styles.noQuickAuthText}>Kirjaudu sähköpostilla</Text>
            <TouchableOpacity
              style={styles.emailLoginButton}
              onPress={() => setShowEmailLogin(true)}
            >
              <Text style={styles.emailLoginButtonText}>
                Jatka sähköpostilla
              </Text>
            </TouchableOpacity>
          </View>
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

        {/* Always show option to go back to quick auth during login */}
        {!isRegister && showEmailLogin && (
          <TouchableOpacity
            style={styles.backToQuickAuthButton}
            onPress={() => setShowEmailLogin(false)}
          >
            <Text style={styles.backToQuickAuthButtonText}>
              ← Takaisin pikakirjautumiseen
            </Text>
          </TouchableOpacity>
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
    height: 140,
    width: 140,
    marginBottom: 20,
    borderRadius: 20,
  },
  backToQuickAuthButton: {
    alignItems: "center",
    marginTop: 15,
    padding: 10,
  },
  backToQuickAuthButtonText: {
    color: "#666",
    fontSize: 14,
    textDecorationLine: "underline",
  },
  noQuickAuthContainer: {
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 12,
    margin: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  noQuickAuthText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 15,
    textAlign: "center",
  },
  emailLoginButton: {
    backgroundColor: "#1976d2",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emailLoginButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default LoginScreen;
