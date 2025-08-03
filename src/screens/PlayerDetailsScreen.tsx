import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../types";

type PlayerDetailsScreenRouteProp = RouteProp<
  RootStackParamList,
  "PlayerDetails"
>;

interface Props {
  route: PlayerDetailsScreenRouteProp;
}

const PlayerDetailsScreen: React.FC<Props> = ({ route }) => {
  const { playerId } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>
        Pelaajan {playerId} tiedot tulossa pian...
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  placeholder: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
});

export default PlayerDetailsScreen;
