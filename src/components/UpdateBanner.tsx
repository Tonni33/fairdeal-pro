import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Updates from "expo-updates";

/**
 * Näyttää palkin kun uusi versio on ladattu ja odottaa käyttöönottoa.
 *
 * Natiivipuoli tarkistaa päivityksen jokaisella kylmäkäynnistyksellä
 * (EXUpdatesCheckOnLaunch = ALWAYS), mutta appi jää usein taustalle päiviksi,
 * jolloin kylmäkäynnistyksiä tulee harvoin. Siksi tarkistus ajetaan myös aina
 * kun appi palaa taustalta.
 *
 * Päivitystä ei oteta käyttöön automaattisesti: reloadAsync käynnistää JS:n
 * uudelleen, ja jos se tapahtuu kesken ilmoittautumisen, käyttäjän painallus
 * menee hukkaan. Käyttäjä päättää ajankohdan itse.
 */
export const UpdateBanner: React.FC = () => {
  // Updates.isEnabled on moduulivakio (false dev-clientissä ja webissä), joten
  // tämä ehto ei vaihda arvoa ajon aikana eikä riko hookkien järjestystä.
  // Näin useUpdates-hookkia ei kutsuta lainkaan ympäristöissä, joissa
  // päivitysmoduulia ei ole.
  if (!Updates.isEnabled) {
    return null;
  }
  return <UpdateBannerEnabled />;
};

const UpdateBannerEnabled: React.FC = () => {
  const { isUpdatePending } = Updates.useUpdates();
  const insets = useSafeAreaInsets();
  // Androidilla App.tsx rajaa turva-alueen SafeAreaView'lla, iOS:llä ei –
  // ilman tätä palkki piirtyisi kellonajan ja akkukuvakkeen alle.
  const topInset = Platform.OS === "ios" ? insets.top : 0;
  const [isReloading, setIsReloading] = useState(false);
  const isChecking = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (isChecking.current) {
      return;
    }
    isChecking.current = true;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
      }
    } catch (error) {
      // Verkkokatko tai palvelin ei tavoitettavissa. Tämä ei ole käyttäjän
      // ongelma eikä siitä ilmoiteta – tarkistus uusitaan seuraavalla kerralla.
      console.log("[UpdateBanner] Päivitystarkistus epäonnistui:", error);
    } finally {
      isChecking.current = false;
    }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "active") {
          checkForUpdate();
        }
      },
    );
    return () => subscription.remove();
  }, [checkForUpdate]);

  const handleReload = useCallback(async () => {
    setIsReloading(true);
    try {
      await Updates.reloadAsync();
    } catch (error) {
      console.log("[UpdateBanner] Uudelleenkäynnistys epäonnistui:", error);
      setIsReloading(false);
    }
  }, []);

  if (!isUpdatePending) {
    return null;
  }

  return (
    <View style={[styles.banner, { paddingTop: 8 + topInset }]}>
      <Ionicons name="arrow-down-circle" size={20} color="#fff" />
      <Text style={styles.text}>Uusi versio ladattu</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={handleReload}
        disabled={isReloading}
      >
        {isReloading ? (
          <ActivityIndicator size="small" color="#1976d2" />
        ) : (
          <Text style={styles.buttonText}>Ota käyttöön</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1976d2",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  text: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#fff",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 96,
    alignItems: "center",
  },
  buttonText: {
    color: "#1976d2",
    fontSize: 14,
    fontWeight: "700",
  },
});
