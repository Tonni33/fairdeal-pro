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

  // Check if user has admin privileges for the selected team OR any team
  const isUserAdmin = (): boolean => {
    if (!user?.uid) {
      console.log("AdminMenuButton: No user UID");
      return false;
    }

    // Check if user is master admin
    if (user.isMasterAdmin) {
      console.log("AdminMenuButton: User is MasterAdmin");
      return true;
    }

    // Check if user.isAdmin is set (from AuthContext team admin check)
    if (user.isAdmin === true) {
      console.log("AdminMenuButton: User has isAdmin flag set to true");
      return true;
    }

    // If a team is selected, check admin status for that specific team
    if (selectedTeamId) {
      const selectedTeam = teams.find((team) => team.id === selectedTeamId);
      if (selectedTeam) {
        const isAdminOfSelectedTeam =
          selectedTeam.adminIds?.includes(user.uid) ||
          selectedTeam.adminId === user.uid;
        console.log(
          `AdminMenuButton: Selected team ${selectedTeam.name}, isAdmin: ${isAdminOfSelectedTeam}`
        );
        return isAdminOfSelectedTeam;
      }
    }

    // If no team is selected, check if user is admin of ANY team
    const isAdminOfAnyTeam = teams.some(
      (team) => team.adminIds?.includes(user.uid) || team.adminId === user.uid
    );
    console.log(
      `AdminMenuButton: No team selected, checking all teams. isAdminOfAnyTeam: ${isAdminOfAnyTeam}`
    );
    return isAdminOfAnyTeam;
  };

  const shouldShow = isUserAdmin();
  console.log(
    `AdminMenuButton: Final decision - shouldShow: ${shouldShow}, user: ${user?.email}, selectedTeamId: ${selectedTeamId}`
  );

  // Only show for users with admin privileges
  if (!user || !shouldShow) {
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
