import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useApp } from "../contexts/AppContext";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../types";

interface AdminTeamButtonProps {
  style?: any;
}

const AdminTeamButton: React.FC<AdminTeamButtonProps> = ({ style }) => {
  const { user } = useAuth();
  const { selectedTeamId, teams } = useApp();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();

  // Check if user is admin of selected team
  const isSelectedTeamAdmin = (): boolean => {
    if (!selectedTeamId || !user?.uid) return false;

    // Master admin sees button for any team selection
    if (user.isMasterAdmin) return true;

    // Check if user is admin of the selected team
    const team = teams.find((t) => t.id === selectedTeamId);
    return team?.adminIds?.includes(user.uid) || team?.adminId === user.uid;
  };

  // Show button only if team is selected AND user is admin
  if (!selectedTeamId || !isSelectedTeamAdmin()) {
    return null;
  }

  return (
    <TouchableOpacity
      style={[styles.adminButton, style]}
      onPress={() => navigation.navigate("AdminMenu")}
    >
      <Ionicons name="settings" size={20} color="#fff" />
      <Text style={styles.adminButtonText}>Admin</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  adminButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF6B35",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
  },
  adminButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default AdminTeamButton;
