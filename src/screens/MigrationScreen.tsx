import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";

const MigrationScreen: React.FC = () => {
  const [migrating, setMigrating] = useState(false);
  const [migrationLog, setMigrationLog] = useState<string[]>([]);
  const [migrationComplete, setMigrationComplete] = useState(false);
  const { user } = useAuth();

  const addLog = (message: string) => {
    setMigrationLog((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  const migratePlayersToUsers = async () => {
    if (!user) {
      Alert.alert("Virhe", "Sinun täytyy olla kirjautunut sisään");
      return;
    }

    Alert.alert(
      "Vahvista migraatio",
      "Tämä siirtää kaikki pelaajat players kokoelmasta users kokoelmaan. Jatketaanko?",
      [
        { text: "Peruuta", style: "cancel" },
        {
          text: "Kyllä, siirretään",
          onPress: async () => {
            setMigrating(true);
            setMigrationLog([]);

            try {
              addLog("🔄 Aloitetaan migraatio...");

              // Hae kaikki pelaajat players kokoelmasta
              const playersSnapshot = await getDocs(collection(db, "players"));
              const players = playersSnapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
              })) as any[];

              addLog(`📊 Löytyi ${players.length} pelaajaa siirrettäväksi`);

              let successCount = 0;
              let errorCount = 0;

              // Siirretään jokainen pelaaja
              for (const player of players) {
                try {
                  // Muunna tiedot users kokoelman muotoon
                  const userData = {
                    name: player.name,
                    displayName: player.name || player.displayName,
                    email: player.email || "",
                    phone: player.phone || "",
                    image: player.image || "",

                    // Muunna teams -> teamIds
                    teamIds: player.teams || player.teamIds || [],

                    // Säilytä muut kentät
                    position: player.position || "H",
                    category: player.category || 1,
                    multiplier: player.multiplier || 1.0,
                    isAdmin: player.isAdmin || false,

                    // Migraation tiedot
                    createdAt: player.createdAt || new Date(),
                    createdBy: player.createdBy || "migration",
                    migratedAt: new Date(),
                    migratedFrom: "players",

                    // Jos sähköposti on annettu, tarvitsee salasanan
                    needsPasswordChange: player.email ? true : false,
                  };

                  // Luo uusi dokumentti users kokoelmaan
                  await setDoc(doc(db, "users", player.id), userData);

                  addLog(
                    `✅ Siirretty: ${player.name} ${
                      player.email ? `(${player.email})` : "(ei sähköpostia)"
                    }`
                  );
                  successCount++;
                } catch (error) {
                  addLog(`❌ Virhe siirrettäessä ${player.name}: ${error}`);
                  errorCount++;
                }
              }

              addLog(`\n📊 Migraatio valmis:`);
              addLog(`✅ Onnistui: ${successCount}`);
              addLog(`❌ Epäonnistui: ${errorCount}`);

              if (successCount > 0 && errorCount === 0) {
                addLog(`\n🎉 Kaikki pelaajat siirretty onnistuneesti!`);
                addLog(
                  `⚠️  Voit nyt poistaa players kokoelman "Poista players kokoelma" -napilla`
                );
                setMigrationComplete(true);
              }
            } catch (error) {
              addLog(`❌ Migraatio epäonnistui: ${error}`);
            }

            setMigrating(false);
          },
        },
      ]
    );
  };

  const deletePlayersCollection = async () => {
    if (!migrationComplete) {
      Alert.alert("Virhe", "Suorita ensin migraatio loppuun");
      return;
    }

    Alert.alert(
      "⚠️ VAROITUS",
      "Tämä poistaa KAIKKI dokumentit players kokoelmasta pysyvästi! Oletko varma?",
      [
        { text: "Peruuta", style: "cancel" },
        {
          text: "Kyllä, poista",
          style: "destructive",
          onPress: async () => {
            setMigrating(true);

            try {
              addLog("🗑️ Aloitetaan players kokoelman poisto...");

              const playersSnapshot = await getDocs(collection(db, "players"));
              const players = playersSnapshot.docs;

              addLog(`📊 Löytyi ${players.length} dokumenttia poistettavaksi`);

              let deletedCount = 0;
              let errorCount = 0;

              for (const playerDoc of players) {
                try {
                  await deleteDoc(doc(db, "players", playerDoc.id));
                  addLog(`🗑️ Poistettu: ${playerDoc.id}`);
                  deletedCount++;
                } catch (error) {
                  addLog(`❌ Virhe poistaessa ${playerDoc.id}: ${error}`);
                  errorCount++;
                }
              }

              addLog(`\n📊 Poisto valmis:`);
              addLog(`🗑️ Poistettu: ${deletedCount}`);
              addLog(`❌ Epäonnistui: ${errorCount}`);

              if (deletedCount > 0 && errorCount === 0) {
                addLog(`\n🎉 Players kokoelma poistettu onnistuneesti!`);
              }
            } catch (error) {
              addLog(`❌ Poisto epäonnistui: ${error}`);
            }

            setMigrating(false);
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tietokannan migraatio</Text>
        <Text style={styles.headerSubtitle}>
          Siirrä pelaajat players → users
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.migrateButton]}
          onPress={migratePlayersToUsers}
          disabled={migrating}
        >
          {migrating ? (
            <ActivityIndicator color="white" />
          ) : (
            <Ionicons name="arrow-forward" size={20} color="white" />
          )}
          <Text style={styles.buttonText}>Siirra pelaajat</Text>
        </TouchableOpacity>

        {migrationComplete && (
          <TouchableOpacity
            style={[styles.button, styles.deleteButton]}
            onPress={deletePlayersCollection}
            disabled={migrating}
          >
            {migrating ? (
              <ActivityIndicator color="white" />
            ) : (
              <Ionicons name="trash" size={20} color="white" />
            )}
            <Text style={styles.buttonText}>Poista players kokoelma</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.logContainer}>
        <Text style={styles.logTitle}>Migraation loki:</Text>
        {migrationLog.map((log, index) => (
          <Text key={index} style={styles.logText}>
            {log}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    padding: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 30,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: "#666",
  },
  buttonContainer: {
    marginBottom: 20,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  migrateButton: {
    backgroundColor: "#4CAF50",
  },
  deleteButton: {
    backgroundColor: "#f44336",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  logContainer: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 8,
    padding: 16,
  },
  logTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  logText: {
    fontSize: 14,
    color: "#333",
    marginBottom: 4,
    fontFamily: "monospace",
  },
});

export default MigrationScreen;
