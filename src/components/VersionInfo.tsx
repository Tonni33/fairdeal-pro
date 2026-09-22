import React, { useEffect, useState } from "react";
import {
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Updates from "expo-updates";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { JS_VERSION } from "../constants/jsVersion";

/**
 * Versiotiedot profiilisivulla.
 *
 * Kaksi numeroa, joilla on eri korjaustapa – siksi myös eri käsittely:
 *
 *  - Sovellusversio tulee kaupasta, eikä appi voi päivittää itseään. Jos se on
 *    jäljessä, se korostetaan ja tarjotaan linkki kauppaan.
 *  - JS-versio korjaantuu itsestään seuraavalla avauksella, ja otsikkorivin
 *    nappi hoitaa sen heti. Siksi se näytetään tässä pelkkänä tietona, ettei
 *    samasta asiasta ole kahta eriväristä merkkiä eri puolilla appia.
 *
 * Molemmat kannattaa näyttää, koska tukitilanteessa ensimmäinen kysymys on
 * mitä versiota käyttäjä ajaa.
 */
const STORE_URL = Platform.select({
  ios: "https://apps.apple.com/app/id6749513627",
  android: "https://play.google.com/store/apps/details?id=com.fairdeal.pro",
  default: "",
});

export const VersionInfo: React.FC = () => {
  const [latestAppVersion, setLatestAppVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadLatestRelease = async () => {
      try {
        const snapshot = await getDoc(doc(db, "settings", "app"));
        if (cancelled || !snapshot.exists()) {
          return;
        }
        const value = (snapshot.data() as { latestRuntimeVersion?: string })
          .latestRuntimeVersion;
        setLatestAppVersion(typeof value === "string" ? value : null);
      } catch (error) {
        // Tieto on mukavuutta, ei toiminnallisuutta – virhe ei näy käyttäjälle
        console.log("[Version] Julkaisutiedon luku epäonnistui:", error);
      }
    };
    loadLatestRelease();
    return () => {
      cancelled = true;
    };
  }, []);

  const appVersion = Updates.runtimeVersion || null;
  const isOutdated =
    !!appVersion &&
    !!latestAppVersion &&
    appVersion.localeCompare(latestAppVersion, undefined, { numeric: true }) < 0;

  const openStore = () => {
    if (STORE_URL) {
      Linking.openURL(STORE_URL).catch((error) =>
        console.log("[Version] Kaupan avaaminen epäonnistui:", error)
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        <Ionicons name="information-circle-outline" size={18} color="#333" />{" "}
        Versiotiedot
      </Text>

      <View style={styles.row}>
        <Text style={styles.label}>Sovellusversio</Text>
        <View
          style={[styles.badge, isOutdated ? styles.badgeWarn : styles.badgeOk]}
        >
          <Text
            style={[
              styles.badgeText,
              isOutdated ? styles.badgeTextWarn : styles.badgeTextOk,
            ]}
          >
            {appVersion || "ei tiedossa"}
          </Text>
        </View>
      </View>

      {isOutdated && (
        <TouchableOpacity style={styles.storeButton} onPress={openStore}>
          <Ionicons name="cloud-download-outline" size={16} color="#fff" />
          <Text style={styles.storeButtonText}>
            Päivitä kaupasta (uusin {latestAppVersion})
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.row}>
        <Text style={styles.label}>JS-versio</Text>
        <Text style={styles.plainValue}>{JS_VERSION}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  label: {
    fontSize: 14,
    color: "#666",
  },
  plainValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeOk: {
    backgroundColor: "rgba(76, 175, 80, 0.12)",
    borderColor: "#4caf50",
  },
  badgeWarn: {
    backgroundColor: "rgba(255, 152, 0, 0.15)",
    borderColor: "#ff9800",
  },
  badgeText: {
    fontSize: 14,
    fontWeight: "700",
  },
  badgeTextOk: {
    color: "#2e7d32",
  },
  badgeTextWarn: {
    color: "#e65100",
  },
  storeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ff9800",
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  storeButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default VersionInfo;
