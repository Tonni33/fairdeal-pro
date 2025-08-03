import React from "react";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./src/contexts/AuthContext";
import { AppProvider } from "./src/contexts/AppContext";
import AppNavigator from "./src/navigation/AppNavigator";

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <StatusBar style="auto" />
        <AppNavigator />
      </AppProvider>
    </AuthProvider>
  );
}
