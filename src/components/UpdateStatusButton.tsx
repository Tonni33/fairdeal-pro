import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Updates from "expo-updates";

/**
 * Päivitystilan merkki otsikkorivillä logon vieressä.
 *
 *  - päivitys odottaa käyttöönottoa -> "Päivitä"-painike
 *  - tarkistus tai lataus kesken     -> hyrrä
 *  - kaikki ajan tasalla             -> vihreä valintamerkki, jota painamalla
 *                                       voi tarkistaa päivitykset itse
 *
 * Sama tila kuin UpdateBannerissa (Updates.useUpdates jakaa tilan), joten
 * palkki ja tämä merkki eivät voi olla eri mieltä.
 */
export const UpdateStatusButton: React.FC = () => {
  // Moduulivakio: dev-clientissä ja webissä päivityksiä ei ole, eikä hookkia
  // silloin kutsuta lainkaan
  if (!Updates.isEnabled) {
    return null;
  }
  return <UpdateStatusButtonEnabled />;
};

const UpdateStatusButtonEnabled: React.FC = () => {
  const { isUpdatePending, isChecking, isDownloading } = Updates.useUpdates();
  const [isReloading, setIsReloading] = useState(false);
  const [showUpToDate, setShowUpToDate] = useState(false);

  const applyUpdate = useCallback(async () => {
    setIsReloading(true);
    try {
      await Updates.reloadAsync();
    } catch (error) {
      console.log("[UpdateStatus] Käyttöönotto epäonnistui:", error);
      setIsReloading(false);
    }
  }, []);

  const checkNow = useCallback(async () => {
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
      } else {
        // Lyhyt kuittaus, jotta painallus tuntuu tekevän jotain
        setShowUpToDate(true);
        setTimeout(() => setShowUpToDate(false), 2000);
      }
    } catch (error) {
      console.log("[UpdateStatus] Tarkistus epäonnistui:", error);
    }
  }, []);

  if (isReloading || isChecking || isDownloading) {
    return (
      <View style={styles.iconButton}>
        <ActivityIndicator size="small" color="#1976d2" />
      </View>
    );
  }

  if (isUpdatePending) {
    return (
      <TouchableOpacity
        style={styles.updateButton}
        onPress={applyUpdate}
        accessibilityLabel="Ota uusi versio käyttöön"
      >
        <Ionicons name="arrow-down-circle" size={16} color="#fff" />
        <Text style={styles.updateButtonText}>Päivitä</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.iconButton}
      onPress={checkNow}
      accessibilityLabel="Tarkista päivitykset"
    >
      <Ionicons name="checkmark-circle" size={24} color="#4caf50" />
      {showUpToDate && <Text style={styles.upToDateText}>Ajan tasalla</Text>}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  iconButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  upToDateText: {
    fontSize: 12,
    color: "#4caf50",
    fontWeight: "500",
  },
  updateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1976d2",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  updateButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
});

export default UpdateStatusButton;
