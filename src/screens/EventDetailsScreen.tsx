import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../types";

type EventDetailsScreenRouteProp = RouteProp<
  RootStackParamList,
  "EventDetails"
>;

interface Props {
  route: EventDetailsScreenRouteProp;
}

const EventDetailsScreen: React.FC<Props> = ({ route }) => {
  const { eventId } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>
        Tapahtuman {eventId} tiedot tulossa pian...
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

export default EventDetailsScreen;
