import React, { createContext, useContext, useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth, db } from "../services/firebase";
import { AuthContextType, User } from "../types";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let isComponentMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log(
        "Auth state changed:",
        firebaseUser
          ? `User logged in: ${firebaseUser.email}`
          : "User logged out"
      );

      // Only update state if component is still mounted
      if (!isComponentMounted) return;

      if (firebaseUser) {
        console.log("Firebase user:", firebaseUser.email, firebaseUser.uid);

        try {
          // Get user data from Firestore
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));

          if (!isComponentMounted) return; // Check again after async operation

          if (userDoc.exists()) {
            console.log("User document found in Firestore");
            const userData = userDoc.data();
            console.log("User data from Firestore:", userData);
            console.log("isAdmin field value:", userData.isAdmin);
            console.log("isMasterAdmin field value:", userData.isMasterAdmin);
            console.log("role field value:", userData.role);
            setUser({
              id: firebaseUser.uid,
              uid: firebaseUser.uid, // Add uid field
              email: firebaseUser.email!,
              displayName: firebaseUser.displayName || userData.displayName,
              role: userData.isAdmin ? "admin" : "user", // Check isAdmin field
              isAdmin: userData.isAdmin || false, // Add isAdmin field for compatibility
              isMasterAdmin: userData.isMasterAdmin || false, // Add isMasterAdmin field
              playerId: userData.playerId,
              createdAt: userData.createdAt?.toDate?.() || new Date(),
            });
          } else {
            console.log("Creating new user document in Firestore");
            // Create user document if it doesn't exist
            const newUser: User = {
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              email: firebaseUser.email!,
              displayName: firebaseUser.displayName || "",
              role: "user",
              createdAt: new Date(),
            };

            if (isComponentMounted) {
              await setDoc(doc(db, "users", firebaseUser.uid), {
                ...newUser,
                createdAt: new Date(),
              });

              setUser(newUser);
            }
          }
        } catch (error) {
          console.error("Error handling auth state change:", error);
          // Set user even if Firestore fails (permissions issue)
          if (isComponentMounted) {
            const basicUser: User = {
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              email: firebaseUser.email!,
              displayName: firebaseUser.displayName || "",
              role: "user",
              createdAt: new Date(),
            };
            setUser(basicUser);
          }
        }
      } else {
        console.log("No user, setting user to null");
        if (isComponentMounted) {
          setUser(null);
        }
      }

      if (isComponentMounted) {
        setLoading(false);
        setInitializing(false);
      }
    });

    return () => {
      isComponentMounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<void> => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    displayName?: string
  ): Promise<void> => {
    try {
      const result = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      if (displayName && result.user) {
        await updateProfile(result.user, { displayName });
      }

      // Create user document in Firestore
      const newUser: User = {
        id: result.user.uid,
        uid: result.user.uid,
        email: result.user.email!,
        displayName: displayName || "",
        role: "user",
        createdAt: new Date(),
      };

      try {
        await setDoc(doc(db, "users", result.user.uid), {
          ...newUser,
          createdAt: new Date(),
        });
      } catch (error) {
        console.error("Error creating user document:", error);
        // Continue even if Firestore fails
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      await firebaseSignOut(auth);

      // Check if user has biometric or PIN auth enabled
      const biometricEnabled = await AsyncStorage.getItem("biometric_enabled");
      const pinEnabled = await AsyncStorage.getItem("pin_enabled");

      if (biometricEnabled === "true" || pinEnabled === "true") {
        // Keep was_logged_in flag and email if user has quick auth enabled
        console.log(
          "Keeping was_logged_in flag and email because biometric/PIN auth is enabled"
        );
        // Don't remove quick_auth_email - it's needed for quick auth
      } else {
        // Clear all login-related flags if no quick auth
        console.log("Clearing all login flags - no quick auth enabled");
        await AsyncStorage.removeItem("was_logged_in");
        await AsyncStorage.removeItem("quick_auth_email");
      }

      console.log("Signed out successfully");
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const changePassword = async (newPassword: string): Promise<void> => {
    try {
      if (!auth.currentUser) {
        throw new Error("Käyttäjä ei ole kirjautunut sisään");
      }
      await updatePassword(auth.currentUser, newPassword);
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
