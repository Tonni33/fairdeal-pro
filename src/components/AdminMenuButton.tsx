import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";

interface AdminMenuButtonProps {
  onNavigate?: (screen: string) => void;
}

const AdminMenuButton: React.FC<AdminMenuButtonProps> = ({ onNavigate }) => {
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const { user } = useAuth();

  // Only show for admin users - check if user exists first
  if (!user) {
    return null;
  }

  const userRole = (user as any).role;
  if (userRole !== "admin") {
    return null;
  }

  const menuItems = [
    {
      title: "Tiimien luonti",
      icon: "people-outline",
      screen: "TeamGeneration",
      description: "Luo tasapainoiset tiimit",
      adminOnly: true,
    },
    {
      title: "Luo tapahtuma",
      icon: "add-circle-outline",
      screen: "CreateEvent",
      description: "Luo uusi peli-ilta",
      adminOnly: true,
    },
    {
      title: "Tapahtumahallinta",
      icon: "calendar-outline",
      screen: "EventManagementScreen",
      description: "Muokkaa ja hallitse tapahtumia",
      adminOnly: false,
    },
    {
      title: "Luo pelaaja",
      icon: "person-add-outline",
      screen: "CreatePlayer",
      description: "Lisää uusi pelaaja",
      adminOnly: true,
    },

    {
      title: "Käyttäjähallinta",
      icon: "settings-outline",
      screen: "UserManagement",
      description: "Hallinnoi käyttäjiä",
      adminOnly: true,
    },
    {
      title: "Joukkuehallinta",
      icon: "people-outline",
      screen: "TeamManagement",
      description: "Luo ja hallinnoi joukkueita",
      adminOnly: true,
    },
    {
      title: "Asetukset",
      icon: "cog-outline",
      screen: "Settings",
      description: "Tapahtumien oletusasetukset",
      adminOnly: true,
    },
  ];

  const handleMenuItemPress = (screen: string, title: string) => {
    setIsMenuVisible(false);

    if (onNavigate) {
      onNavigate(screen);
    } else {
      // Temporary alert until screens are implemented
      Alert.alert("Tulossa pian", `${title} -toiminto toteutetaan seuraavaksi`);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.adminButton}
        onPress={() => setIsMenuVisible(true)}
      >
        <Ionicons name="menu" size={24} color="#1976d2" />
      </TouchableOpacity>

      <Modal
        visible={isMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setIsMenuVisible(false)}
        >
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Admin-valikko</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsMenuVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.menuItems}>
              {menuItems
                .filter((item) => !item.adminOnly || userRole === "admin")
                .map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.menuItem}
                    onPress={() => handleMenuItemPress(item.screen, item.title)}
                  >
                    <View style={styles.menuItemIcon}>
                      <Ionicons
                        name={item.icon as any}
                        size={24}
                        color="#1976d2"
                      />
                    </View>
                    <View style={styles.menuItemContent}>
                      <Text style={styles.menuItemTitle}>{item.title}</Text>
                      <Text style={styles.menuItemDescription}>
                        {item.description}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                  </TouchableOpacity>
                ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  adminButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "rgba(25, 118, 210, 0.1)",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  menuContainer: {
    backgroundColor: "white",
    borderRadius: 12,
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  menuHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  closeButton: {
    padding: 4,
  },
  menuItems: {
    padding: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#f8f9fa",
    marginBottom: 8,
  },
  menuItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(25, 118, 210, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  menuItemDescription: {
    fontSize: 14,
    color: "#666",
  },
});

export default AdminMenuButton;
