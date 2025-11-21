import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
  Modal,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
} from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import { useApp, getUserTeams } from "../contexts/AppContext";

interface EventDefaults {
  maxPlayers: number;
  maxGoalkeepers: number;
  defaultLocation: string;
  defaultTime: string;
  eventDuration: number; // minuutteina
  defaultTitle: string; // Oletusnimi tapahtumalle
  notificationEnabled: boolean;
  teamAName?: string; // Custom name for Team A in random team generation
  teamBName?: string; // Custom name for Team B in random team generation
}

interface TeamEventDefaults extends EventDefaults {
  teamId: string;
  teamName: string;
}

interface UserWithoutPassword {
  id: string;
  email: string;
  displayName?: string;
  hasPassword: boolean;
  selected?: boolean;
}

interface SettingsScreenProps {
  route?: {
    params?: {
      tab?: "global" | "team";
      hideTabSwitch?: boolean; // Piilottaa tab-valitsimen
    };
  };
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ route }) => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { teams, refreshData } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const justSavedRef = useRef(false); // Track if we just saved to prevent field clearing

  // Determine initial tab based on route params or user role
  const getInitialTab = (): "global" | "team" => {
    if (route?.params?.tab) {
      return route.params.tab;
    }
    // Default: MasterAdmin starts with global, regular admin with team
    return user?.isMasterAdmin ? "global" : "team";
  };

  const [activeTab, setActiveTab] = useState<"global" | "team">(
    getInitialTab()
  );
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");

  // User management states
  const [usersWithoutPassword, setUsersWithoutPassword] = useState<
    UserWithoutPassword[]
  >([]);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [commonPassword, setCommonPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [creatingPasswords, setCreatingPasswords] = useState(false); // Global settings
  const [globalSettings, setGlobalSettings] = useState<EventDefaults>({
    maxPlayers: 20,
    maxGoalkeepers: 2,
    defaultLocation: "",
    defaultTime: "19:00",
    eventDuration: 90,
    defaultTitle: "",
    notificationEnabled: true,
    teamAName: "Joukkue A",
    teamBName: "Joukkue B",
  });

  // Team-specific settings
  const [teamSettings, setTeamSettings] = useState<
    Record<string, EventDefaults>
  >({});

  // Local state for WhatsApp group settings
  const [whatsappGroupName, setWhatsappGroupName] = useState<string>("");
  const [whatsappGroupInviteLink, setWhatsappGroupInviteLink] =
    useState<string>("");
  const [guestRegistrationHours, setGuestRegistrationHours] =
    useState<number>(24);
  const [guestRegistrationHoursText, setGuestRegistrationHoursText] =
    useState<string>("24");

  // Helper function to check if user is master admin
  const isMasterAdmin = (): boolean => {
    return Boolean(user && user.isMasterAdmin === true);
  };

  // Get teams where user is admin
  const adminTeams = useMemo(() => {
    if (!user?.uid) {
      console.log("SettingsScreen: No user UID");
      return [];
    }

    // MasterAdmin sees all teams
    if (isMasterAdmin()) {
      console.log("SettingsScreen: User is MasterAdmin, showing all teams");
      return teams;
    }

    // Regular admin: filter teams where user is admin
    const userAdminTeams = teams.filter((team) => {
      const isAdmin =
        team.adminIds?.includes(user.uid) ||
        team.adminId === user.uid ||
        team.adminId === user.email;

      if (isAdmin) {
        console.log(`SettingsScreen: User is admin of team ${team.name}`);
      }

      return isAdmin;
    });

    console.log(
      `SettingsScreen: User is admin of ${userAdminTeams.length} teams:`,
      userAdminTeams.map((t) => t.name)
    );

    return userAdminTeams;
  }, [user, teams]);

  useEffect(() => {
    console.log("SettingsScreen: Initial load");
    loadSettings();
    loadUsersWithoutPassword();
  }, []);

  // Auto-select first admin team when adminTeams loads
  useEffect(() => {
    console.log(
      `SettingsScreen: Auto-select check - adminTeams.length: ${adminTeams.length}, selectedTeamId: ${selectedTeamId}, activeTab: ${activeTab}`
    );
    if (adminTeams.length > 0 && !selectedTeamId && activeTab === "team") {
      console.log(
        `SettingsScreen: Auto-selecting first admin team: ${adminTeams[0].name} (${adminTeams[0].id})`
      );
      setSelectedTeamId(adminTeams[0].id);
    }
  }, [adminTeams, activeTab]);

  // Reload users and WhatsApp data when selected team changes or teams data updates
  useEffect(() => {
    console.log(
      `SettingsScreen: selectedTeamId or teams changed, selectedTeamId: ${selectedTeamId}, justSaved: ${justSavedRef.current}`
    );
    if (selectedTeamId) {
      loadUsersWithoutPassword();

      // Load WhatsApp group settings from team data
      // Skip if we just saved to prevent clearing user's unsaved edits
      if (!justSavedRef.current) {
        const teamData = teams.find((team) => team.id === selectedTeamId);
        console.log(
          `SettingsScreen: Loading team data for team ${selectedTeamId}:`,
          {
            whatsappGroupName: teamData?.whatsappGroupName,
            whatsappGroupInviteLink: teamData?.whatsappGroupInviteLink,
            guestRegistrationHours: teamData?.guestRegistrationHours,
          }
        );
        setWhatsappGroupName(teamData?.whatsappGroupName || "");
        setWhatsappGroupInviteLink(teamData?.whatsappGroupInviteLink || "");
        setGuestRegistrationHours(teamData?.guestRegistrationHours || 24);
        setGuestRegistrationHoursText(
          (teamData?.guestRegistrationHours || 24).toString()
        );
      } else {
        console.log(`SettingsScreen: Skipping team data reload - just saved`);
        justSavedRef.current = false; // Reset flag after skipping once
      }
    } else {
      // Clear settings when no team is selected
      setWhatsappGroupName("");
      setWhatsappGroupInviteLink("");
      setGuestRegistrationHours(24);
      setGuestRegistrationHoursText("24");
    }
  }, [selectedTeamId, teams]);

  const loadSettings = async () => {
    try {
      // Load global settings
      const globalDoc = await getDoc(doc(db, "settings", "eventDefaults"));
      if (globalDoc.exists()) {
        setGlobalSettings({ ...globalSettings, ...globalDoc.data() });
      }

      // Load team-specific settings
      const teamSettingsMap: Record<string, EventDefaults> = {};
      for (const team of adminTeams) {
        const teamDoc = await getDoc(doc(db, "settings", `team-${team.id}`));
        const teamData = teams.find((t) => t.id === team.id);

        if (teamDoc.exists()) {
          teamSettingsMap[team.id] = {
            ...(teamDoc.data() as EventDefaults),
            // Override with team-specific data if available
            notificationEnabled: teamData?.notificationEnabled ?? true,
          };
        } else {
          // Use global settings as default for teams without specific settings
          teamSettingsMap[team.id] = {
            ...globalSettings,
            notificationEnabled: teamData?.notificationEnabled ?? true,
          };
        }
      }
      setTeamSettings(teamSettingsMap);
    } catch (error) {
      console.error("Error loading settings:", error);
      Alert.alert("Virhe", "Asetusten lataaminen epäonnistui");
    } finally {
      setLoading(false);
    }
  };

  const loadUsersWithoutPassword = async () => {
    try {
      // Get all users from Firestore users collection
      const usersSnapshot = await getDocs(collection(db, "users"));
      const usersData = usersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as any[];

      // Find users who need password change or don't have Firebase Auth account
      const usersWithoutAuth: UserWithoutPassword[] = [];

      for (const userData of usersData) {
        // Check if user needs password change (meaning they don't have a proper password yet)
        if (userData.email && userData.needsPasswordChange === true) {
          // Jos valittu joukkue, suodata joukkueen mukaan
          if (selectedTeamId) {
            // Check if user belongs to the selected team
            const belongsToTeam = userData.teamIds?.includes(selectedTeamId);

            if (!belongsToTeam) {
              continue; // Skip users not in the selected team
            }
          } else if (activeTab === "team") {
            // Jos team-tabissa mutta ei joukkuetta valittu, älä näytä käyttäjiä
            continue;
          } else if (!isMasterAdmin()) {
            // Tavallinen admin global-tabissa - näytä vain oman joukkueen käyttäjät
            const userBelongsToAdminTeam = adminTeams.some((team) =>
              userData.teamIds?.includes(team.id)
            );
            if (!userBelongsToAdminTeam) {
              continue;
            }
          }
          // MasterAdmin global-tabissa näkee kaikki

          usersWithoutAuth.push({
            id: userData.id,
            email: userData.email,
            displayName: userData.displayName || userData.name,
            hasPassword: false,
            selected: false,
          });
        }
      }

      setUsersWithoutPassword(usersWithoutAuth);
    } catch (error) {
      console.error("Error loading users without password:", error);
    }
  };

  const saveSettings = async () => {
    if (!user) return;

    setSaving(true);
    justSavedRef.current = true; // Mark that we're saving to prevent field clearing
    try {
      if (activeTab === "global") {
        // Save global settings
        await setDoc(doc(db, "settings", "eventDefaults"), {
          ...globalSettings,
          updatedBy: user.email,
          updatedAt: new Date(),
        });
      } else if (selectedTeamId && teamSettings[selectedTeamId]) {
        // Save team-specific settings
        const currentTeam = teams.find((t) => t.id === selectedTeamId);
        await setDoc(doc(db, "settings", `team-${selectedTeamId}`), {
          ...teamSettings[selectedTeamId],
          teamId: selectedTeamId,
          teamName: currentTeam?.name || "Tuntematon joukkue",
          teamCode: currentTeam?.code || "",
          teamColor: currentTeam?.color || "",
          teamAdminIds: currentTeam?.adminIds || [],
          updatedBy: user.email,
          updatedAt: new Date(),
        });

        // Also save WhatsApp group data to team document
        await saveTeamWhatsAppData();

        // Refresh data after save to update teams state with new WhatsApp data
        await refreshData();
      }
      Alert.alert("Onnistui", "Asetukset tallennettu");
    } catch (error) {
      console.error("Error saving settings:", error);
      Alert.alert("Virhe", "Asetusten tallentaminen epäonnistui");
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (
    field: keyof EventDefaults,
    value: string | number | boolean
  ) => {
    console.log(
      `SettingsScreen: handleInputChange - field: ${field}, value: ${value}, activeTab: ${activeTab}, selectedTeamId: ${selectedTeamId}`
    );

    if (activeTab === "global") {
      console.log("SettingsScreen: Updating global settings");
      setGlobalSettings((prev) => ({
        ...prev,
        [field]: value,
      }));
    } else if (selectedTeamId) {
      console.log(
        `SettingsScreen: Updating team settings for team ${selectedTeamId}`
      );
      setTeamSettings((prev) => ({
        ...prev,
        [selectedTeamId]: {
          ...prev[selectedTeamId],
          [field]: value,
        },
      }));
    } else {
      console.log(
        "SettingsScreen: WARNING - Cannot update settings, no team selected!"
      );
    }
  };

  const getCurrentSettings = (): EventDefaults => {
    if (activeTab === "global") {
      console.log(
        "SettingsScreen: getCurrentSettings - returning globalSettings"
      );
      return globalSettings;
    } else if (selectedTeamId && teamSettings[selectedTeamId]) {
      console.log(
        `SettingsScreen: getCurrentSettings - returning team settings for ${selectedTeamId}`
      );
      return teamSettings[selectedTeamId];
    }
    console.log(
      "SettingsScreen: getCurrentSettings - WARNING: No team selected, returning globalSettings as fallback"
    );
    return globalSettings;
  };

  const getCurrentTeamData = () => {
    if (selectedTeamId) {
      return teams.find((team) => team.id === selectedTeamId);
    }
    return null;
  };

  const handleTeamDataChange = (field: string, value: string | number) => {
    // Update local state only - don't save to database immediately
    if (field === "whatsappGroupName") {
      setWhatsappGroupName(value as string);
    } else if (field === "whatsappGroupInviteLink") {
      setWhatsappGroupInviteLink(value as string);
    } else if (field === "guestRegistrationHours") {
      setGuestRegistrationHours(value as number);
    }
  };

  const saveTeamWhatsAppData = async () => {
    if (!selectedTeamId || !user) return;

    try {
      console.log(`SettingsScreen: Saving team data for ${selectedTeamId}:`, {
        whatsappGroupName,
        whatsappGroupInviteLink,
        guestRegistrationHours,
        notificationEnabled: teamSettings[selectedTeamId]?.notificationEnabled,
      });

      const teamRef = doc(db, "teams", selectedTeamId);
      await updateDoc(teamRef, {
        whatsappGroupName: whatsappGroupName,
        whatsappGroupInviteLink: whatsappGroupInviteLink,
        guestRegistrationHours: guestRegistrationHours,
        notificationEnabled:
          teamSettings[selectedTeamId]?.notificationEnabled ?? true,
        updatedBy: user.email,
        updatedAt: new Date(),
      });

      console.log(
        `SettingsScreen: WhatsApp data saved successfully for team ${selectedTeamId}`
      );

      // Note: Don't refresh data here as it would trigger useEffect and clear fields
      // The data will be available for other components that need it
      console.log(`SettingsScreen: WhatsApp data saved to Firestore`);
      // Don't show alert here since it's called from saveSettings which shows its own alert
    } catch (error) {
      console.error("Error updating WhatsApp team data:", error);
      throw error; // Re-throw so saveSettings can handle the error
    }
  };
  const toggleUserSelection = (userId: string) => {
    setUsersWithoutPassword((prev) =>
      prev.map((user) =>
        user.id === userId ? { ...user, selected: !user.selected } : user
      )
    );
  };

  const selectAllUsers = () => {
    const hasUnselected = usersWithoutPassword.some((user) => !user.selected);
    setUsersWithoutPassword((prev) =>
      prev.map((user) => ({ ...user, selected: hasUnselected }))
    );
  };

  const createPasswordsForSelectedUsers = async () => {
    try {
      console.log("Starting password creation process...");

      const selectedUsers = usersWithoutPassword.filter(
        (user) => user.selected
      );
      console.log("Selected users:", selectedUsers.length);

      if (selectedUsers.length === 0) {
        Alert.alert("Virhe", "Valitse vähintään yksi käyttäjä");
        return;
      }

      if (!commonPassword || commonPassword.length < 6) {
        Alert.alert("Virhe", "Salasanan tulee olla vähintään 6 merkkiä pitkä");
        return;
      }

      // Check if auth is properly initialized
      if (!auth) {
        console.error("Firebase Auth not initialized");
        Alert.alert("Virhe", "Autentikointi ei ole käytettävissä");
        return;
      }

      setCreatingPasswords(true);

      try {
        // Call Cloud Function to create users (this keeps admin logged in)
        const createUserAccounts = httpsCallable(
          functions,
          "createUserAccounts"
        );
        const result = await createUserAccounts({
          users: selectedUsers,
          commonPassword: commonPassword,
        });

        const data = result.data as any;

        let message = "";
        if (data.successCount > 0) {
          message += `✅ ${data.successCount} käyttäjätiliä luotu onnistuneesti.\n`;
        }
        if (data.errorCount > 0) {
          message += `❌ ${data.errorCount} käyttäjätiliä ei voitu luoda.\n`;
          const errors = data.results
            .filter((r: any) => !r.success)
            .map((r: any) => `${r.email}: ${r.error}`);
          if (errors.length > 0) {
            message += `\nVirheet:\n${errors.slice(0, 3).join("\n")}`;
            if (errors.length > 3) {
              message += `\n... ja ${errors.length - 3} muuta virhettä`;
            }
          }
        }

        if (data.successCount > 0) {
          message += `\n\n🔑 Yleissalasana: ${commonPassword}\n\n⚠️ Jaa tämä salasana käyttäjille turvallisesti.`;
        }

        Alert.alert("Salasanojen luonti", message);

        // Refresh the list only if we had some success
        if (data.successCount > 0) {
          await loadUsersWithoutPassword();
        }

        setPasswordModalVisible(false);
        setCommonPassword("FairDeal2025!");
      } catch (error: any) {
        console.error("Error calling createUserAccounts:", error);
        Alert.alert(
          "Virhe",
          `Salasanojen luominen epäonnistui: ${
            error.message || "Tuntematon virhe"
          }`
        );
      } finally {
        setCreatingPasswords(false);
      }
    } catch (error: any) {
      console.error("Critical error in password creation:", error);
      Alert.alert(
        "Virhe",
        `Kriittinen virhe: ${error.message || "Tuntematon virhe"}`
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Asetukset</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Ladataan asetuksia...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Asetukset</Text>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.savingButton]}
          onPress={saveSettings}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? "Tallennetaan..." : "Tallenna"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Tab selector - piilotetaan jos tullaan suoraan tiettyyn näkymään AdminMenusta */}
        {!route?.params?.hideTabSwitch && (
          <View style={styles.tabContainer}>
            {isMasterAdmin() && (
              <TouchableOpacity
                style={[styles.tab, activeTab === "global" && styles.activeTab]}
                onPress={() => setActiveTab("global")}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === "global" && styles.activeTabText,
                  ]}
                >
                  Yleiset oletusarvot
                </Text>
              </TouchableOpacity>
            )}
            {adminTeams.length > 0 && (
              <TouchableOpacity
                style={[styles.tab, activeTab === "team" && styles.activeTab]}
                onPress={() => setActiveTab("team")}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === "team" && styles.activeTabText,
                  ]}
                >
                  Joukkuekohtaiset
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Team selector for team-specific settings */}
        {activeTab === "team" && adminTeams.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Valitse joukkue</Text>
            <View style={styles.teamSelector}>
              {adminTeams.map((team) => (
                <TouchableOpacity
                  key={team.id}
                  style={[
                    styles.teamOption,
                    selectedTeamId === team.id && styles.selectedTeamOption,
                  ]}
                  onPress={() => setSelectedTeamId(team.id)}
                >
                  <View style={styles.teamOptionLeft}>
                    <View
                      style={[
                        styles.teamColorIndicator,
                        { backgroundColor: team.color || "#666" },
                      ]}
                    />
                    <Text
                      style={[
                        styles.teamOptionText,
                        selectedTeamId === team.id &&
                          styles.selectedTeamOptionText,
                      ]}
                    >
                      {team.name}
                    </Text>
                  </View>
                  {selectedTeamId === team.id && (
                    <Ionicons name="checkmark" size={20} color="#007AFF" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {activeTab === "global"
              ? "Yleiset oletusarvot"
              : `Oletusarvot: ${
                  adminTeams.find((t) => t.id === selectedTeamId)?.name || ""
                }`}
          </Text>
          <Text style={styles.sectionDescription}>
            {activeTab === "global"
              ? "Nämä arvot käytetään oletuksina kaikille joukkueille, joilla ei ole omia asetuksia"
              : "Nämä arvot käytetään vain tämän joukkueen tapahtumissa"}
          </Text>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Tapahtuman oletusnimi</Text>
            <TextInput
              style={styles.textInput}
              value={getCurrentSettings().defaultTitle}
              onChangeText={(text) => handleInputChange("defaultTitle", text)}
              placeholder="Esim. Viikoittainen peli"
            />
          </View>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Maksimi pelaajamäärä</Text>
            <TextInput
              style={styles.numberInput}
              value={getCurrentSettings().maxPlayers.toString()}
              onChangeText={(text) =>
                handleInputChange("maxPlayers", parseInt(text) || 0)
              }
              keyboardType="numeric"
              placeholder="20"
            />
          </View>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Maksimi maalivahdit</Text>
            <TextInput
              style={styles.numberInput}
              value={getCurrentSettings().maxGoalkeepers.toString()}
              onChangeText={(text) =>
                handleInputChange("maxGoalkeepers", parseInt(text) || 0)
              }
              keyboardType="numeric"
              placeholder="2"
            />
          </View>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Oletuspaikka</Text>
            <TextInput
              style={styles.textInput}
              value={getCurrentSettings().defaultLocation}
              onChangeText={(text) =>
                handleInputChange("defaultLocation", text)
              }
              placeholder="Esim. Pallokenttä A"
            />
          </View>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Oletusaika</Text>
            <TextInput
              style={styles.textInput}
              value={getCurrentSettings().defaultTime}
              onChangeText={(text) => handleInputChange("defaultTime", text)}
              placeholder="19:00"
            />
          </View>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>
              Tapahtuman kesto (minuuttia)
            </Text>
            <TextInput
              style={styles.numberInput}
              value={getCurrentSettings().eventDuration.toString()}
              onChangeText={(text) =>
                handleInputChange("eventDuration", parseInt(text) || 0)
              }
              keyboardType="numeric"
              placeholder="90"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ilmoitukset</Text>

          <View style={styles.switchItem}>
            <View style={styles.switchLabelContainer}>
              <Text style={styles.settingLabel}>Push-ilmoitukset</Text>
              <Text style={styles.settingDescription}>
                Lähetä ilmoituksia uusista tapahtumista ja muutoksista
              </Text>
            </View>
            <Switch
              value={getCurrentSettings().notificationEnabled}
              onValueChange={(value) =>
                handleInputChange("notificationEnabled", value)
              }
              trackColor={{ false: "#767577", true: "#1976d2" }}
              thumbColor={
                getCurrentSettings().notificationEnabled ? "#fff" : "#f4f3f4"
              }
            />
          </View>
        </View>

        {/* WhatsApp group settings - only for team-specific settings */}
        {activeTab === "team" && selectedTeamId && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>WhatsApp-ryhmä</Text>
            <Text style={styles.sectionDescription}>
              Tallenna joukkueen WhatsApp-ryhmän tiedot, jotta ne voidaan
              käyttää automaattisesti joukkuejakojen lähettämisessä
            </Text>

            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>WhatsApp-ryhmän nimi</Text>
              <TextInput
                style={styles.textInput}
                value={whatsappGroupName}
                onChangeText={(text) =>
                  handleTeamDataChange("whatsappGroupName", text)
                }
                placeholder="Esim. HC KeLo WhatsApp"
              />
            </View>

            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>
                WhatsApp-ryhmän kutsu-linkki
              </Text>
              <TextInput
                style={styles.textInput}
                value={whatsappGroupInviteLink}
                onChangeText={(text) =>
                  handleTeamDataChange("whatsappGroupInviteLink", text)
                }
                placeholder="https://chat.whatsapp.com/..."
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.settingDescription}>
                Voit kopioida kutsu-linkin WhatsApp-ryhmästä ja liittää sen
                tähän. Tämä mahdollistaa joukkuejakojen lähettämisen suoraan
                ryhmään.
              </Text>
            </View>
          </View>
        )}

        {/* Guest registration settings - only for team-specific settings */}
        {activeTab === "team" && selectedTeamId && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Satunnaisten pelaajien ilmoittautuminen
            </Text>
            <Text style={styles.sectionDescription}>
              Määritä milloin pelaajat joilla teamMember-status on "Ei"
              (satunnaiset/vieraat pelaajat) voivat ilmoittautua tapahtumaan.
              Vakiokävijät (teamMember: "Kyllä") voivat ilmoittautua heti
              tapahtuman luomisen jälkeen.
            </Text>

            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>
                Ilmoittautuminen aukee (tuntia ennen tapahtumaa)
              </Text>
              <TextInput
                style={styles.numberInput}
                value={guestRegistrationHoursText}
                onChangeText={(text) => {
                  setGuestRegistrationHoursText(text);
                }}
                onBlur={() => {
                  const hours = parseInt(guestRegistrationHoursText) || 24;
                  setGuestRegistrationHours(hours);
                  setGuestRegistrationHoursText(hours.toString());
                  handleTeamDataChange("guestRegistrationHours", hours);
                }}
                keyboardType="numeric"
                placeholder="24"
              />
              <Text style={styles.settingDescription}>
                Esimerkiksi: Jos asetat 24 tuntia, satunnaiset pelaajat voivat
                ilmoittautua tapahtumaan vasta 24 tuntia ennen tapahtuman alkua.
                Vakiokävijät saavat etuoikeuden ilmoittautumiseen.
              </Text>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Satunnaisjoukkueet</Text>
          <Text style={styles.sectionDescription}>
            Määritä nimet joukkueille kun luodaan satunnaisjoukkueita
          </Text>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Ensimmäisen joukkueen nimi</Text>
            <TextInput
              style={styles.textInput}
              value={getCurrentSettings().teamAName || "Joukkue A"}
              onChangeText={(text) => handleInputChange("teamAName", text)}
              placeholder="Joukkue A"
            />
          </View>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Toisen joukkueen nimi</Text>
            <TextInput
              style={styles.textInput}
              value={getCurrentSettings().teamBName || "Joukkue B"}
              onChangeText={(text) => handleInputChange("teamBName", text)}
              placeholder="Joukkue B"
            />
          </View>
        </View>

        {/* User Management Section - vain joukkuekohtaisissa asetuksissa */}
        {activeTab === "team" && usersWithoutPassword.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Käyttäjien hallinta</Text>
            <Text style={styles.sectionDescription}>
              Nämä käyttäjät tarvitsevat salasanan tai salasanan vaihdon
              sovellukseen kirjautumista varten
            </Text>

            <View style={styles.userManagementHeader}>
              <Text style={styles.userCountText}>
                {usersWithoutPassword.length} käyttäjää tarvitsee salasanan
              </Text>
              <TouchableOpacity
                style={styles.selectAllButton}
                onPress={selectAllUsers}
              >
                <Text style={styles.selectAllText}>
                  {usersWithoutPassword.every((user) => user.selected)
                    ? "Poista valinnat"
                    : "Valitse kaikki"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.usersList}>
              {usersWithoutPassword.map((user) => (
                <TouchableOpacity
                  key={user.id}
                  style={[
                    styles.userItem,
                    user.selected && styles.selectedUserItem,
                  ]}
                  onPress={() => toggleUserSelection(user.id)}
                >
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>
                      {user.displayName || "Nimetön"}
                    </Text>
                    <Text style={styles.userEmail}>{user.email}</Text>
                  </View>
                  {user.selected && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color="#4CAF50"
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.createPasswordsButton,
                usersWithoutPassword.filter((u) => u.selected).length === 0 &&
                  styles.disabledButton,
              ]}
              onPress={() => {
                const selectedCount = usersWithoutPassword.filter(
                  (u) => u.selected
                ).length;
                if (selectedCount === 0) {
                  Alert.alert(
                    "Huomio",
                    "Valitse ensin vähintään yksi käyttäjä salasanan luontia varten."
                  );
                  return;
                }
                setPasswordModalVisible(true);
              }}
              disabled={
                usersWithoutPassword.filter((u) => u.selected).length === 0
              }
            >
              <Ionicons
                name="key"
                size={20}
                color="white"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.createPasswordsText}>
                Luo salasana valituille (
                {usersWithoutPassword.filter((u) => u.selected).length})
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.infoSection}>
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#1976d2" />
            <Text style={styles.infoText}>
              Nämä asetukset vaikuttavat vain uusiin tapahtumiin. Olemassa
              olevia tapahtumia ei muuteta.
            </Text>
          </View>
        </View>

        {/* Lisää tilaa alaosaan */}
        <View style={{ height: 50 }} />
      </ScrollView>

      {/* Password Creation Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={passwordModalVisible}
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.passwordModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Luo yleissalasana</Text>
              <TouchableOpacity onPress={() => setPasswordModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDescription}>
              Luo yleissalasana{" "}
              {usersWithoutPassword.filter((u) => u.selected).length} valitulle
              käyttäjälle. Käyttäjät voivat vaihtaa salasanan ensimmäisen
              kirjautumisen jälkeen.
            </Text>

            <View style={styles.passwordInputContainer}>
              <Text style={styles.inputLabel}>Yleissalasana:</Text>
              <TextInput
                style={styles.passwordInput}
                value={commonPassword}
                onChangeText={setCommonPassword}
                placeholder="Syötä salasana"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.showPasswordButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? "eye-off" : "eye"}
                  size={20}
                  color="#666"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setPasswordModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Peruuta</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.createButton,
                  (!commonPassword.trim() || creatingPasswords) &&
                    styles.disabledButton,
                ]}
                onPress={createPasswordsForSelectedUsers}
                disabled={!commonPassword.trim() || creatingPasswords}
              >
                {creatingPasswords ? (
                  <View style={styles.loadingContainer}>
                    <Text style={styles.createButtonText}>Luodaan...</Text>
                  </View>
                ) : (
                  <Text style={styles.createButtonText}>Luo</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  saveButton: {
    backgroundColor: "#1976d2",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  savingButton: {
    backgroundColor: "#999",
  },
  saveButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "500",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
  },
  content: {
    flex: 1,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "white",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 12,
  },
  activeTab: {
    backgroundColor: "#1976d2",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#666",
  },
  activeTabText: {
    color: "white",
  },
  teamSelector: {
    backgroundColor: "white",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  teamOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#f8f9fa",
  },
  selectedTeamOption: {
    backgroundColor: "#e3f2fd",
    borderWidth: 2,
    borderColor: "#1976d2",
  },
  teamOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  teamColorIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 12,
  },
  teamOptionText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  selectedTeamOptionText: {
    color: "#1976d2",
    fontWeight: "600",
  },
  section: {
    backgroundColor: "white",
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
    lineHeight: 20,
  },
  settingItem: {
    marginBottom: 20,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    marginBottom: 8,
  },
  settingDescription: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  numberInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
    width: 100,
  },
  switchItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  switchLabelContainer: {
    flex: 1,
    marginRight: 16,
  },
  infoSection: {
    marginHorizontal: 16,
    marginTop: 20,
  },
  infoBox: {
    backgroundColor: "#e3f2fd",
    padding: 16,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  infoText: {
    fontSize: 14,
    color: "#1976d2",
    marginLeft: 8,
    flex: 1,
    lineHeight: 20,
  },
  // User Management Styles
  userManagementHeader: {
    flexDirection: "column",
    // justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  userCountText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  selectAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f0f0f0",
    borderRadius: 6,
  },
  selectAllText: {
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "500",
  },
  usersList: {
    marginBottom: 16,
  },
  userItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  selectedUserItem: {
    backgroundColor: "#e8f5e8",
    borderColor: "#4CAF50",
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: "#666",
  },
  createPasswordsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  createPasswordsText: {
    color: "white",
    fontSize: 16,
    fontWeight: "500",
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  passwordModalContainer: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  modalDescription: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginBottom: 20,
  },
  passwordInputContainer: {
    marginBottom: 24,
    position: "relative",
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 8,
  },
  passwordInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    paddingRight: 50,
    fontSize: 16,
    backgroundColor: "#f8f9fa",
  },
  showPasswordButton: {
    position: "absolute",
    right: 12,
    bottom: 12,
    padding: 4,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#f0f0f0",
  },
  cancelButtonText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
  createButton: {
    backgroundColor: "#007AFF",
  },
  createButtonText: {
    fontSize: 16,
    color: "white",
    fontWeight: "500",
  },
  disabledButton: {
    backgroundColor: "#ccc",
    opacity: 0.6,
  },
});

export default SettingsScreen;
