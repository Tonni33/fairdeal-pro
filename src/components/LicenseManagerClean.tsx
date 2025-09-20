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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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

interface LicenseManagerProps {
  visible: boolean;
  onClose: () => void;
  team?: Team;
  onLicenseUpdated?: () => void;
  isMasterAdmin?: boolean;
  currentUserId?: string; // Käyttäjän UID
  currentUserEmail?: string; // Käyttäjän email
}

const LicenseManager: React.FC<LicenseManagerProps> = ({
  visible,
  onClose,
  team,
  onLicenseUpdated,
  isMasterAdmin = false,
  currentUserId,
  currentUserEmail,
}) => {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [licenseRequests, setLicenseRequests] = useState<any[]>([]);
  const [teams, setTeams] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(false);
  const [activatingLicense, setActivatingLicense] = useState(false);

  // Team admin information
  const [teamAdmins, setTeamAdmins] = useState<User[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  // Create license states
  const [licenseType, setLicenseType] = useState<
    "trial" | "monthly" | "yearly"
  >("monthly");
  const [licenseCount, setLicenseCount] = useState("1");

  // Activate license states
  const [licenseCode, setLicenseCode] = useState("");

  // Tarkista onko käyttäjä joukkueen admin
  const isTeamAdmin = (team?: Team): boolean => {
    if (!team) return false;

    // Tarkista uudesta adminIds arraysta
    if (team.adminIds && Array.isArray(team.adminIds)) {
      return team.adminIds.some(
        (adminId) =>
          (typeof currentUserId === "string" && adminId === currentUserId) ||
          (typeof currentUserEmail === "string" && adminId === currentUserEmail)
      );
    }

    // Legacy support: tarkista vanhasta adminId kentästä
    if (team.adminId) {
      return (
        (typeof currentUserId === "string" && team.adminId === currentUserId) ||
        (typeof currentUserEmail === "string" &&
          team.adminId === currentUserEmail)
      );
    }

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

      // Hae adminit uudesta adminIds arraysta
      if (team.adminIds && Array.isArray(team.adminIds)) {
        console.log(
          "🔍 LicenseManager: Fetching admins with IDs:",
          team.adminIds
        );

        for (const adminId of team.adminIds) {
          const userDoc = await getDoc(doc(db, "users", adminId));
          if (userDoc.exists()) {
            const userData = { id: userDoc.id, ...userDoc.data() } as User;
            console.log("✅ LicenseManager: Admin found:", userData);
            admins.push(userData);
          } else {
            console.log("❌ LicenseManager: No admin found with ID:", adminId);
          }
        }
      }

      // Legacy support: jos ei löydy adminIds arraysta, yritä vanhaa adminId kenttää
      if (admins.length === 0 && team.adminId) {
        console.log(
          "🔍 LicenseManager: Fallback to legacy adminId:",
          team.adminId
        );
        const userDoc = await getDoc(doc(db, "users", team.adminId));
        if (userDoc.exists()) {
          const userData = { id: userDoc.id, ...userDoc.data() } as User;
          console.log("✅ LicenseManager: Legacy admin found:", userData);
          admins.push(userData);
        }
      }

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

      // Fetch team admin information if team is provided
      if (team && (team.adminIds || team.adminId)) {
        console.log(
          "🔍 LicenseManager: Fetching admins for team:",
          team.name,
          "adminIds:",
          team.adminIds,
          "legacy adminId:",
          team.adminId
        );
        setLoadingAdmins(true);
        fetchTeamAdmins(team).then((adminInfos) => {
          console.log("👤 LicenseManager: Admin infos received:", adminInfos);
          setTeamAdmins(adminInfos);
          setLoadingAdmins(false);
        });
      } else {
        console.log("⚠️ LicenseManager: No team or admin info", {
          hasTeam: !!team,
          teamName: team?.name,
          adminIds: team?.adminIds,
          adminId: team?.adminId,
        });
        setTeamAdmins([]);
      }
    }
  }, [visible, isMasterAdmin, team]);

  const loadLicenses = async () => {
    try {
      const licensesRef = collection(db, "licenses");
      const snapshot = await getDocs(licensesRef);
      const licensesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as License[];
      setLicenses(licensesData);
    } catch (error) {
      console.error("Virhe lisenssien latauksessa:", error);
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
      snapshot.docs.forEach((doc) => {
        const teamData = doc.data();
        teamNamesMap[doc.id] = teamData.name || "Tuntematon joukkue";
      });
      setTeams(teamNamesMap);
    } catch (error) {
      console.error("Virhe joukkueiden latauksessa:", error);
    }
  };

  const requestLicense = async () => {
    if (!team?.id) {
      Alert.alert("Virhe", "Joukkue ID puuttuu");
      return;
    }

    if (!isTeamAdmin(team)) {
      Alert.alert("Virhe", "Vain joukkueen admin voi pyytää lisenssiä");
      return;
    }

    try {
      await addDoc(collection(db, "licenseRequests"), {
        teamId: team.id,
        teamName: team.name || "Tuntematon joukkue",
        requestedAt: new Date(),
        status: "pending",
        requestedBy: currentUserId || "Tuntematon käyttäjä",
      });

      Alert.alert(
        "Pyyntö lähetetty",
        "Lisenssipyyntö on lähetetty MasterAdminille. Saat ilmoituksen kun pyyntö on käsitelty.",
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

  const getDurationDays = (type: "trial" | "monthly" | "yearly"): number => {
    switch (type) {
      case "trial":
        return 7;
      case "monthly":
        return 30;
      case "yearly":
        return 365;
      default:
        return 30;
    }
  };

  const createLicenses = async () => {
    const count = parseInt(licenseCount);
    if (isNaN(count) || count < 1 || count > 100) {
      Alert.alert("Virhe", "Syötä kelvollinen määrä (1-100)");
      return;
    }

    setLoading(true);
    try {
      const licensesToCreate = [];
      for (let i = 0; i < count; i++) {
        licensesToCreate.push({
          code: generateLicenseCode(licenseType),
          type: licenseType,
          duration: getDurationDays(licenseType),
          isUsed: false,
          createdAt: new Date(),
        });
      }

      for (const license of licensesToCreate) {
        await addDoc(collection(db, "licenses"), license);
      }

      Alert.alert("Onnistui", `Luotiin ${count} lisenssiä`);
      setLicenseCount("1");
      await loadLicenses();
    } catch (error) {
      console.error("Virhe lisenssien luonnissa:", error);
      Alert.alert("Virhe", "Lisenssien luonti epäonnistui");
    }
    setLoading(false);
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
        license.isUsed ? "\n\nTämä deaktivoi lisenssin myös joukkueelta." : ""
      }`,
      [
        { text: "Peruuta", style: "cancel" },
        {
          text: "Poista",
          style: "destructive",
          onPress: async () => {
            try {
              if (license.isUsed && license.usedByTeamId) {
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
            } catch (error) {
              console.error("Virhe lisenssin poistossa:", error);
              Alert.alert("Virhe", "Lisenssin poisto epäonnistui");
            }
          },
        },
      ]
    );
  };

  const getLicenseTypeText = (type: string): string => {
    switch (type) {
      case "trial":
        return "Kokeilu (7pv)";
      case "monthly":
        return "Kuukausi (30pv)";
      case "yearly":
        return "Vuosi (365pv)";
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
                {/* License creation section */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Luo uusia lisenssejä</Text>

                  <Text style={styles.formLabel}>Lisenssin tyyppi</Text>
                  <View style={styles.licenseTypeRow}>
                    {(["trial", "monthly", "yearly"] as const).map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.licenseTypeButton,
                          licenseType === type && styles.selectedType,
                        ]}
                        onPress={() => setLicenseType(type)}
                      >
                        <Text
                          style={[
                            styles.licenseTypeText,
                            licenseType === type && styles.selectedTypeText,
                          ]}
                        >
                          {getLicenseTypeText(type)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.formLabel}>Määrä</Text>
                  <TextInput
                    style={styles.countInput}
                    value={licenseCount}
                    onChangeText={setLicenseCount}
                    placeholder="1"
                    keyboardType="numeric"
                    maxLength={3}
                  />

                  <TouchableOpacity
                    style={styles.generateButton}
                    onPress={createLicenses}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.generateButtonText}>
                        Luo {licenseCount} lisenssiä
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

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
                      {licenses.slice(0, 50).map((license) => (
                        <View key={license.id} style={styles.licenseCard}>
                          <View style={styles.licenseCardHeader}>
                            <Text style={styles.licenseCodeCard}>
                              {license.code}
                            </Text>
                            <View
                              style={[
                                styles.licenseStatusBadge,
                                {
                                  backgroundColor: license.isUsed
                                    ? "#e8f5e8"
                                    : "#fff3e0",
                                },
                              ]}
                            >
                              <View
                                style={[
                                  styles.statusDot,
                                  {
                                    backgroundColor: license.isUsed
                                      ? "#4caf50"
                                      : "#ff9800",
                                  },
                                ]}
                              />
                              <Text
                                style={[
                                  styles.licenseStatusBadgeText,
                                  {
                                    color: license.isUsed
                                      ? "#4caf50"
                                      : "#ff9800",
                                  },
                                ]}
                              >
                                {license.isUsed ? "Käytössä" : "Vapaa"}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.licenseCardBody}>
                            <Text style={styles.licenseTypeCard}>
                              {getLicenseTypeText(license.type)}
                            </Text>

                            {license.isUsed && license.usedByTeamId ? (
                              <Text style={styles.licenseUsedBy}>
                                Annettu joukkueelle:{" "}
                                {teams[license.usedByTeamId] ||
                                  license.usedByTeamId}
                              </Text>
                            ) : (
                              <Text style={styles.licenseAvailable}>
                                Valmis käytettäväksi
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

                          <View style={styles.licenseCardActions}>
                            <TouchableOpacity
                              style={styles.deleteLicenseCardButton}
                              onPress={() => deleteLicense(license)}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={18}
                                color="#f44336"
                              />
                              <Text style={styles.deleteLicenseCardText}>
                                Poista
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}

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
                        loadingAdmins
                      );
                      return null;
                    })()}
                    {teamAdmins && teamAdmins.length > 0 ? (
                      <View style={styles.adminInfo}>
                        <View style={styles.adminHeader}>
                          <Ionicons name="people" size={16} color="#666" />
                          <Text style={styles.adminTitle}>
                            Ylläpitäjä{teamAdmins.length > 1 ? "t" : ""} (
                            {teamAdmins.length})
                          </Text>
                        </View>
                        {teamAdmins.map((admin, index) => (
                          <View key={admin.id} style={styles.adminItem}>
                            <Text style={styles.adminName}>
                              {getUserDisplayName(admin)}
                            </Text>
                            <Text style={styles.adminEmail}>{admin.email}</Text>
                          </View>
                        ))}
                      </View>
                    ) : loadingAdmins ? (
                      <View style={styles.adminInfo}>
                        <ActivityIndicator size="small" color="#1976d2" />
                        <Text style={styles.adminTitle}>
                          Ladataan admin-tietoja...
                        </Text>
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

                    {/* Team admin information */}
                    {(() => {
                      console.log(
                        "🎯 LicenseManager: Rendering admin section (no license), teamAdmins:",
                        teamAdmins,
                        "loadingAdmins:",
                        loadingAdmins
                      );
                      return null;
                    })()}
                    {teamAdmins && teamAdmins.length > 0 ? (
                      <View style={styles.adminInfo}>
                        <View style={styles.adminHeader}>
                          <Ionicons name="people" size={16} color="#666" />
                          <Text style={styles.adminTitle}>
                            Ylläpitäjä{teamAdmins.length > 1 ? "t" : ""} (
                            {teamAdmins.length})
                          </Text>
                        </View>
                        {teamAdmins.map((admin, index) => (
                          <View key={admin.id} style={styles.adminItem}>
                            <Text style={styles.adminName}>
                              {getUserDisplayName(admin)}
                            </Text>
                            <Text style={styles.adminEmail}>{admin.email}</Text>
                          </View>
                        ))}
                      </View>
                    ) : loadingAdmins ? (
                      <View style={styles.adminInfo}>
                        <ActivityIndicator size="small" color="#1976d2" />
                        <Text style={styles.adminTitle}>
                          Ladataan admin-tietoja...
                        </Text>
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
                      // Käyttäjä voi pyytää lisenssiä tai syöttää koodin
                      <>
                        <Text style={styles.requestDescription}>
                          Joukkueella ei ole voimassa olevaa lisenssiä.
                          {isTeamAdmin(team)
                            ? " Voit joko syöttää lisenssin jos sinulla on sellainen, tai pyytää lisenssiä."
                            : " Pyydä joukkueen adminilta aktivointia tai lisenssiä."}
                        </Text>

                        {/* Lisenssin syöttö - aina näkyvissä */}
                        <View style={styles.inputSection}>
                          <Text style={styles.inputLabel}>
                            Syötä lisenssikoodi
                          </Text>
                          <View style={styles.licenseInputContainer}>
                            <TextInput
                              style={styles.licenseInput}
                              value={licenseCode}
                              onChangeText={setLicenseCode}
                              placeholder="FD2024-T123ABC"
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
                        </View>

                        {/* Pyydä lisenssiä - vain joukkueen adminille */}
                        {isTeamAdmin(team) ? (
                          <>
                            <View style={styles.divider}>
                              <Text style={styles.dividerText}>TAI</Text>
                            </View>

                            <TouchableOpacity
                              style={styles.requestButton}
                              onPress={requestLicense}
                            >
                              <Ionicons name="mail" size={20} color="#fff" />
                              <Text style={styles.requestButtonText}>
                                Pyydä lisenssiä MasterAdminilta
                              </Text>
                            </TouchableOpacity>
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
  },
  section: {
    padding: 20,
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
});

export default LicenseManager;
