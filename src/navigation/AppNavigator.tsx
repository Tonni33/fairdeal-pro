import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { RootStackParamList, BottomTabParamList } from "../types";
import { useAuth } from "../contexts/AuthContext";

// Import screens (we'll create these next)
import LoginScreen from "../screens/LoginScreen";
import HomeScreen from "../screens/HomeScreen";
import EventsScreen from "../screens/EventsScreen";
import TeamsScreen from "../screens/TeamsScreen";
import PlayersScreen from "../screens/PlayersScreen";
import ProfileScreen from "../screens/ProfileScreen";
import EventDetailsScreen from "../screens/EventDetailsScreen";
import CreateEventScreen from "../screens/CreateEventScreen";
import CreatePlayerScreen from "../screens/CreatePlayerScreen";
import EventManagementScreen from "../screens/EventManagementScreen";
import UserManagementScreen from "../screens/UserManagementScreen";
import PlayerDetailsScreen from "../screens/PlayerDetailsScreen";
import TeamGenerationScreen from "../screens/TeamGenerationScreen";
import SettingsScreen from "../screens/SettingsScreen";
import MigrationScreen from "../screens/MigrationScreen";
import TeamManagementScreen from "../screens/TeamManagementScreen";
import AdminMenuScreen from "../screens/AdminMenuScreen";
import MasterAdminScreen from "../screens/MasterAdminScreen";
import RankingScreen from "../screens/RankingScreen";

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<BottomTabParamList>();

const TabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          switch (route.name) {
            case "Home":
              iconName = focused ? "home" : "home-outline";
              break;
            case "Events":
              iconName = focused ? "calendar" : "calendar-outline";
              break;
            case "Teams":
              iconName = focused ? "shield-half" : "shield-half-outline";
              break;
            case "Players":
              iconName = focused ? "people" : "people-outline";
              break;
            case "Profile":
              iconName = focused ? "person" : "person-outline";
              break;
            default:
              iconName = "help-outline";
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: "#1976d2",
        tabBarInactiveTintColor: "gray",
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: "Etusivu" }}
      />
      <Tab.Screen
        name="Events"
        component={EventsScreen}
        options={{ title: "Tapahtumat" }}
      />
      <Tab.Screen
        name="Teams"
        component={TeamsScreen}
        options={{ title: "Joukkueet" }}
      />
      <Tab.Screen
        name="Players"
        component={PlayersScreen}
        options={{ title: "Pelaajat" }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: "Profiili" }}
      />
    </Tab.Navigator>
  );
};

const AppNavigator = () => {
  const { user, loading } = useAuth();

  if (loading) {
    // TODO: Add proper loading screen
    return null;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="Main" component={TabNavigator} />
            <Stack.Screen
              name="EventDetails"
              component={EventDetailsScreen}
              options={{
                headerShown: true,
                title: "Tapahtuman tiedot",
                headerBackTitle: "Takaisin",
              }}
            />
            <Stack.Screen
              name="CreateEvent"
              component={CreateEventScreen}
              options={{
                headerShown: true,
                title: "Luo tapahtuma",
                headerBackTitle: "Peruuta",
              }}
            />
            <Stack.Screen
              name="CreatePlayer"
              component={CreatePlayerScreen}
              options={{
                headerShown: true,
                title: "Luo pelaaja",
                headerBackTitle: "Peruuta",
              }}
            />
            <Stack.Screen
              name="UserManagement"
              component={UserManagementScreen}
              options={{
                headerShown: true,
                title: "Käyttäjähallinta",
                headerBackTitle: "Takaisin",
              }}
            />
            <Stack.Screen
              name="PlayerDetails"
              component={PlayerDetailsScreen}
              options={{
                headerShown: true,
                title: "Pelaajan tiedot",
                headerBackTitle: "Takaisin",
              }}
            />
            <Stack.Screen
              name="TeamGeneration"
              component={TeamGenerationScreen}
              options={{
                headerShown: true,
                title: "Luo joukkueet",
                headerBackTitle: "Takaisin",
              }}
            />
            <Stack.Screen
              name="EventManagementScreen"
              component={EventManagementScreen}
              options={{
                headerShown: true,
                title: "Tapahtumahallinta",
                headerBackTitle: "Takaisin",
              }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="TeamManagement"
              component={TeamManagementScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="Migration"
              component={MigrationScreen}
              options={{
                headerShown: true,
                title: "Tietokannan migraatio",
                headerBackTitle: "Takaisin",
              }}
            />
            <Stack.Screen
              name="AdminMenu"
              component={AdminMenuScreen}
              options={{
                headerShown: true,
                title: "Admin-valikko",
                headerBackTitle: "Takaisin",
              }}
            />
            <Stack.Screen
              name="MasterAdmin"
              component={MasterAdminScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="Ranking"
              component={RankingScreen}
              options={{
                headerShown: true,
                title: "Ranking",
                headerBackTitle: "Takaisin",
              }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
