import React from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

/**
 * Käynnistysnäkymä, joka jatkaa natiivia splashia saumattomasti: sama
 * taustaväri ja sama susilogo samassa koossa. iOS:n SplashScreen.storyboard
 * venyttää logon koko leveydelle, Androidin vanhan mallin splash piirtää sen
 * 288dp:n kokoisena.
 */
export const StartupScreen: React.FC<{ showSpinner?: boolean }> = ({
  showSpinner = false,
}) => {
  const { width } = useWindowDimensions();
  const logoSize = Platform.OS === "ios" ? width : 288;

  return (
    <View style={styles.container}>
      <Image
        source={require("../../assets/FairDeal_splash.png")}
        style={{ width: logoSize, height: logoSize }}
        resizeMode="contain"
      />
      {showSpinner && (
        <ActivityIndicator style={styles.spinner} size="small" color="#fff" />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0E1A27",
  },
  spinner: {
    position: "absolute",
    bottom: 80,
  },
});

export default StartupScreen;
