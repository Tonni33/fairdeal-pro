import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";

interface AdminMenuButtonProps {
  onNavigate?: (screen: string) => void;
}

const AdminMenuButton: React.FC<AdminMenuButtonProps> = ({ onNavigate }) => {
  const { user } = useAuth();

  // Only show for admin users - check if user exists first
  if (!user) {
    return null;
  }

  const userRole = (user as any).role;
  if (userRole !== "admin") {
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
