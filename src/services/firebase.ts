import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, initializeAuth, type Auth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAu7G-FQHMntSeovsdmbaTGG_PUep-sM5E",
  authDomain: "fairdeal-c0a58.firebaseapp.com",
  projectId: "fairdeal-c0a58",
  storageBucket: "fairdeal-c0a58.firebasestorage.app",
  messagingSenderId: "365045026562",
  appId: "1:365045026562:web:63ac8f11801bd2f2623c1b",
};

// Initialize Firebase only if not already initialized
const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Firebase services
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Kirjautumisen säilyminen appin sulkemisen yli.
//
// @firebase/auth 1.11:n React Native -bundlessa getAuth() kutsuu sisäisesti
// initializeAuth(app) ILMAN persistenssiä ja kirjaa varoituksen "Auth state
// will default to memory persistence and will not persist between sessions".
// Istunto eli siis vain muistissa: kun käyttäjä sulki appin, kirjautuminen
// katosi ja hän joutui syöttämään salasanan uudelleen. Androidilla tämä osui
// useammin, koska järjestelmä sulkee taustalla olevia appeja herkemmin.
//
// AsyncStorage on jo appin natiiviriippuvuus, joten tämä on pelkkä JS-muutos.
// Kertoo säilyykö kirjautuminen levyllä. Tallennettuja tunnuksia siivotaan
// vasta kun tämä on tosi, jottei kukaan jää ilman kirjautumiskeinoa.
export let authPersistenceEnabled = false;

const createAuth = (): Auth => {
  if (Platform.OS === "web") {
    // Webissä firebase/auth käyttää selaimen omaa persistenssiä
    authPersistenceEnabled = true;
    return getAuth(app);
  }
  try {
    // getReactNativePersistence on vain RN-bundlessa, ei jaetuissa tyypeissä
    const { getReactNativePersistence } = require("firebase/auth") as {
      getReactNativePersistence: (storage: unknown) => any;
    };
    const instance = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
    authPersistenceEnabled = true;
    return instance;
  } catch (error) {
    // Auth on jo alustettu (esim. Fast Refresh) tai persistenssiä ei saatu
    console.warn("Firebase Auth persistence setup failed:", error);
    return getAuth(app);
  }
};

export const auth = createAuth();

export default app;
