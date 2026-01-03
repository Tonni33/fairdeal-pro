import React from "react";
import { StatusBar } from "expo-status-bar";
import { View, Platform, StyleSheet } from "react-native";
import { Provider as PaperProvider } from "react-native-paper";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider } from "./src/contexts/AuthContext";
import { AppProvider } from "./src/contexts/AppContext";
import AppNavigator from "./src/navigation/AppNavigator";
import { NotificationHandler } from "./src/components/NotificationHandler";

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider>
        <AuthProvider>
          <AppProvider>
            <NotificationHandler>
              {Platform.OS === "android" ? (
                <SafeAreaView
                  style={styles.androidContainer}
                  edges={["top", "bottom"]}
                >
                  <StatusBar style="auto" />
                  <AppNavigator />
                </SafeAreaView>
              ) : (
                <View style={styles.container}>
                  <StatusBar style="auto" />
                  <AppNavigator />
                </View>
              )}
            </NotificationHandler>
          </AppProvider>
        </AuthProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  androidContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
});
