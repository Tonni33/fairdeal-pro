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
import { sendPasswordResetEmail } from "firebase/auth";
import { useAuth } from "../contexts/AuthContext";
import { auth } from "../services/firebase";
import { SecureStorage } from "../utils/secureStorage";

const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  // Lomake näkyy aina: pikakirjautuminen ei enää korvaa sitä
  const [showEmailLogin, setShowEmailLogin] = useState(true);
  const [imageError, setImageError] = useState(false);

  const { signIn, signUp } = useAuth();

  useEffect(() => {
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


  const handlePasswordReset = async () => {
    if (!email.trim()) {
      Alert.alert(
        "Syötä sähköpostiosoite",
        "Kirjoita sähköpostiosoitteesi ensin, niin voimme lähettää sinulle salasanan palautusohjeet."
      );
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert(
        "Sähköposti lähetetty",
        `Salasanan palautusohjeet on lähetetty osoitteeseen ${email}. Tarkista myös roskapostikansiosi.`
      );
    } catch (error: any) {
      console.error("Password reset error:", error);
      let errorMessage = "Salasanan palautus epäonnistui";

      if (error.code === "auth/user-not-found") {
        errorMessage = "Sähköpostiosoitetta ei löydy järjestelmästä";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Virheellinen sähköpostiosoite";
      } else if (error.code === "auth/too-many-requests") {
        errorMessage = "Liian monta yritystä. Odota hetki ja yritä uudelleen.";
      }

      Alert.alert("Virhe", errorMessage);
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

        // Salasanaa ei tallenneta laitteelle. Istunto säilyy Firebasen omassa
        // persistenssissä, ja sormenjälki/PIN toimii appin lukkona (AppLock)
        // eikä tee uutta sisäänkirjautumista.
      }
    } catch (error: any) {
      Alert.alert("Virhe", error.message);
    } finally {
      setLoading(false);
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
                  placeholderTextColor="#999"
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
                placeholderTextColor="#999"
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
                placeholderTextColor="#999"
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

            {!isRegister && (
              <TouchableOpacity
                style={styles.forgotPasswordButton}
                onPress={handlePasswordReset}
              >
                <Text style={styles.forgotPasswordText}>
                  Unohditko salasanan?
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => {
                setIsRegister(!isRegister);
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
    color: "#000",
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
  forgotPasswordButton: {
    alignItems: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  forgotPasswordText: {
    color: "#666",
    fontSize: 14,
    textDecorationLine: "underline",
  },
  logo: {
    height: 120,
    width: 120,
    marginBottom: 20,
    borderRadius: 20,
  },
});

export default LoginScreen;
