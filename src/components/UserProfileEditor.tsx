import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Player, Team } from "../types";
import {
  doc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../services/firebase";

interface UserProfileEditorProps {
  player: Player;
  teams: Team[];
  onSave?: () => void;
}

const UserProfileEditor: React.FC<UserProfileEditorProps> = ({
  player,
  teams,
  onSave,
}) => {
  console.log("UserProfileEditor: Initializing with player:", {
    id: player.id,
    name: player.name,
    email: player.email,
    image: player.image,
    imageLength: player.image?.length || 0,
  });

  const [name, setName] = useState(player.name || "");
  const [email, setEmail] = useState(player.email || "");
  const [phone, setPhone] = useState(player.phone || "");
  const [image, setImage] = useState(player.image || "");
  const [saving, setSaving] = useState(false);
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [teamCode, setTeamCode] = useState("");
  const [joiningTeam, setJoiningTeam] = useState(false);

  // Update local state only when player changes AND we don't have unsaved image changes
  useEffect(() => {
    console.log("UserProfileEditor: useEffect - player changed");
    // Only update if we don't have a local image that differs from player.image
    // This prevents overwriting user's selected image before they save
    if (!image || image === player.image) {
      console.log("UserProfileEditor: Updating state from player props");
      setName(player.name || "");
      setEmail(player.email || "");
      setPhone(player.phone || "");
      setImage(player.image || "");
    } else {
      console.log(
        "UserProfileEditor: Skipping state update - user has unsaved image changes"
      );
    }
  }, [player.id]); // Only re-run if player ID changes, not on every render

  // Hae kaikki joukkueet joissa käyttäjä on mukana teamIds-kentän kautta
  const userTeams = teams.filter((team) => player.teamIds?.includes(team.id));

  console.log(
    `UserProfileEditor: Löytyi ${userTeams.length} joukkuetta pelaajalle ${
      player.name || "Nimetön"
    }`
  );

  const handlePickImage = async () => {
    try {
      console.log("UserProfileEditor: Requesting media library permissions...");
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissionResult.granted === false) {
        console.log("UserProfileEditor: Permission denied");
        Alert.alert("Lupa vaaditaan", "Kuvien käyttöön tarvitaan lupa");
        return;
      }

      console.log("UserProfileEditor: Launching image picker...");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const imageUri = result.assets[0].uri;
        console.log("UserProfileEditor: Image selected:", imageUri);

        // Upload to Firebase Storage immediately
        try {
          console.log(
            "UserProfileEditor: Uploading image to Firebase Storage..."
          );
          setSaving(true);

          // Fetch the image as a blob
          const response = await fetch(imageUri);
          const blob = await response.blob();

          // Create a unique filename
          const filename = `profile-images/${player.id}_${Date.now()}.jpg`;
          const storageRef = ref(storage, filename);

          console.log("UserProfileEditor: Uploading to:", filename);
          await uploadBytes(storageRef, blob);

          // Get the download URL
          const downloadURL = await getDownloadURL(storageRef);
          console.log("UserProfileEditor: Upload complete! URL:", downloadURL);

          setImage(downloadURL);
          Alert.alert(
            "Valmis",
            "Kuva ladattu onnistuneesti! Muista tallentaa profiili."
          );
        } catch (uploadError) {
          console.error("UserProfileEditor: Upload error:", uploadError);
          Alert.alert("Virhe", "Kuvan lataus epäonnistui");
        } finally {
          setSaving(false);
        }
      } else {
        console.log("UserProfileEditor: Image selection cancelled");
      }
    } catch (error) {
      console.error("UserProfileEditor: Image picker error:", error);
      Alert.alert("Virhe", "Kuvan valinta epäonnistui");
    }
  };

  const handleJoinTeam = async () => {
    if (!teamCode.trim()) {
      Alert.alert("Virhe", "Syötä joukkuekoodi");
      return;
    }

    setJoiningTeam(true);
    try {
      // Etsi joukkue koodilla
      const teamsQuery = query(
        collection(db, "teams"),
        where("code", "==", teamCode.trim().toUpperCase())
      );
      const querySnapshot = await getDocs(teamsQuery);

      if (querySnapshot.empty) {
        // Kokeile myös licenceCode kenttää takaisintoimivuuden vuoksi
        const licenceQuery = query(
          collection(db, "teams"),
          where("licenceCode", "==", teamCode.trim().toUpperCase())
        );
        const licenceSnapshot = await getDocs(licenceQuery);

        if (licenceSnapshot.empty) {
          Alert.alert("Virhe", "Joukkuetta ei löytynyt annetulla koodilla");
          setJoiningTeam(false);
          return;
        }

        // Käytä licenceCode tulosta jos löytyy
        const teamData = licenceSnapshot.docs[0].data() as Team;
        const teamRef = doc(db, "teams", licenceSnapshot.docs[0].id);

        await updateDoc(teamRef, {
          members: arrayUnion(player.id),
        });

        Alert.alert("Onnistui", `Liityit joukkueeseen: ${teamData.name}`);
        setJoinModalVisible(false);
        setTeamCode("");
        setJoiningTeam(false);
        return;
      }
      const teamDoc = querySnapshot.docs[0];
      const team = { id: teamDoc.id, ...teamDoc.data() } as Team;

      // Tarkista onko pelaaja jo joukkueessa teamIds-kentän kautta
      const alreadyInTeam = player.teamIds?.includes(team.id);

      if (alreadyInTeam) {
        Alert.alert("Tiedoksi", "Olet jo tässä joukkueessa");
        setJoiningTeam(false);
        setJoinModalVisible(false);
        setTeamCode("");
        return;
      }

      // Lisää pelaaja joukkueeseen
      const playerRef = doc(db, "users", player.id);

      await updateDoc(playerRef, {
        teamIds: arrayUnion(team.id),
      });

      Alert.alert("Onnistui!", `Liityit joukkueeseen: ${team.name}`);
      setJoinModalVisible(false);
      setTeamCode("");

      // Kutsu onSave-callbackia päivittääksemme datan
      if (onSave) {
        onSave();
      }
    } catch (error) {
      console.error("Error joining team:", error);
      Alert.alert("Virhe", "Joukkueeseen liittyminen epäonnistui");
    }
    setJoiningTeam(false);
  };

  const handleLeaveTeam = async (teamId: string, teamName: string) => {
    Alert.alert(
      "Vahvista",
      `Haluatko varmasti poistua joukkueesta "${teamName}"?`,
      [
        { text: "Peruuta", style: "cancel" },
        {
          text: "Poistu",
          style: "destructive",
          onPress: async () => {
            try {
              const playerRef = doc(db, "users", player.id);
              const teamRef = doc(db, "teams", teamId);

              // Poista teamId pelaajan teamIds-listasta
              await updateDoc(playerRef, {
                teamIds: arrayRemove(teamId),
              });

              // Hae joukkueen tiedot ja poista kaikki pelaajan mahdolliset ID:t members-listasta
              const teamDoc = await getDoc(teamRef);
              if (teamDoc.exists()) {
                const teamData = teamDoc.data();
                const currentMembers = teamData.members || [];

                // Poista kaikki pelaajan ID:t (player.id, player.playerId, player.email)
                const updatedMembers = currentMembers.filter(
                  (memberId: string) =>
                    memberId !== player.id &&
                    memberId !== player.playerId &&
                    memberId !== player.email
                );

                await updateDoc(teamRef, {
                  members: updatedMembers,
                });

                console.log("Removed player from team:", {
                  teamId,
                  originalMembersCount: currentMembers.length,
                  newMembersCount: updatedMembers.length,
                });
              }

              Alert.alert("Onnistui", `Poistuit joukkueesta: ${teamName}`);

              // Kutsu onSave-callbackia päivittääksemme datan
              if (onSave) {
                onSave();
              }
            } catch (error) {
              console.error("Error leaving team:", error);
              Alert.alert("Virhe", "Joukkueesta poistuminen epäonnistui");
            }
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      console.log("UserProfileEditor: Saving profile...");
      console.log("  - Player ID:", player.id);
      console.log("  - Name:", name.trim());
      console.log("  - Phone:", phone.trim());
      console.log("  - Image:", image.trim());

      const playerRef = doc(db, "users", player.id);
      const updateData = {
        name: name.trim(),
        phone: phone.trim(),
        image: image.trim(),
      };

      console.log("  - Update data:", updateData);
      await updateDoc(playerRef, updateData);

      console.log("UserProfileEditor: Profile saved successfully!");
      Alert.alert("Tallennettu", "Profiilitiedot päivitetty");
      if (onSave) onSave();
    } catch (e) {
      console.error("UserProfileEditor: Save error:", e);
      Alert.alert("Virhe", "Tietojen tallennus epäonnistui");
    }
    setSaving(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.avatarContainer}>
        {image ? (
          <Image source={{ uri: image }} style={styles.avatar} />
        ) : (
          <Ionicons name="person-circle" size={80} color="#bbb" />
        )}
        <TouchableOpacity style={styles.imageButton} onPress={handlePickImage}>
          <Ionicons name="camera" size={20} color="#1976d2" />
          <Text style={styles.imageButtonText}>Muokkaa kuvaa</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Nimi</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Nimi"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Sähköposti</Text>
        <TextInput style={styles.input} value={email} editable={false} />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Puhelinnumero</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="Puhelinnumero"
          keyboardType="phone-pad"
        />
      </View>
      <View style={styles.inputGroup}>
        <View style={styles.teamHeader}>
          <Text style={styles.label}>Joukkueet</Text>
          <TouchableOpacity
            style={styles.joinButton}
            onPress={() => setJoinModalVisible(true)}
          >
            <Ionicons name="add" size={20} color="#4CAF50" />
            <Text style={styles.joinButtonText}>Liity joukkueeseen</Text>
          </TouchableOpacity>
        </View>
        {userTeams.length === 0 ? (
          <Text style={styles.teamText}>Ei joukkueita</Text>
        ) : (
          userTeams.map((team) => (
            <View key={team.id} style={styles.teamItem}>
              <View style={styles.teamInfo}>
                <View
                  style={[
                    styles.teamColorIndicator,
                    { backgroundColor: team.color || "#666" },
                  ]}
                />
                <Text style={styles.teamText}>{team.name}</Text>
              </View>
              <TouchableOpacity
                style={styles.leaveButton}
                onPress={() => handleLeaveTeam(team.id, team.name)}
              >
                <Ionicons name="exit-outline" size={20} color="#f44336" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
      <TouchableOpacity
        style={styles.saveButton}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Ionicons
            name="save"
            size={20}
            color="#fff"
            style={{ marginRight: 8 }}
          />
        )}
        <Text style={styles.saveButtonText}>Tallenna</Text>
      </TouchableOpacity>

      {/* Liity joukkueeseen modal */}
      <Modal
        visible={joinModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setJoinModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Liity joukkueeseen</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setJoinModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Joukkuekoodi</Text>
              <TextInput
                style={styles.input}
                value={teamCode}
                onChangeText={setTeamCode}
                placeholder="Syötä joukkuekoodi"
                autoCapitalize="characters"
                maxLength={10}
              />
            </View>

            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: "#4CAF50" }]}
              onPress={handleJoinTeam}
              disabled={joiningTeam}
            >
              {joiningTeam ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons
                  name="add"
                  size={20}
                  color="#fff"
                  style={{ marginRight: 8 }}
                />
              )}
              <Text style={styles.saveButtonText}>Liity joukkueeseen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    alignItems: "stretch",
  },
  avatarContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 8,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#f9f9f9",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#333",
  },
  teamText: {
    fontSize: 15,
    color: "#1976d2",
    marginBottom: 2,
  },
  saveButton: {
    backgroundColor: "#1976d2",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  imageButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#f0f8ff",
  },
  imageButtonText: {
    color: "#1976d2",
    fontSize: 14,
    marginLeft: 4,
  },
  teamHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#e8f5e8",
  },
  joinButtonText: {
    color: "#4CAF50",
    fontSize: 14,
    marginLeft: 4,
  },
  teamItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    marginBottom: 4,
  },
  teamInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  teamColorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  leaveButton: {
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    width: "85%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  closeButton: {
    padding: 8,
  },
});

export default UserProfileEditor;
