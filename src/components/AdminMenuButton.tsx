import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useApp } from "../contexts/AppContext";

interface AdminMenuButtonProps {
  onNavigate?: (screen: string) => void;
}

const AdminMenuButton: React.FC<AdminMenuButtonProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { teams, selectedTeamId } = useApp();

  // Check if user has admin privileges for the selected team
  const isUserAdmin = (): boolean => {
    if (!user?.uid) return false;

    // Check if user is master admin
    if (user.isMasterAdmin) return true;

    // If no team is selected, don't show admin button
    if (!selectedTeamId) return false;

    // Check if user is admin of the selected team
    const selectedTeam = teams.find((team) => team.id === selectedTeamId);
    if (!selectedTeam) return false;

    return (
      selectedTeam.adminIds?.includes(user.uid) ||
      selectedTeam.adminId === user.uid
    );
  };

  // Only show for users with admin privileges
  if (!user || !isUserAdmin()) {
    return null;
  }

  const handlePress = () => {
    if (onNavigate) {
      onNavigate("AdminMenu");
    }
  };

  return (
    <TouchableOpacity style={styles.adminButton} onPress={handlePress}>
      <Ionicons name="menu" size={24} color="#1976d2" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  adminButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "rgba(25, 118, 210, 0.1)",
  },
});

export default AdminMenuButton;
