import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import { useAuth } from "../contexts/AuthContext";

/**
 * Sormenjälki- ja PIN-lukko kirjautuneen näkymän edessä.
 *
 * Aiemmin nämä olivat kirjautumisruudulla ja tekivät oikean sisäänkirjautumisen
 * levylle tallennetulla salasanalla. Kun istunto säilyy, kirjautumisruutua ei
 * enää näytetä palanneelle käyttäjälle, joten lukon paikka on täällä: se ei
 * kirjaa sisään vaan estää pääsyn jo kirjautuneen käyttäjän tietoihin.
 */

// Taustalla vietetty aika, jonka jälkeen appi lukitaan uudelleen
const RELOCK_AFTER_MS = 5 * 60 * 1000;

const hashPin = (pinCode: string): Promise<string> =>
  Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pinCode + "fairdealpro_salt",
    { encoding: Crypto.CryptoEncoding.HEX },
  );

type LockSettings = { biometric: boolean; pin: boolean };

export const AppLock: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, signOut } = useAuth();
  const [settings, setSettings] = useState<LockSettings | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const promptShown = useRef(false);

  const lockEnabled = !!settings && (settings.biometric || settings.pin);

  // Asetukset luetaan aina kun käyttäjä vaihtuu (kirjautuminen tai ulos)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user) {
        if (!cancelled) {
          setSettings(null);
          setUnlocked(false);
          promptShown.current = false;
        }
        return;
      }
      try {
        const [biometric, pinEnabled] = await Promise.all([
          AsyncStorage.getItem("biometric_enabled"),
          AsyncStorage.getItem("pin_enabled"),
        ]);
        if (cancelled) return;
        const next = {
          biometric: biometric === "true",
          pin: pinEnabled === "true",
        };
        setSettings(next);
        setUnlocked(!next.biometric && !next.pin);
      } catch (error) {
        // Asetuksia ei saatu luettua: ei jätetä käyttäjää lukkojen taakse
        console.log("[AppLock] Asetusten luku epäonnistui:", error);
        if (!cancelled) {
          setSettings({ biometric: false, pin: false });
          setUnlocked(true);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Uudelleenlukitus kun appi on ollut taustalla riittävän kauan
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "background" || state === "inactive") {
          backgroundedAt.current = Date.now();
          return;
        }
        if (state === "active" && backgroundedAt.current && lockEnabled) {
          const away = Date.now() - backgroundedAt.current;
          backgroundedAt.current = null;
          if (away >= RELOCK_AFTER_MS) {
            promptShown.current = false;
            setUnlocked(false);
          }
        }
      },
    );
    return () => subscription.remove();
  }, [lockEnabled]);

  const authenticateWithBiometrics = useCallback(async () => {
    setBusy(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Avaa FairDeal Pro",
        fallbackLabel: "Käytä PIN-koodia",
        cancelLabel: "Peruuta",
        disableDeviceFallback: false,
      });
      if (result.success) {
        setUnlocked(true);
      }
    } catch (error) {
      console.log("[AppLock] Biometrinen tunnistus epäonnistui:", error);
    } finally {
      setBusy(false);
    }
  }, []);

  // Sormenjälkikysely näytetään kerran per lukitus
  useEffect(() => {
    if (
      !unlocked &&
      settings?.biometric &&
      !promptShown.current &&
      user !== null
    ) {
      promptShown.current = true;
      authenticateWithBiometrics();
    }
  }, [unlocked, settings, user, authenticateWithBiometrics]);

  const submitPin = useCallback(async () => {
    if (pin.length !== 4) {
      Alert.alert("Virhe", "PIN-koodin täytyy olla 4-numeroinen");
      return;
    }
    setBusy(true);
    try {
      const stored = await AsyncStorage.getItem("user_pin");
      const entered = await hashPin(pin);
      if (stored && stored === entered) {
        setPin("");
        setUnlocked(true);
      } else {
        setPin("");
        Alert.alert("Virhe", "Väärä PIN-koodi");
      }
    } catch (error) {
      console.log("[AppLock] PIN-tarkistus epäonnistui:", error);
      Alert.alert("Virhe", "PIN-tarkistus epäonnistui");
    } finally {
      setBusy(false);
    }
  }, [pin]);

  // Kirjautumisruutu renderöidään sellaisenaan
  if (!user) {
    return <>{children}</>;
  }

  // Asetuksia luetaan vielä: sisältöä ei näytetä ennen kuin tiedetään
  // pitääkö appi lukita, jottei se välähdä lukitusruudun alta
  if (settings === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1976d2" />
      </View>
    );
  }

  if (!lockEnabled || unlocked) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <Ionicons name="lock-closed" size={56} color="#1976d2" />
      <Text style={styles.title}>FairDeal Pro on lukittu</Text>
      <Text style={styles.subtitle}>{user.email}</Text>

      {settings.biometric && (
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={authenticateWithBiometrics}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="finger-print" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>Avaa tunnistautumalla</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {settings.pin && (
        <View style={styles.pinContainer}>
          <Text style={styles.pinLabel}>PIN-koodi</Text>
          <TextInput
            style={styles.pinInput}
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            textAlign="center"
            editable={!busy}
            onSubmitEditing={submitPin}
          />
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={submitPin}
            disabled={busy || pin.length !== 4}
          >
            <Text style={styles.secondaryButtonText}>Avaa</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Ilman tätä sormenjäljen pettäminen jättäisi käyttäjän jumiin */}
      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Kirjaudu ulos</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
    marginBottom: 28,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1976d2",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
    minWidth: 240,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  pinContainer: {
    alignItems: "center",
    marginTop: 24,
    width: "100%",
    maxWidth: 240,
  },
  pinLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  pinInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    fontSize: 24,
    letterSpacing: 8,
    paddingVertical: 12,
    width: "100%",
    backgroundColor: "#fafafa",
  },
  secondaryButton: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1976d2",
    width: "100%",
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#1976d2",
    fontSize: 16,
    fontWeight: "600",
  },
  signOutButton: {
    marginTop: 32,
    padding: 12,
  },
  signOutText: {
    color: "#888",
    fontSize: 14,
    textDecorationLine: "underline",
  },
});

export default AppLock;
