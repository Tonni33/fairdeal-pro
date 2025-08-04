import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

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

// Initialize Auth with AsyncStorage persistence for React Native
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});
console.log("Firebase Auth initialized");

export default app;
