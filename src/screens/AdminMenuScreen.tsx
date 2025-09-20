import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../types";
import { useAuth } from "../contexts/AuthContext";

type AdminMenuScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "AdminMenu"
>;

const AdminMenuScreen: React.FC = () => {
  const navigation = useNavigation<AdminMenuScreenNavigationProp>();
  const { user } = useAuth();

  const userRole = (user as any)?.role;

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

  const handleMenuItemPress = (screen: string) => {
    if (screen === "TeamGeneration") {
      navigation.navigate("TeamGeneration", { eventId: "" });
    } else {
      navigation.navigate(screen as any);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.subtitle}>
            Hallinnoi sovelluksen asetuksia ja sisältöä
          </Text>
        </View>

        <View style={styles.menuItems}>
          {menuItems
            .filter((item) => !item.adminOnly || userRole === "admin")
            .map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.menuItem}
                onPress={() => handleMenuItemPress(item.screen)}
              >
                <View style={styles.menuItemIcon}>
                  <Ionicons name={item.icon as any} size={24} color="#1976d2" />
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
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9f9f9",
  },
  content: {
    flex: 1,
  },
  header: {
    padding: 20,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  subtitle: {
    fontSize: 18,
    color: "#333",
    lineHeight: 24,
    fontWeight: "500",
  },
  menuItems: {
    padding: 16,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "white",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  menuItemIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(25, 118, 210, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  menuItemDescription: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
});

export default AdminMenuScreen;
