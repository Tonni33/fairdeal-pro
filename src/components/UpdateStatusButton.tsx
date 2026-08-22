import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Updates from "expo-updates";

/**
 * Päivitystilan nappi otsikkorivillä, samankokoinen kuin admin-valikon nappi.
 * Ei-admineilla AdminMenuButton palauttaa nullin, jolloin tämä jää rivin
 * oikeaan reunaan sen paikalle.
 *
 *  - vihreä    -> kaikki ajan tasalla, painallus tarkistaa päivitykset
 *  - oranssi   -> päivitys ladattu ja odottaa, painallus ottaa sen käyttöön
 *  - hyrrä     -> tarkistus, lataus tai uudelleenkäynnistys kesken
 *
 * Tämä on ainoa päivityshallinta appissa: erillinen yläpalkki poistettiin,
 * koska se tarjosi saman toiminnon toiseen kertaan. Siksi myös taustalla
 * tehtävä tarkistus asuu täällä.
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
  const checkInFlight = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (checkInFlight.current) {
      return;
    }
    checkInFlight.current = true;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
      }
    } catch (error) {
      // Verkkokatko tai palvelin ei tavoitettavissa. Ei käyttäjän ongelma,
      // eikä siitä ilmoiteta – tarkistus uusitaan seuraavalla kerralla.
      console.log("[UpdateStatus] Päivitystarkistus epäonnistui:", error);
    } finally {
      checkInFlight.current = false;
    }
  }, []);

  // Natiivipuoli tarkistaa päivitykset kylmäkäynnistyksessä, mutta appi jää
  // usein taustalle päiviksi. Siksi tarkistus myös aina taustalta palatessa.
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

  const applyUpdate = useCallback(async () => {
    setIsReloading(true);
    try {
      await Updates.reloadAsync();
    } catch (error) {
      console.log("[UpdateStatus] Käyttöönotto epäonnistui:", error);
      setIsReloading(false);
    }
  }, []);

  if (isReloading || isChecking || isDownloading) {
    return (
      <View style={[styles.button, styles.buttonNeutral]}>
        <ActivityIndicator size="small" color="#1976d2" />
      </View>
    );
  }

  if (isUpdatePending) {
    return (
      <TouchableOpacity
        style={[styles.button, styles.buttonPending]}
        onPress={applyUpdate}
        accessibilityLabel="Ota uusi versio käyttöön"
      >
        <Ionicons name="sync-circle" size={24} color="#ff9800" />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.button, styles.buttonUpToDate]}
      onPress={checkForUpdate}
      accessibilityLabel="Tarkista päivitykset"
    >
      <Ionicons name="sync-circle" size={24} color="#4caf50" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // Sama muoto ja koko kuin AdminMenuButtonilla
  button: {
    padding: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  buttonUpToDate: {
    backgroundColor: "rgba(76, 175, 80, 0.12)",
  },
  buttonPending: {
    backgroundColor: "rgba(255, 152, 0, 0.18)",
  },
  buttonNeutral: {
    backgroundColor: "rgba(25, 118, 210, 0.1)",
  },
});

export default UpdateStatusButton;
