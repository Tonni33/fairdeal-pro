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
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import {
  collection,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { RootStackParamList, Team, Player } from "../types";
import { db, functions, auth } from "../services/firebase";
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

  // State
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllTeams, setShowAllTeams] = useState(false); // Master Admin: näytä kaikki joukkueet

  // Filtteröi joukkueet: Admin näkee vain ne joukkueet joissa on admin
  const userTeams = useMemo(() => {
    if (!user || !user.uid) {
      console.log("UserManagement: No user, returning empty teams array");
      return [];
    }
    if (teams.length === 0) {
      return [];
    }

    // Jos Master Admin ja showAllTeams on päällä, näytä kaikki joukkueet
    if (isMasterAdmin() && showAllTeams) {
      console.log("UserManagement: Master Admin viewing all teams");
      return teams;
    }

    // Käyttäjä näkee vain ne joukkueet joissa on admin-oikeudet
    const player = allPlayers.find(
      (p) => p.id === user.uid || p.email === user.email
    );
    const playerTeamIds = player?.teamIds || [];

    return teams.filter(
      (team) =>
        team.adminIds?.includes(user.uid) && playerTeamIds.includes(team.id)
    );
  }, [user, teams, allPlayers, showAllTeams]);

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

    console.log("UserManagement: Selected team data:", selectedTeamData.name);

    // Käytetään sekä teamIds että members-kenttää varmuuden vuoksi
    const filtered = allPlayers.filter((player) => {
      return player.teamIds?.includes(selectedTeam);
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
  const [editPosition, setEditPosition] = useState("H"); // Legacy: primary position
  const [editPositions, setEditPositions] = useState<string[]>(["H"]); // New: array of positions
  // Kenttäpelaajan taidot
  const [editFieldCategory, setEditFieldCategory] = useState(1);
  const [editFieldMultiplier, setEditFieldMultiplier] = useState(1.0);
  // Maalivahdin taidot
  const [editGoalkeeperCategory, setEditGoalkeeperCategory] = useState(1);
  const [editGoalkeeperMultiplier, setEditGoalkeeperMultiplier] = useState(1.0);
  // Mikä roolin taitoja ollaan muokkaamassa ('field' | 'goalkeeper')
  const [editSkillsRole, setEditSkillsRole] = useState<"field" | "goalkeeper">(
    "field"
  );
  // Legacy - yhteensopivuus
  const [editCategory, setEditCategory] = useState(1);
  const [editMultiplier, setEditMultiplier] = useState(1.0);
  const [editTeamMember, setEditTeamMember] = useState(true); // Vakiokävijä-status
  const [originalTeamMember, setOriginalTeamMember] = useState<boolean | null>(
    null
  ); // Onko arvo ollut Firestoressa (true/false) vai ei asetettu
  // Rooli: "member" | "admin"
  const [editRole, setEditRole] = useState<"member" | "admin">("member");
  const [editSelectedTeams, setEditSelectedTeams] = useState<string[]>([]);

  // Yksi dropdown-tila: mikä valinta auki ('position' | 'category' | 'multiplier' | 'role' | 'teams' | null)
  const [editDropdown, setEditDropdown] = useState<null | string>(null);

  const positions = [
    { value: "H", label: "Hyökkääjä" },
    { value: "P", label: "Puolustaja" },
    { value: "MV", label: "Maalivahti" },
  ];

  const categories = [1, 2, 3];

  // Kerroin vaihtoehdot kategoriaperusteisesti
  const getMultiplierOptions = (category: number) => {
    if (category === 1) {
      return [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9];
    } else if (category === 2) {
      return [2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9];
    } else {
      return [3.0, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9];
    }
  };

  // Nykyisen muokattavan roolin taidot
  const getCurrentCategory = () =>
    editSkillsRole === "field" ? editFieldCategory : editGoalkeeperCategory;
  const getCurrentMultiplier = () =>
    editSkillsRole === "field" ? editFieldMultiplier : editGoalkeeperMultiplier;
  const setCurrentCategory = (value: number) =>
    editSkillsRole === "field"
      ? setEditFieldCategory(value)
      : setEditGoalkeeperCategory(value);
  const setCurrentMultiplier = (value: number) =>
    editSkillsRole === "field"
      ? setEditFieldMultiplier(value)
      : setEditGoalkeeperMultiplier(value);

  // Helper function to get team skills with local state fallback
  const getTeamSkillsWithLocal = (playerId: string, teamId: string) => {
    const localKey = `${playerId}-${teamId}`;
    const localSkills = localTeamSkills[localKey];

    if (localSkills) {
      console.log(`Using local skills for ${playerId}-${teamId}:`, localSkills);
      return localSkills;
    }

    // Löydä pelaaja - tarkista sekä id, playerId että email
    const player = allPlayers.find(
      (p) =>
        p.id === playerId || p.playerId === playerId || p.email === playerId
    );

    if (!player) {
      console.log(`Player not found for ID: ${playerId}`);
      return null;
    }

    console.log(
      `Found player for ${playerId}: ${player.name} (id: ${player.id}, playerId: ${player.playerId}, email: ${player.email})`
    );
    console.log(`Player teamSkills:`, player.teamSkills);

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
  const openPlayerModal = async (player: Player) => {
    // Lue tuorein data Firestoresta ennen modalin avaamista
    try {
      const playerRef = doc(db, "users", player.id);
      const freshPlayerDoc = await getDoc(playerRef);
      const freshPlayerData = freshPlayerDoc.data();

      // Käytä tuoretta dataa jos saatavilla, muuten fallback parametrina saatuun
      const freshPlayer = freshPlayerData
        ? {
            ...player,
            teamSkills: freshPlayerData.teamSkills || player.teamSkills,
            teamMember: freshPlayerData.teamMember || player.teamMember,
          }
        : player;

      setSelectedPlayer(freshPlayer);
      setEditName(freshPlayer.name);
      setEditEmail(freshPlayer.email);
      setEditPhone(freshPlayer.phone || "");

      // Jos joukkue on valittu, käytä joukkuekohtaisia taitoja
      if (selectedTeam) {
        const teamSkills = freshPlayer.teamSkills?.[selectedTeam];

        // Positions is always loaded from player's basic data (not team-specific)
        const positions = freshPlayer.positions;
        setEditPositions(positions);
        setEditPosition(arrayToPosition(positions));

        // Load field player skills (H/P)
        const fieldCategory = teamSkills?.field?.category || 2;
        const fieldMultiplier = teamSkills?.field?.multiplier || 2.0;

        setEditFieldCategory(fieldCategory);
        setEditFieldMultiplier(fieldMultiplier);

        // Load goalkeeper skills (MV)
        const goalkeeperCategory = teamSkills?.goalkeeper?.category || 2;
        const goalkeeperMultiplier = teamSkills?.goalkeeper?.multiplier || 2.0;

        setEditGoalkeeperCategory(goalkeeperCategory);
        setEditGoalkeeperMultiplier(goalkeeperMultiplier);

        console.log("📊 Loaded player skills:", {
          playerId: freshPlayer.id,
          field: { category: fieldCategory, multiplier: fieldMultiplier },
          goalkeeper: {
            category: goalkeeperCategory,
            multiplier: goalkeeperMultiplier,
          },
          teamSkills: teamSkills,
        });

        // Set initial role to field, switch to goalkeeper if player only has MV
        setEditSkillsRole(
          positions.includes("MV") &&
            !positions.includes("H") &&
            !positions.includes("P")
            ? "goalkeeper"
            : "field"
        );

        // Legacy fields for backwards compatibility with old UI code
        setEditCategory(fieldCategory);
        setEditMultiplier(fieldMultiplier);

        // Aseta vakiokävijä-status valitulle joukkueelle tuoreesta datasta
        const initialTeamMember = freshPlayer.teamMember?.[selectedTeam];
        setOriginalTeamMember(
          typeof initialTeamMember === "boolean" ? initialTeamMember : null
        );
        setEditTeamMember(initialTeamMember === true);

        console.log("Opening modal with fresh teamMember data:", {
          playerId: freshPlayer.id,
          teamId: selectedTeam,
          teamMember: freshPlayer.teamMember?.[selectedTeam],
          allTeamMembers: freshPlayer.teamMember,
        });
      } else {
        // Käytä pelaajan perustaitoja - kun ei ole joukkuetta valittu
        // Käytä ensimmäisen joukkueen taitoja jos saatavilla
        const positions = freshPlayer.positions;
        setEditPositions(positions);
        setEditPosition(arrayToPosition(positions));

        // Try to get skills from first team, otherwise use defaults
        const firstTeamId = freshPlayer.teamIds?.[0];
        const firstTeamSkills = firstTeamId
          ? freshPlayer.teamSkills?.[firstTeamId]
          : null;

        setEditCategory(firstTeamSkills?.field?.category || 2);
        setEditMultiplier(firstTeamSkills?.field?.multiplier || 2.0);
        setEditFieldCategory(firstTeamSkills?.field?.category || 2);
        setEditFieldMultiplier(firstTeamSkills?.field?.multiplier || 2.0);
        setEditGoalkeeperCategory(firstTeamSkills?.goalkeeper?.category || 2);
        setEditGoalkeeperMultiplier(
          firstTeamSkills?.goalkeeper?.multiplier || 2.0
        );

        // Kun ei ole joukkuetta valittu, aseta oletukseksi true
        setOriginalTeamMember(null);
        setEditTeamMember(false);
      }
    } catch (error) {
      console.error("Error fetching fresh player data:", error);
      // Jos virhe, käytä parametrina saatua dataa
      setSelectedPlayer(player);
      setEditName(player.name);
      setEditEmail(player.email);
      setEditPhone(player.phone || "");

      if (selectedTeam) {
        const teamSkills = player.teamSkills?.[selectedTeam];

        // Positions is always loaded from player's basic data (not team-specific)
        const positions = player.positions;
        setEditPositions(positions);
        setEditPosition(arrayToPosition(positions));

        setEditCategory(teamSkills?.field?.category || 2);
        setEditMultiplier(teamSkills?.field?.multiplier || 2.0);
        setEditFieldCategory(teamSkills?.field?.category || 2);
        setEditFieldMultiplier(teamSkills?.field?.multiplier || 2.0);
        setEditGoalkeeperCategory(teamSkills?.goalkeeper?.category || 2);
        setEditGoalkeeperMultiplier(teamSkills?.goalkeeper?.multiplier || 2.0);
        const initialTeamMember = player.teamMember?.[selectedTeam];
        setOriginalTeamMember(
          typeof initialTeamMember === "boolean" ? initialTeamMember : null
        );
        setEditTeamMember(initialTeamMember === true);
      } else {
        const positions = player.positions;
        setEditPositions(positions);
        setEditPosition(arrayToPosition(positions));

        // Try to get skills from first team, otherwise use defaults
        const firstTeamId = player.teamIds?.[0];
        const firstTeamSkills = firstTeamId
          ? player.teamSkills?.[firstTeamId]
          : null;

        setEditCategory(firstTeamSkills?.field?.category || 2);
        setEditMultiplier(firstTeamSkills?.field?.multiplier || 2.0);
        setEditFieldCategory(firstTeamSkills?.field?.category || 2);
        setEditFieldMultiplier(firstTeamSkills?.field?.multiplier || 2.0);
        setEditGoalkeeperCategory(firstTeamSkills?.goalkeeper?.category || 2);
        setEditGoalkeeperMultiplier(
          firstTeamSkills?.goalkeeper?.multiplier || 2.0
        );
        setOriginalTeamMember(null);
        setEditTeamMember(false);
      }
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

    // Jos joukkue on valittu, näytä vain se joukkue muokattavissa
    // Muuten näytä kaikki pelaajan joukkueet
    if (selectedTeam && selectedTeam.length > 0) {
      // Tarkista onko pelaaja jo tässä joukkueessa
      const isInTeam = (player.teamIds || []).includes(selectedTeam);
      setEditSelectedTeams(isInTeam ? [selectedTeam] : []);
    } else {
      setEditSelectedTeams(player.teamIds || player.teams || []);
    }
    setIsPlayerModalVisible(true);
  };

  // Helper: Convert positions array to display string (primary position)
  const arrayToPosition = (positions: string[]): string => {
    if (!positions || positions.length === 0) return "H";
    if (positions.includes("MV")) return "MV"; // Goalkeeper is primary if present
    if (positions.includes("H") && positions.includes("P")) return "H/P";
    return positions[0]; // Use first position as primary
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
    setEditPositions(["H"]);
    setEditCategory(1);
    setEditMultiplier(1.0);
    setOriginalTeamMember(null);
    setEditTeamMember(false);
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

    // Jos selectedTeam kontekstissa, tarkista että joukkue on valittu
    // Muuten tarkista että vähintään yksi joukkue on valittu
    if (
      (!selectedTeam || selectedTeam.length === 0) &&
      editSelectedTeams.length === 0
    ) {
      Alert.alert("Virhe", "Valitse vähintään yksi joukkue");
      return;
    }

    try {
      // Käsittele teamPlayers muutokset kun pelaajan joukkueita muutetaan
      const originalTeams =
        selectedPlayer.teamIds || selectedPlayer.teams || [];

      let removedTeams: string[];
      let addedTeams: string[];

      if (selectedTeam && selectedTeam.length > 0) {
        // Single-team konteksti:
        // - Voidaan lisätä useisiin joukkueisiin
        // - Voidaan poistaa VAIN valitusta joukkueesta
        const wasInSelectedTeam = originalTeams.includes(selectedTeam);
        const isInSelectedTeam = editSelectedTeams.includes(selectedTeam);

        // Poistetaan vain valitusta joukkueesta jos se on poistettu
        removedTeams =
          wasInSelectedTeam && !isInSelectedTeam ? [selectedTeam] : [];

        // Lisätään kaikkiin uusiin valittuihin joukkueisiin
        addedTeams = editSelectedTeams.filter(
          (teamId) => !originalTeams.includes(teamId)
        );
      } else {
        // Kaikkien joukkueiden konteksti: vertaa koko listoja
        removedTeams = originalTeams.filter(
          (teamId) => !editSelectedTeams.includes(teamId)
        );
        addedTeams = editSelectedTeams.filter(
          (teamId) => !originalTeams.includes(teamId)
        );
      }

      console.log("Team changes:", {
        selectedTeam,
        original: originalTeams,
        edited: editSelectedTeams,
        removed: removedTeams,
        added: addedTeams,
      });

      // Luo kopio teamSkills datasta muokkauksia varten
      const currentTeamSkillsData = { ...selectedPlayer.teamSkills };

      // Luo teamSkills data uusille joukkueille - vain relevantit pelipaikan taidot
      const hasFieldPosition = editPositions.some(
        (p) => p === "H" || p === "P"
      );
      const hasGoalkeeperPosition = editPositions.includes("MV");

      for (const addedTeamId of addedTeams) {
        if (!currentTeamSkillsData[addedTeamId]) {
          console.log(
            "Creating default team skills for new team:",
            addedTeamId,
            "(positions:",
            editPositions,
            ")"
          );

          currentTeamSkillsData[addedTeamId] = {
            updatedAt: new Date(),
          };

          // Tallenna vain field-taidot jos pelaajalla on H tai P positio
          if (hasFieldPosition) {
            currentTeamSkillsData[addedTeamId].field = {
              category: editFieldCategory || 2,
              multiplier: editFieldMultiplier || 2.0,
            };
          }

          // Tallenna vain goalkeeper-taidot jos pelaajalla on MV positio
          if (hasGoalkeeperPosition) {
            currentTeamSkillsData[addedTeamId].goalkeeper = {
              category: editGoalkeeperCategory || 2,
              multiplier: editGoalkeeperMultiplier || 2.0,
            };
          }
        }
      }

      // Päivitä pelaajan perustiedot
      const playerRef = doc(db, "users", selectedPlayer.id);

      // Jos joukkueita on poistettu, poista myös niiden joukkuekohtaiset taidot
      // ja teamMember tiedot, sekä adminIds joukkueista
      const currentTeamMemberData = { ...selectedPlayer.teamMember };

      for (const removedTeamId of removedTeams) {
        // Poista teamSkills
        if (currentTeamSkillsData[removedTeamId]) {
          delete currentTeamSkillsData[removedTeamId];
          console.log("Removed team skills for removed team:", removedTeamId);
        }

        // Poista teamMember
        if (currentTeamMemberData[removedTeamId] !== undefined) {
          delete currentTeamMemberData[removedTeamId];
          console.log("Removed teamMember for removed team:", removedTeamId);
        }

        // Poista käyttäjä joukkueen adminIds ja members listasta
        const teamData = teams.find((team) => team.id === removedTeamId);
        if (teamData) {
          const teamRef = doc(db, "teams", removedTeamId);
          const teamUpdates: any = {
            updatedAt: new Date(),
          };

          // Poista adminIds:stä jos löytyy
          if (teamData.adminIds?.includes(selectedPlayer.id)) {
            teamUpdates.adminIds = teamData.adminIds.filter(
              (id) => id !== selectedPlayer.id
            );
            console.log(
              "✅ Removing user from team adminIds for removed team:",
              removedTeamId
            );
          }

          // Note: team.members field is deprecated - player.teamIds is now the source of truth
          // No need to update team.members as it's no longer used

          // Päivitä joukkue vain jos on muutoksia
          if (teamUpdates.adminIds) {
            await updateDoc(teamRef, teamUpdates);
            console.log(
              "✅ Team document updated for removed team:",
              removedTeamId
            );
          }
        }
      }

      if (selectedTeam && selectedTeam.length > 0) {
        // Jos joukkue on valittu, tallenna myös joukkuekohtaiset taidot
        const currentTeamSkills = selectedPlayer.teamSkills?.[selectedTeam];

        // Tarkista vakiokävijä-statusmuutos
        // Käytä Firestore-arvoa sellaisenaan; undefined tarkoittaa "ei asetettu"
        const currentTeamMember = selectedPlayer.teamMember?.[selectedTeam];
        const teamMemberChanged =
          currentTeamMember === undefined ||
          editTeamMember !== currentTeamMember;

        // Tarkista onko taidot muuttuneet nykyisistä taidoista
        const currentFieldCategory = currentTeamSkills?.field?.category || 2;
        const currentFieldMultiplier =
          currentTeamSkills?.field?.multiplier || 2.0;
        const currentGoalkeeperCategory =
          currentTeamSkills?.goalkeeper?.category || 2;
        const currentGoalkeeperMultiplier =
          currentTeamSkills?.goalkeeper?.multiplier || 2.0;
        const currentPosition = arrayToPosition(selectedPlayer.positions);

        const skillsChanged =
          editFieldCategory !== currentFieldCategory ||
          editFieldMultiplier !== currentFieldMultiplier ||
          editGoalkeeperCategory !== currentGoalkeeperCategory ||
          editGoalkeeperMultiplier !== currentGoalkeeperMultiplier ||
          editPosition !== currentPosition;

        console.log("Skills comparison:", {
          current: {
            field: {
              category: currentFieldCategory,
              multiplier: currentFieldMultiplier,
            },
            goalkeeper: {
              category: currentGoalkeeperCategory,
              multiplier: currentGoalkeeperMultiplier,
            },
            position: currentPosition,
          },
          edited: {
            field: {
              category: editFieldCategory,
              multiplier: editFieldMultiplier,
            },
            goalkeeper: {
              category: editGoalkeeperCategory,
              multiplier: editGoalkeeperMultiplier,
            },
            position: editPosition,
          },
          skillsChanged,
        });

        console.log("Debug team skills save:", {
          selectedTeam,
          hasCurrentTeamSkills: !!currentTeamSkills,
          willSaveTeamSkills: skillsChanged,
          teamMemberChanged,
        });

        if (skillsChanged || teamMemberChanged) {
          console.log("💾 Saving team skills to Firestore...");

          // Optimistic update - päivitä local state heti
          const localKey = `${selectedPlayer.id}-${selectedTeam}`;
          setLocalTeamSkills((prev) => ({
            ...prev,
            [localKey]: {
              category: editCategory,
              multiplier: editMultiplier,
              position: arrayToPosition(editPositions), // Keep legacy position field
            },
          }));
          console.log("⚡ Applied optimistic update for team skills");

          // Tallenna joukkuekohtaiset taidot suoraan pelaajan dokumenttiin
          // Käytä teamSkills kenttää jossa avaimena on teamId
          // Note: positions array is saved to player's basic data, not in teamSkills
          const currentTeamSkills = selectedPlayer.teamSkills || {};
          let updatedTeamSkills = currentTeamSkills;

          if (skillsChanged) {
            const hasFieldPosition = editPositions.some(
              (p) => p === "H" || p === "P"
            );
            const hasGoalkeeperPosition = editPositions.includes("MV");

            updatedTeamSkills = {
              ...currentTeamSkills,
              [selectedTeam]: {
                // Legacy fields for backwards compatibility
                category: editFieldCategory, // Use field player category as default
                multiplier: editFieldMultiplier, // Use field player multiplier as default
                position: arrayToPosition(editPositions), // Legacy: computed primary position
                updatedAt: new Date(),
              },
            };

            // Tallenna vain field-taidot jos pelaajalla on H tai P positio
            if (hasFieldPosition) {
              updatedTeamSkills[selectedTeam].field = {
                category: editFieldCategory,
                multiplier: editFieldMultiplier,
              };
            }

            // Tallenna vain goalkeeper-taidot jos pelaajalla on MV positio
            if (hasGoalkeeperPosition) {
              updatedTeamSkills[selectedTeam].goalkeeper = {
                category: editGoalkeeperCategory,
                multiplier: editGoalkeeperMultiplier,
              };
            }
          }

          // Päivitä myös teamMember-status
          // Lue ensin tuorein data Firestoresta varmistaaksemme ettei muiden joukkueiden dataa ylikirjoiteta
          const freshPlayerDoc = await getDoc(playerRef);
          const freshPlayerData = freshPlayerDoc.data();
          const currentTeamMember = freshPlayerData?.teamMember || {};
          const updatedTeamMember = {
            ...currentTeamMember,
            [selectedTeam]: editTeamMember,
          };

          console.log(
            "Saving team skills and member status to user document:",
            {
              playerId: selectedPlayer.id,
              teamId: selectedTeam,
              teamSkills: updatedTeamSkills[selectedTeam],
              teamMember: updatedTeamMember[selectedTeam],
              allTeamMembers: updatedTeamMember,
            }
          );

          // Päivitä pelaajan dokumentti teamSkills ja teamMember kentillä
          await updateDoc(playerRef, {
            teamSkills: updatedTeamSkills,
            teamMember: updatedTeamMember,
          });

          // Päivitä myös selectedPlayer state jotta modal näyttää oikean datan
          setSelectedPlayer({
            ...selectedPlayer,
            teamSkills: updatedTeamSkills,
            teamMember: updatedTeamMember,
          });

          console.log("✅ Team skills saved to user document successfully");
        } else {
          console.log("⏭️ No team skills changes detected, skipping save");
        }
      }

      // Päivitä pelaajan perustiedot
      // Jos selectedTeam on valittu, päivitä vain sitä joukkuetta
      // Muuten päivitä kaikki joukkueet
      console.log("🚨🚨🚨 CRITICAL DEBUG - Before finalTeamIds calculation:", {
        selectedTeam,
        selectedTeamType: typeof selectedTeam,
        selectedTeamLength: selectedTeam?.length,
        selectedTeamTruthy: !!selectedTeam,
        editSelectedTeams,
        selectedPlayerTeamIds: selectedPlayer.teamIds,
        addedTeams,
        removedTeams,
      });

      let finalTeamIds: string[];
      // IMPORTANT: Check that selectedTeam is not just empty string
      if (selectedTeam && selectedTeam.length > 0) {
        // Single-team konteksti: säilytä kaikki nykyiset joukkueet,
        // lisää/poista vain valitun joukkueen ja mahdollisesti lisää uudet
        const freshPlayerDoc = await getDoc(playerRef);
        const freshPlayerData = freshPlayerDoc.data();
        let currentTeamIds = freshPlayerData?.teamIds || [];

        console.log("🔍 Team modification in single-team context:", {
          selectedTeam,
          currentTeamIds,
          editSelectedTeams,
          addedTeams,
          removedTeams,
        });

        // Poista valittu joukkue jos se poistettiin
        if (removedTeams.includes(selectedTeam)) {
          currentTeamIds = currentTeamIds.filter(
            (id: string) => id !== selectedTeam
          );
          console.log("❌ Removing player from selected team:", selectedTeam);
        }

        // Lisää kaikki uudet joukkueet
        for (const teamId of addedTeams) {
          if (!currentTeamIds.includes(teamId)) {
            currentTeamIds.push(teamId);
            console.log("✅ Adding player to team:", teamId);
          }
        }

        finalTeamIds = currentTeamIds;
        console.log("📋 Final team IDs:", finalTeamIds);
      } else {
        // Ei valittua joukkuetta: korvaa koko lista
        finalTeamIds = editSelectedTeams;
        console.log("📝 Replacing all teams:", finalTeamIds);
      }

      // Muunna team ID:t nimiksi teams-kenttään
      const teamNames = finalTeamIds
        .map((teamId) => teams.find((t) => t.id === teamId)?.name)
        .filter(Boolean);

      const updateData: any = {
        name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        phone: editPhone.trim(),
        teams: teamNames, // Joukkueiden nimet
        teamIds: finalTeamIds, // Joukkueiden ID:t
        updatedAt: new Date(),
      };

      // Päivitä globaalit roolitiedot vain jos ei ole joukkuetta valittu
      if (!selectedTeam || selectedTeam.length === 0) {
        updateData.isAdmin = editRole === "admin";
        updateData.role = editRole;
      }

      // Päivitä teamSkills jos joukkueita lisättiin tai poistettiin
      if (removedTeams.length > 0 || addedTeams.length > 0) {
        updateData.teamSkills = currentTeamSkillsData;
        console.log("Saving updated teamSkills:", currentTeamSkillsData);
      }

      // Päivitä teamMember jos joukkueita poistettiin
      if (removedTeams.length > 0) {
        updateData.teamMember = currentTeamMemberData;
        console.log("Saving updated teamMember:", currentTeamMemberData);
      }

      // Päivitä positions aina (ei joukkuekohtainen tieto)
      updateData.positions = editPositions; // New: array of positions
      updateData.position = arrayToPosition(editPositions); // Legacy: computed primary position

      // Päivitä perustaidot vain jos ei ole joukkuetta valittu
      if (!selectedTeam || selectedTeam.length === 0) {
        updateData.category = editCategory;
        updateData.multiplier = editMultiplier;
      }

      console.log("Saving player basic data including positions:", {
        positions: editPositions,
        position: arrayToPosition(editPositions),
      });

      console.log("💾 Calling updateDoc with data:", {
        playerId: selectedPlayer.id,
        updateData,
      });

      await updateDoc(playerRef, updateData);

      console.log("✅ Player document updated successfully:", {
        playerId: selectedPlayer.id,
        finalTeamIds,
      });

      // Jos rooli on admin ja joukkue on valittu, lisää käyttäjä joukkueen adminIds listaan
      if (editRole === "admin" && selectedTeam && selectedTeam.length > 0) {
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
      if (editRole !== "admin" && selectedTeam && selectedTeam.length > 0) {
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
      "Poista käyttäjä",
      `Haluatko varmasti poistaa käyttäjän ${selectedPlayer.name}?\n\nTämä poistaa käyttäjän sekä tietokannasta että kirjautumispalvelusta. Käyttäjä voi liittyä uudelleen samalla sähköpostilla.`,
      [
        { text: "Peruuta", style: "cancel" },
        {
          text: "Poista",
          style: "destructive",
          onPress: async () => {
            try {
              // Debug: Check auth state
              console.log("Current user:", user?.id, user?.email);
              console.log("Deleting player:", selectedPlayer.id);

              if (!user) {
                Alert.alert("Virhe", "Et ole kirjautunut sisään");
                return;
              }

              // Get current auth token to ensure it's fresh
              const currentUser = auth.currentUser;
              if (!currentUser) {
                Alert.alert("Virhe", "Käyttäjä ei ole kirjautunut");
                return;
              }

              // Force token refresh to ensure we have a valid token
              await currentUser.getIdToken(true);
              console.log("Auth token refreshed");

              // Call Cloud Function to delete user from both Firestore and Authentication
              const deleteUserFunction = httpsCallable(functions, "deleteUser");
              const result = await deleteUserFunction({
                userId: selectedPlayer.id,
              });

              const data = result.data as { success: boolean; message: string };
              Alert.alert("Onnistui", data.message);
              closePlayerModal();
              refreshData();
            } catch (error: any) {
              console.error("Error deleting player:", error);
              console.error("Error code:", error.code);
              console.error("Error details:", JSON.stringify(error, null, 2));

              let errorMessage = "Käyttäjän poistaminen epäonnistui";
              if (error.code === "functions/permission-denied") {
                errorMessage = "Sinulla ei ole oikeuksia poistaa käyttäjiä";
              } else if (error.code === "functions/unauthenticated") {
                errorMessage = "Sinun tulee olla kirjautunut";
              } else if (error.message) {
                errorMessage = error.message;
              }

              Alert.alert("Virhe", errorMessage);
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

    // Jos single-team kontekstissa, tarkista rajoitukset
    if (selectedTeam && selectedTeam.length > 0) {
      const isCurrentlySelected = editSelectedTeams.includes(teamId);
      const wasOriginallyInTeam =
        selectedPlayer?.teamIds?.includes(teamId) || false;

      // Jos yritetään poistaa joukkueesta (joka ei ole valittu joukkue)
      // JA pelaaja oli alun perin siinä joukkueessa, estä
      if (
        isCurrentlySelected &&
        teamId !== selectedTeam &&
        wasOriginallyInTeam
      ) {
        console.log("⚠️ Cannot remove from other teams in single-team context");
        Alert.alert(
          "Huomio",
          "Et voi poistaa pelaajaa muista joukkueista tässä näkymässä. Avaa käyttäjähallinta ilman joukkuevalintaa poistaaksesi pelaajan joukkueista."
        );
        return;
      }
    }

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

          {/* Master Admin: Toggle to show all teams */}
          {isMasterAdmin() && (
            <View style={styles.masterAdminToggle}>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Näytä kaikki joukkueet</Text>
                <Switch
                  value={showAllTeams}
                  onValueChange={setShowAllTeams}
                  trackColor={{ false: "#767577", true: "#81b0ff" }}
                  thumbColor={showAllTeams ? "#007AFF" : "#f4f3f4"}
                />
              </View>
              {showAllTeams && (
                <Text style={styles.toggleHint}>
                  Master Admin -tilassa näet kaikki järjestelmän joukkueet
                </Text>
              )}
            </View>
          )}

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
                  const isGoalkeeper = player.positions.includes("MV");
                  // Käytä valittua joukkuetta värikoodaukseen
                  const selectedTeamData = teams.find(
                    (team) => team.id === selectedTeam
                  );

                  // Get team-specific skills from player.teamSkills
                  const teamSkills = player.teamSkills?.[selectedTeam];

                  // Display field player skills by default (H/P)
                  const displayCategory = teamSkills?.field?.category || 2;
                  const displayMultiplier =
                    teamSkills?.field?.multiplier || 2.0;
                  const displayPosition = arrayToPosition(player.positions);
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
                    {userTeams.map((team) => {
                      // Single-team kontekstissa: estä poistaminen joukkueista joissa pelaaja jo on
                      const wasOriginallyInTeam =
                        selectedPlayer?.teamIds?.includes(team.id) || false;
                      const isLocked =
                        selectedTeam &&
                        selectedTeam.length > 0 &&
                        team.id !== selectedTeam &&
                        wasOriginallyInTeam;

                      return (
                        <TouchableOpacity
                          key={team.id}
                          style={[
                            styles.dropdownOption,
                            isLocked && styles.lockedOption,
                          ]}
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
                            <Text
                              style={[
                                styles.teamOptionText,
                                isLocked && styles.lockedText,
                              ]}
                            >
                              {team.name}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      style={styles.modalConfirmButton}
                      onPress={() => setEditDropdown(null)}
                    >
                      <Text style={styles.modalConfirmText}>Valmis</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Position - Checkboxes for multiple selection */}
              <View style={styles.editInputGroup}>
                <Text style={styles.label}>
                  Pelipaikka (valitse yksi tai useampi)
                </Text>
                {positions.map((pos) => (
                  <TouchableOpacity
                    key={pos.value}
                    style={styles.checkboxOption}
                    onPress={() => {
                      const isSelected = editPositions.includes(pos.value);
                      if (isSelected) {
                        // Don't allow unselecting if it's the only position
                        if (editPositions.length > 1) {
                          const newPositions = editPositions.filter(
                            (p) => p !== pos.value
                          );
                          setEditPositions(newPositions);
                          setEditPosition(arrayToPosition(newPositions));
                        }
                      } else {
                        const newPositions = [...editPositions, pos.value];
                        setEditPositions(newPositions);
                        setEditPosition(arrayToPosition(newPositions));
                      }
                    }}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        editPositions.includes(pos.value) &&
                          styles.checkboxChecked,
                      ]}
                    >
                      {editPositions.includes(pos.value) && (
                        <Ionicons name="checkmark" size={18} color="#fff" />
                      )}
                    </View>
                    <Text style={styles.checkboxLabel}>{pos.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Role tabs for players with both field and goalkeeper positions */}
              {editPositions.includes("MV") &&
                (editPositions.includes("H") ||
                  editPositions.includes("P")) && (
                  <View style={styles.roleTabsContainer}>
                    <TouchableOpacity
                      style={[
                        styles.roleTab,
                        editSkillsRole === "field" && styles.roleTabActive,
                      ]}
                      onPress={() => {
                        setEditSkillsRole("field");
                      }}
                    >
                      <Text
                        style={[
                          styles.roleTabText,
                          editSkillsRole === "field" &&
                            styles.roleTabTextActive,
                        ]}
                      >
                        H/P Taidot
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.roleTab,
                        editSkillsRole === "goalkeeper" && styles.roleTabActive,
                      ]}
                      onPress={() => {
                        setEditSkillsRole("goalkeeper");
                      }}
                    >
                      <Text
                        style={[
                          styles.roleTabText,
                          editSkillsRole === "goalkeeper" &&
                            styles.roleTabTextActive,
                        ]}
                      >
                        MV Taidot
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

              {/* Category - only show when editing relevant role */}
              {((editPositions.includes("H") || editPositions.includes("P")) &&
                (!editPositions.includes("MV") ||
                  editSkillsRole === "field")) ||
              (editPositions.includes("MV") &&
                !editPositions.includes("H") &&
                !editPositions.includes("P")) ||
              (editPositions.includes("MV") &&
                editSkillsRole === "goalkeeper") ? (
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
                      Kategoria {getCurrentCategory()}
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
                            setCurrentCategory(cat);
                            // Päivitä kerroin automaattisesti uuden kategorian mukaan
                            const multiplierOptions = getMultiplierOptions(cat);
                            const currentMult = getCurrentMultiplier();
                            if (!multiplierOptions.includes(currentMult)) {
                              setCurrentMultiplier(multiplierOptions[0]);
                            }
                            setEditDropdown(null);
                          }}
                        >
                          <Text style={styles.optionText}>Kategoria {cat}</Text>
                          {getCurrentCategory() === cat && (
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
              ) : null}

              {/* Multiplier - only show when editing relevant role */}
              {((editPositions.includes("H") || editPositions.includes("P")) &&
                (!editPositions.includes("MV") ||
                  editSkillsRole === "field")) ||
              (editPositions.includes("MV") &&
                !editPositions.includes("H") &&
                !editPositions.includes("P")) ||
              (editPositions.includes("MV") &&
                editSkillsRole === "goalkeeper") ? (
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
                      {getCurrentMultiplier().toFixed(1)}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color="#666" />
                  </TouchableOpacity>
                  {editDropdown === "multiplier" && (
                    <View style={styles.dropdownList}>
                      {getMultiplierOptions(getCurrentCategory()).map(
                        (mult) => (
                          <TouchableOpacity
                            key={mult}
                            style={styles.dropdownOption}
                            onPress={() => {
                              setCurrentMultiplier(mult);
                              setEditDropdown(null);
                            }}
                          >
                            <Text style={styles.optionText}>
                              {mult.toFixed(1)}
                            </Text>
                            {getCurrentMultiplier() === mult && (
                              <Ionicons
                                name="checkmark"
                                size={20}
                                color="#007AFF"
                              />
                            )}
                          </TouchableOpacity>
                        )
                      )}
                    </View>
                  )}
                </View>
              ) : null}

              {/* Vakiokävijä - näytetään vain kun joukkue on valittu */}
              {selectedTeam && (
                <View style={styles.editInputGroup}>
                  <Text style={styles.label}>Vakiokävijä</Text>
                  <TouchableOpacity
                    style={styles.selector}
                    onPress={() =>
                      setEditDropdown(
                        editDropdown === "teamMember" ? null : "teamMember"
                      )
                    }
                  >
                    <Text style={styles.selectorText}>
                      {originalTeamMember === null
                        ? "Ei asetettu"
                        : editTeamMember
                        ? "Kyllä"
                        : "Ei"}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color="#666" />
                  </TouchableOpacity>
                  {editDropdown === "teamMember" && (
                    <View style={styles.dropdownList}>
                      <TouchableOpacity
                        style={styles.dropdownOption}
                        onPress={() => {
                          setEditTeamMember(true);
                          if (originalTeamMember === null) {
                            setOriginalTeamMember(true);
                          }
                          setEditDropdown(null);
                        }}
                      >
                        <Text style={styles.optionText}>Kyllä</Text>
                        {editTeamMember === true && (
                          <Ionicons
                            name="checkmark"
                            size={20}
                            color="#007AFF"
                          />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.dropdownOption}
                        onPress={() => {
                          setEditTeamMember(false);
                          if (originalTeamMember === null) {
                            setOriginalTeamMember(false);
                          }
                          setEditDropdown(null);
                        }}
                      >
                        <Text style={styles.optionText}>Ei</Text>
                        {editTeamMember === false && (
                          <Ionicons
                            name="checkmark"
                            size={20}
                            color="#007AFF"
                          />
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

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
  checkboxOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  checkboxChecked: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  checkboxLabel: {
    fontSize: 16,
    color: "#333",
    marginLeft: 12,
  },
  roleTabsContainer: {
    flexDirection: "row",
    marginBottom: 16,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 4,
  },
  roleTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: "center",
  },
  roleTabActive: {
    backgroundColor: "#007AFF",
  },
  roleTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  roleTabTextActive: {
    color: "#fff",
  },
  lockedOption: {
    opacity: 0.6,
    backgroundColor: "#f5f5f5",
  },
  lockedText: {
    color: "#999",
    fontStyle: "italic",
  },
  masterAdminToggle: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  toggleHint: {
    fontSize: 12,
    color: "#666",
    marginTop: 8,
    fontStyle: "italic",
  },
});

export default UserManagementScreen;
