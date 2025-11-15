import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import {
  Team,
  TeamCreationRequest,
  LicenseRequest,
  RootStackParamList,
} from "../types";
import LicenseManager from "../components/LicenseManager";
import { useAuth } from "../contexts/AuthContext";
import { useApp } from "../contexts/AppContext";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  doc,
  addDoc,
  deleteDoc,
  getDocs,
  getDoc,
} from "firebase/firestore";
import { db } from "../services/firebase";

type MasterAdminScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "MasterAdmin"
>;

const MasterAdminScreen: React.FC = () => {
  const navigation = useNavigation<MasterAdminScreenNavigationProp>();
  const { user } = useAuth();
  const { players } = useApp();

  // States
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamRequests, setTeamRequests] = useState<TeamCreationRequest[]>([]);
  const [licenseRequests, setLicenseRequests] = useState<LicenseRequest[]>([]);
  const [licenses, setLicenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [licenseManagerVisible, setLicenseManagerVisible] = useState(false);
  const [selectedTeamForLicense, setSelectedTeamForLicense] =
    useState<Team | null>(null);

  // Team request modal states
  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] =
    useState<TeamCreationRequest | null>(null);
  const [processingRequest, setProcessingRequest] = useState(false);

  // Check if user is Master Admin
  const isMasterAdmin = (): boolean => {
    return Boolean(user && user.isMasterAdmin === true);
  };

  // Redirect if not Master Admin
  useEffect(() => {
    if (!loading && !isMasterAdmin()) {
      Alert.alert(
        "Ei käyttöoikeutta",
        "Tämä sivu on vain Master Admin -käyttäjille",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    }
  }, [loading, user, navigation]);

  // Load teams
  useEffect(() => {
    const teamsQuery = query(collection(db, "teams"), orderBy("name", "asc"));

    const unsubscribe = onSnapshot(teamsQuery, (snapshot) => {
      const teamsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Team[];
      setTeams(teamsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Load team creation requests
  useEffect(() => {
    if (!user?.isMasterAdmin) return;

    const requestsQuery = query(
      collection(db, "teamCreationRequests"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
      const requestsData: TeamCreationRequest[] = [];
      snapshot.forEach((doc) => {
        requestsData.push({ id: doc.id, ...doc.data() } as TeamCreationRequest);
      });
      setTeamRequests(requestsData);
    });

    return () => unsubscribe();
  }, [user]);

  // Load license requests
  useEffect(() => {
    if (!user?.isMasterAdmin) return;

    const licenseRequestsQuery = query(
      collection(db, "licenseRequests"),
      orderBy("requestedAt", "desc")
    );

    const unsubscribe = onSnapshot(licenseRequestsQuery, (snapshot) => {
      const requestsData: LicenseRequest[] = [];
      snapshot.forEach((doc) => {
        requestsData.push({ id: doc.id, ...doc.data() } as LicenseRequest);
      });
      setLicenseRequests(requestsData);
    });

    return () => unsubscribe();
  }, [user]);

  // Load licenses
  useEffect(() => {
    if (!user?.isMasterAdmin) return;

    const licensesQuery = query(
      collection(db, "licenses"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(licensesQuery, (snapshot) => {
      const licensesData: any[] = [];
      snapshot.forEach((doc) => {
        licensesData.push({ id: doc.id, ...doc.data() });
      });
      setLicenses(licensesData);
    });

    return () => unsubscribe();
  }, [user]);

  const pendingLicenseRequestsCount = licenseRequests.filter(
    (r) => r.status === "pending"
  ).length;

  const availableLicensesCount = licenses.filter(
    (l) => !l.usedByTeamId && !l.isUsed
  ).length;

  // Helper functions for team request processing
  const approveTeamRequest = async (request: TeamCreationRequest) => {
    setProcessingRequest(true);
    try {
      // Generate team code and license code
      const teamCode = generateTeamCode();
      const licenseCode = generateLicenseCode();

      // Calculate season-based expiry date
      const now = new Date();
      const expiresAt = calculateSeasonExpiry(request.licenseType || "season");
      const licenseDuration = getLicenseDurationDays(now, expiresAt);

      // Create the new team with active license
      const newTeam = {
        name: request.teamName,
        adminIds: [request.userId],
        members: [request.userId],
        players: [],
        totalPoints: 0,
        code: teamCode,
        licenseStatus: "active" as const,
        licenseExpiresAt: expiresAt,
        licenseActivatedAt: now,
        licenseDuration: licenseDuration,
        licenceCode: licenseCode,
        seasonEndDate: expiresAt, // Add season end for easier tracking
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const teamRef = await addDoc(collection(db, "teams"), newTeam);

      // Create license record in licenses collection
      const newLicenseRef = await addDoc(collection(db, "licenses"), {
        code: licenseCode,
        usedByTeamId: teamRef.id, // Changed from teamId to usedByTeamId
        isUsed: true, // Added to match approveLicenseRequest
        teamName: request.teamName,
        type: request.licenseType || "season",
        duration: licenseDuration,
        usedAt: now, // Changed from activatedAt to usedAt to match approveLicenseRequest
        expiresAt: expiresAt,
        seasonEndDate: expiresAt,
        status: "active",
        createdBy: user?.uid,
        createdAt: now,
        country: "FI", // Default to Finland
      });

      // Update team document with licenseId to maintain bidirectional reference
      await updateDoc(teamRef, {
        licenseId: newLicenseRef.id,
      });

      // Update request status
      await updateDoc(doc(db, "teamCreationRequests", request.id), {
        status: "approved",
        reviewedAt: new Date(),
        reviewedBy: user?.uid,
        approvedTeamId: teamRef.id,
      });

      const seasonInfo = getSeasonDisplayInfo(request.licenseType || "season");

      Alert.alert(
        "Joukkue luotu onnistuneesti! ✅",
        `Joukkue "${request.teamName}" on luotu ja aktivoitu.\n\n` +
          `🎫 Liittymiskoodi: ${teamCode}\n` +
          `🔑 Lisenssikoodi: ${licenseCode}\n` +
          `📅 Lisenssi: ${seasonInfo}\n` +
          `⏰ Voimassa ${licenseDuration} päivää\n\n` +
          `Koodit on lähetetty joukkueen ylläpitäjälle.`,
        [
          {
            text: "OK",
            onPress: () => {
              setRequestModalVisible(false);
              setSelectedRequest(null);
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error approving team request:", error);
      Alert.alert("Virhe", "Joukkueen luominen epäonnistui");
    }
    setProcessingRequest(false);
  };
  const rejectTeamRequest = async (request: TeamCreationRequest) => {
    setProcessingRequest(true);
    try {
      await updateDoc(doc(db, "teamCreationRequests", request.id), {
        status: "rejected",
        reviewedAt: new Date(),
        reviewedBy: user?.uid,
      });

      Alert.alert(
        "Pyyntö hylätty",
        `Joukkueen "${request.teamName}" luomispyyntö on hylätty.`,
        [
          {
            text: "OK",
            onPress: () => {
              setRequestModalVisible(false);
              setSelectedRequest(null);
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error rejecting team request:", error);
      Alert.alert("Virhe", "Pyynnön hylkääminen epäonnistui");
    }
    setProcessingRequest(false);
  };

  // License request handlers
  const approveLicenseRequest = async (request: LicenseRequest) => {
    setProcessingRequest(true);
    try {
      const now = new Date();

      // Determine license type and duration from request, or use defaults
      const requestedType = request.requestedLicenseType || "trial";
      let licenseType: "trial" | "half-season" | "season" = requestedType;
      let duration: number;

      // Set duration based on license type
      switch (licenseType) {
        case "trial":
          duration = 60; // 60 days
          break;
        case "half-season":
          duration = 183; // ~6 months
          break;
        case "season":
          duration = 365; // 1 year
          break;
        default:
          duration = 60;
      }

      const expiresAt = new Date(
        now.getTime() + duration * 24 * 60 * 60 * 1000
      );

      // Generate a unique license code
      const licenseCode = `LIC-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 9)
        .toUpperCase()}`;

      // Create new license document
      const newLicense = {
        code: licenseCode,
        type: licenseType,
        duration: duration,
        createdAt: now,
        createdBy: user?.uid || "system",
        usedByTeamId: request.teamId,
        teamName: request.teamName, // Add team name for easier identification
        isUsed: true,
        usedAt: now,
        expiresAt: expiresAt,
        seasonEndDate: expiresAt,
        status: "active",
        country: "FI", // Default to Finland
      };

      const licenseRef = await addDoc(collection(db, "licenses"), newLicense);
      console.log("Created new license:", licenseRef.id);

      // Update team with new license
      const teamRef = doc(db, "teams", request.teamId);
      await updateDoc(teamRef, {
        licenseId: licenseRef.id,
        licenceCode: licenseCode,
        licenseExpiresAt: expiresAt,
        licenseType: licenseType,
        licenseStatus: "active",
        licenseActivatedAt: now,
        licenseDuration: duration,
      });

      // Link requesting admin to team as member + admin
      // Try to find user by requestedBy (user id) first, then by adminEmail
      let userIdToLink: string | null = null;

      if (request.requestedBy) {
        const requestedByRef = doc(db, "users", request.requestedBy);
        const requestedBySnap = await getDoc(requestedByRef);
        if (requestedBySnap.exists()) {
          userIdToLink = requestedBySnap.id;
        }
      }

      if (!userIdToLink && request.adminEmail) {
        const usersSnapshot = await getDocs(collection(db, "users"));
        const matchingUser = usersSnapshot.docs.find((u) => {
          const data = u.data() as any;
          return (
            data.email &&
            typeof data.email === "string" &&
            data.email.toLowerCase() === request.adminEmail!.toLowerCase()
          );
        });
        if (matchingUser) {
          userIdToLink = matchingUser.id;
        }
      }

      if (userIdToLink) {
        const userRef = doc(db, "users", userIdToLink);
        const userSnap = await getDoc(userRef);
        const userData = (userSnap.data() || {}) as any;

        const currentTeamIds: string[] = userData.teamIds || [];
        const currentTeamMember = userData.teamMember || {};
        const currentTeamsNames: string[] = userData.teams || [];

        const updatedTeamIds = currentTeamIds.includes(request.teamId)
          ? currentTeamIds
          : [...currentTeamIds, request.teamId];

        const updatedTeamMember = {
          ...currentTeamMember,
          [request.teamId]: true,
        };

        const updatedTeamsNames = currentTeamsNames.includes(request.teamName)
          ? currentTeamsNames
          : [...currentTeamsNames, request.teamName];

        await updateDoc(userRef, {
          teamIds: updatedTeamIds,
          teamMember: updatedTeamMember,
          teams: updatedTeamsNames,
          isAdmin: true,
        });

        // Ensure team.adminIds contains this user
        const freshTeamSnap = await getDoc(teamRef);
        const freshTeamData = (freshTeamSnap.data() || {}) as any;
        const currentAdminIds: string[] = freshTeamData.adminIds || [];

        if (!currentAdminIds.includes(userIdToLink)) {
          await updateDoc(teamRef, {
            adminIds: [...currentAdminIds, userIdToLink],
          });
        }
      }

      // Update request as approved
      const requestRef = doc(db, "licenseRequests", request.id);
      await updateDoc(requestRef, {
        status: "approved",
        reviewedAt: now,
        reviewedBy: user?.uid,
        approvedLicenseId: licenseRef.id,
      });

      Alert.alert(
        "Onnistui",
        `Lisenssipyyntö joukkueelle "${
          request.teamName
        }" hyväksytty!\n\nLisenssi: ${licenseType}\nKesto: ${duration} päivää\nVoimassa: ${expiresAt.toLocaleDateString(
          "fi-FI"
        )} asti`,
        [
          {
            text: "OK",
            onPress: () => {
              setRequestModalVisible(false);
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error approving license request:", error);
      Alert.alert("Virhe", "Lisenssipyynnön hyväksyntä epäonnistui");
    }
    setProcessingRequest(false);
  };

  const rejectLicenseRequest = async (request: LicenseRequest) => {
    setProcessingRequest(true);
    try {
      const requestRef = doc(db, "licenseRequests", request.id);
      await updateDoc(requestRef, {
        status: "rejected",
        reviewedAt: new Date(),
        reviewedBy: user?.uid,
      });

      Alert.alert(
        "Pyyntö hylätty",
        `Lisenssipyyntö joukkueelle "${request.teamName}" on hylätty.`,
        [
          {
            text: "OK",
            onPress: () => {
              setRequestModalVisible(false);
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error rejecting license request:", error);
      Alert.alert("Virhe", "Pyynnön hylkääminen epäonnistui");
    }
    setProcessingRequest(false);
  };

  // Create new free license
  // Removed createFreeLicense - licenses are now created automatically when approving requests

  const generateTeamCode = (): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const generateLicenseCode = (): string => {
    const prefix = "FD2024";
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}-S${code}`;
  };

  // Calculate season-based expiry dates
  const calculateSeasonExpiry = (licenseType: string): Date => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // JavaScript months are 0-indexed

    if (licenseType === "trial") {
      // Trial: 60 days from activation
      return new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    }

    // Determine which season year to use
    // If we're between July and December, the season ends next year on June 30
    // If we're between January and June, the season ends this year on June 30
    let seasonEndYear = currentYear;
    if (currentMonth >= 7) {
      seasonEndYear = currentYear + 1;
    }

    if (licenseType === "half-season") {
      // Half season: Until December 31st of current season year - 1
      // This gives roughly half the season
      const halfSeasonEnd = new Date(seasonEndYear - 1, 11, 31); // December 31st
      return halfSeasonEnd;
    }

    // Full season: Until June 30th of the season end year
    const fullSeasonEnd = new Date(seasonEndYear, 5, 30); // June 30th (month 5 = June)
    return fullSeasonEnd;
  };

  // Get license duration in days for display purposes
  const getLicenseDurationDays = (startDate: Date, endDate: Date): number => {
    const diffTime = endDate.getTime() - startDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Format season info for display
  const getSeasonDisplayInfo = (licenseType: string): string => {
    const expiryDate = calculateSeasonExpiry(licenseType);
    const now = new Date();
    const days = getLicenseDurationDays(now, expiryDate);

    if (licenseType === "trial") {
      return `Kokeilu (60 päivää)`;
    } else if (licenseType === "half-season") {
      return `Puolikausi (päättyy ${expiryDate.toLocaleDateString("fi-FI")})`;
    } else {
      return `Täysi kausi (päättyy ${expiryDate.toLocaleDateString("fi-FI")})`;
    }
  };

  // Main menu items for Master Admin
  const masterAdminItems = [
    {
      title: "Lisenssipyynnöt",
      icon: "document-text",
      description: "Käsittele uudet lisenssipyynnöt",
      count: pendingLicenseRequestsCount,
      backgroundColor: pendingLicenseRequestsCount > 0 ? "#FF9800" : "#4CAF50", // Oranssi jos pyyntöjä, vihreä jos kaikki käsitelty
      onPress: () => {
        if (licenseRequests.length === 0) {
          Alert.alert(
            "Ei pyyntöjä",
            "Lisenssipyyntöjä ei ole vielä lähetetty."
          );
          return;
        }
        setRequestModalVisible(true);
      },
    },
    // Removed "Luo uusia lisenssejä" - licenses are now created automatically when approving requests
    {
      title: "Lisenssinhallinta",
      icon: "shield-checkmark",
      description: "Hallinnoi lisenssejä ja voimassaoloja",
      onPress: () => {
        setSelectedTeamForLicense(null);
        setLicenseManagerVisible(true);
      },
    },
    {
      title: "Kaikki joukkueet",
      icon: "people",
      description: `Hallinnoi kaikkia joukkueita (${teams.length} kpl)`,
      onPress: () => {
        navigation.navigate("TeamManagement");
      },
    },
  ];

  // Helper functions for formatting
  const formatDate = (timestamp: any): string => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("fi-FI", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusText = (status: string): string => {
    switch (status) {
      case "pending":
        return "Odottaa";
      case "approved":
        return "Hyväksytty";
      case "rejected":
        return "Hylätty";
      default:
        return status;
    }
  };

  const getLicenseTypeText = (type: string): string => {
    return getSeasonDisplayInfo(type);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>Master Admin</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1976d2" />
          <Text style={styles.loadingText}>Ladataan...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isMasterAdmin()) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="warning" size={64} color="#f44336" />
          <Text style={styles.errorText}>Ei käyttöoikeutta</Text>
          <Text style={styles.errorSubtext}>
            Tämä sivu on vain Master Admin -käyttäjille
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Master Admin</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Master Admin -hallinta</Text>
          <Text style={styles.welcomeSubtitle}>
            Hallinnoi sovelluksen lisenssejä
          </Text>
        </View>

        <View style={styles.menuItems}>
          {masterAdminItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.menuItem,
                item.backgroundColor && {
                  backgroundColor: item.backgroundColor,
                },
              ]}
              onPress={item.onPress}
            >
              <View style={styles.menuItemIcon}>
                <Ionicons name={item.icon as any} size={24} color="#fff" />
              </View>
              <View style={styles.menuItemContent}>
                <Text
                  style={[
                    styles.menuItemTitle,
                    item.backgroundColor && { color: "#fff" },
                  ]}
                >
                  {item.title}
                </Text>
                <Text
                  style={[
                    styles.menuItemDescription,
                    item.backgroundColor && { color: "#fff", opacity: 0.9 },
                  ]}
                >
                  {item.description}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={item.backgroundColor ? "#fff" : "#ccc"}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Quick stats */}
        <View style={styles.statsSection}>
          <Text style={styles.statsSectionTitle}>Tilastot</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{teams.length}</Text>
              <Text style={styles.statLabel}>Joukkuetta</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {pendingLicenseRequestsCount}
              </Text>
              <Text style={styles.statLabel}>Lisenssipyyntöjä</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {teams.filter((t) => t.licenseStatus === "active").length}
              </Text>
              <Text style={styles.statLabel}>Aktiivista lisenssiä</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* License Requests Modal */}
      {requestModalVisible && (
        <Modal
          visible={requestModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setRequestModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  Lisenssipyynnöt ({licenseRequests.length})
                </Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setRequestModalVisible(false)}
                >
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollContent}>
                {licenseRequests.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons
                      name="document-text-outline"
                      size={64}
                      color="#ccc"
                    />
                    <Text style={styles.emptyStateTitle}>Ei pyyntöjä</Text>
                    <Text style={styles.emptyStateDescription}>
                      Lisenssipyyntöjä ei ole vielä lähetetty.
                    </Text>
                  </View>
                ) : (
                  licenseRequests.map((request) => (
                    <View key={request.id} style={styles.requestCard}>
                      <View style={styles.requestHeader}>
                        <Text style={styles.requestTeamName}>
                          {request.teamName}
                        </Text>
                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor:
                                request.status === "pending"
                                  ? "#fff3e0"
                                  : request.status === "approved"
                                  ? "#e8f5e8"
                                  : "#ffebee",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusText,
                              {
                                color:
                                  request.status === "pending"
                                    ? "#ff9800"
                                    : request.status === "approved"
                                    ? "#4caf50"
                                    : "#f44336",
                              },
                            ]}
                          >
                            {getStatusText(request.status)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.requestDetails}>
                        <View
                          style={[
                            styles.requestTypeBadge,
                            {
                              backgroundColor:
                                request.requestType === "new"
                                  ? "#e3f2fd"
                                  : "#fff3e0",
                            },
                          ]}
                        >
                          <Ionicons
                            name={
                              request.requestType === "new"
                                ? "add-circle"
                                : "refresh"
                            }
                            size={16}
                            color={
                              request.requestType === "new"
                                ? "#1976d2"
                                : "#ff9800"
                            }
                          />
                          <Text
                            style={[
                              styles.requestTypeText,
                              {
                                color:
                                  request.requestType === "new"
                                    ? "#1976d2"
                                    : "#ff9800",
                              },
                            ]}
                          >
                            {request.requestType === "new"
                              ? "Uusi lisenssi"
                              : "Uusiminen"}
                          </Text>
                        </View>

                        {/* Show requested license type prominently */}
                        {request.requestedLicenseType && (
                          <View style={styles.requestedLicenseContainer}>
                            <Ionicons name="ticket" size={16} color="#1976d2" />
                            <Text style={styles.requestedLicenseText}>
                              {request.requestedLicenseType === "trial" &&
                                "Kokeilu (60 päivää)"}
                              {request.requestedLicenseType === "half-season" &&
                                "Puolikausi (183 päivää - 69€)"}
                              {request.requestedLicenseType === "season" &&
                                "Kausikortti (365 päivää - 99€)"}
                            </Text>
                          </View>
                        )}

                        {/* Admin contact info - PRIMARY */}
                        <View style={styles.contactInfoContainer}>
                          <Text style={styles.contactInfoTitle}>
                            Yhteyshenkilö
                          </Text>
                          <View style={styles.contactInfoRow}>
                            <Ionicons name="person" size={16} color="#666" />
                            <Text style={styles.contactInfoText}>
                              {request.adminName}
                            </Text>
                          </View>
                          <View style={styles.contactInfoRow}>
                            <Ionicons name="mail" size={16} color="#666" />
                            <Text style={styles.contactInfoText}>
                              {request.adminEmail}
                            </Text>
                          </View>
                          {request.adminPhone && (
                            <View style={styles.contactInfoRow}>
                              <Ionicons name="call" size={16} color="#666" />
                              <Text style={styles.contactInfoText}>
                                {request.adminPhone}
                              </Text>
                            </View>
                          )}
                        </View>

                        <Text style={styles.requestDate}>
                          Pyydetty: {formatDate(request.requestedAt)}
                        </Text>

                        {/* Additional info - SECONDARY */}
                        {request.requestType === "new" && (
                          <>
                            {request.teamDescription && (
                              <Text style={styles.requestDescriptionSecondary}>
                                Kuvaus: {request.teamDescription}
                              </Text>
                            )}
                            {request.estimatedPlayerCount && (
                              <Text style={styles.requestPlayerCountSecondary}>
                                Pelaajia: ~{request.estimatedPlayerCount}
                              </Text>
                            )}
                          </>
                        )}

                        {request.reviewedAt && (
                          <Text style={styles.requestReviewed}>
                            Käsitelty: {formatDate(request.reviewedAt)}
                          </Text>
                        )}
                        {request.rejectionReason && (
                          <Text style={styles.requestDescription}>
                            Hylkäys syy: {request.rejectionReason}
                          </Text>
                        )}
                      </View>

                      {request.status === "pending" && (
                        <View style={styles.requestActions}>
                          <TouchableOpacity
                            style={styles.approveButton}
                            onPress={() => approveLicenseRequest(request)}
                            disabled={processingRequest}
                          >
                            {processingRequest ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <>
                                <Ionicons
                                  name="checkmark"
                                  size={20}
                                  color="#fff"
                                />
                                <Text style={styles.approveButtonText}>
                                  Hyväksy
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.rejectButton}
                            onPress={() => rejectLicenseRequest(request)}
                            disabled={processingRequest}
                          >
                            {processingRequest ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <>
                                <Ionicons name="close" size={20} color="#fff" />
                                <Text style={styles.rejectButtonText}>
                                  Hylkää
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* License Manager */}
      <LicenseManager
        visible={licenseManagerVisible}
        onClose={() => {
          setLicenseManagerVisible(false);
          setSelectedTeamForLicense(null);
        }}
        team={selectedTeamForLicense || undefined}
        onLicenseUpdated={() => {
          // Refresh teams data if needed
        }}
        isMasterAdmin={isMasterAdmin()}
        currentUserId={user?.uid}
        currentUserEmail={user?.email}
        currentUser={user || undefined}
        currentUserPhone={(() => {
          const currentPlayer = players.find(
            (p) => p.id === user?.uid || p.email === user?.email
          );
          console.log("MasterAdmin - Looking for phone:", {
            userId: user?.uid,
            userEmail: user?.email,
            foundPlayer: currentPlayer?.id,
            phone: currentPlayer?.phone,
          });
          return currentPlayer?.phone || "";
        })()}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    flex: 1,
    textAlign: "center",
  },
  backButton: {
    padding: 8,
    width: 40,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#f44336",
    marginTop: 16,
    textAlign: "center",
  },
  errorSubtext: {
    fontSize: 16,
    color: "#666",
    marginTop: 8,
    textAlign: "center",
  },
  welcomeSection: {
    padding: 20,
    backgroundColor: "#1976d2",
    marginBottom: 20,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: "#e3f2fd",
    lineHeight: 22,
  },
  menuItems: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "white",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  menuItemIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(25, 118, 210, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  menuItemDescription: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  countBadge: {
    color: "#ff9800",
    fontWeight: "700",
  },
  statsSection: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  statsSectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "white",
    borderRadius: 12,
    paddingVertical: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statItem: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1976d2",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
  },
  // Modal styles
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
    height: "80%",
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#f5f5f5",
  },
  modalScrollContent: {
    flex: 1,
    padding: 20,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#999",
    marginTop: 16,
  },
  emptyStateDescription: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginTop: 8,
  },
  requestCard: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#1976d2",
  },
  requestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  requestTeamName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  requestDetails: {
    marginBottom: 16,
  },
  requestUser: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  requestDate: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  requestTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 12,
    alignSelf: "flex-start",
    gap: 6,
  },
  requestTypeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  requestDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  requestPlayerCount: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  requestLicenseType: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  requestedLicenseContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e3f2fd",
    padding: 8,
    borderRadius: 6,
    marginVertical: 8,
    gap: 8,
  },
  requestedLicenseText: {
    fontSize: 14,
    color: "#1976d2",
    fontWeight: "600",
  },
  contactInfoContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#4CAF50",
  },
  contactInfoTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  contactInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    gap: 8,
  },
  contactInfoText: {
    fontSize: 14,
    color: "#333",
  },
  requestDescriptionSecondary: {
    fontSize: 13,
    color: "#999",
    marginTop: 8,
    fontStyle: "italic",
  },
  requestPlayerCountSecondary: {
    fontSize: 13,
    color: "#999",
    marginTop: 4,
    fontStyle: "italic",
  },
  requestReviewed: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
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
});

export default MasterAdminScreen;
