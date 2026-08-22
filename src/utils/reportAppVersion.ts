import { Platform } from "react-native";
import * as Updates from "expo-updates";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { JS_VERSION } from "../constants/jsVersion";

/**
 * Kirjaa käyttäjän dokumenttiin, mitä versiota hänen laitteellaan ajetaan.
 * Näkyy web-hallinnan käyttäjälistassa, jotta vanhaan versioon jääneet
 * huomaa ilman että heiltä pitää kysyä.
 *
 * Kaksi eri versiota:
 *  - runtimeVersion vastaa kaupasta asennettua sovellusversiota (tässä
 *    projektissa se on sidottu app.jsonin version-kenttään).
 *  - updateId kertoo, mikä JS-päivitys laitteella on käytössä. Jos ajossa on
 *    kaupan mukana tullut nippu, isEmbedded on tosi eikä updateId:tä ole.
 *
 * Ei koskaan kaada kirjautumista: virhe vain lokitetaan.
 */
export const reportAppVersion = async (userId: string): Promise<void> => {
  try {
    await updateDoc(doc(db, "users", userId), {
      appInfo: {
        runtimeVersion: Updates.runtimeVersion ?? null,
        // Nipun mukana kulkeva numero: kertoo tarkalleen minkä JS-version
        // laite ajaa, ilman aikaleimoihin perustuvaa päättelyä
        jsVersion: JS_VERSION,
        updateId: Updates.updateId ?? null,
        updateCreatedAt: Updates.createdAt ?? null,
        isEmbedded: Updates.isEmbeddedLaunch ?? null,
        channel: Updates.channel ?? null,
        platform: Platform.OS,
        osVersion: String(Platform.Version ?? ""),
        reportedAt: new Date(),
      },
    });
  } catch (error) {
    console.log("[Version] Versiotiedon kirjaus epäonnistui:", error);
  }
};
