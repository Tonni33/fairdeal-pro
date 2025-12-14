import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  Platform,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Calendar } from "react-native-calendars";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { collection, addDoc } from "firebase/firestore";

import { RootStackParamList } from "../types";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  useApp,
  getUserTeams,
  getUserAdminTeams,
} from "../contexts/AppContext";
import { getEventDefaults, formatTimeString } from "../utils/eventDefaults";

type CreateEventScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "CreateEvent"
>;

const CreateEventScreen: React.FC = () => {
  const navigation = useNavigation<CreateEventScreenNavigationProp>();
  const { user } = useAuth();
  const { teams } = useApp();

  // Form state
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [duration, setDuration] = useState("90"); // minutes
  const [maxPlayers, setMaxPlayers] = useState("20");
  const [maxGoalkeepers, setMaxGoalkeepers] = useState("2");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");

  // UI state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [customTime, setCustomTime] = useState("");
  const [showCustomTimeModal, setShowCustomTimeModal] = useState(false);
  const [showTimePickerModal, setShowTimePickerModal] = useState(false);
  const [isTeamModalVisible, setIsTeamModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // Helper function to check if user is master admin
  const isMasterAdmin = (): boolean => {
    return Boolean(user && user.isMasterAdmin === true);
  };

  // Get user teams (memoized to avoid repeated logs)
  // Master admin sees all teams, others see only their own
  const userTeams = React.useMemo(() => {
    if (!user || !user.uid) {
      console.log("CreateEventScreen: No user, returning empty teams array");
      return [];
    }
    if (teams.length === 0) {
      return [];
    }
    return getUserAdminTeams(user, teams);
  }, [user, teams]);

  // Common time presets
  const timePresets = [
    { label: "10:00", value: "10:00" },
    { label: "10:30", value: "10:30" },
    { label: "11:00", value: "11:00" },
    { label: "11:30", value: "11:30" },
    { label: "12:00", value: "12:00" },
    { label: "12:30", value: "12:30" },
    { label: "13:00", value: "13:00" },
    { label: "13:30", value: "13:30" },
    { label: "14:00", value: "14:00" },
    { label: "14:30", value: "14:30" },
    { label: "15:00", value: "15:00" },
    { label: "15:30", value: "15:30" },
    { label: "16:00", value: "16:00" },
    { label: "16:30", value: "16:30" },
    { label: "17:00", value: "17:00" },
    { label: "Muu aika...", value: "custom" },
  ];

  useEffect(() => {
    // Load default settings
    const loadDefaults = async () => {
      try {
        const defaults = await getEventDefaults(selectedTeamId || undefined);
        setTitle(defaults.defaultTitle);
        setLocation(defaults.defaultLocation);
        setMaxPlayers(defaults.maxPlayers.toString());
        setMaxGoalkeepers(defaults.maxGoalkeepers.toString());
        setDuration(defaults.eventDuration.toString());

        // Set default time
        const [hours, minutes] = defaults.defaultTime.split(":").map(Number);
        const defaultTime = new Date();
        defaultTime.setHours(hours, minutes, 0, 0);
        setSelectedTime(defaultTime);
      } catch (error) {
        console.error("Error loading defaults:", error);
      }
    };

    loadDefaults();

    // Set default team if user has only one team and no team is selected yet
    if (userTeams.length === 1 && !selectedTeamId) {
      setSelectedTeamId(userTeams[0].id);
    }
  }, [userTeams, selectedTeamId]);

  const handleTeamSelection = async (teamId: string) => {
    setSelectedTeamId(teamId);
    setIsTeamModalVisible(false);

    // Load team-specific defaults
    try {
      const defaults = await getEventDefaults(teamId);
      setTitle(defaults.defaultTitle);
      setLocation(defaults.defaultLocation);
      setMaxPlayers(defaults.maxPlayers.toString());
      setMaxGoalkeepers(defaults.maxGoalkeepers.toString());
      setDuration(defaults.eventDuration.toString());

      // Set default time
      const [hours, minutes] = defaults.defaultTime.split(":").map(Number);
      const defaultTime = new Date();
      defaultTime.setHours(hours, minutes, 0, 0);
      setSelectedTime(defaultTime);
    } catch (error) {
      console.error("Error loading team defaults:", error);
    }
  };

  const getSelectedTeamName = () => {
    const team = userTeams.find((t) => t.id === selectedTeamId);
    return team ? team.name : "Valitse joukkue";
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("fi-FI", {
      weekday: "short",
      day: "numeric",
      month: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("fi-FI", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleDateSelect = (day: any) => {
    const selectedDate = new Date(day.dateString);
    setSelectedDate(selectedDate);
    setShowDatePicker(false);
  };

  const handleTimePresetSelect = (timeValue: string) => {
    if (timeValue === "custom") {
      setShowTimePickerModal(false);
      setCustomTime("");
      setShowCustomTimeModal(true);
    } else {
      const [hours, minutes] = timeValue.split(":").map(Number);
      const newTime = new Date();
      newTime.setHours(hours, minutes, 0, 0);
      setSelectedTime(newTime);
      setShowTimePickerModal(false);
    }
  };

  const handleDateChange = (event: any, date?: Date) => {
    // Android sulkee päivämäärä-valitsimen automaattisesti
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }

    if (date && event.type !== "dismissed") {
      setSelectedDate(date);
      // iOS:lla voimme sulkea valitsimen manuaalisesti
      if (Platform.OS === "ios") {
        setShowDatePicker(false);
      }
    } else if (event.type === "dismissed") {
      setShowDatePicker(false);
    }
  };

  const handleTimeChange = (event: any, time?: Date) => {
    // Android sulkee aika-valitsimen automaattisesti
    if (Platform.OS === "android") {
      setShowTimePicker(false);
    }

    if (time && event.type !== "dismissed") {
      setSelectedTime(time);
      // iOS:lla voimme sulkea valitsimen manuaalisesti
      if (Platform.OS === "ios") {
        setShowTimePicker(false);
      }
    } else if (event.type === "dismissed") {
      setShowTimePicker(false);
    }
  };

  const validateForm = () => {
    if (!title.trim()) {
      Alert.alert("Virhe", "Anna tapahtumalle nimi");
      return false;
    }
    if (!selectedTeamId) {
      Alert.alert("Virhe", "Valitse joukkue");
      return false;
    }
    if (!location.trim()) {
      Alert.alert("Virhe", "Anna tapahtuman sijainti");
      return false;
    }
    if (parseInt(maxPlayers) < 1) {
      Alert.alert("Virhe", "Pelaajien maksimimäärä oltava vähintään 1");
      return false;
    }
    if (parseInt(maxGoalkeepers) < 0) {
      Alert.alert("Virhe", "Maalivahtien määrä ei voi olla negatiivinen");
      return false;
    }
    if (parseInt(duration) < 1) {
      Alert.alert("Virhe", "Kesto oltava vähintään 1 minuutti");
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    // Check license status before creating event
    const selectedTeam = teams.find((t) => t.id === selectedTeamId);
    if (!selectedTeam) {
      Alert.alert("Virhe", "Valittua joukkuetta ei löytynyt");
      return;
    }

    // Check if license is active and valid
    if (selectedTeam.licenseStatus !== "active") {
      Alert.alert(
        "Lisenssi vanhentunut",
        "Joukkueen lisenssi on vanhentunut tai ei ole aktiivinen. Pyydä admin uusimaan lisenssi ennen tapahtuman luomista.",
        [{ text: "OK" }]
      );
      return;
    }

    // Check if license has expired
    if (selectedTeam.licenseExpiresAt) {
      const expiryDate =
        typeof selectedTeam.licenseExpiresAt === "object" &&
        "seconds" in selectedTeam.licenseExpiresAt
          ? new Date((selectedTeam.licenseExpiresAt as any).seconds * 1000)
          : selectedTeam.licenseExpiresAt instanceof Date
          ? selectedTeam.licenseExpiresAt
          : new Date(selectedTeam.licenseExpiresAt);

      if (expiryDate < new Date()) {
        Alert.alert(
          "Lisenssi vanhentunut",
          `Joukkueen lisenssi vanheni ${expiryDate.toLocaleDateString(
            "fi-FI"
          )}. Pyydä admin uusimaan lisenssi ennen tapahtuman luomista.`,
          [{ text: "OK" }]
        );
        return;
      }
    }

    setLoading(true);
    try {
      // Combine date and time
      const eventDateTime = new Date(selectedDate);
      eventDateTime.setHours(selectedTime.getHours());
      eventDateTime.setMinutes(selectedTime.getMinutes());

      const eventData = {
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        date: eventDateTime.toISOString(),
        duration: parseInt(duration),
        maxPlayers: parseInt(maxPlayers),
        maxGoalkeepers: parseInt(maxGoalkeepers),
        teamId: selectedTeamId,
        createdBy: user?.uid,
        createdAt: new Date().toISOString(),
        registeredPlayers: [],
      };

      await addDoc(collection(db, "events"), eventData);

      Alert.alert("Onnistui!", "Tapahtuma luotu onnistuneesti", [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error("Error creating event:", error);
      Alert.alert("Virhe", "Tapahtuman luominen epäonnistui");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
      >
        {/* Title */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Tapahtuman nimi *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Esim. Keskiviikon peli"
            placeholderTextColor="#999"
          />
        </View>

        {/* Team Selection */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Joukkue *</Text>
          <TouchableOpacity
            style={styles.selectorButton}
            onPress={() => setIsTeamModalVisible(true)}
          >
            <Text
              style={[
                styles.selectorText,
                !selectedTeamId && styles.placeholderText,
              ]}
            >
              {getSelectedTeamName()}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Date */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Päivämäärä *</Text>
          <TouchableOpacity
            style={styles.selectorButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.selectorText}>{formatDate(selectedDate)}</Text>
            <Ionicons name="calendar-outline" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Time */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Kellonaika *</Text>
          <TouchableOpacity
            style={styles.selectorButton}
            onPress={() => setShowTimePickerModal(true)}
          >
            <Text style={styles.selectorText}>{formatTime(selectedTime)}</Text>
            <Ionicons name="time-outline" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Location */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Sijainti *</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="Esim. Keskuspuiston kenttä"
            placeholderTextColor="#999"
          />
        </View>

        {/* Duration */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Kesto (minuuttia) *</Text>
          <TextInput
            style={styles.input}
            value={duration}
            onChangeText={setDuration}
            placeholder="90"
            placeholderTextColor="#999"
            keyboardType="numeric"
          />
        </View>

        {/* Max Players */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Pelaajien maksimimäärä *</Text>
          <TextInput
            style={styles.input}
            value={maxPlayers}
            onChangeText={setMaxPlayers}
            placeholder="20"
            placeholderTextColor="#999"
            keyboardType="numeric"
          />
        </View>

        {/* Max Goalkeepers */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Maalivahtien maksimimäärä</Text>
          <TextInput
            style={styles.input}
            value={maxGoalkeepers}
            onChangeText={setMaxGoalkeepers}
            placeholder="2"
            placeholderTextColor="#999"
            keyboardType="numeric"
          />
        </View>

        {/* Description */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Kuvaus</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Lisätietoja tapahtumasta..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Ionicons
            name="add-circle"
            size={20}
            color="white"
            style={styles.buttonIcon}
          />
          <Text style={styles.submitButtonText}>
            {loading ? "Luodaan..." : "Luo tapahtuma"}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Date Picker Modal with Calendar */}
      <Modal
        visible={showDatePicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Valitse päivämäärä</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowDatePicker(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <Calendar
              onDayPress={handleDateSelect}
              markedDates={{
                [selectedDate.toISOString().split("T")[0]]: {
                  selected: true,
                  selectedColor: "#1976d2",
                },
              }}
              minDate={new Date().toISOString().split("T")[0]}
              monthFormat={"MMMM yyyy"}
              hideExtraDays={true}
              firstDay={1}
              theme={{
                backgroundColor: "#ffffff",
                calendarBackground: "#ffffff",
                textSectionTitleColor: "#b6c1cd",
                selectedDayBackgroundColor: "#1976d2",
                selectedDayTextColor: "#ffffff",
                todayTextColor: "#1976d2",
                dayTextColor: "#2d4150",
                textDisabledColor: "#d9e1e8",
                arrowColor: "#1976d2",
                monthTextColor: "#1976d2",
                indicatorColor: "#1976d2",
                textDayFontFamily: "System",
                textMonthFontFamily: "System",
                textDayHeaderFontFamily: "System",
                textDayFontWeight: "400",
                textMonthFontWeight: "600",
                textDayHeaderFontWeight: "600",
                textDayFontSize: 16,
                textMonthFontSize: 18,
                textDayHeaderFontSize: 14,
              }}
            />
          </View>
        </View>
      </Modal>

      {/* Time Preset Modal */}
      <Modal
        visible={showTimePickerModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowTimePickerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Valitse kellonaika</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowTimePickerModal(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={timePresets}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.timePresetOption}
                  onPress={() => handleTimePresetSelect(item.value)}
                >
                  <Text style={styles.timePresetText}>{item.label}</Text>
                  {item.value === "custom" && (
                    <Ionicons name="time-outline" size={20} color="#666" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Custom time input modal */}
      <Modal
        visible={showCustomTimeModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCustomTimeModal(false)}
      >
        <View style={styles.datePickerModalOverlay}>
          <View style={styles.datePickerModalContent}>
            <View style={styles.datePickerHeader}>
              <Text style={styles.datePickerTitle}>
                Syötä kellonaika (HH:MM)
              </Text>
              <TouchableOpacity
                style={styles.datePickerCloseButton}
                onPress={() => setShowCustomTimeModal(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={customTime}
              onChangeText={(text) => {
                // Poistetaan kaikki paitsi numerot
                let cleaned = text.replace(/[^0-9]/g, "");
                if (cleaned.length > 4) cleaned = cleaned.slice(0, 4);
                let formatted = cleaned;
                if (cleaned.length > 2) {
                  formatted = cleaned.slice(0, 2) + ":" + cleaned.slice(2);
                }
                setCustomTime(formatted);
              }}
              placeholder="Esim. 1845 -> 18:45"
              keyboardType="numeric"
              maxLength={5}
              autoFocus
            />
            <TouchableOpacity
              style={styles.datePickerConfirmButton}
              onPress={() => {
                // Validate input (HH:MM)
                const match = customTime.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
                if (match) {
                  const [hours, minutes] = customTime.split(":").map(Number);
                  const newTime = new Date();
                  newTime.setHours(hours, minutes, 0, 0);
                  setSelectedTime(newTime);
                  setShowCustomTimeModal(false);
                } else {
                  Alert.alert(
                    "Virhe",
                    "Syötä aika muodossa HH:MM (esim. 18:45)"
                  );
                }
              }}
            >
              <Text style={styles.datePickerConfirmText}>Aseta aika</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Android Time Picker */}
      {/* Android DateTimePicker poistettu, käytä custom preset tai TextInput */}

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

            {userTeams.map((team) => {
              // Check if license is expired or inactive
              const isLicenseInactive = team.licenseStatus !== "active";
              let isExpired = false;
              if (team.licenseExpiresAt) {
                const expiryDate =
                  typeof team.licenseExpiresAt === "object" &&
                  "seconds" in team.licenseExpiresAt
                    ? new Date((team.licenseExpiresAt as any).seconds * 1000)
                    : team.licenseExpiresAt instanceof Date
                    ? team.licenseExpiresAt
                    : new Date(team.licenseExpiresAt);
                isExpired = expiryDate < new Date();
              }
              const hasValidLicense = !isLicenseInactive && !isExpired;

              return (
                <TouchableOpacity
                  key={team.id}
                  style={[
                    styles.teamOption,
                    selectedTeamId === team.id && styles.selectedTeamOption,
                    !hasValidLicense && styles.disabledTeamOption,
                  ]}
                  onPress={() => handleTeamSelection(team.id)}
                >
                  <View style={styles.teamOptionLeft}>
                    <View
                      style={[
                        styles.teamColorIndicator,
                        { backgroundColor: team.color || "#1976d2" },
                      ]}
                    />
                    <View style={styles.teamNameContainer}>
                      <Text
                        style={[
                          styles.teamOptionText,
                          selectedTeamId === team.id &&
                            styles.selectedTeamOptionText,
                          !hasValidLicense && styles.disabledTeamText,
                        ]}
                      >
                        {team.name}
                      </Text>
                      {!hasValidLicense && (
                        <Text style={styles.licenseWarningText}>
                          ⚠️ Lisenssi vanhentunut
                        </Text>
                      )}
                    </View>
                  </View>
                  {selectedTeamId === team.id && (
                    <Ionicons name="checkmark" size={20} color="#007AFF" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
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
    paddingTop: 60, // Säilytetään ylätila
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
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: "#333",
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  selectorButton: {
    backgroundColor: "white",
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
  submitButton: {
    backgroundColor: "#4caf50",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonIcon: {
    marginRight: 8,
  },
  submitButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
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
  teamOption: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectedTeamOption: {
    backgroundColor: "#f0f8ff",
  },
  teamOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  teamColorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  teamOptionText: {
    fontSize: 16,
    color: "#333",
  },
  selectedTeamOptionText: {
    color: "#007AFF",
    fontWeight: "500",
  },
  disabledTeamOption: {
    opacity: 0.5,
  },
  teamNameContainer: {
    flex: 1,
  },
  disabledTeamText: {
    color: "#999",
  },
  licenseWarningText: {
    fontSize: 12,
    color: "#ff6b6b",
    marginTop: 2,
  },
  // DateTimePicker Modal styles
  datePickerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  datePickerModalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxWidth: 400,
  },
  datePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  datePickerCloseButton: {
    padding: 8,
  },
  dateTimePicker: {
    width: "100%",
    height: 200,
  },
  datePickerConfirmButton: {
    backgroundColor: "#1976d2",
    padding: 16,

    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
  },
  datePickerConfirmText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  // Calendar Modal styles
  calendarModalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
  },
  // Time Preset styles
  timePresetOption: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timePresetText: {
    fontSize: 16,
    color: "#333",
  },
});

export default CreateEventScreen;
