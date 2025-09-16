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
      const biometricEnabled = await AsyncStorage.getItem("biometric_enabled");
      const pinEnabled = await AsyncStorage.getItem("pin_enabled");
      const wasLoggedIn = await AsyncStorage.getItem("was_logged_in");
      const quickAuthEmail = await AsyncStorage.getItem("quick_auth_email");

      console.log("Quick auth check:", {
        biometricEnabled,
        pinEnabled,
        wasLoggedIn,
        quickAuthEmail,
        currentUser: auth.currentUser ? auth.currentUser.email : "none",
      });

      // Quick auth is available if:
      // 1. User was previously logged in AND
      // 2. Either biometric auth or PIN is enabled
      const isAvailable =
        wasLoggedIn === "true" &&
        (biometricEnabled === "true" || pinEnabled === "true");

      console.log("Quick auth available:", isAvailable);

      // If user is already signed in with Firebase, we might not need quick auth UI
      if (auth.currentUser && isAvailable) {
        console.log(
          "User already signed in with Firebase and quick auth available"
        );
      }

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

      // Check if we have stored credentials that we can use for silent re-auth
      const storedEmail = await AsyncStorage.getItem("quick_auth_email");

      if (storedEmail) {
        console.log("Found stored email:", storedEmail);
        console.log(
          "📱 Firebase session expired but biometric/PIN auth succeeded"
        );
        console.log(
          "This is normal behavior - Firebase sessions have limited lifetime for security"
        );

        // Don't automatically re-authenticate - this would require storing password
        // Instead, inform user and provide easy re-login
        Alert.alert(
          "Istunto vanhentunut",
          "Biometrinen tunnistus onnistui! Firebase-istunto on vanhentunut turvallisuussyistä. Syötä salasanasi kerran vahvistaaksesi kirjautumisen.",
          [
            {
              text: "OK",
              onPress: () => {
                setShowEmailLogin(true);
                setEmail(storedEmail); // Pre-fill email
              },
            },
          ]
        );
      } else {
        console.log("No stored email found");
        Alert.alert(
          "Kirjautuminen vaaditaan",
          "Biometrinen tunnistus onnistui, mutta täydellinen kirjautuminen vaatii sähköpostin ja salasanan.",
          [{ text: "OK", onPress: () => setShowEmailLogin(true) }]
        );
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
