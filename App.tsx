import React from "react";
import { StatusBar } from "expo-status-bar";
import { View, Platform, StyleSheet } from "react-native";
import { Provider as PaperProvider } from "react-native-paper";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider } from "./src/contexts/AuthContext";
import { AppProvider } from "./src/contexts/AppContext";
import AppNavigator from "./src/navigation/AppNavigator";
import { NotificationHandler } from "./src/components/NotificationHandler";

// Inject CSS for Expo web – makes html/body/#root fill the viewport so
// react-native-web ScrollView actually scrolls instead of growing forever.
if (Platform.OS === "web" && typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #root {
      height: 100% !important;
      overflow: hidden !important;
      margin: 0;
      padding: 0;
    }
  `;
  document.head.appendChild(style);
}

export default function App() {
  return (
    <SafeAreaProvider
      style={Platform.OS === "web" ? ({ height: "100%" } as any) : undefined}
    >
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
    ...(Platform.OS === "web" ? { height: "100%" } : {}),
  },
  androidContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
});
