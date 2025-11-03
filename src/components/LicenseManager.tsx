import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Calendar } from "react-native-calendars";
import { Team, License, User } from "../types";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  getDoc,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { useApp } from "../contexts/AppContext";

interface LicenseManagerProps {
  visible: boolean;
  onClose: () => void;
  team?: Team;
  onLicenseUpdated?: () => void;
  isMasterAdmin?: boolean;
  currentUserId?: string; // Käyttäjän UID
  currentUserEmail?: string; // Käyttäjän email
  currentUser?: User; // Full user object for additional info
  currentUserPhone?: string; // User's phone number from Firestore
}

const LicenseManager: React.FC<LicenseManagerProps> = ({
  visible,
  onClose,
  team,
  onLicenseUpdated,
  isMasterAdmin = false,
  currentUserId,
  currentUserEmail,
  currentUser,
  currentUserPhone,
}) => {
  const { players } = useApp();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [licenseRequests, setLicenseRequests] = useState<any[]>([]);
  const [teams, setTeams] = useState<{ [key: string]: string }>({});
  const [teamColors, setTeamColors] = useState<{ [key: string]: string }>({});
  const [teamLicenseExpiry, setTeamLicenseExpiry] = useState<{
    [key: string]: Date;
  }>({});
  const [loading, setLoading] = useState(false);
  const [activatingLicense, setActivatingLicense] = useState(false);

  // Team admin information
  const [teamAdmins, setTeamAdmins] = useState<User[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  // Add admin functionality
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [addingAdmin, setAddingAdmin] = useState(false);

  // Activate license states
  const [licenseCode, setLicenseCode] = useState("");

  // License extension states for Master Admin
  const [showExtendLicense, setShowExtendLicense] = useState(false);
  const [selectedTeamForExtension, setSelectedTeamForExtension] =
    useState<Team | null>(null);
  const [extensionDays, setExtensionDays] = useState("30");
  const [extendingLicense, setExtendingLicense] = useState(false);

  // License detail modal states
  const [showLicenseDetail, setShowLicenseDetail] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null);

  // New license request modal states
  const [showNewLicenseModal, setShowNewLicenseModal] = useState(false);
  const [teamDescription, setTeamDescription] = useState("");
  const [estimatedPlayers, setEstimatedPlayers] = useState("");
  const [requestedLicenseType, setRequestedLicenseType] = useState<
    "trial" | "half-season" | "season"
  >("trial");

  // Date picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedExpiryDate, setSelectedExpiryDate] = useState<Date>(
    new Date()
  );
  const [updatingExpiry, setUpdatingExpiry] = useState(false);

  // Tarkista onko käyttäjä joukkueen admin adminIds arrayn perusteella
  const isTeamAdmin = (team?: Team): boolean => {
    if (!team) return false;

    console.log(
      "🔍 isTeamAdmin: Checking admin status for team:",
      team.name,
      "teamId:",
      team.id
    );
    console.log(
      "🔍 isTeamAdmin: currentUserId:",
      currentUserId,
      "currentUserEmail:",
      currentUserEmail
    );
    console.log("🔍 isTeamAdmin: team.adminIds:", team.adminIds);

    // Ensisijaisesti tarkista adminIds arraysta
    if (team.adminIds && Array.isArray(team.adminIds)) {
      const isInAdminIds = team.adminIds.includes(currentUserId || "");
      console.log("🔍 isTeamAdmin: Is in adminIds array:", isInAdminIds);
      if (isInAdminIds) return true;
    }

    // Fallback: tarkista haetusta teamAdmins listasta
    if (currentUserId) {
      const user = players.find((p) => p.id === currentUserId);
      const isTeamMember = user?.teamIds?.includes(team.id);
      console.log("🔍 isTeamAdmin: Is team member:", isTeamMember);

      if (isTeamMember) {
        // Käyttäjä on joukkueen jäsen, tarkista admin rooli teamAdmins listasta
        const isAdminInList = teamAdmins.some(
          (admin) =>
            admin.id === currentUserId || admin.email === currentUserEmail
        );
        console.log("🔍 isTeamAdmin: Is admin in fetched list:", isAdminInList);
        if (isAdminInList) return true;
      }
    }

    // Legacy fallback: tarkista vanhasta adminId kentästä
    if (team.adminId) {
      const isLegacyAdmin =
        (typeof currentUserId === "string" && team.adminId === currentUserId) ||
        (typeof currentUserEmail === "string" &&
          team.adminId === currentUserEmail);
      console.log("🔍 isTeamAdmin: Is legacy admin:", isLegacyAdmin);
      if (isLegacyAdmin) return true;
    }

    console.log("🔍 isTeamAdmin: No admin access found for team:", team.id);
    return false;
  };

  const getUserDisplayName = (user: User): string => {
    // Yritetään löytää nimi useammasta kentästä
    const userData = user as any;

    if (userData.displayName?.trim()) {
      return userData.displayName.trim();
    }

    if (userData.name?.trim()) {
      return userData.name.trim();
    }

    if (userData.firstName?.trim() || userData.lastName?.trim()) {
      const firstName = userData.firstName?.trim() || "";
      const lastName = userData.lastName?.trim() || "";
      return `${firstName} ${lastName}`.trim();
    }

    // Jos mikään nimi ei löydy, käytetään sähköpostin alkuosaa
    if (userData.email) {
      const emailName = userData.email.split("@")[0];
      return emailName.charAt(0).toUpperCase() + emailName.slice(1);
    }

    return "Nimetön käyttäjä";
  };

  const fetchTeamAdmins = async (team: Team): Promise<User[]> => {
    try {
      const admins: User[] = [];

      console.log(
        "🔍 fetchTeamAdmins: Starting adminIds search for team:",
        team.name,
        "teamId:",
        team.id
      );
      console.log("🔍 fetchTeamAdmins: team.adminIds:", team.adminIds);

      // Ensisijaisesti hae adminit adminIds arrayn perusteella
      if (
        team.adminIds &&
        Array.isArray(team.adminIds) &&
        team.adminIds.length > 0
      ) {
        console.log(
          "🔍 LicenseManager: Fetching admins from adminIds:",
          team.adminIds
        );

        for (const adminId of team.adminIds) {
          console.log("🔍 fetchTeamAdmins: Fetching admin with ID:", adminId);
          const userDoc = await getDoc(doc(db, "users", adminId));
          if (userDoc.exists()) {
            const userData = { id: userDoc.id, ...userDoc.data() } as User;
            console.log(
              "✅ LicenseManager: Admin found from adminIds:",
              userData.email
            );
            admins.push(userData);
          } else {
            console.log("❌ LicenseManager: No admin found with ID:", adminId);
          }
        }
        console.log(
          "🔍 fetchTeamAdmins: Found",
          admins.length,
          "admins from adminIds array"
        );
      } else {
        console.log(
          "⚠️ fetchTeamAdmins: No adminIds found, checking team members with admin roles"
        );

        // Fallback: hae kaikki joukkueen jäsenet playersista ja tarkista heidän roolinsa
        const teamMembers = players.filter((p) => p.teamIds?.includes(team.id));
        console.log(
          "🔍 LicenseManager: Fetching team members count:",
          teamMembers.length
        );

        for (const member of teamMembers) {
          console.log("🔍 fetchTeamAdmins: Checking member:", member.email);

          // Tarkista onko admin roolissa
          const globalRole = (member as any).role;
          const isLegacyAdmin = (member as any).isAdmin;

          if (globalRole === "admin" || isLegacyAdmin) {
            console.log(
              "✅ LicenseManager: Admin found from role:",
              member.email
            );
            admins.push(member as unknown as User);
          }
        }
        console.log(
          "🔍 fetchTeamAdmins: Found",
          admins.length,
          "admins from team members with admin roles"
        );
      }

      // Viimeinen fallback: legacy adminId kenttä
      if (admins.length === 0 && team.adminId) {
        console.log(
          "🔍 LicenseManager: Final fallback to legacy adminId:",
          team.adminId
        );
        const userDoc = await getDoc(doc(db, "users", team.adminId));
        if (userDoc.exists()) {
          const userData = { id: userDoc.id, ...userDoc.data() } as User;
          console.log("✅ LicenseManager: Final legacy admin found:", userData);
          admins.push(userData);
        }
      }

      console.log("🔍 fetchTeamAdmins: Total admins found:", admins.length);
      return admins;
    } catch (error) {
      console.error("❌ LicenseManager: Error fetching team admins:", error);
      return [];
    }
  };

  const fetchTeamAdmin = async (adminId: string): Promise<User | null> => {
    try {
      console.log("🔍 LicenseManager: Fetching user with ID:", adminId);
      const userDoc = await getDoc(doc(db, "users", adminId));
      if (userDoc.exists()) {
        const userData = { id: userDoc.id, ...userDoc.data() } as User;
        console.log("✅ LicenseManager: User found:", userData);
        console.log("🔍 LicenseManager: User name fields:", {
          displayName: userData.displayName,
          name: (userData as any).name,
          firstName: (userData as any).firstName,
          lastName: (userData as any).lastName,
          email: userData.email,
        });
        return userData;
      } else {
        console.log("❌ LicenseManager: No user found with ID:", adminId);
      }
    } catch (error) {
      console.error("❌ LicenseManager: Error fetching team admin:", error);
    }
    return null;
  };

  useEffect(() => {
    if (visible) {
      loadLicenses();
      loadLicenseRequests();
      if (isMasterAdmin) {
        loadTeamNames();
      }
    }
  }, [visible, isMasterAdmin]);

  // Erillinen useEffect admin-tietojen hakemiseen joukkueen vaihtuessa
  useEffect(() => {
    // Nollaa admin-tiedot heti kun joukkue vaihtuu
    setTeamAdmins([]);
    setLoadingAdmins(false);
    setShowAddAdmin(false); // Sulje admin-lisäyslomake
    setNewAdminEmail(""); // Tyhjennä admin email kenttä

    // Fetch team admin information if team is provided
    if (team && visible) {
      console.log(
        "🔍 LicenseManager: Team changed, fetching admins for:",
        team.name,
        "adminIds:",
        team.adminIds,
        "legacy adminId:",
        team.adminId
      );
      console.log(
        "🔍 LicenseManager: Full team object:",
        JSON.stringify(team, null, 2)
      );
      setLoadingAdmins(true);
      fetchTeamAdmins(team).then((adminInfos) => {
        console.log("👤 LicenseManager: Admin infos received:", adminInfos);
        console.log("👤 LicenseManager: Admin count:", adminInfos.length);
        setTeamAdmins(adminInfos);
        setLoadingAdmins(false);
      });
    } else if (!team) {
      console.log("⚠️ LicenseManager: No team provided, clearing admin data");
    }
  }, [team, visible]);

  const loadLicenses = async () => {
    try {
      setLoading(true);
      const licensesRef = collection(db, "licenses");
      const snapshot = await getDocs(licensesRef);
      const licensesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as License[];

      console.log(
        "🔍 loadLicenses: Ladattiin",
        licensesData.length,
        "lisenssiä"
      );
      licensesData.forEach((lic) => {
        if (lic.usedByTeamId) {
          console.log(
            `  ✅ Lisenssi ${lic.id}: käytössä joukkueella ${lic.usedByTeamId} (isUsed: ${lic.isUsed})`
          );
        } else {
          console.log(`  ❌ Lisenssi ${lic.id}: VAPAA (isUsed: ${lic.isUsed})`);
        }
      });

      setLicenses(licensesData);
    } catch (error) {
      console.error("Virhe lisenssien latauksessa:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadLicenseRequests = async () => {
    try {
      const requestsRef = collection(db, "licenseRequests");
      const q = query(requestsRef, where("status", "==", "pending"));
      const snapshot = await getDocs(q);
      const requestsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setLicenseRequests(requestsData);
    } catch (error) {
      console.error("Virhe lisenssipyyntöjen latauksessa:", error);
    }
  };

  const loadTeamNames = async () => {
    try {
      const teamsRef = collection(db, "teams");
      const snapshot = await getDocs(teamsRef);
      const teamNamesMap: { [key: string]: string } = {};
      const teamColorsMap: { [key: string]: string } = {};
      const teamLicenseExpiryMap: { [key: string]: Date } = {};

      console.log(
        "🔍 loadTeamNames: Ladattiin",
        snapshot.docs.length,
        "joukkuetta"
      );

      snapshot.docs.forEach((doc) => {
        const teamData = doc.data();
        teamNamesMap[doc.id] = teamData.name || "Tuntematon joukkue";
        teamColorsMap[doc.id] = teamData.color || "#2196F3"; // Default blue if no color

        // Debug: Show team's licenseId
        console.log(
          `  ${teamData.licenseId ? "🔗" : "❌"} ${teamData.name} (${
            doc.id
          }) -> licenseId: ${teamData.licenseId || "EI LISENSSIÄ"}`
        );

        // Load license expiry date
        if (teamData.licenseExpiresAt) {
          const expiryDate =
            typeof teamData.licenseExpiresAt === "object" &&
            "seconds" in teamData.licenseExpiresAt
              ? new Date(teamData.licenseExpiresAt.seconds * 1000)
              : teamData.licenseExpiresAt instanceof Date
              ? teamData.licenseExpiresAt
              : new Date(teamData.licenseExpiresAt);
          teamLicenseExpiryMap[doc.id] = expiryDate;
        }
      });

      console.log(
        "🔍 loadTeamNames: Joukkueet:",
        Object.entries(teamNamesMap).map(([id, name]) => `${name} (${id})`)
      );

      setTeams(teamNamesMap);
      setTeamColors(teamColorsMap);
      setTeamLicenseExpiry(teamLicenseExpiryMap);
    } catch (error) {
      console.error("Virhe joukkueiden latauksessa:", error);
    }
  };

  const requestLicense = async (
    requestType: "new" | "renewal",
    additionalInfo?: {
      description?: string;
      estimatedPlayers?: number;
      licenseType?: "trial" | "half-season" | "season";
    }
  ) => {
    if (!team?.id) {
      Alert.alert("Virhe", "Joukkue ID puuttuu");
      return;
    }

    if (!isTeamAdmin(team)) {
      Alert.alert("Virhe", "Vain joukkueen admin voi pyytää lisenssiä");
      return;
    }

    try {
      console.log("LicenseManager - Creating request with:", {
        currentUserPhone,
        currentUserAsPhone: (currentUser as any)?.phone,
        currentUserPhoneNumber: currentUser?.phoneNumber,
        currentUserName: currentUser?.name,
        currentUserEmail: currentUserEmail,
      });

      const requestData: any = {
        teamId: team.id,
        teamName: team.name || "Tuntematon joukkue",
        requestType: requestType,
        requestedAt: new Date(),
        status: "pending",
        requestedBy: currentUserId || "Tuntematon käyttäjä",
        adminName: currentUser?.name || currentUserEmail || "Tuntematon",
        adminEmail: currentUserEmail || "",
        adminPhone:
          currentUserPhone ||
          (currentUser as any)?.phone ||
          currentUser?.phoneNumber ||
          "",
      };

      console.log("LicenseManager - Request data to save:", {
        adminName: requestData.adminName,
        adminEmail: requestData.adminEmail,
        adminPhone: requestData.adminPhone,
      });

      // Add additional info for new license requests
      if (requestType === "new" && additionalInfo) {
        if (additionalInfo.description) {
          requestData.teamDescription = additionalInfo.description;
        }
        if (additionalInfo.estimatedPlayers) {
          requestData.estimatedPlayerCount = additionalInfo.estimatedPlayers;
        }
        if (additionalInfo.licenseType) {
          requestData.requestedLicenseType = additionalInfo.licenseType;
        }
      }

      console.log(
        "LicenseManager - FINAL data before Firestore save:",
        JSON.stringify(requestData, null, 2)
      );

      await addDoc(collection(db, "licenseRequests"), requestData);

      Alert.alert(
        "Pyyntö lähetetty",
        requestType === "new"
          ? "Uuden lisenssin pyyntö on lähetetty MasterAdminille. Saat ilmoituksen kun pyyntö on käsitelty."
          : "Lisenssin uusimispyyntö on lähetetty MasterAdminille. Saat ilmoituksen kun pyyntö on käsitelty.",
        [{ text: "OK", onPress: () => onClose() }]
      );
    } catch (error) {
      console.error("Virhe lisenssipyynnön lähettämisessä:", error);
      Alert.alert("Virhe", "Lisenssipyynnön lähettäminen epäonnistui");
    }
  };

  const approveLicenseRequest = async (requestId: string, teamId: string) => {
    try {
      setLoading(true);

      const availableLicense = licenses.find(
        (license) => !license.usedByTeamId
      );
      if (!availableLicense) {
        Alert.alert("Virhe", "Ei vapaita lisenssejä saatavilla");
        return;
      }

      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + availableLicense.duration * 24 * 60 * 60 * 1000
      );

      const licenseRef = doc(db, "licenses", availableLicense.id);
      await updateDoc(licenseRef, {
        usedByTeamId: teamId,
        isUsed: true,
        usedAt: now,
      });

      const teamRef = doc(db, "teams", teamId);
      await updateDoc(teamRef, {
        licenseId: availableLicense.id,
        licenceCode: availableLicense.code,
        licenseExpiresAt: expiresAt,
        licenseType: availableLicense.type,
        licenseStatus: "active",
        licenseActivatedAt: now,
        licenseDuration: availableLicense.duration,
      });

      const requestRef = doc(db, "licenseRequests", requestId);
      await updateDoc(requestRef, {
        status: "approved",
        approvedAt: new Date(),
      });

      await loadLicenses();
      await loadLicenseRequests();

      Alert.alert(
        "Onnistui",
        "Lisenssipyyntö hyväksytty ja lisenssi aktivoitu"
      );
    } catch (error) {
      console.error("Virhe lisenssipyynnön hyväksynnässä:", error);
      Alert.alert("Virhe", "Lisenssipyynnön hyväksyntä epäonnistui");
    } finally {
      setLoading(false);
    }
  };

  const rejectLicenseRequest = async (requestId: string) => {
    try {
      const requestRef = doc(db, "licenseRequests", requestId);
      await updateDoc(requestRef, {
        status: "rejected",
        rejectedAt: new Date(),
      });

      await loadLicenseRequests();
      Alert.alert("Onnistui", "Lisenssipyyntö hylätty");
    } catch (error) {
      console.error("Virhe lisenssipyynnön hylkäämisessä:", error);
      Alert.alert("Virhe", "Lisenssipyynnön hylkääminen epäonnistui");
    }
  };

  const generateLicenseCode = (type: string): string => {
    const prefix = "FD2024";
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const suffix = type.toUpperCase().charAt(0);

    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return `${prefix}-${suffix}${code}`;
  };

  const getDurationDays = (
    type: "trial" | "half-season" | "season"
  ): number => {
    switch (type) {
      case "trial":
        return 60; // 2 months for trial
      case "half-season":
        return 183; // ~6 months
      case "season":
        return 365; // 1 year
      default:
        return 365;
    }
  };

  const extendTeamLicense = async (team: Team, additionalDays: number) => {
    if (!team.licenseExpiresAt) {
      Alert.alert("Virhe", "Joukkueella ei ole aktiivista lisenssiä");
      return;
    }

    setExtendingLicense(true);
    try {
      // Calculate new expiration date
      const currentExpiry = team.licenseExpiresAt;
      let currentExpiryDate: Date;

      if (
        currentExpiry &&
        typeof currentExpiry === "object" &&
        "seconds" in currentExpiry
      ) {
        // Firestore timestamp format
        currentExpiryDate = new Date((currentExpiry as any).seconds * 1000);
      } else if (currentExpiry instanceof Date) {
        currentExpiryDate = currentExpiry;
      } else if (typeof currentExpiry === "string") {
        currentExpiryDate = new Date(currentExpiry);
      } else {
        throw new Error("Invalid expiration date format");
      }

      const newExpiryDate = new Date(
        currentExpiryDate.getTime() + additionalDays * 24 * 60 * 60 * 1000
      );

      // Update team license expiration
      const teamRef = doc(db, "teams", team.id);
      await updateDoc(teamRef, {
        licenseExpiresAt: newExpiryDate,
        licenseDuration: (team.licenseDuration || 0) + additionalDays,
        updatedAt: new Date(),
        updatedBy: currentUserId,
      });

      // Update associated license if exists
      if (team.licenceCode) {
        const licensesQuery = query(
          collection(db, "licenses"),
          where("code", "==", team.licenceCode),
          where("usedByTeamId", "==", team.id)
        );
        const licensesSnapshot = await getDocs(licensesQuery);

        if (!licensesSnapshot.empty) {
          const licenseDoc = licensesSnapshot.docs[0];
          await updateDoc(doc(db, "licenses", licenseDoc.id), {
            duration: (licenseDoc.data().duration || 0) + additionalDays,
            updatedAt: new Date(),
          });
        }
      }

      Alert.alert(
        "Lisenssi pidennetty onnistuneesti! ✅",
        `Joukkue: ${team.name}\n\n` +
          `Lisenssi pidennetty ${additionalDays} päivällä\n` +
          `Uusi voimassaoloaika: ${newExpiryDate.toLocaleDateString(
            "fi-FI"
          )} asti`,
        [
          {
            text: "OK",
            onPress: () => {
              setShowExtendLicense(false);
              setSelectedTeamForExtension(null);
              setExtensionDays("30");
              onLicenseUpdated?.();
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error extending license:", error);
      Alert.alert("Virhe", "Lisenssin pidentäminen epäonnistui");
    }
    setExtendingLicense(false);
  };

  // Update license expiry date directly (for Master Admin)
  const updateLicenseExpiryDate = async (
    license: License,
    newExpiryDate: Date
  ) => {
    if (!license.usedByTeamId) {
      Alert.alert("Virhe", "Lisenssi ei ole käytössä");
      return;
    }

    console.log("📅 Päivitetään lisenssin voimassaoloaikaa:");
    console.log("- Lisenssi ID:", license.id);
    console.log("- Joukkue ID:", license.usedByTeamId);
    console.log(
      "- Uusi voimassaolopäivä:",
      newExpiryDate.toLocaleDateString("fi-FI")
    );

    setUpdatingExpiry(true);
    try {
      // Calculate days from now to new expiry
      const now = new Date();
      const daysUntilExpiry = Math.ceil(
        (newExpiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      console.log("- Päiviä nyt -> uusi päivä:", daysUntilExpiry);

      // Update team license expiration
      const teamRef = doc(db, "teams", license.usedByTeamId);
      await updateDoc(teamRef, {
        licenseExpiresAt: newExpiryDate,
        licenseDuration: daysUntilExpiry,
        updatedAt: new Date(),
        updatedBy: currentUserId,
      });
      console.log("✅ Teams-dokumentti päivitetty");

      // Update license document
      const licenseRef = doc(db, "licenses", license.id);
      await updateDoc(licenseRef, {
        duration: daysUntilExpiry,
        updatedAt: new Date(),
      });
      console.log("✅ License-dokumentti päivitetty");

      Alert.alert(
        "Voimassaoloaika päivitetty! ✅",
        `Uusi voimassaoloaika: ${newExpiryDate.toLocaleDateString(
          "fi-FI"
        )} asti`,
        [
          {
            text: "OK",
            onPress: () => {
              setShowLicenseDetail(false);
              setSelectedLicense(null);
              setShowDatePicker(false);
              loadLicenses();
              onLicenseUpdated?.();
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error updating license expiry:", error);
      Alert.alert("Virhe", "Voimassaoloajan päivitys epäonnistui");
    } finally {
      setUpdatingExpiry(false);
    }
  };

  const activateLicense = async (team: Team, code: string) => {
    if (!code.trim()) {
      Alert.alert("Virhe", "Syötä lisenssikoodi");
      return;
    }

    setActivatingLicense(true);
    try {
      const licensesQuery = query(
        collection(db, "licenses"),
        where("code", "==", code.trim().toUpperCase()),
        where("isUsed", "==", false)
      );

      const licensesSnapshot = await getDocs(licensesQuery);
      if (licensesSnapshot.empty) {
        Alert.alert("Virhe", "Lisenssiä ei löytynyt tai se on jo käytetty");
        return;
      }

      const licenseDoc = licensesSnapshot.docs[0];
      const license = { id: licenseDoc.id, ...licenseDoc.data() } as License;

      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + license.duration * 24 * 60 * 60 * 1000
      );

      const teamRef = doc(db, "teams", team.id);
      await updateDoc(teamRef, {
        licenceCode: license.code,
        licenseStatus: "active",
        licenseExpiresAt: expiresAt,
        licenseActivatedAt: now,
        licenseDuration: license.duration,
      });

      const licenseRef = doc(db, "licenses", license.id);
      await updateDoc(licenseRef, {
        isUsed: true,
        usedByTeamId: team.id,
        usedAt: now,
      });

      Alert.alert(
        "Lisenssi aktivoitu",
        `Lisenssi on aktivoitu joukkueelle ${
          team.name
        }. Voimassa ${expiresAt.toLocaleDateString("fi-FI")} asti.`,
        [{ text: "OK", onPress: onClose }]
      );

      onLicenseUpdated?.();
    } catch (error) {
      console.error("Virhe lisenssin aktivoinnissa:", error);
      Alert.alert("Virhe", "Lisenssin aktivointi epäonnistui");
    }
    setActivatingLicense(false);
  };

  const deleteLicense = async (license: License) => {
    Alert.alert(
      "Vahvista poisto",
      `Haluatko varmasti poistaa lisenssin ${license.code}?${
        license.usedByTeamId
          ? "\n\nTämä deaktivoi lisenssin myös joukkueelta."
          : ""
      }`,
      [
        { text: "Peruuta", style: "cancel" },
        {
          text: "Poista",
          style: "destructive",
          onPress: async () => {
            try {
              if (license.usedByTeamId) {
                const teamRef = doc(db, "teams", license.usedByTeamId);
                await updateDoc(teamRef, {
                  licenceCode: null,
                  licenseStatus: "inactive",
                  licenseExpiresAt: null,
                  licenseActivatedAt: null,
                  licenseDuration: null,
                });
              }

              await deleteDoc(doc(db, "licenses", license.id));
              Alert.alert("Onnistui", "Lisenssi poistettu");
              await loadLicenses();
              onLicenseUpdated?.();
            } catch (error) {
              console.error("Virhe lisenssin poistossa:", error);
              Alert.alert("Virhe", "Lisenssin poisto epäonnistui");
            }
          },
        },
      ]
    );
  };

  const addAdminToTeam = async (team: Team, adminEmail: string) => {
    if (!adminEmail.trim()) {
      Alert.alert("Virhe", "Syötä admin-käyttäjän sähköpostiosoite");
      return;
    }

    setAddingAdmin(true);
    try {
      // Find user by email
      const usersRef = collection(db, "users");
      const q = query(
        usersRef,
        where("email", "==", adminEmail.trim().toLowerCase())
      );
      const userSnapshot = await getDocs(q);

      if (userSnapshot.empty) {
        Alert.alert(
          "Virhe",
          "Käyttäjää ei löytynyt sähköpostiosoitteella: " + adminEmail
        );
        setAddingAdmin(false);
        return;
      }

      const newAdminDoc = userSnapshot.docs[0];
      const newAdminId = newAdminDoc.id;
      const newAdminData = newAdminDoc.data();

      console.log("🔍 Found user to add as admin:", newAdminData);

      // Tarkista onko käyttäjä jo adminIds listassa
      let currentAdminIds = team.adminIds || [];
      if (currentAdminIds.includes(newAdminId)) {
        Alert.alert("Huomio", "Käyttäjä on jo tämän joukkueen admin");
        setAddingAdmin(false);
        return;
      }

      // Lisää käyttäjä adminIds listaan
      currentAdminIds.push(newAdminId);

      // Lisää joukkue käyttäjän teamIds listaan (jos ei ole jo siellä)
      const userPlayer = players.find((p) => p.id === newAdminId);
      if (!userPlayer?.teamIds?.includes(team.id)) {
        const userRef = doc(db, "users", newAdminId);
        await updateDoc(userRef, {
          teamIds: [...(userPlayer?.teamIds || []), team.id],
          updatedAt: new Date(),
        });
      }

      // Päivitä joukkueen tiedot
      const teamRef = doc(db, "teams", team.id);
      await updateDoc(teamRef, {
        adminIds: currentAdminIds,
        updatedAt: new Date(),
      });

      console.log("✅ Added user to team adminIds:", newAdminId);

      // Päivitä käyttäjän rooli adminiksi
      const userRef = doc(db, "users", newAdminId);
      await updateDoc(userRef, {
        isAdmin: true,
        role: "admin",
        updatedAt: new Date(),
      });

      console.log("✅ Updated user role to admin");

      Alert.alert(
        "Onnistui",
        `${
          newAdminData.displayName || newAdminData.name || newAdminData.email
        } lisätty joukkueen ${team.name} adminiksi`,
        [
          {
            text: "OK",
            onPress: () => {
              setShowAddAdmin(false);
              setNewAdminEmail("");
              // Refresh admin list
              if (team) {
                setLoadingAdmins(true);
                fetchTeamAdmins(team).then((adminInfos) => {
                  setTeamAdmins(adminInfos);
                  setLoadingAdmins(false);
                });
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error adding admin:", error);
      Alert.alert("Virhe", "Admin-käyttäjän lisääminen epäonnistui");
    }
    setAddingAdmin(false);
  };

  const getLicenseTypeText = (type: string): string => {
    switch (type) {
      case "trial":
        return "Kokeilu (60pv)";
      case "half-season":
        return "Puolikausi (183pv)";
      case "season":
        return "Kausi (365pv)";
      default:
        return type;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {isMasterAdmin && !team
                ? "MasterAdmin - Lisenssinhallinta"
                : team
                ? `${team.name} - Lisenssi`
                : "Lisenssinhallinta"}
            </Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {isMasterAdmin && !team ? (
              // MasterAdmin yleishallinta
              <>
                {/* License Requests Section */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    Lisenssipyynnöt ({licenseRequests.length})
                  </Text>

                  {licenseRequests.length === 0 ? (
                    <Text style={styles.noRequestsText}>
                      Ei odottavia lisenssipyyntöjä
                    </Text>
                  ) : (
                    licenseRequests.map((request) => (
                      <View key={request.id} style={styles.requestItem}>
                        <View style={styles.requestInfo}>
                          <Text style={styles.requestTeamName}>
                            {request.teamName}
                          </Text>
                          <Text style={styles.requestDate}>
                            Pyydetty:{" "}
                            {new Date(
                              request.requestedAt.seconds * 1000
                            ).toLocaleDateString("fi-FI")}
                          </Text>
                          <Text style={styles.requestedBy}>
                            Pyytäjä: {request.requestedBy}
                          </Text>
                        </View>

                        <View style={styles.requestActions}>
                          <TouchableOpacity
                            style={styles.approveButton}
                            onPress={() =>
                              approveLicenseRequest(request.id, request.teamId)
                            }
                            disabled={loading}
                          >
                            <Ionicons name="checkmark" size={20} color="#fff" />
                            <Text style={styles.approveButtonText}>
                              Hyväksy
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.rejectButton}
                            onPress={() => rejectLicenseRequest(request.id)}
                            disabled={loading}
                          >
                            <Ionicons name="close" size={20} color="#fff" />
                            <Text style={styles.rejectButtonText}>Hylkää</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </View>

                {/* License Extension for Teams - REMOVED */}

                {/* Licenses list */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    Kaikki lisenssit ({licenses.length})
                  </Text>

                  <View style={styles.licenseStatsRow}>
                    <View style={styles.statItem}>
                      <Text style={styles.statNumber}>
                        {licenses.filter((l) => !l.isUsed).length}
                      </Text>
                      <Text style={styles.statLabel}>Vapaana</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statNumber}>
                        {licenses.filter((l) => l.isUsed).length}
                      </Text>
                      <Text style={styles.statLabel}>Käytössä</Text>
                    </View>
                  </View>

                  {loading ? (
                    <ActivityIndicator
                      size="large"
                      color="#1976d2"
                      style={styles.loader}
                    />
                  ) : (
                    <View style={styles.licensesList}>
                      {licenses.slice(0, 50).map((license) => {
                        const teamColor = license.usedByTeamId
                          ? teamColors[license.usedByTeamId]
                          : undefined;

                        // Get expiry date from team data (loaded from Firestore)
                        let expiryDateStr = "";
                        if (license.usedByTeamId) {
                          const expiryDate =
                            teamLicenseExpiry[license.usedByTeamId];

                          if (expiryDate) {
                            expiryDateStr = `Voimassa ${expiryDate.toLocaleDateString(
                              "fi-FI"
                            )} saakka`;
                          }
                        }

                        return (
                          <TouchableOpacity
                            key={license.id}
                            style={styles.licenseCard}
                            onPress={async () => {
                              setSelectedLicense(license);
                              // Set initial date picker value based on license expiry
                              // Try to get the actual expiry date from the team document
                              if (license.usedByTeamId) {
                                try {
                                  const teamDoc = await getDoc(
                                    doc(db, "teams", license.usedByTeamId)
                                  );
                                  if (teamDoc.exists()) {
                                    const teamData = teamDoc.data();
                                    const licenseExpiresAt =
                                      teamData.licenseExpiresAt;

                                    if (licenseExpiresAt) {
                                      // Convert Firestore timestamp to Date
                                      const expiryDate =
                                        typeof licenseExpiresAt === "object" &&
                                        "seconds" in licenseExpiresAt
                                          ? new Date(
                                              (licenseExpiresAt as any)
                                                .seconds * 1000
                                            )
                                          : licenseExpiresAt instanceof Date
                                          ? licenseExpiresAt
                                          : new Date(licenseExpiresAt);
                                      setSelectedExpiryDate(expiryDate);
                                    } else if (license.usedAt) {
                                      // Fallback: calculate from usedAt + duration
                                      const expiryDate = new Date(
                                        (typeof license.usedAt === "object" &&
                                        "seconds" in license.usedAt
                                          ? (license.usedAt as any).seconds *
                                            1000
                                          : license.usedAt instanceof Date
                                          ? license.usedAt.getTime()
                                          : Date.now()) +
                                          license.duration * 24 * 60 * 60 * 1000
                                      );
                                      setSelectedExpiryDate(expiryDate);
                                    }
                                  }
                                } catch (error) {
                                  console.error(
                                    "Error loading team expiry date:",
                                    error
                                  );
                                  // Fallback to calculated date
                                  if (license.usedAt) {
                                    const expiryDate = new Date(
                                      (typeof license.usedAt === "object" &&
                                      "seconds" in license.usedAt
                                        ? (license.usedAt as any).seconds * 1000
                                        : license.usedAt instanceof Date
                                        ? license.usedAt.getTime()
                                        : Date.now()) +
                                        license.duration * 24 * 60 * 60 * 1000
                                    );
                                    setSelectedExpiryDate(expiryDate);
                                  }
                                }
                              } else if (license.usedAt) {
                                // For non-used licenses, calculate from creation
                                const expiryDate = new Date(
                                  (typeof license.usedAt === "object" &&
                                  "seconds" in license.usedAt
                                    ? (license.usedAt as any).seconds * 1000
                                    : license.usedAt instanceof Date
                                    ? license.usedAt.getTime()
                                    : Date.now()) +
                                    license.duration * 24 * 60 * 60 * 1000
                                );
                                setSelectedExpiryDate(expiryDate);
                              }
                              setShowLicenseDetail(true);
                            }}
                          >
                            <View style={styles.licenseCardHeader}>
                              <Text
                                style={[
                                  styles.licenseTeamName,
                                  teamColor && { color: teamColor },
                                ]}
                              >
                                {(() => {
                                  if (license.usedByTeamId) {
                                    const teamName =
                                      teams[license.usedByTeamId];
                                    if (!teamName) {
                                      console.log(
                                        "⚠️ Lisenssi käytössä mutta joukkuetta ei löydy:"
                                      );
                                      console.log(
                                        "  - License ID:",
                                        license.id
                                      );
                                      console.log(
                                        "  - usedByTeamId:",
                                        license.usedByTeamId
                                      );
                                      console.log(
                                        "  - isUsed:",
                                        license.isUsed
                                      );
                                      console.log(
                                        "  - Available teams:",
                                        Object.keys(teams)
                                      );
                                    }
                                    return teamName || "Tuntematon joukkue";
                                  }
                                  return "Vapaa lisenssi";
                                })()}
                              </Text>
                              <View
                                style={[
                                  styles.licenseStatusBadge,
                                  {
                                    backgroundColor: license.usedByTeamId
                                      ? "#e8f5e8"
                                      : "#fff3e0",
                                  },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.statusDot,
                                    {
                                      backgroundColor: license.usedByTeamId
                                        ? "#4caf50"
                                        : "#ff9800",
                                    },
                                  ]}
                                />
                                <Text
                                  style={[
                                    styles.licenseStatusBadgeText,
                                    {
                                      color: license.usedByTeamId
                                        ? "#4caf50"
                                        : "#ff9800",
                                    },
                                  ]}
                                >
                                  {license.usedByTeamId ? "Käytössä" : "Vapaa"}
                                </Text>
                              </View>
                            </View>

                            <View style={styles.licenseCardBody}>
                              <Text style={styles.licenseTypeCard}>
                                {getLicenseTypeText(license.type)}
                              </Text>

                              <Text style={styles.licenseCodeCard}>
                                Koodi: {license.code}
                              </Text>

                              {expiryDateStr && (
                                <Text style={styles.licenseExpiryDate}>
                                  {expiryDateStr}
                                </Text>
                              )}

                              {license.createdAt && (
                                <Text style={styles.licenseCreatedAt}>
                                  Luotu:{" "}
                                  {(() => {
                                    const createdAt = license.createdAt;
                                    if (
                                      createdAt &&
                                      typeof createdAt === "object" &&
                                      "seconds" in createdAt
                                    ) {
                                      return new Date(
                                        (createdAt as any).seconds * 1000
                                      ).toLocaleDateString("fi-FI");
                                    } else if (createdAt instanceof Date) {
                                      return createdAt.toLocaleDateString(
                                        "fi-FI"
                                      );
                                    }
                                    return "Tuntematon päivämäärä";
                                  })()}
                                </Text>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}

                      {licenses.length > 50 && (
                        <Text style={styles.moreItemsText}>
                          ... ja {licenses.length - 50} muuta lisenssiä
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              </>
            ) : team ? (
              // Joukkuekohtainen lisenssinhallinta
              <View style={styles.section}>
                {team.licenseStatus === "active" && team.licenseExpiresAt ? (
                  // Näytä aktiivinen lisenssi
                  <>
                    {/* Team name header */}
                    <Text style={styles.sectionTitle}>{team.name}</Text>

                    {/* Team admin information */}
                    {(() => {
                      console.log(
                        "🎯 LicenseManager: Rendering admin section (active license), teamAdmins:",
                        teamAdmins,
                        "loadingAdmins:",
                        loadingAdmins,
                        "team adminIds:",
                        team?.adminIds
                      );
                      return null;
                    })()}
                    {loadingAdmins ? (
                      <View style={styles.adminInfo}>
                        <View style={styles.adminHeader}>
                          <ActivityIndicator size="small" color="#1976d2" />
                          <Text style={styles.adminTitle}>
                            Ladataan admin-tietoja...
                          </Text>
                        </View>
                      </View>
                    ) : teamAdmins && teamAdmins.length > 0 ? (
                      <View style={styles.adminInfo}>
                        <View style={styles.adminHeader}>
                          <Ionicons name="people" size={16} color="#666" />
                          <Text style={styles.adminTitle}>
                            Ylläpitäjä{teamAdmins.length > 1 ? "t" : ""} (
                            {teamAdmins.length})
                          </Text>
                          {isTeamAdmin(team) && (
                            <TouchableOpacity
                              style={styles.addAdminButton}
                              onPress={() => setShowAddAdmin(!showAddAdmin)}
                            >
                              <Ionicons name="add" size={16} color="#1976d2" />
                            </TouchableOpacity>
                          )}
                        </View>
                        {teamAdmins.map((admin, index) => (
                          <View key={admin.id} style={styles.adminItem}>
                            <Text style={styles.adminName}>
                              {getUserDisplayName(admin)}
                            </Text>
                            <Text style={styles.adminEmail}>{admin.email}</Text>
                          </View>
                        ))}

                        {/* Add Admin Form */}
                        {showAddAdmin && isTeamAdmin(team) && (
                          <View style={styles.addAdminForm}>
                            <Text style={styles.addAdminLabel}>
                              Lisää uusi admin:
                            </Text>
                            <View style={styles.addAdminInputContainer}>
                              <TextInput
                                style={styles.addAdminInput}
                                value={newAdminEmail}
                                onChangeText={setNewAdminEmail}
                                placeholder="admin@example.com"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                              />
                              <TouchableOpacity
                                style={styles.addAdminSubmitButton}
                                onPress={() =>
                                  addAdminToTeam(team, newAdminEmail)
                                }
                                disabled={addingAdmin}
                              >
                                {addingAdmin ? (
                                  <ActivityIndicator
                                    size="small"
                                    color="#fff"
                                  />
                                ) : (
                                  <>
                                    <Ionicons
                                      name="add"
                                      size={16}
                                      color="#fff"
                                    />
                                    <Text style={styles.addAdminSubmitText}>
                                      Lisää
                                    </Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    ) : (
                      <View style={styles.adminInfo}>
                        <Text style={styles.adminTitle}>
                          Admin-tietoja ei löytynyt
                        </Text>
                      </View>
                    )}

                    <View style={styles.activeLicenseInfo}>
                      <Ionicons
                        name="checkmark-circle"
                        size={24}
                        color="#4caf50"
                      />
                      <View style={styles.licenseDetails}>
                        <Text style={styles.activeLicenseText}>
                          Lisenssi aktiivinen
                        </Text>
                        {team.licenseActivatedAt && (
                          <Text style={styles.licenseActivatedText}>
                            Aktivoitu:{" "}
                            {(() => {
                              const activatedDate = team.licenseActivatedAt;
                              if (
                                activatedDate &&
                                typeof activatedDate === "object" &&
                                "seconds" in activatedDate
                              ) {
                                // Firestore timestamp format
                                return new Date(
                                  (activatedDate as any).seconds * 1000
                                ).toLocaleDateString("fi-FI");
                              } else if (activatedDate instanceof Date) {
                                return activatedDate.toLocaleDateString(
                                  "fi-FI"
                                );
                              } else if (typeof activatedDate === "string") {
                                return new Date(
                                  activatedDate
                                ).toLocaleDateString("fi-FI");
                              }
                              return "Tuntematon päivämäärä";
                            })()}
                          </Text>
                        )}
                        <Text style={styles.licenseCodeText}>
                          Koodi: {team.licenceCode}
                        </Text>
                        <Text style={styles.licenseDaysLeft}>
                          {(() => {
                            const expiresAt = team.licenseExpiresAt;
                            let expirationDate;

                            if (
                              expiresAt &&
                              typeof expiresAt === "object" &&
                              "seconds" in expiresAt
                            ) {
                              // Firestore timestamp format
                              expirationDate = new Date(
                                (expiresAt as any).seconds * 1000
                              );
                            } else if (expiresAt instanceof Date) {
                              expirationDate = expiresAt;
                            } else if (typeof expiresAt === "string") {
                              expirationDate = new Date(expiresAt);
                            } else {
                              return "Tuntematon voimassaoloaika";
                            }

                            const daysLeft = Math.max(
                              0,
                              Math.ceil(
                                (expirationDate.getTime() - Date.now()) /
                                  (1000 * 60 * 60 * 24)
                              )
                            );

                            return `${daysLeft} päivää jäljellä`;
                          })()}
                        </Text>
                      </View>
                    </View>
                    {/* Team join code edit for team admin */}
                    {isTeamAdmin(team) && (
                      <View style={{ marginTop: 20 }}>
                        <Text style={{ fontWeight: "600", marginBottom: 8 }}>
                          Joukkueen liittymiskoodi
                        </Text>
                        <View
                          style={{ flexDirection: "row", alignItems: "center" }}
                        >
                          <TextInput
                            style={[styles.licenseInput, { flex: 1 }]}
                            value={team.code || ""}
                            onChangeText={(text) => {
                              // Update local team.code (shallow copy)
                              if (team) team.code = text.toUpperCase();
                            }}
                            placeholder="ABCD12"
                            autoCapitalize="characters"
                            maxLength={10}
                          />
                          <TouchableOpacity
                            style={[styles.activateButton, { marginLeft: 8 }]}
                            onPress={async () => {
                              try {
                                const teamRef = doc(db, "teams", team.id);
                                await updateDoc(teamRef, {
                                  code: team.code?.trim().toUpperCase() || "",
                                });
                                Alert.alert(
                                  "Onnistui",
                                  "Liittymiskoodi päivitetty"
                                );
                              } catch (error) {
                                Alert.alert(
                                  "Virhe",
                                  "Koodin päivitys epäonnistui"
                                );
                              }
                            }}
                          >
                            <Ionicons name="save" size={18} color="#fff" />
                            <Text style={styles.activateButtonText}>
                              Tallenna
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <Text
                          style={{ fontSize: 12, color: "#666", marginTop: 4 }}
                        >
                          Pelaajat käyttävät tätä koodia liittyäkseen
                          joukkueeseen
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  // Lisenssin aktivointi tai pyytäminen
                  <>
                    {/* Team name header */}
                    <Text style={styles.sectionTitle}>
                      {isMasterAdmin && team
                        ? "Aktivoi lisenssi joukkueelle"
                        : team?.name || "Lisenssi tarvitaan"}
                    </Text>

                    {/* License warning banner - show different message for new vs expired */}
                    {team?.licenseExpiresAt &&
                    team?.licenseStatus !== "inactive" &&
                    (() => {
                      const expiryDate =
                        typeof team.licenseExpiresAt === "object" &&
                        "seconds" in team.licenseExpiresAt
                          ? new Date(
                              (team.licenseExpiresAt as any).seconds * 1000
                            )
                          : team.licenseExpiresAt instanceof Date
                          ? team.licenseExpiresAt
                          : new Date(team.licenseExpiresAt);
                      return expiryDate < new Date();
                    })() ? (
                      // Expired license
                      <View style={styles.expiredLicenseBanner}>
                        <Ionicons
                          name="alert-circle"
                          size={24}
                          color="#f44336"
                        />
                        <View style={styles.expiredLicenseTextContainer}>
                          <Text style={styles.expiredLicenseTitle}>
                            Lisenssi vanhentunut
                          </Text>
                          <Text style={styles.expiredLicenseDescription}>
                            Lisenssi vanheni{" "}
                            {(() => {
                              const expiryDate =
                                typeof team.licenseExpiresAt === "object" &&
                                "seconds" in team.licenseExpiresAt
                                  ? new Date(
                                      (team.licenseExpiresAt as any).seconds *
                                        1000
                                    )
                                  : team.licenseExpiresAt instanceof Date
                                  ? team.licenseExpiresAt
                                  : new Date(team.licenseExpiresAt);
                              return expiryDate.toLocaleDateString("fi-FI");
                            })()}
                            . Voit hallita joukkuetta ja pelaajia, mutta et voi
                            luoda uusia tapahtumia.
                          </Text>
                        </View>
                      </View>
                    ) : team?.licenseStatus === "inactive" ||
                      !team?.licenseExpiresAt ? (
                      // No license (new team)
                      <View
                        style={[
                          styles.expiredLicenseBanner,
                          {
                            backgroundColor: "#e3f2fd",
                            borderLeftColor: "#1976d2",
                          },
                        ]}
                      >
                        <Ionicons
                          name="information-circle"
                          size={24}
                          color="#1976d2"
                        />
                        <View style={styles.expiredLicenseTextContainer}>
                          <Text
                            style={[
                              styles.expiredLicenseTitle,
                              { color: "#1976d2" },
                            ]}
                          >
                            Ei voimassa olevaa lisenssiä
                          </Text>
                          <Text style={styles.expiredLicenseDescription}>
                            Voit hallita joukkuetta ja pelaajia, mutta et voi
                            luoda uusia tapahtumia ennen kuin lisenssi on
                            aktivoitu.
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    {/* Team admin information */}
                    {(() => {
                      console.log(
                        "🎯 LicenseManager: Rendering admin section (no license), teamAdmins:",
                        teamAdmins,
                        "loadingAdmins:",
                        loadingAdmins,
                        "team adminIds:",
                        team?.adminIds
                      );
                      return null;
                    })()}
                    {loadingAdmins ? (
                      <View style={styles.adminInfo}>
                        <View style={styles.adminHeader}>
                          <ActivityIndicator size="small" color="#1976d2" />
                          <Text style={styles.adminTitle}>
                            Ladataan admin-tietoja...
                          </Text>
                        </View>
                      </View>
                    ) : teamAdmins && teamAdmins.length > 0 ? (
                      <View style={styles.adminInfo}>
                        <View style={styles.adminHeader}>
                          <Ionicons name="people" size={16} color="#666" />
                          <Text style={styles.adminTitle}>
                            Ylläpitäjä{teamAdmins.length > 1 ? "t" : ""} (
                            {teamAdmins.length})
                          </Text>
                          {isTeamAdmin(team) && (
                            <TouchableOpacity
                              style={styles.addAdminButton}
                              onPress={() => setShowAddAdmin(!showAddAdmin)}
                            >
                              <Ionicons name="add" size={16} color="#1976d2" />
                            </TouchableOpacity>
                          )}
                        </View>
                        {teamAdmins.map((admin, index) => (
                          <View key={admin.id} style={styles.adminItem}>
                            <Text style={styles.adminName}>
                              {getUserDisplayName(admin)}
                            </Text>
                            <Text style={styles.adminEmail}>{admin.email}</Text>
                          </View>
                        ))}

                        {/* Add Admin Form */}
                        {showAddAdmin && isTeamAdmin(team) && (
                          <View style={styles.addAdminForm}>
                            <Text style={styles.addAdminLabel}>
                              Lisää uusi admin:
                            </Text>
                            <View style={styles.addAdminInputContainer}>
                              <TextInput
                                style={styles.addAdminInput}
                                value={newAdminEmail}
                                onChangeText={setNewAdminEmail}
                                placeholder="admin@example.com"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                              />
                              <TouchableOpacity
                                style={styles.addAdminSubmitButton}
                                onPress={() =>
                                  addAdminToTeam(team, newAdminEmail)
                                }
                                disabled={addingAdmin}
                              >
                                {addingAdmin ? (
                                  <ActivityIndicator
                                    size="small"
                                    color="#fff"
                                  />
                                ) : (
                                  <>
                                    <Ionicons
                                      name="add"
                                      size={16}
                                      color="#fff"
                                    />
                                    <Text style={styles.addAdminSubmitText}>
                                      Lisää
                                    </Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    ) : (
                      <View style={styles.adminInfo}>
                        <Text style={styles.adminTitle}>
                          Admin-tietoja ei löytynyt
                        </Text>
                      </View>
                    )}

                    <Text style={styles.requestDescription}>
                      {isMasterAdmin && team
                        ? "Lisenssin aktivointi"
                        : "Lisenssi tarvitaan"}
                    </Text>

                    {isMasterAdmin && team && !isTeamAdmin(team) ? (
                      // MasterAdmin voi aktivoida suoraan joukkueelle
                      <>
                        <Text style={styles.requestDescription}>
                          Syötä lisenssikoodi aktivoidaksesi lisenssin tälle
                          joukkueelle.
                        </Text>
                        <View style={styles.licenseInputContainer}>
                          <TextInput
                            style={styles.licenseInput}
                            value={licenseCode}
                            onChangeText={setLicenseCode}
                            placeholder="Syötä lisenssikoodi"
                            autoCapitalize="characters"
                            autoCorrect={false}
                          />
                          <TouchableOpacity
                            style={styles.activateButton}
                            onPress={() => activateLicense(team, licenseCode)}
                            disabled={activatingLicense}
                          >
                            {activatingLicense ? (
                              <ActivityIndicator color="#fff" />
                            ) : (
                              <>
                                <Ionicons name="key" size={20} color="#fff" />
                                <Text style={styles.activateButtonText}>
                                  Aktivoi
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      </>
                    ) : (
                      // Käyttäjä voi pyytää lisenssiä
                      <>
                        {/* Pyydä lisenssiä - vain joukkueen adminille */}
                        {isTeamAdmin(team) ? (
                          <>
                            <Text style={styles.requestDescription}>
                              {/* Check if license has expired (not inactive, but actual expiry) */}
                              {team?.licenseExpiresAt &&
                              team?.licenseStatus !== "inactive" &&
                              (() => {
                                const expiryDate =
                                  typeof team.licenseExpiresAt === "object" &&
                                  "seconds" in team.licenseExpiresAt
                                    ? new Date(
                                        (team.licenseExpiresAt as any).seconds *
                                          1000
                                      )
                                    : team.licenseExpiresAt instanceof Date
                                    ? team.licenseExpiresAt
                                    : new Date(team.licenseExpiresAt);
                                return expiryDate < new Date();
                              })()
                                ? "Lisenssi on vanhentunut. Pyydä lisenssin uusimista MasterAdminilta."
                                : "Joukkueella ei ole voimassa olevaa lisenssiä. Pyydä uutta lisenssiä MasterAdminilta."}
                            </Text>

                            {/* Check if license has expired or never existed */}
                            {team?.licenseStatus === "inactive" ||
                            !team?.licenseExpiresAt ? (
                              // Request NEW license
                              <TouchableOpacity
                                style={styles.requestButton}
                                onPress={() => setShowNewLicenseModal(true)}
                              >
                                <Ionicons name="mail" size={20} color="#fff" />
                                <Text style={styles.requestButtonText}>
                                  Pyydä uutta lisenssiä
                                </Text>
                              </TouchableOpacity>
                            ) : team?.licenseExpiresAt &&
                              (() => {
                                const expiryDate =
                                  typeof team.licenseExpiresAt === "object" &&
                                  "seconds" in team.licenseExpiresAt
                                    ? new Date(
                                        (team.licenseExpiresAt as any).seconds *
                                          1000
                                      )
                                    : team.licenseExpiresAt instanceof Date
                                    ? team.licenseExpiresAt
                                    : new Date(team.licenseExpiresAt);
                                return expiryDate < new Date();
                              })() ? (
                              // Request RENEWAL
                              <TouchableOpacity
                                style={styles.requestButton}
                                onPress={() => requestLicense("renewal")}
                              >
                                <Ionicons
                                  name="refresh"
                                  size={20}
                                  color="#fff"
                                />
                                <Text style={styles.requestButtonText}>
                                  Pyydä lisenssin uusimista
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </>
                        ) : (
                          /* Jos ei ole admin, näytä ohje */
                          <View
                            style={[
                              styles.divider,
                              {
                                marginTop: 20,
                                backgroundColor: "#ffeeee",
                                padding: 10,
                                borderRadius: 5,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.dividerText,
                                { color: "#666", fontSize: 12 },
                              ]}
                            >
                              Vain joukkueen admin voi pyytää lisenssiä.{"\n"}
                              Ota yhteyttä admin käyttäjään: {team?.adminId}
                            </Text>
                          </View>
                        )}
                      </>
                    )}
                  </>
                )}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>

      {/* License Detail Modal */}
      {showLicenseDetail && selectedLicense && (
        <Modal
          visible={showLicenseDetail}
          transparent={true}
          animationType="slide"
          onRequestClose={() => {
            setShowLicenseDetail(false);
            setSelectedLicense(null);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Lisenssin hallinta</Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => {
                    setShowLicenseDetail(false);
                    setSelectedLicense(null);
                  }}
                >
                  <Ionicons name="close" size={20} color="#666" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.scrollContent}>
                <View style={styles.section}>
                  {/* Team header */}
                  <Text style={styles.sectionTitle}>
                    {selectedLicense.usedByTeamId
                      ? teams[selectedLicense.usedByTeamId] ||
                        "Tuntematon joukkue"
                      : "Vapaa lisenssi"}
                  </Text>

                  {/* License details */}
                  <View style={styles.licenseDetailSection}>
                    <Text style={styles.licenseDetailLabel}>
                      Lisenssikoodi:
                    </Text>
                    <Text style={styles.licenseDetailValue}>
                      {selectedLicense.code}
                    </Text>
                  </View>

                  <View style={styles.licenseDetailSection}>
                    <Text style={styles.licenseDetailLabel}>Tyyppi:</Text>
                    <Text style={styles.licenseDetailValue}>
                      {getLicenseTypeText(selectedLicense.type)}
                    </Text>
                  </View>

                  <View style={styles.licenseDetailSection}>
                    <Text style={styles.licenseDetailLabel}>Tila:</Text>
                    <View style={styles.licenseDetailStatus}>
                      <View
                        style={[
                          styles.statusDot,
                          {
                            backgroundColor: selectedLicense.usedByTeamId
                              ? "#4caf50"
                              : "#ff9800",
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.licenseDetailValue,
                          {
                            color: selectedLicense.usedByTeamId
                              ? "#4caf50"
                              : "#ff9800",
                          },
                        ]}
                      >
                        {selectedLicense.usedByTeamId ? "Käytössä" : "Vapaa"}
                      </Text>
                    </View>
                  </View>

                  {selectedLicense.createdAt && (
                    <View style={styles.licenseDetailSection}>
                      <Text style={styles.licenseDetailLabel}>Luotu:</Text>
                      <Text style={styles.licenseDetailValue}>
                        {(() => {
                          const createdAt = selectedLicense.createdAt;
                          if (
                            createdAt &&
                            typeof createdAt === "object" &&
                            "seconds" in createdAt
                          ) {
                            return new Date(
                              (createdAt as any).seconds * 1000
                            ).toLocaleDateString("fi-FI", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            });
                          } else if (createdAt instanceof Date) {
                            return createdAt.toLocaleDateString("fi-FI", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            });
                          }
                          return "Tuntematon päivämäärä";
                        })()}
                      </Text>
                    </View>
                  )}

                  {selectedLicense.usedByTeamId && selectedLicense.usedAt && (
                    <View style={styles.licenseDetailSection}>
                      <Text style={styles.licenseDetailLabel}>Aktivoitu:</Text>
                      <Text style={styles.licenseDetailValue}>
                        {(() => {
                          const usedAt = selectedLicense.usedAt;
                          if (
                            usedAt &&
                            typeof usedAt === "object" &&
                            "seconds" in usedAt
                          ) {
                            return new Date(
                              (usedAt as any).seconds * 1000
                            ).toLocaleDateString("fi-FI", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            });
                          } else if (usedAt instanceof Date) {
                            return usedAt.toLocaleDateString("fi-FI", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            });
                          }
                          return "Tuntematon päivämäärä";
                        })()}
                      </Text>
                    </View>
                  )}

                  {/* License expiry date update for Master Admin */}
                  {isMasterAdmin && selectedLicense.usedByTeamId && (
                    <View style={styles.licenseActionSection}>
                      <Text style={styles.licenseActionTitle}>
                        Päivitä voimassaoloaika
                      </Text>
                      <Text style={styles.licenseActionDescription}>
                        Valitse uusi voimassaolopäivä lisenssilelle.
                      </Text>

                      <TouchableOpacity
                        style={styles.datePickerButton}
                        onPress={() => setShowDatePicker(true)}
                      >
                        <Ionicons
                          name="calendar-outline"
                          size={20}
                          color="#1976d2"
                        />
                        <Text style={styles.datePickerButtonText}>
                          {selectedExpiryDate.toLocaleDateString("fi-FI", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </Text>
                      </TouchableOpacity>

                      {showDatePicker && (
                        <Modal
                          visible={showDatePicker}
                          transparent={true}
                          animationType="slide"
                          onRequestClose={() => setShowDatePicker(false)}
                        >
                          <TouchableOpacity
                            style={styles.datePickerModalOverlay}
                            activeOpacity={1}
                            onPress={() => setShowDatePicker(false)}
                          >
                            <TouchableOpacity
                              style={styles.datePickerModalContent}
                              activeOpacity={1}
                              onPress={(e) => e.stopPropagation()}
                            >
                              <View style={styles.datePickerHeader}>
                                <Text style={styles.datePickerHeaderText}>
                                  Valitse päivämäärä
                                </Text>
                              </View>

                              <Calendar
                                current={
                                  selectedExpiryDate.toISOString().split("T")[0]
                                }
                                onDayPress={(day) => {
                                  const newDate = new Date(day.dateString);
                                  console.log(
                                    "📅 Kalenteri: Valittu päivä:",
                                    day.dateString
                                  );
                                  console.log(
                                    "📅 Kalenteri: Date-objekti:",
                                    newDate.toLocaleDateString("fi-FI")
                                  );
                                  setSelectedExpiryDate(newDate);
                                }}
                                markedDates={{
                                  [selectedExpiryDate
                                    .toISOString()
                                    .split("T")[0]]: {
                                    selected: true,
                                    selectedColor: "#1976d2",
                                  },
                                }}
                                minDate={new Date().toISOString().split("T")[0]}
                                theme={{
                                  todayTextColor: "#1976d2",
                                  selectedDayBackgroundColor: "#1976d2",
                                  selectedDayTextColor: "#ffffff",
                                }}
                              />

                              <View style={styles.iosDatePickerButtons}>
                                <TouchableOpacity
                                  style={styles.datePickerCancelButton}
                                  onPress={() => setShowDatePicker(false)}
                                >
                                  <Text style={styles.datePickerCancelText}>
                                    Peruuta
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.datePickerConfirmButton}
                                  onPress={() => setShowDatePicker(false)}
                                >
                                  <Text style={styles.datePickerConfirmText}>
                                    Valmis
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            </TouchableOpacity>
                          </TouchableOpacity>
                        </Modal>
                      )}

                      <TouchableOpacity
                        style={styles.generateButton}
                        onPress={() => {
                          if (!selectedExpiryDate) {
                            Alert.alert("Virhe", "Valitse voimassaolopäivä");
                            return;
                          }

                          updateLicenseExpiryDate(
                            selectedLicense,
                            selectedExpiryDate
                          );
                        }}
                        disabled={updatingExpiry}
                      >
                        {updatingExpiry ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.generateButtonText}>
                            Päivitä voimassaoloaika
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Delete license action */}
                  <View style={styles.licenseActionSection}>
                    <TouchableOpacity
                      style={styles.deleteLicenseDetailButton}
                      onPress={() => {
                        setShowLicenseDetail(false);
                        setSelectedLicense(null);
                        deleteLicense(selectedLicense);
                      }}
                    >
                      <Ionicons name="trash-outline" size={20} color="#fff" />
                      <Text style={styles.deleteLicenseDetailButtonText}>
                        Poista lisenssi
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* New License Request Modal */}
      <Modal
        visible={showNewLicenseModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowNewLicenseModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: 500 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pyydä uutta lisenssiä</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowNewLicenseModal(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollContent}>
              <Text style={styles.requestDescription}>
                Anna joukkueen tiedot, jotta MasterAdmin voi käsitellä pyyntösi.
              </Text>

              {/* License Type Selection */}
              <View style={styles.modalInputContainer}>
                <Text style={styles.modalInputLabel}>Lisenssin tyyppi *</Text>
                <View style={styles.licenseTypeContainer}>
                  <TouchableOpacity
                    style={[
                      styles.licenseRequestButton,
                      requestedLicenseType === "trial" &&
                        styles.licenseTypeButtonActive,
                    ]}
                    onPress={() => setRequestedLicenseType("trial")}
                  >
                    <Ionicons
                      name={
                        requestedLicenseType === "trial"
                          ? "radio-button-on"
                          : "radio-button-off"
                      }
                      size={24}
                      color={
                        requestedLicenseType === "trial" ? "#4CAF50" : "#666"
                      }
                    />
                    <View style={styles.licenseTypeTextContainer}>
                      <Text style={styles.licenseTypeTitle}>Kokeilu</Text>
                      <Text style={styles.licenseTypeSubtitle}>
                        60 päivää - Ilmainen
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.licenseRequestButton,
                      requestedLicenseType === "half-season" &&
                        styles.licenseTypeButtonActive,
                    ]}
                    onPress={() => setRequestedLicenseType("half-season")}
                  >
                    <Ionicons
                      name={
                        requestedLicenseType === "half-season"
                          ? "radio-button-on"
                          : "radio-button-off"
                      }
                      size={24}
                      color={
                        requestedLicenseType === "half-season"
                          ? "#4CAF50"
                          : "#666"
                      }
                    />
                    <View style={styles.licenseTypeTextContainer}>
                      <Text style={styles.licenseTypeTitle}>Puolikausi</Text>
                      <Text style={styles.licenseTypeSubtitle}>
                        183 päivää - 69€
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.licenseRequestButton,
                      requestedLicenseType === "season" &&
                        styles.licenseTypeButtonActive,
                    ]}
                    onPress={() => setRequestedLicenseType("season")}
                  >
                    <Ionicons
                      name={
                        requestedLicenseType === "season"
                          ? "radio-button-on"
                          : "radio-button-off"
                      }
                      size={24}
                      color={
                        requestedLicenseType === "season" ? "#4CAF50" : "#666"
                      }
                    />
                    <View style={styles.licenseTypeTextContainer}>
                      <Text style={styles.licenseTypeTitle}>Kausikortti</Text>
                      <Text style={styles.licenseTypeSubtitle}>
                        365 päivää - 99€
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.modalInputContainer}>
                <Text style={styles.modalInputLabel}>
                  Joukkueen kuvaus (valinnainen)
                </Text>
                <TextInput
                  style={[styles.modalTextInput, styles.modalMultilineInput]}
                  value={teamDescription}
                  onChangeText={setTeamDescription}
                  placeholder="Kuvaile joukkuettasi lyhyesti..."
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.modalInputContainer}>
                <Text style={styles.modalInputLabel}>
                  Arvioitu pelaajamäärä (valinnainen)
                </Text>
                <TextInput
                  style={styles.modalTextInput}
                  value={estimatedPlayers}
                  onChangeText={setEstimatedPlayers}
                  placeholder="Esim. 20"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.modalButtonsContainer}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => {
                    setShowNewLicenseModal(false);
                    setTeamDescription("");
                    setEstimatedPlayers("");
                  }}
                >
                  <Text style={styles.modalCancelButtonText}>Peruuta</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalSubmitButton}
                  onPress={() => {
                    requestLicense("new", {
                      description: teamDescription,
                      estimatedPlayers: estimatedPlayers
                        ? parseInt(estimatedPlayers)
                        : undefined,
                      licenseType: requestedLicenseType,
                    });
                    setShowNewLicenseModal(false);
                    setTeamDescription("");
                    setEstimatedPlayers("");
                    setRequestedLicenseType("trial"); // Reset to default
                  }}
                >
                  <Text style={styles.modalSubmitButtonText}>Lähetä</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 12,
    width: "90%",
    maxWidth: 600,
    height: "85%",
    maxHeight: 700,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    backgroundColor: "white",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    minHeight: 60,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    flex: 1,
    paddingRight: 8,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  scrollContent: {
    flex: 1,
    padding: 20,
  },
  section: {
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  licenseTypeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  licenseTypeButton: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  selectedType: {
    borderColor: "#1976d2",
    backgroundColor: "#e3f2fd",
  },
  licenseTypeText: {
    fontSize: 12,
    color: "#666",
  },
  selectedTypeText: {
    color: "#1976d2",
    fontWeight: "600",
  },
  countInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
    marginBottom: 16,
    textAlign: "center",
  },
  generateButton: {
    backgroundColor: "#ff9800",
    padding: 14,
    borderRadius: 6,
    alignItems: "center",
  },
  generateButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  noRequestsText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    padding: 20,
    fontStyle: "italic",
  },
  requestItem: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#1976d2",
  },
  requestInfo: {
    marginBottom: 12,
  },
  requestTeamName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  requestDate: {
    fontSize: 14,
    color: "#666",
    marginBottom: 2,
  },
  requestedBy: {
    fontSize: 14,
    color: "#666",
  },
  requestActions: {
    flexDirection: "row",
    gap: 12,
  },
  approveButton: {
    backgroundColor: "#4caf50",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    flex: 1,
    justifyContent: "center",
  },
  approveButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 6,
  },
  rejectButton: {
    backgroundColor: "#f44336",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    flex: 1,
    justifyContent: "center",
  },
  rejectButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 6,
  },
  loader: {
    marginVertical: 20,
  },
  licenseItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#f9f9f9",
    borderRadius: 6,
    marginBottom: 8,
  },
  licenseInfo: {
    flex: 1,
  },
  licenseActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  licenseCode: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    fontFamily: "monospace",
  },
  licenseType: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  licenseStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  licenseStatusText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  deleteLicenseButton: {
    padding: 8,
    borderRadius: 4,
    backgroundColor: "#ffebee",
  },
  teamBannerRow: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    minHeight: 40,
  },
  teamBannerActionsAbsolute: {
    position: "absolute",
    right: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 2,
  },
  editTeamButton: {
    padding: 8,
    borderRadius: 4,
    backgroundColor: "#e3f2fd",
    marginRight: 4,
  },
  deleteTeamButton: {
    padding: 8,
    borderRadius: 4,
    backgroundColor: "#ffebee",
  },
  activeLicenseInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e8f5e8",
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#4caf50",
  },
  licenseDetails: {
    marginLeft: 12,
    flex: 1,
  },
  activeLicenseText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4caf50",
  },
  licenseExpiryText: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  licenseCodeText: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
    fontFamily: "monospace",
  },
  licenseDaysLeft: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  requestDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
    lineHeight: 20,
  },
  licenseInputContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  licenseInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    fontFamily: "monospace",
    textAlign: "center",
    backgroundColor: "#f8f8f8",
  },
  activateButton: {
    backgroundColor: "#1976d2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 6,
  },
  activateButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },
  inputSection: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  divider: {
    alignItems: "center",
    marginVertical: 20,
  },
  dividerText: {
    fontSize: 14,
    color: "#999",
    fontWeight: "600",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
  },
  requestButton: {
    backgroundColor: "#1976d2",
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 6,
    justifyContent: "center",
  },
  requestButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  licenseActivatedText: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  licenseDurationText: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  licenseStatsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
    paddingVertical: 16,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
  },
  statItem: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1976d2",
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  licensesList: {
    gap: 12,
  },
  licenseCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  licenseCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  licenseTeamName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2196F3",
    marginBottom: 4,
  },
  licenseExpiryDate: {
    fontSize: 14,
    color: "#4caf50",
    fontWeight: "600",
    marginTop: 4,
  },
  licenseCodeCard: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    fontFamily: "monospace",
  },
  licenseStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  licenseStatusBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  licenseCardBody: {
    marginBottom: 12,
    gap: 4,
  },
  licenseTypeCard: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  licenseUsedBy: {
    fontSize: 13,
    color: "#4caf50",
    fontWeight: "500",
  },
  licenseAvailable: {
    fontSize: 13,
    color: "#ff9800",
    fontWeight: "500",
  },
  licenseCreatedAt: {
    fontSize: 12,
    color: "#999",
  },
  licenseCardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  deleteLicenseCardButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#ffebee",
    gap: 6,
  },
  deleteLicenseCardText: {
    fontSize: 14,
    color: "#f44336",
    fontWeight: "600",
  },
  moreItemsText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    fontStyle: "italic",
    paddingVertical: 12,
  },
  // Admin information styles
  adminInfo: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: "#1976d2",
  },
  adminHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  adminTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginLeft: 8,
  },
  adminItem: {
    marginBottom: 8,
    paddingLeft: 4,
  },
  adminName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  adminEmail: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  // Add admin styles
  addAdminButton: {
    marginLeft: "auto",
    padding: 4,
    borderRadius: 4,
    backgroundColor: "#e3f2fd",
  },
  addAdminForm: {
    marginTop: 12,
    padding: 8,
    backgroundColor: "#f0f8ff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e3f2fd",
  },
  addAdminLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1976d2",
    marginBottom: 8,
  },
  addAdminInputContainer: {
    flexDirection: "row",
    gap: 8,
  },
  addAdminInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
    padding: 8,
    fontSize: 12,
    backgroundColor: "#fff",
  },
  addAdminSubmitButton: {
    backgroundColor: "#1976d2",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    gap: 4,
  },
  addAdminSubmitText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  // Team picker styles for license extension
  teamPickerScrollView: {
    maxHeight: 120,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    backgroundColor: "#f9f9f9",
  },
  teamPickerItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  selectedTeamPickerItem: {
    backgroundColor: "#e3f2fd",
    borderColor: "#1976d2",
  },
  teamPickerText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  selectedTeamPickerText: {
    color: "#1976d2",
  },
  teamLicenseInfo: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
    fontFamily: "monospace",
  },
  extensionInputRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  extensionDaysButton: {
    flex: 1,
    padding: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  selectedExtensionDays: {
    borderColor: "#1976d2",
    backgroundColor: "#e3f2fd",
  },
  extensionDaysText: {
    fontSize: 12,
    color: "#666",
  },
  selectedExtensionDaysText: {
    color: "#1976d2",
    fontWeight: "600",
  },

  // License detail modal styles
  licenseDetailSection: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  licenseDetailLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 4,
  },
  licenseDetailValue: {
    fontSize: 16,
    color: "#333",
    fontFamily: "monospace",
  },
  licenseDetailStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  licenseActionSection: {
    marginTop: 20,
    padding: 16,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#1976d2",
  },
  licenseActionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  licenseActionDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
    lineHeight: 20,
  },
  deleteLicenseDetailButton: {
    backgroundColor: "#f44336",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 6,
    gap: 8,
  },
  deleteLicenseDetailButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    gap: 10,
    marginBottom: 16,
  },
  datePickerButtonText: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
  iosDatePickerButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 12,
    marginBottom: 12,
  },
  datePickerCancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: "#f0f0f0",
  },
  datePickerCancelText: {
    color: "#666",
    fontSize: 14,
    fontWeight: "600",
  },
  datePickerConfirmButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: "#1976d2",
  },
  datePickerConfirmText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  datePickerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  datePickerModalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  datePickerHeader: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  datePickerHeaderText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  iosDatePicker: {
    width: "100%",
    height: 200,
  },
  expiredLicenseBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#ffebee",
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#f44336",
  },
  expiredLicenseTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  expiredLicenseTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#d32f2f",
    marginBottom: 4,
  },
  expiredLicenseDescription: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  modalInputContainer: {
    marginBottom: 16,
  },
  modalInputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  modalTextInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  modalMultilineInput: {
    height: 100,
    textAlignVertical: "top",
  },
  modalButtonsContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  modalCancelButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  modalSubmitButton: {
    flex: 1,
    backgroundColor: "#1976d2",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  modalSubmitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  licenseTypeContainer: {
    gap: 12,
  },
  licenseRequestButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#e0e0e0",
    backgroundColor: "#fff",
  },
  licenseTypeButtonActive: {
    borderColor: "#4CAF50",
    backgroundColor: "#f1f8f4",
  },
  licenseTypeTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  licenseTypeTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  licenseTypeSubtitle: {
    fontSize: 14,
    color: "#666",
  },
});

export default LicenseManager;
