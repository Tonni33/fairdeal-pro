import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";

import { RootStackParamList, Team } from "../types";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import { useApp, getUserTeams } from "../contexts/AppContext";

type CreatePlayerScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "CreatePlayer"
>;

const CreatePlayerScreen: React.FC = () => {
  const navigation = useNavigation<CreatePlayerScreenNavigationProp>();
  const { user } = useAuth();
  const { teams, refreshData } = useApp();

  // Helper function to check if user is master admin
  const isMasterAdmin = (): boolean => {
    return Boolean(user && user.isMasterAdmin === true);
  };

  // Filtteröi joukkueet: Master admin näkee kaikki, muut vain omat
  const userTeams = useMemo(() => {
    if (isMasterAdmin()) {
      // Master admin näkee kaikki joukkueet
      return teams;
    } else {
      // Tavalliset käyttäjät näkevät vain ne joukkueet joissa ovat mukana
      return getUserTeams(user, teams);
    }
  }, [user, teams]);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [position, setPosition] = useState("H");
  const [category, setCategory] = useState(1);
  const [multiplier, setMultiplier] = useState(1.0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);

  // Modal states
  const [isTeamModalVisible, setIsTeamModalVisible] = useState(false);
  const [isPositionModalVisible, setIsPositionModalVisible] = useState(false);
  const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false);
  const [isMultiplierModalVisible, setIsMultiplierModalVisible] =
    useState(false);
  const [isRoleModalVisible, setIsRoleModalVisible] = useState(false);

  const positions = [
    { value: "H", label: "Hyökkääjä" },
    { value: "P", label: "Puolustaja" },
    { value: "H/P", label: "Hyökkääjä/Puolustaja" },
    { value: "MV", label: "Maalivahti" },
  ];

  const categories = [1, 2, 3];

  // Kerroin vaihtoehdot kategoriaperusteisesti
  const getMultiplierOptions = () => {
    if (category === 1) {
      return [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9];
    } else if (category === 2) {
      return [2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9];
    } else {
      return [3.0, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9];
    }
  };

  // Päivitä kerroin automaattisesti kategorian muuttuessa
  const handleCategoryChange = (newCategory: number) => {
    setCategory(newCategory);
    if (newCategory === 1) {
      setMultiplier(1.0);
    } else if (newCategory === 2) {
      setMultiplier(2.0);
    } else {
      setMultiplier(3.0);
    }
  };

  const validateForm = () => {
    if (!name.trim()) {
      Alert.alert("Virhe", "Nimi on pakollinen");
      return false;
    }
    if (!email.trim()) {
      Alert.alert("Virhe", "Sähköposti on pakollinen");
      return false;
    }
    if (selectedTeams.length === 0) {
      Alert.alert("Virhe", "Valitse vähintään yksi joukkue");
      return false;
    }
    if (multiplier < 1.0 || multiplier > 3.9) {
      Alert.alert("Virhe", "Kerroin tulee olla välillä 1.0 - 3.9");
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const playerData = {
        name: name.trim(),
        displayName: name.trim(), // Lisää displayName yhtenäisyyden vuoksi
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        teamIds: selectedTeams, // Muuta teams -> teamIds yhtenäisyyden vuoksi
        position,
        category,
        multiplier,
        isAdmin,
        createdAt: new Date(),
        createdBy: user?.uid,
        // Lisää käyttäjätilin tiedot
        needsPasswordChange: email.trim() ? true : false, // Jos email on annettu, tarvitsee salasanan
      };

      // Luo käyttäjä users kokoelmaan
      const userDocRef = await addDoc(collection(db, "users"), playerData);

      // Päivitä valittujen joukkueiden members-listat
      for (const teamId of selectedTeams) {
        const teamRef = doc(db, "teams", teamId);
        await updateDoc(teamRef, {
          members: arrayUnion(userDocRef.id),
        });
      }

      Alert.alert("Onnistui", "Pelaaja luotu onnistuneesti", [
        {
          text: "OK",
          onPress: () => {
            refreshData();
            navigation.goBack();
          },
        },
      ]);
    } catch (error) {
      console.error("Error creating player:", error);
      Alert.alert("Virhe", "Pelaajan luominen epäonnistui");
    } finally {
      setLoading(false);
    }
  };

  const toggleTeamSelection = (teamId: string) => {
    setSelectedTeams((prev) =>
      prev.includes(teamId)
        ? prev.filter((id) => id !== teamId)
        : [...prev, teamId]
    );
  };

  const getSelectedTeamsText = () => {
    if (selectedTeams.length === 0) return "Valitse joukkueet";
    if (selectedTeams.length === 1) {
      const team = userTeams.find((t) => t.id === selectedTeams[0]);
      return team?.name || "Tuntematon joukkue";
    }
    return `${selectedTeams.length} joukkuetta valittu`;
  };

  const getPositionLabel = () => {
    return positions.find((p) => p.value === position)?.label || position;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* <Text style={styles.title}>Luo uusi pelaaja</Text> */}

          {/* Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nimi *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Pelaajan nimi"
              placeholderTextColor="#999"
            />
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Sähköposti *</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="pelaaja@example.com"
              placeholderTextColor="#999"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Phone */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Puhelinnumero</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+358 XX XXX XXXX"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
            />
          </View>

          {/* Team Selection */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Joukkueet *</Text>
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setIsTeamModalVisible(true)}
            >
              <Text
                style={[
                  styles.selectorText,
                  selectedTeams.length === 0 && styles.placeholderText,
                ]}
              >
                {getSelectedTeamsText()}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Position */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Pelipaikka</Text>
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setIsPositionModalVisible(true)}
            >
              <Text style={styles.selectorText}>{getPositionLabel()}</Text>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Category */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Kategoria</Text>
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setIsCategoryModalVisible(true)}
            >
              <Text style={styles.selectorText}>Kategoria {category}</Text>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Multiplier */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Kerroin</Text>
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setIsMultiplierModalVisible(true)}
            >
              <Text style={styles.selectorText}>{multiplier.toFixed(1)}</Text>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Role */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Rooli</Text>
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setIsRoleModalVisible(true)}
            >
              <Text style={styles.selectorText}>
                {isAdmin ? "Admin" : "Jäsen"}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.disabledButton]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Ionicons
              name="person-add"
              size={20}
              color="white"
              style={styles.buttonIcon}
            />
            <Text style={styles.submitButtonText}>
              {loading ? "Luodaan..." : "Luo pelaaja"}
            </Text>
          </TouchableOpacity>
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
              <Text style={styles.modalTitle}>Valitse joukkueet</Text>
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
                style={styles.teamOption}
                onPress={() => toggleTeamSelection(team.id)}
              >
                <View style={styles.teamOptionLeft}>
                  <View style={styles.checkbox}>
                    {selectedTeams.includes(team.id) && (
                      <Ionicons name="checkmark" size={16} color="#007AFF" />
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
              onPress={() => setIsTeamModalVisible(false)}
            >
              <Text style={styles.modalConfirmText}>Valmis</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Position Selection Modal */}
      <Modal
        visible={isPositionModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsPositionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Valitse pelipaikka</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsPositionModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {positions.map((pos) => (
              <TouchableOpacity
                key={pos.value}
                style={[
                  styles.option,
                  position === pos.value && styles.selectedOption,
                ]}
                onPress={() => {
                  setPosition(pos.value);
                  setIsPositionModalVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    position === pos.value && styles.selectedOptionText,
                  ]}
                >
                  {pos.label}
                </Text>
                {position === pos.value && (
                  <Ionicons name="checkmark" size={20} color="#007AFF" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Category Selection Modal */}
      <Modal
        visible={isCategoryModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsCategoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Valitse kategoria</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsCategoryModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.option,
                  category === cat && styles.selectedOption,
                ]}
                onPress={() => {
                  handleCategoryChange(cat);
                  setIsCategoryModalVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    category === cat && styles.selectedOptionText,
                  ]}
                >
                  Kategoria {cat}
                </Text>
                {category === cat && (
                  <Ionicons name="checkmark" size={20} color="#007AFF" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Role Selection Modal */}
      <Modal
        visible={isRoleModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsRoleModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Valitse rooli</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsRoleModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.option, !isAdmin && styles.selectedOption]}
              onPress={() => {
                setIsAdmin(false);
                setIsRoleModalVisible(false);
              }}
            >
              <Text
                style={[
                  styles.optionText,
                  !isAdmin && styles.selectedOptionText,
                ]}
              >
                Jäsen
              </Text>
              {!isAdmin && (
                <Ionicons name="checkmark" size={20} color="#007AFF" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.option, isAdmin && styles.selectedOption]}
              onPress={() => {
                setIsAdmin(true);
                setIsRoleModalVisible(false);
              }}
            >
              <Text
                style={[
                  styles.optionText,
                  isAdmin && styles.selectedOptionText,
                ]}
              >
                Admin
              </Text>
              {isAdmin && (
                <Ionicons name="checkmark" size={20} color="#007AFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Multiplier Selection Modal */}
      <Modal
        visible={isMultiplierModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsMultiplierModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Valitse kerroin</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsMultiplierModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView}>
              {getMultiplierOptions().map((mult) => (
                <TouchableOpacity
                  key={mult}
                  style={[
                    styles.option,
                    multiplier === mult && styles.selectedOption,
                  ]}
                  onPress={() => {
                    setMultiplier(mult);
                    setIsMultiplierModalVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      multiplier === mult && styles.selectedOptionText,
                    ]}
                  >
                    {mult.toFixed(1)}
                  </Text>
                  {multiplier === mult && (
                    <Ionicons name="checkmark" size={20} color="#007AFF" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
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
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: "#333",
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
  submitButton: {
    backgroundColor: "#1976d2",
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
  modalScrollView: {
    maxHeight: 300,
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
  optionText: {
    fontSize: 16,
    color: "#333",
  },
  selectedOptionText: {
    color: "#007AFF",
    fontWeight: "500",
  },
});

export default CreatePlayerScreen;
