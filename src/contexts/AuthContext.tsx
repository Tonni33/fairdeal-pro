import React, { createContext, useContext, useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  deleteUser,
  User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  arrayRemove,
  collection,
  getDocs,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth, db } from "../services/firebase";
import { AuthContextType, User } from "../types";
import { SecureStorage } from "../utils/secureStorage";

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

            // Check if user is admin of any team
            let isTeamAdmin = false;
            try {
              console.log(
                "Checking team admin status for user:",
                firebaseUser.uid,
                firebaseUser.email
              );
              const teamsSnapshot = await getDocs(collection(db, "teams"));
              const teams = teamsSnapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
              })) as any[];

              console.log(`Found ${teams.length} teams, checking adminIds...`);

              teams.forEach((team) => {
                console.log(`Team ${team.name}:`, {
                  adminIds: team.adminIds,
                  adminId: team.adminId,
                  containsUid: team.adminIds?.includes(firebaseUser.uid),
                  adminIdMatchesUid: team.adminId === firebaseUser.uid,
                  adminIdMatchesEmail: team.adminId === firebaseUser.email,
                });
              });

              isTeamAdmin = teams.some(
                (team) =>
                  team.adminIds?.includes(firebaseUser.uid) ||
                  team.adminId === firebaseUser.uid ||
                  team.adminId === firebaseUser.email
              );

              console.log("User is admin of at least one team:", isTeamAdmin);
            } catch (error) {
              console.error("Error checking team admin status:", error);
            }

            // User is admin if they have isAdmin field OR are admin of any team
            const userIsAdmin = userData.isAdmin || isTeamAdmin || false;

            console.log("Final admin status decision:", {
              userDataIsAdmin: userData.isAdmin,
              isTeamAdmin: isTeamAdmin,
              finalUserIsAdmin: userIsAdmin,
            });

            const finalUser: User = {
              id: firebaseUser.uid,
              uid: firebaseUser.uid, // Add uid field
              email: firebaseUser.email!,
              name: userData.name || firebaseUser.displayName,
              displayName: firebaseUser.displayName || userData.displayName,
              role: (userIsAdmin ? "admin" : "user") as "user" | "admin",
              isAdmin: userIsAdmin,
              isMasterAdmin: userData.isMasterAdmin || false, // Add isMasterAdmin field
              playerId: userData.playerId,
              createdAt: userData.createdAt?.toDate?.() || new Date(),
            };

            console.log("🔐 Setting user object:", {
              email: finalUser.email,
              isAdmin: finalUser.isAdmin,
              isMasterAdmin: finalUser.isMasterAdmin,
              role: finalUser.role,
            });

            setUser(finalUser);
          } else {
            console.log("Creating new user document in Firestore");
            // Create user document if it doesn't exist
            const newUser: User = {
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              email: firebaseUser.email!,
              name: firebaseUser.displayName || "",
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
              name: firebaseUser.displayName || "",
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
        name: displayName || "",
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
        // Keep was_logged_in flag and credentials if user has quick auth enabled
        console.log(
          "Keeping was_logged_in flag and credentials because biometric/PIN auth is enabled"
        );
        // Don't remove credentials - they're needed for quick auth
      } else {
        // Clear all login-related flags and credentials if no quick auth
        console.log(
          "Clearing all login flags and credentials - no quick auth enabled"
        );
        await SecureStorage.setWasLoggedIn(false);
        await SecureStorage.clearCredentials();
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

  const deleteAccount = async (): Promise<void> => {
    try {
      if (!auth.currentUser || !user) {
        throw new Error("Käyttäjä ei ole kirjautunut sisään");
      }

      const userId = auth.currentUser.uid;
      const currentUser = auth.currentUser; // Store reference before deletion

      // Delete the Firebase Auth account FIRST
      // This is the most likely to fail and should be done before any data cleanup
      await deleteUser(currentUser);

      // After successful Auth deletion, clean up Firestore data
      // Remove user from all teams' member lists
      const teamsSnapshot = await getDocs(collection(db, "teams"));
      const updatePromises = [];

      for (const teamDoc of teamsSnapshot.docs) {
        const teamData = teamDoc.data();
        const teamId = teamDoc.id;

        // Check if user is in members array or adminIds array
        const isInMembers =
          teamData.members && teamData.members.includes(userId);
        const isInAdminIds =
          teamData.adminIds && teamData.adminIds.includes(userId);

        if (isInMembers || isInAdminIds) {
          const updateData: any = {};

          if (isInMembers) {
            updateData.members = arrayRemove(userId);
          }

          if (isInAdminIds) {
            updateData.adminIds = arrayRemove(userId);
          }

          updatePromises.push(updateDoc(doc(db, "teams", teamId), updateData));
        }
      }

      // Wait for all team updates to complete
      await Promise.all(updatePromises);

      // Delete user document from Firestore
      await deleteDoc(doc(db, "users", userId));

      // Clear local storage and authentication data
      await SecureStorage.clearCredentials();
      await AsyncStorage.removeItem("biometric_enabled");
      await AsyncStorage.removeItem("pin_enabled");
      await AsyncStorage.removeItem("was_logged_in");

      // Clear local state
      setUser(null);
    } catch (error: any) {
      console.error("Account deletion error:", error);

      // Provide more specific error messages
      if (error.code === "auth/requires-recent-login") {
        throw new Error(
          "Turvallisuussyistä sinun täytyy kirjautua uudelleen sisään ennen tilin poistoa. Kirjaudu ulos ja takaisin sisään, sitten yritä uudelleen."
        );
      } else if (error.code === "auth/network-request-failed") {
        throw new Error(
          "Verkkoyhteysvirhe. Tarkista internetyhteys ja yritä uudelleen."
        );
      } else {
        throw new Error(error.message || "Tilin poisto epäonnistui");
      }
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    changePassword,
    deleteAccount,
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
