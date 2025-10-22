import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { collection, doc, updateDoc, deleteDoc } from "firebase/firestore";

import { RootStackParamList, Team, Player } from "../types";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  useApp,
  getUserTeams,
  getUserAdminTeams,
} from "../contexts/AppContext";

type UserManagementScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "UserManagement"
>;

const UserManagementScreen: React.FC = () => {
  const navigation = useNavigation<UserManagementScreenNavigationProp>();
  const { user } = useAuth();
  const { teams, players: allPlayers, refreshData } = useApp();

  // Helper function to check if user is master admin
  const isMasterAdmin = (): boolean => {
    return Boolean(user && user.isMasterAdmin === true);
  };

  // Filtteröi joukkueet: Admin näkee vain ne joukkueet joissa on admin
  const userTeams = useMemo(() => {
    if (!user || !user.uid) {
      console.log("UserManagement: No user, returning empty teams array");
      return [];
    }
    if (teams.length === 0) {
      return [];
    }
    // Käyttäjä näkee vain ne joukkueet joissa on admin-oikeudet
    return getUserAdminTeams(user, teams);
  }, [user, teams]);

  // State
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Local state for optimistic updates of team skills
  const [localTeamSkills, setLocalTeamSkills] = useState<{
    [key: string]: { category: number; multiplier: number; position: string };
  }>({});

  // Tyhjennä optimistic state kun joukkue vaihtuu
  const handleTeamChange = (teamId: string) => {
    setSelectedTeam(teamId);
    setLocalTeamSkills({}); // Tyhjennä optimistic updates kun joukkue vaihtuu
    console.log("Team changed, cleared local team skills cache");
  };

  // Debug: Log data changes
  useEffect(() => {
    console.log(
      "UserManagement: Data updated - Players:",
      allPlayers.length,
      "Teams:",
      teams.length
    );
  }, [allPlayers, teams]);

  // Filtteröi pelaajat valitun joukkueen mukaan
  const filteredPlayers = useMemo(() => {
    console.log("UserManagement: Filtering players for team:", selectedTeam);
    console.log("UserManagement: Total players:", allPlayers.length);

    if (!selectedTeam) return [];

    const selectedTeamData = teams.find((team) => team.id === selectedTeam);
    if (!selectedTeamData) {
      console.log("UserManagement: Selected team not found");
      return [];
    }

    console.log(
      "UserManagement: Selected team data:",
      selectedTeamData.name,
      "members:",
      selectedTeamData.members
    );

    // Käytetään sekä teamIds että members-kenttää varmuuden vuoksi
    const filtered = allPlayers.filter((player) => {
      const inTeamByTeamIds = player.teamIds?.includes(selectedTeam);
      const inTeamByMembers = selectedTeamData.members.includes(player.id);

      console.log(`UserManagement: Player ${player.name || player.email}:`, {
        teamIds: player.teamIds,
        inTeamByTeamIds,
        inTeamByMembers,
        name: player.name,
        nameIsEmpty: !player.name || !player.name.trim(),
      });

      return inTeamByTeamIds || inTeamByMembers;
    });

    console.log("UserManagement: Filtered players count:", filtered.length);

    // Lajittele pelaajat aakkosjärjestykseen sukunimen perusteella
    const sorted = filtered.sort((a, b) => {
      const aName = (a.name && a.name.trim()) || a.email || "Tuntematon";
      const bName = (b.name && b.name.trim()) || b.email || "Tuntematon";
      const aLastName = aName.split(" ").pop() || aName;
      const bLastName = bName.split(" ").pop() || bName;
      return aLastName.localeCompare(bLastName, "fi");
    });

    return sorted;
  }, [selectedTeam, allPlayers, teams, localTeamSkills]); // Poistettu teamPlayers riippuvuus

  // Aseta ensimmäinen joukkue valituksi automaattisesti
  useEffect(() => {
    if (userTeams.length > 0 && !selectedTeam) {
      console.log(
        "UserManagement: Auto-selecting first team:",
        userTeams[0].id
      );
      setSelectedTeam(userTeams[0].id);
    }
  }, [userTeams, selectedTeam]);

  // Modal states
  const [isTeamModalVisible, setIsTeamModalVisible] = useState(false);
  const [isPlayerModalVisible, setIsPlayerModalVisible] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // Edit form states
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPosition, setEditPosition] = useState("H");
  const [editCategory, setEditCategory] = useState(1);
  const [editMultiplier, setEditMultiplier] = useState(1.0);
  // Rooli: "member" | "admin"
  const [editRole, setEditRole] = useState<"member" | "admin">("member");
  const [editSelectedTeams, setEditSelectedTeams] = useState<string[]>([]);

  // Yksi dropdown-tila: mikä valinta auki ('position' | 'category' | 'multiplier' | 'role' | 'teams' | null)
  const [editDropdown, setEditDropdown] = useState<null | string>(null);

  const positions = [
    { value: "H", label: "Hyökkääjä" },
    { value: "P", label: "Puolustaja" },
    { value: "H/P", label: "Hyökkääjä/Puolustaja" },
    { value: "MV", label: "Maalivahti" },
  ];

  const categories = [1, 2, 3];

  // Kerroin vaihtoehdot kategoriaperusteisesti
  const getMultiplierOptions = () => {
    if (editCategory === 1) {
      return [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9];
    } else if (editCategory === 2) {
      return [2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9];
    } else {
      return [3.0, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9];
    }
  };

  // Helper function to get team skills with local state fallback
  const getTeamSkillsWithLocal = (playerId: string, teamId: string) => {
    const localKey = `${playerId}-${teamId}`;
    const localSkills = localTeamSkills[localKey];

    if (localSkills) {
      console.log(`Using local skills for ${playerId}-${teamId}:`, localSkills);
      return localSkills;
    }

    // Löydä pelaaja ja hae teamSkills suoraan player objektista
    const player = allPlayers.find((p) => p.id === playerId);
    if (player?.teamSkills?.[teamId]) {
      console.log(
        `Using Firestore skills for ${playerId}-${teamId}:`,
        player.teamSkills[teamId]
      );
      return player.teamSkills[teamId];
    }

    console.log(`No team skills found for ${playerId}-${teamId}`);
    return null;
  };

  // Päivitä kerroin automaattisesti kategorian muuttuessa
  const handleCategoryChange = (newCategory: number) => {
    setEditCategory(newCategory);
    if (newCategory === 1) {
      setEditMultiplier(1.0);
    } else if (newCategory === 2) {
      setEditMultiplier(2.0);
    } else {
      setEditMultiplier(3.0);
    }
  };

  // Avaa pelaajan muokkausmodaali
  const openPlayerModal = (player: Player) => {
    console.log("UserManagement: Opening player modal for:", player.name);
    console.log("UserManagement: Player data:", {
      teams: player.teams,
      teamIds: player.teamIds,
      category: player.category,
      multiplier: player.multiplier,
      role: (player as any).role,
      isAdmin: player.isAdmin,
    });

    setSelectedPlayer(player);
    setEditName(player.name);
    setEditEmail(player.email);
    setEditPhone(player.phone || "");

    // Jos joukkue on valittu, käytä joukkuekohtaisia taitoja
    if (selectedTeam) {
      const teamSkills = getTeamSkillsWithLocal(player.id, selectedTeam);
      setEditPosition(teamSkills?.position || player.position);
      setEditCategory(teamSkills?.category || player.category);
      setEditMultiplier(teamSkills?.multiplier || player.multiplier);
    } else {
      // Käytä pelaajan perustaitoja
      setEditPosition(player.position);
      setEditCategory(player.category);
      setEditMultiplier(player.multiplier);
    }

    // Määritä rooli: jos joukkue on valittu, käytä joukkuekohtaista roolia
    if (selectedTeam) {
      // Tarkista onko käyttäjä valitun joukkueen adminIds listassa
      const selectedTeamData = teams.find((team) => team.id === selectedTeam);
      if (selectedTeamData?.adminIds?.includes(player.id)) {
        setEditRole("admin");
      } else {
        // Kun joukkue on valittu, käytä vain "member" ellei ole kyseisen joukkueen adminIds-listassa
        setEditRole("member");
      }
    } else {
      // Jos ei ole joukkuetta valittu, käytä globaalia roolia
      const playerRole = (player as any).role;
      if (player.isAdmin) {
        setEditRole("admin");
      } else {
        setEditRole("member");
      }
    }

    setEditSelectedTeams(player.teamIds || player.teams || []);
    setIsPlayerModalVisible(true);
  };

  // Sulje pelaajan modaali ja nollaa tiedot
  const closePlayerModal = () => {
    console.log("UserManagement: Closing player modal");
    setIsPlayerModalVisible(false);
    setSelectedPlayer(null);
    setEditName("");
    setEditEmail("");
    setEditPhone("");
    setEditPosition("H");
    setEditCategory(1);
    setEditMultiplier(1.0);
    setEditRole("member");
    setEditSelectedTeams([]);
    // Ei enää erillisiä edit-modaaleja
  };

  // Tallenna pelaajan muutokset
  const savePlayerChanges = async () => {
    if (!selectedPlayer) return;

    console.log("UserManagement: Saving player changes:", {
      name: editName,
      teams: editSelectedTeams,
      category: editCategory,
      multiplier: editMultiplier,
      role: editRole,
    });

    if (!editName.trim()) {
      Alert.alert("Virhe", "Nimi on pakollinen");
      return;
    }
    if (!editEmail.trim()) {
      Alert.alert("Virhe", "Sähköposti on pakollinen");
      return;
    }
    if (editSelectedTeams.length === 0) {
      Alert.alert("Virhe", "Valitse vähintään yksi joukkue");
      return;
    }

    try {
      // Käsittele teamPlayers muutokset kun pelaajan joukkueita muutetaan
      const originalTeams =
        selectedPlayer.teamIds || selectedPlayer.teams || [];
      const removedTeams = originalTeams.filter(
        (teamId) => !editSelectedTeams.includes(teamId)
      );
      const addedTeams = editSelectedTeams.filter(
        (teamId) => !originalTeams.includes(teamId)
      );

      console.log("Team changes:", {
        original: originalTeams,
        new: editSelectedTeams,
        removed: removedTeams,
        added: addedTeams,
      });

      console.log("Current teams data before update:");
      teams.forEach((team) => {
        console.log(`Team ${team.name}:`, team.members);
      });

      // Poista pelaaja poistetuista joukkueista
      for (const removedTeamId of removedTeams) {
        // Poista pelaaja joukkueen members-listasta
        const teamToUpdate = teams.find((team) => team.id === removedTeamId);
        if (teamToUpdate && teamToUpdate.members.includes(selectedPlayer.id)) {
          console.log("Removing player from team members:", removedTeamId);
          const updatedMembers = teamToUpdate.members.filter(
            (memberId) => memberId !== selectedPlayer.id
          );
          const teamRef = doc(db, "teams", removedTeamId);
          await updateDoc(teamRef, {
            members: updatedMembers,
            updatedAt: new Date(),
          });
        }
      }

      // Lisää pelaaja uusien joukkueiden members-listoihin
      for (const addedTeamId of addedTeams) {
        const teamToUpdate = teams.find((team) => team.id === addedTeamId);
        if (teamToUpdate && !teamToUpdate.members.includes(selectedPlayer.id)) {
          console.log("Adding player to team members:", addedTeamId);
          const updatedMembers = [...teamToUpdate.members, selectedPlayer.id];
          const teamRef = doc(db, "teams", addedTeamId);
          await updateDoc(teamRef, {
            members: updatedMembers,
            updatedAt: new Date(),
          });
        }
      }

      // Päivitä pelaajan perustiedot
      const playerRef = doc(db, "users", selectedPlayer.id);

      // Jos joukkueita on poistettu, poista myös niiden joukkuekohtaiset taidot
      const currentTeamSkillsData = { ...selectedPlayer.teamSkills };
      for (const removedTeamId of removedTeams) {
        if (currentTeamSkillsData[removedTeamId]) {
          delete currentTeamSkillsData[removedTeamId];
          console.log("Removed team skills for removed team:", removedTeamId);
        }
      }

      if (selectedTeam) {
        // Jos joukkue on valittu, tallenna myös joukkuekohtaiset taidot
        const currentTeamSkills = selectedPlayer.teamSkills?.[selectedTeam];

        // Tarkista onko taidot muuttuneet nykyisistä taidoista (joukkuekohtaisista tai perustaidoista)
        const currentCategory =
          currentTeamSkills?.category || selectedPlayer.category;
        const currentMultiplier =
          currentTeamSkills?.multiplier || selectedPlayer.multiplier;
        const currentPosition =
          currentTeamSkills?.position || selectedPlayer.position;

        const skillsChanged =
          editCategory !== currentCategory ||
          editMultiplier !== currentMultiplier ||
          editPosition !== currentPosition;

        console.log("Skills comparison:", {
          current: {
            category: currentCategory,
            multiplier: currentMultiplier,
            position: currentPosition,
          },
          edited: {
            category: editCategory,
            multiplier: editMultiplier,
            position: editPosition,
          },
          skillsChanged,
        });

        console.log("Debug team skills save:", {
          selectedTeam,
          hasCurrentTeamSkills: !!currentTeamSkills,
          willSaveTeamSkills: skillsChanged,
        });

        if (skillsChanged) {
          console.log("💾 Saving team skills to Firestore...");

          // Optimistic update - päivitä local state heti
          const localKey = `${selectedPlayer.id}-${selectedTeam}`;
          setLocalTeamSkills((prev) => ({
            ...prev,
            [localKey]: {
              category: editCategory,
              multiplier: editMultiplier,
              position: editPosition,
            },
          }));
          console.log("⚡ Applied optimistic update for team skills");

          // Tallenna joukkuekohtaiset taidot suoraan pelaajan dokumenttiin
          // Käytä teamSkills kenttää jossa avaimena on teamId
          const currentTeamSkills = selectedPlayer.teamSkills || {};
          const updatedTeamSkills = {
            ...currentTeamSkills,
            [selectedTeam]: {
              category: editCategory,
              multiplier: editMultiplier,
              position: editPosition,
              updatedAt: new Date(),
            },
          };

          console.log("Saving team skills to user document:", {
            playerId: selectedPlayer.id,
            teamId: selectedTeam,
            teamSkills: updatedTeamSkills[selectedTeam],
          });

          // Päivitä pelaajan dokumentti teamSkills kentällä
          await updateDoc(playerRef, {
            teamSkills: updatedTeamSkills,
          });

          console.log("✅ Team skills saved to user document successfully");
        } else {
          console.log("⏭️ No team skills changes detected, skipping save");
        }
      }

      // Päivitä pelaajan perustiedot
      const updateData: any = {
        name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        phone: editPhone.trim(),
        teams: editSelectedTeams,
        teamIds: editSelectedTeams,
        updatedAt: new Date(),
      };

      // Päivitä globaalit roolitiedot vain jos ei ole joukkuetta valittu
      if (!selectedTeam) {
        updateData.isAdmin = editRole === "admin";
        updateData.role = editRole;
      }

      // Jos joukkueita poistettiin, päivitä teamSkills
      if (removedTeams.length > 0) {
        updateData.teamSkills = currentTeamSkillsData;
      }

      // Päivitä perustaidot vain jos ei ole joukkuetta valittu
      if (!selectedTeam) {
        updateData.position = editPosition;
        updateData.category = editCategory;
        updateData.multiplier = editMultiplier;
      }

      await updateDoc(playerRef, updateData);

      // Jos rooli on admin ja joukkue on valittu, lisää käyttäjä joukkueen adminIds listaan
      if (editRole === "admin" && selectedTeam) {
        console.log("Adding user to team adminIds:", {
          userId: selectedPlayer.id,
          teamId: selectedTeam,
          role: editRole,
        });

        const selectedTeamData = teams.find((team) => team.id === selectedTeam);
        if (selectedTeamData) {
          const currentAdminIds = selectedTeamData.adminIds || [];
          if (!currentAdminIds.includes(selectedPlayer.id)) {
            const updatedAdminIds = [...currentAdminIds, selectedPlayer.id];

            const teamRef = doc(db, "teams", selectedTeam);
            await updateDoc(teamRef, {
              adminIds: updatedAdminIds,
              updatedAt: new Date(),
            });

            console.log("✅ User added to team adminIds successfully");
          }
        }
      }

      // Jos rooli ei ole admin mutta käyttäjä on adminIds listassa, poista se
      if (editRole !== "admin" && selectedTeam) {
        console.log("Removing user from team adminIds if present:", {
          userId: selectedPlayer.id,
          teamId: selectedTeam,
          role: editRole,
        });

        const selectedTeamData = teams.find((team) => team.id === selectedTeam);
        if (
          selectedTeamData &&
          selectedTeamData.adminIds?.includes(selectedPlayer.id)
        ) {
          const updatedAdminIds = selectedTeamData.adminIds.filter(
            (id) => id !== selectedPlayer.id
          );

          const teamRef = doc(db, "teams", selectedTeam);
          await updateDoc(teamRef, {
            adminIds: updatedAdminIds,
            updatedAt: new Date(),
          });

          console.log("✅ User removed from team adminIds successfully");
        }
      }

      // Pakota datan päivitys ja komponenttien uudelleen renderöinti
      await refreshData();

      // Lisää pidempi viive varmistamaan että real-time listenerit päivittyvät
      console.log("⏳ Waiting for Firestore real-time updates...");
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Pakota myös teamPlayers-datan päivitys
      console.log(
        "🔄 Refreshing data again to ensure teamPlayers are updated..."
      );
      await refreshData();

      // Lisää vielä lyhyt viive
      await new Promise((resolve) => setTimeout(resolve, 500));

      console.log("Teams data after update and refresh:");
      teams.forEach((team) => {
        console.log(`Team ${team.name}:`, team.members);
      });

      console.log(
        `Player ${selectedPlayer.name} teamIds after update:`,
        editSelectedTeams
      );

      // Debug: Tarkista onko teamSkills-data päivittynyt
      const updatedPlayer = allPlayers.find((p) => p.id === selectedPlayer.id);
      const updatedTeamSkills = updatedPlayer?.teamSkills?.[selectedTeam];
      const localKey = `${selectedPlayer.id}-${selectedTeam}`;
      const optimisticSkills = localTeamSkills[localKey];

      console.log("🔍 Updated team skills after save:", updatedTeamSkills);
      console.log("🔍 Optimistic team skills:", optimisticSkills);
      console.log("🔍 Current player teamSkills:", updatedPlayer?.teamSkills);

      Alert.alert(
        "Onnistui",
        selectedTeam
          ? "Pelaajan tiedot ja joukkuekohtaiset taidot päivitetty"
          : "Pelaajan tiedot päivitetty"
      );
      closePlayerModal();
    } catch (error) {
      console.error("Error updating player:", error);
      Alert.alert("Virhe", "Pelaajan päivittäminen epäonnistui");
    }
  };

  // Poista pelaaja
  const deletePlayer = async () => {
    if (!selectedPlayer) return;

    Alert.alert(
      "Poista pelaaja",
      `Haluatko varmasti poistaa pelaajan ${selectedPlayer.name}?`,
      [
        { text: "Peruuta", style: "cancel" },
        {
          text: "Poista",
          style: "destructive",
          onPress: async () => {
            try {
              // Käytä users collectioa players sijasta
              await deleteDoc(doc(db, "users", selectedPlayer.id));
              Alert.alert("Onnistui", "Pelaaja poistettu");
              closePlayerModal();
              refreshData();
            } catch (error) {
              console.error("Error deleting player:", error);
              Alert.alert("Virhe", "Pelaajan poistaminen epäonnistui");
            }
          },
        },
      ]
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    refreshData().finally(() => setRefreshing(false));
  };

  const getSelectedTeamName = () => {
    if (!selectedTeam) return "Valitse joukkue";
    const team = userTeams.find((t) => t.id === selectedTeam);
    return team?.name || "Tuntematon joukkue";
  };

  const getPositionLabel = () => {
    return (
      positions.find((p) => p.value === editPosition)?.label || editPosition
    );
  };

  const toggleEditTeamSelection = (teamId: string) => {
    console.log("UserManagement: Toggling team selection for:", teamId);
    console.log("UserManagement: Current selected teams:", editSelectedTeams);

    setEditSelectedTeams((prev) => {
      const newSelection = prev.includes(teamId)
        ? prev.filter((id) => id !== teamId)
        : [...prev, teamId];

      console.log("UserManagement: New selected teams:", newSelection);
      return newSelection;
    });
  };

  const getEditSelectedTeamsText = () => {
    console.log("UserManagement: Getting teams text for:", editSelectedTeams);

    if (editSelectedTeams.length === 0) return "Valitse joukkueet";
    if (editSelectedTeams.length === 1) {
      const team = userTeams.find((t) => t.id === editSelectedTeams[0]);
      return team?.name || "Tuntematon joukkue";
    }
    return `${editSelectedTeams.length} joukkuetta valittu`;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.content}>
          {/* <Text style={styles.title}>Käyttäjähallinta</Text> */}

          {/* Team Selection */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Valitse joukkue</Text>
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setIsTeamModalVisible(true)}
            >
              <Text
                style={[
                  styles.selectorText,
                  !selectedTeam && styles.placeholderText,
                ]}
              >
                {getSelectedTeamName()}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Players List */}
          {selectedTeam && (
            <View style={styles.playersSection}>
              <Text style={styles.sectionTitle}>
                Pelaajat ({filteredPlayers.length})
              </Text>

              {loading ? (
                <Text style={styles.loadingText}>Ladataan pelaajia...</Text>
              ) : filteredPlayers.length === 0 ? (
                <Text style={styles.emptyText}>
                  Ei pelaajia valitussa joukkueessa
                </Text>
              ) : (
                filteredPlayers.map((player) => {
                  const isGoalkeeper = player.position === "MV";
                  // Käytä valittua joukkuetta värikoodaukseen
                  const selectedTeamData = teams.find(
                    (team) => team.id === selectedTeam
                  );

                  // Get team-specific skills
                  const teamSkills = getTeamSkillsWithLocal(
                    player.id,
                    selectedTeam
                  );
                  const displayCategory =
                    teamSkills?.category || player.category;
                  const displayMultiplier =
                    teamSkills?.multiplier || player.multiplier;
                  const displayPosition =
                    teamSkills?.position || player.position;
                  const hasTeamSkills = Boolean(teamSkills);

                  // Määritä rooli joukkuekohtaisesti
                  let playerRole = "Jäsen";
                  if (selectedTeam) {
                    const selectedTeamData = teams.find(
                      (team) => team.id === selectedTeam
                    );
                    if (selectedTeamData?.adminIds?.includes(player.id)) {
                      playerRole = "Admin";
                    } else {
                      // Kun joukkue on valittu, näytä vain "Jäsen" ellei ole kyseisen joukkueen adminIds-listassa
                      // Globaalit roolit eivät näy joukkuenäkymässä
                      playerRole = "Jäsen";
                    }
                  } else {
                    // Jos ei ole joukkuetta valittu, näytä globaali rooli
                    const globalRole = (player as any).role;
                    if (player.isAdmin) {
                      playerRole = "Admin";
                    }
                  }

                  return (
                    <TouchableOpacity
                      key={player.id}
                      style={[
                        styles.playerCard,
                        isGoalkeeper && {
                          borderLeftWidth: 4,
                          borderLeftColor: "#ff9800",
                          backgroundColor: "#fff8e1",
                        },
                      ]}
                      onPress={() => openPlayerModal(player)}
                    >
                      {!isGoalkeeper && selectedTeamData && (
                        <View
                          style={[
                            styles.playerTeamIndicator,
                            {
                              backgroundColor:
                                selectedTeamData.color || "#1976d2",
                            },
                          ]}
                        />
                      )}
                      <View style={styles.playerInfo}>
                        <Text
                          style={[
                            styles.playerName,
                            isGoalkeeper && {
                              color: "#ff9800",
                              fontWeight: "600",
                            },
                          ]}
                        >
                          {(player.name && player.name.trim()) ||
                            player.email ||
                            "Tuntematon"}
                          {isGoalkeeper && " 🥅"}
                        </Text>
                        <Text style={styles.playerDetails}>
                          {displayPosition} • Kat. {displayCategory} •{" "}
                          {displayMultiplier.toFixed(1)}
                          {playerRole !== "Jäsen" && (
                            <Text
                              style={[
                                styles.roleIndicator,
                                playerRole === "Admin" && styles.adminRole,
                              ]}
                            >
                              {" • " + playerRole}
                            </Text>
                          )}
                        </Text>
                        <Text style={styles.playerContact}>
                          {player.email}
                          {player.phone && ` • ${player.phone}`}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#666" />
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Team Selection Modal */}
      <Modal
        visible={isTeamModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsTeamModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Valitse joukkue</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsTeamModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {userTeams.map((team) => (
              <TouchableOpacity
                key={team.id}
                style={[
                  styles.option,
                  selectedTeam === team.id && styles.selectedOption,
                ]}
                onPress={() => {
                  handleTeamChange(team.id);
                  setIsTeamModalVisible(false);
                }}
              >
                <View style={styles.teamOptionContent}>
                  <View
                    style={[
                      styles.teamColorIndicator,
                      { backgroundColor: team.color || "#1976d2" },
                    ]}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      selectedTeam === team.id && styles.selectedOptionText,
                    ]}
                  >
                    {team.name}
                  </Text>
                </View>
                {selectedTeam === team.id && (
                  <Ionicons name="checkmark" size={20} color="#007AFF" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Player Edit Modal - Implementation continues in next part */}

      {/* Player Details/Edit Modal */}
      <Modal
        visible={isPlayerModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={closePlayerModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.editModalContent]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Muokkaa pelaajaa</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closePlayerModal}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.editScrollView}>
              {/* Name */}
              <View style={styles.editInputGroup}>
                <Text style={styles.label}>Nimi *</Text>
                <TextInput
                  style={styles.input}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Pelaajan nimi"
                  placeholderTextColor="#999"
                />
              </View>

              {/* Email */}
              <View style={styles.editInputGroup}>
                <Text style={styles.label}>Sähköposti *</Text>
                <TextInput
                  style={styles.input}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="pelaaja@example.com"
                  placeholderTextColor="#999"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              {/* Phone */}
              <View style={styles.editInputGroup}>
                <Text style={styles.label}>Puhelinnumero</Text>
                <TextInput
                  style={styles.input}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="+358 XX XXX XXXX"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                />
              </View>

              {/* Team Selection */}
              <View style={styles.editInputGroup}>
                <Text style={styles.label}>Joukkueet *</Text>
                <TouchableOpacity
                  style={styles.selector}
                  onPress={() =>
                    setEditDropdown(editDropdown === "teams" ? null : "teams")
                  }
                >
                  <Text
                    style={[
                      styles.selectorText,
                      editSelectedTeams.length === 0 && styles.placeholderText,
                    ]}
                  >
                    {getEditSelectedTeamsText()}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>
                {editDropdown === "teams" && (
                  <View style={styles.dropdownList}>
                    {userTeams.map((team) => (
                      <TouchableOpacity
                        key={team.id}
                        style={styles.dropdownOption}
                        onPress={() => toggleEditTeamSelection(team.id)}
                      >
                        <View style={styles.teamOptionLeft}>
                          <View style={styles.checkbox}>
                            {editSelectedTeams.includes(team.id) && (
                              <Ionicons
                                name="checkmark"
                                size={16}
                                color="#007AFF"
                              />
                            )}
                          </View>
                          <View
                            style={[
                              styles.teamColorIndicator,
                              { backgroundColor: team.color || "#1976d2" },
                            ]}
                          />
                          <Text style={styles.teamOptionText}>{team.name}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={styles.modalConfirmButton}
                      onPress={() => setEditDropdown(null)}
                    >
                      <Text style={styles.modalConfirmText}>Valmis</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Position */}
              <View style={styles.editInputGroup}>
                <Text style={styles.label}>Pelipaikka</Text>
                <TouchableOpacity
                  style={styles.selector}
                  onPress={() =>
                    setEditDropdown(
                      editDropdown === "position" ? null : "position"
                    )
                  }
                >
                  <Text style={styles.selectorText}>{getPositionLabel()}</Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>
                {editDropdown === "position" && (
                  <View style={styles.dropdownList}>
                    {positions.map((pos) => (
                      <TouchableOpacity
                        key={pos.value}
                        style={styles.dropdownOption}
                        onPress={() => {
                          setEditPosition(pos.value);
                          setEditDropdown(null);
                        }}
                      >
                        <Text style={styles.optionText}>{pos.label}</Text>
                        {editPosition === pos.value && (
                          <Ionicons
                            name="checkmark"
                            size={20}
                            color="#007AFF"
                          />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Category */}
              <View style={styles.editInputGroup}>
                <Text style={styles.label}>Kategoria</Text>
                <TouchableOpacity
                  style={styles.selector}
                  onPress={() =>
                    setEditDropdown(
                      editDropdown === "category" ? null : "category"
                    )
                  }
                >
                  <Text style={styles.selectorText}>
                    Kategoria {editCategory}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>
                {editDropdown === "category" && (
                  <View style={styles.dropdownList}>
                    {categories.map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={styles.dropdownOption}
                        onPress={() => {
                          handleCategoryChange(cat);
                          setEditDropdown(null);
                        }}
                      >
                        <Text style={styles.optionText}>Kategoria {cat}</Text>
                        {editCategory === cat && (
                          <Ionicons
                            name="checkmark"
                            size={20}
                            color="#007AFF"
                          />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Multiplier */}
              <View style={styles.editInputGroup}>
                <Text style={styles.label}>Kerroin</Text>
                <TouchableOpacity
                  style={styles.selector}
                  onPress={() =>
                    setEditDropdown(
                      editDropdown === "multiplier" ? null : "multiplier"
                    )
                  }
                >
                  <Text style={styles.selectorText}>
                    {editMultiplier.toFixed(1)}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>
                {editDropdown === "multiplier" && (
                  <View style={styles.dropdownList}>
                    {getMultiplierOptions().map((mult) => (
                      <TouchableOpacity
                        key={mult}
                        style={styles.dropdownOption}
                        onPress={() => {
                          setEditMultiplier(mult);
                          setEditDropdown(null);
                        }}
                      >
                        <Text style={styles.optionText}>{mult.toFixed(1)}</Text>
                        {editMultiplier === mult && (
                          <Ionicons
                            name="checkmark"
                            size={20}
                            color="#007AFF"
                          />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Role */}
              <View style={styles.editInputGroup}>
                <Text style={styles.label}>Rooli</Text>
                <TouchableOpacity
                  style={styles.selector}
                  onPress={() =>
                    setEditDropdown(editDropdown === "role" ? null : "role")
                  }
                >
                  <Text style={styles.selectorText}>
                    {editRole === "admin" ? "Admin" : "Jäsen"}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>
                {editDropdown === "role" && (
                  <View style={styles.dropdownList}>
                    <TouchableOpacity
                      style={styles.dropdownOption}
                      onPress={() => {
                        setEditRole("member");
                        setEditDropdown(null);
                      }}
                    >
                      <Text style={styles.optionText}>Jäsen</Text>
                      {editRole === "member" && (
                        <Ionicons name="checkmark" size={20} color="#007AFF" />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.dropdownOption}
                      onPress={() => {
                        setEditRole("admin");
                        setEditDropdown(null);
                      }}
                    >
                      <Text style={styles.optionText}>Admin</Text>
                      {editRole === "admin" && (
                        <Ionicons name="checkmark" size={20} color="#007AFF" />
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={deletePlayer}
              >
                <Ionicons name="trash" size={20} color="white" />
                <Text style={styles.deleteButtonText}>Poista</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={savePlayerChanges}
              >
                <Ionicons name="checkmark" size={20} color="white" />
                <Text style={styles.saveButtonText}>Tallenna</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom dropdown styles for editDropdown */}
      {/* ...dropdown styles are added below ... */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9f9f9",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 24,
    textAlign: "center",
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  selector: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectorText: {
    fontSize: 16,
    color: "#333",
  },
  placeholderText: {
    color: "#999",
  },
  dropdownList: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 100,
  },
  dropdownOption: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playersSection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 16,
  },
  loadingText: {
    textAlign: "center",
    color: "#666",
    fontSize: 16,
    marginTop: 20,
  },
  emptyText: {
    textAlign: "center",
    color: "#666",
    fontSize: 16,
    marginTop: 20,
  },
  playerCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    elevation: 3,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  playerDetails: {
    fontSize: 14,
    color: "#666",
  },
  playerContact: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  playerTeamIndicator: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    width: "80%",
    maxHeight: "70%",
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
  option: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectedOption: {
    backgroundColor: "#f0f8ff",
  },
  teamOptionContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamColorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  optionText: {
    fontSize: 16,
    color: "#333",
  },
  selectedOptionText: {
    color: "#007AFF",
    fontWeight: "500",
  },
  editModalContent: {
    maxHeight: "85%",
  },
  editScrollView: {
    maxHeight: 400,
  },
  editInputGroup: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: "#333",
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  deleteButton: {
    backgroundColor: "#dc3545",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    flex: 0.45,
  },
  deleteButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  saveButton: {
    backgroundColor: "#1976d2",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    flex: 0.45,
  },
  saveButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  teamOption: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  teamOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  teamOptionText: {
    fontSize: 16,
    color: "#333",
  },
  modalConfirmButton: {
    backgroundColor: "#1976d2",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
  },
  modalConfirmText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  modalScrollView: {
    maxHeight: 300,
  },
  roleIndicator: {
    fontWeight: "600",
  },
  adminRole: {
    color: "#d32f2f",
  },
});

export default UserManagementScreen;
