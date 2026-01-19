import { useState, useEffect } from "react";
import {
  Box,
  Button,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Divider,
  Chip,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  IconButton,
  Tooltip,
  Snackbar,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  PlayArrow as PlayArrowIcon,
  Refresh as RefreshIcon,
  ContentCopy as ContentCopyIcon,
  History as HistoryIcon,
  Upcoming as UpcomingIcon,
} from "@mui/icons-material";
import { db } from "../services/firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import type { Team } from "../types";
// Import types from shared source for TeamBalancer compatibility
import type { EnrichedPlayer as SharedEnrichedPlayer } from "@shared/types";
import { TeamBalancer } from "@shared/utils/teamBalancer";

// Extended event interface for this page
interface EventData {
  id: string;
  title: string;
  date: Date;
  teamId: string;
  registeredPlayers: string[];
  playerRoles?: Record<string, string>;
  maxPlayers: number;
  maxGoalkeepers?: number;
}

interface TeamGenerationStep {
  step: number;
  title: string;
  description: string;
  data?: Record<string, unknown>;
}

interface PairInfo {
  pairNumber: number;
  player1Name: string;
  player1Team: string;
  player1Multiplier: number;
  player1Position: string;
  player1Category: number;
  player2Name: string;
  player2Team: string;
  player2Multiplier: number;
  player2Position: string;
  player2Category: number;
  category: number;
  reason: string;
  balance?: string;
  // Running average after this pair
  avgA?: number;
  avgB?: number;
  // Was this pair randomized (same multiplier)?
  wasRandomized?: boolean;
}

export default function TeamBalancerTestPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [generationSteps, setGenerationSteps] = useState<TeamGenerationStep[]>(
    [],
  );
  const [generatedTeams, setGeneratedTeams] = useState<{
    teams: Array<{
      name: string;
      players: Array<{
        name: string;
        position: string;
        category: number;
        multiplier: number;
        points: number;
      }>;
      totalPoints: number;
    }>;
    balanceScore: number;
  } | null>(null);
  const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
  const [distributionMethod, setDistributionMethod] = useState<
    "position-based" | "skill-based"
  >("position-based");
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [eventFilter, setEventFilter] = useState<"all" | "upcoming" | "past">(
    "all",
  );
  const [pairings, setPairings] = useState<PairInfo[]>([]);

  // Load teams on mount
  useEffect(() => {
    loadTeams();
  }, []);

  // Load events when team is selected
  useEffect(() => {
    if (selectedTeamId) {
      loadEvents(selectedTeamId);
    }
  }, [selectedTeamId]);

  const loadTeams = async () => {
    try {
      const teamsRef = collection(db, "teams");
      const snapshot = await getDocs(teamsRef);
      const teamsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Team[];
      setTeams(teamsData);
    } catch (error) {
      console.error("Error loading teams:", error);
    }
  };

  const loadEvents = async (teamId: string) => {
    try {
      setLoading(true);
      console.log("Loading events for team:", teamId);
      // Events are in main "events" collection, filtered by teamId
      const eventsRef = collection(db, "events");
      const q = query(
        eventsRef,
        where("teamId", "==", teamId),
        orderBy("date", "desc"),
      );
      const snapshot = await getDocs(q);
      console.log("Found events:", snapshot.docs.length);

      const eventsData = snapshot.docs.map((doc) => {
        const data = doc.data();
        console.log("Event data:", doc.id, data);
        // Handle Firestore Timestamp
        let eventDate: Date;
        if (data.date && typeof data.date.toDate === "function") {
          eventDate = data.date.toDate();
        } else if (data.date instanceof Date) {
          eventDate = data.date;
        } else if (typeof data.date === "string") {
          eventDate = new Date(data.date);
        } else {
          eventDate = new Date();
        }

        return {
          id: doc.id,
          title: data.title || "Nimetön tapahtuma",
          date: eventDate,
          teamId,
          registeredPlayers: data.registeredPlayers || [],
          playerRoles: data.playerRoles || {},
          maxPlayers: data.maxPlayers || 20,
          maxGoalkeepers: data.maxGoalkeepers || 2,
        };
      }) as EventData[];

      console.log("Processed events:", eventsData.length);
      setEvents(eventsData);
      setSelectedEventId("");
    } catch (error) {
      console.error("Error loading events:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter events based on selected filter
  const filteredEvents = events.filter((event) => {
    const now = new Date();
    const eventDate = event.date;

    if (eventFilter === "upcoming") {
      return eventDate >= now;
    } else if (eventFilter === "past") {
      return eventDate < now;
    }
    return true; // "all"
  });

  // Capture console.log output
  const captureConsoleLog = () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      const message = args
        .map((arg) =>
          typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg),
        )
        .join(" ");
      logs.push(message);
      originalLog.apply(console, args);
    };
    return {
      logs,
      restore: () => {
        console.log = originalLog;
      },
    };
  };

  // Normalize team name from log output
  const normalizeTeam = (teamStr: string): string => {
    const trimmed = teamStr.trim();
    // Remove trailing info like "(weaker)", "(fewer cat1: X vs Y)", etc.
    const cleaned = trimmed.replace(/\s*\([^)]*\)\s*$/, "").trim();
    return cleaned;
  };

  // Parse pairings from console output
  const parsePairingsFromLogs = (
    logs: string[],
    teamAName: string,
    teamBName: string,
  ): PairInfo[] => {
    const pairs: PairInfo[] = [];
    let pairNumber = 0;
    let lastBalance = "";
    let wasRandomized = false; // Track if the next pair was randomized

    for (const log of logs) {
      // Check for randomization indicator 🎲
      if (
        log.includes("🎲") &&
        log.toLowerCase().includes("equal multipliers")
      ) {
        wasRandomized = true;
        continue;
      }

      // Check for balance info first - store it for the next pair
      if (log.includes("BALANCE:")) {
        // Extract balance info: "BALANCE: A: X.XX vs B: Y.YY"
        const balanceMatch = log.match(/BALANCE:\s*(.+)/);
        if (balanceMatch) {
          lastBalance = balanceMatch[1].trim();
        }
        continue;
      }

      // Skip non-relevant logs
      if (
        log.includes("Distributing") ||
        log.includes("calculation") ||
        log.includes("order") ||
        log.includes("Balancing") ||
        log.includes("selected as defenders") ||
        log.includes("complete")
      )
        continue;
      if (log.includes("Both defenders are Cat")) continue;
      if (!log.includes("\u2192")) continue;

      // FIRST: Match defender pair (must be before generic Better/Worse player match)
      // "Defender pair X: Better player (Name [H/P]) \u2192 Team, Worse player (Name) \u2192 Team"
      const defPairMatch = log.match(
        /Defender pair \d+: Better player \(([^)]+)\) \u2192 ([^,]+).*Worse player \(([^)]+)\) \u2192 (.+)/,
      );
      if (defPairMatch) {
        pairNumber++;
        // Check for [H/P] marker in names
        const player1Name = defPairMatch[1].replace(" [H/P]", "").trim();
        const player2Name = defPairMatch[3].replace(" [H/P]", "").trim();
        const isHybrid1 = defPairMatch[1].includes("[H/P]");
        const isHybrid2 = defPairMatch[3].includes("[H/P]");
        pairs.push({
          pairNumber,
          player1Name: player1Name + (isHybrid1 ? " [H/P]" : ""),
          player1Team: normalizeTeam(defPairMatch[2]),
          player1Multiplier: 0,
          player1Position: "",
          player1Category: 0,
          player2Name: player2Name + (isHybrid2 ? " [H/P]" : ""),
          player2Team: normalizeTeam(defPairMatch[4]),
          player2Multiplier: 0,
          player2Position: "",
          player2Category: 0,
          category: 0,
          reason: "P",
          balance: lastBalance,
          wasRandomized,
        });
        lastBalance = "";
        wasRandomized = false;
        continue;
      }

      // Match defender single: "Defender single: Remaining player (Name [H/P]) → Team"
      const defSingleMatch = log.match(
        /Defender single: Remaining player \(([^)]+)\) → (.+)/,
      );
      if (defSingleMatch) {
        pairNumber++;
        const playerName = defSingleMatch[1].replace(" [H/P]", "").trim();
        const isHybrid = defSingleMatch[1].includes("[H/P]");
        pairs.push({
          pairNumber,
          player1Name: playerName + (isHybrid ? " [H/P]" : ""),
          player1Team: normalizeTeam(defSingleMatch[2]),
          player1Multiplier: 0,
          player1Position: "",
          player1Category: 0,
          player2Name: "",
          player2Team: "",
          player2Multiplier: 0,
          player2Position: "",
          player2Category: 0,
          category: 0,
          reason: "P",
          balance: lastBalance,
        });
        lastBalance = "";
        continue;
      }

      // Match goalkeeper pair: "Goalkeeper pair: Better player (Name) → Team, Worse player (Name) → Team"
      const gkPairMatch = log.match(
        /Goalkeeper pair: Better player \(([^)]+)\) → ([^,]+).*Worse player \(([^)]+)\) → (.+)/,
      );
      if (gkPairMatch) {
        pairNumber++;
        pairs.push({
          pairNumber,
          player1Name: gkPairMatch[1].trim(),
          player1Team: normalizeTeam(gkPairMatch[2]),
          player1Multiplier: 0,
          player1Position: "",
          player1Category: 0,
          player2Name: gkPairMatch[3].trim(),
          player2Team: normalizeTeam(gkPairMatch[4]),
          player2Multiplier: 0,
          player2Position: "",
          player2Category: 0,
          category: 0,
          reason: "MV",
          balance: lastBalance,
          wasRandomized,
        });
        lastBalance = "";
        wasRandomized = false;
        continue;
      }

      // Match goalkeeper single: "Goalkeeper single: Remaining player (Name) → Team"
      const gkSingleMatch = log.match(
        /Goalkeeper single: Remaining player \(([^)]+)\) → (.+)/,
      );
      if (gkSingleMatch) {
        pairNumber++;
        pairs.push({
          pairNumber,
          player1Name: gkSingleMatch[1].trim(),
          player1Team: normalizeTeam(gkSingleMatch[2]),
          player1Multiplier: 0,
          player1Position: "",
          player1Category: 0,
          player2Name: "",
          player2Team: "",
          player2Multiplier: 0,
          player2Position: "",
          player2Category: 0,
          category: 0,
          reason: "MV",
          balance: lastBalance,
        });
        lastBalance = "";
        continue;
      }

      // AFTER specific matches: Match category-based format with "Better player (Name) → TeamX, Worse player (Name) → TeamY"
      const betterPlayerMatch = log.match(
        /Better player \(([^)]+)\) → (Team [AB]|[^,(]+)/,
      );
      const worsePlayerMatch = log.match(
        /Worse player \(([^)]+)\) → (Team [AB]|[^,(]+)/,
      );
      const categoryMatch = log.match(/^Category (\d)/);

      if (betterPlayerMatch && worsePlayerMatch) {
        pairNumber++;
        const category = categoryMatch ? parseInt(categoryMatch[1]) : 0;
        pairs.push({
          pairNumber,
          player1Name: betterPlayerMatch[1],
          player1Team: normalizeTeam(betterPlayerMatch[2]),
          player1Multiplier: 0,
          player1Position: "",
          player1Category: 0,
          player2Name: worsePlayerMatch[1],
          player2Team: normalizeTeam(worsePlayerMatch[2]),
          player2Multiplier: 0,
          player2Position: "",
          player2Category: 0,
          category,
          reason: category > 0 ? `Kategoria ${category}` : "Pari",
          balance: lastBalance,
          wasRandomized,
        });
        lastBalance = "";
        wasRandomized = false;
        continue;
      }

      // Match: "Category X: Remaining player (Name) → Team"
      const remainingMatch = log.match(
        /Category (\d): Remaining player \(([^)]+)\) → ([^(]+)/,
      );
      if (remainingMatch) {
        pairNumber++;
        pairs.push({
          pairNumber,
          player1Name: remainingMatch[2],
          player1Team: normalizeTeam(remainingMatch[3]),
          player1Multiplier: 0,
          player1Position: "",
          player1Category: 0,
          player2Name: "",
          player2Team: "",
          player2Multiplier: 0,
          player2Position: "",
          player2Category: 0,
          category: parseInt(remainingMatch[1]),
          reason: "Yksittainen",
          balance: lastBalance,
        });
        lastBalance = "";
        continue;
      }
    }

    return pairs;
  };

  const runTeamBalancer = async () => {
    if (!selectedEventId || !selectedTeamId) return;

    setLoading(true);
    setGenerationSteps([]);
    setGeneratedTeams(null);
    setConsoleOutput([]);
    setPairings([]);

    const steps: TeamGenerationStep[] = [];

    try {
      // Step 1: Load event data
      steps.push({
        step: 1,
        title: "Ladataan tapahtuman tiedot",
        description: "Haetaan tapahtuman ja ilmoittautuneiden pelaajien tiedot",
      });
      setGenerationSteps([...steps]);

      const event = events.find((e) => e.id === selectedEventId);
      if (!event) throw new Error("Event not found");

      // Step 2: Load team data
      steps.push({
        step: 2,
        title: "Ladataan joukkueen asetukset",
        description: "Haetaan joukkueen nimet ja asetukset",
      });
      setGenerationSteps([...steps]);

      const teamDoc = await getDoc(doc(db, "teams", selectedTeamId));
      const team = { id: teamDoc.id, ...teamDoc.data() } as Team;

      // Step 3: Load player profiles
      steps.push({
        step: 3,
        title: "Ladataan pelaajaprofiilit",
        description: `Haetaan ${event.registeredPlayers.length} pelaajan tiedot`,
      });
      setGenerationSteps([...steps]);

      const usersRef = collection(db, "users");
      const usersSnapshot = await getDocs(usersRef);
      const usersMap = new Map<string, Record<string, unknown>>();
      usersSnapshot.docs.forEach((doc) => {
        usersMap.set(doc.id, { id: doc.id, ...doc.data() });
      });

      // Step 4: Build enriched players
      steps.push({
        step: 4,
        title: "Rakennetaan pelaajatiedot",
        description: "Yhdistetaan pelaajaprofiilit ja taitotasot",
      });
      setGenerationSteps([...steps]);

      const enrichedPlayers: SharedEnrichedPlayer[] = [];

      for (const playerId of event.registeredPlayers) {
        const userData = usersMap.get(playerId);
        if (!userData) continue;

        // Get player's positions array (directly on user object) - used for fallback
        const playerPositions = (userData.positions as string[]) || ["H"];

        // Get team-specific skills - structure is: teamSkills.[teamId].field/goalkeeper.{category, multiplier}
        const teamSkills = (
          userData.teamSkills as Record<
            string,
            {
              field?: { category?: number; multiplier?: number };
              goalkeeper?: { category?: number; multiplier?: number };
            }
          >
        )?.[selectedTeamId];

        // IMPORTANT: Use the role selected for THIS EVENT, not the player's profile positions
        // event.playerRoles[playerId] contains the role the player chose when registering (H, P, H/P, or MV)
        const eventRole = event.playerRoles?.[playerId];

        let position = "H"; // Default

        if (eventRole) {
          // Player has a specific role for this event - use it directly
          position = eventRole;
        } else {
          // Fallback to profile positions if no event role is set
          const hasGoalkeeperPosition = playerPositions.includes("MV");
          const hasDefenderPosition = playerPositions.includes("P");
          const hasForwardPosition = playerPositions.includes("H");

          if (hasGoalkeeperPosition) {
            position = "MV";
          } else if (hasDefenderPosition && hasForwardPosition) {
            position = "H/P"; // Hybrid
          } else if (hasDefenderPosition) {
            position = "P";
          } else {
            position = "H";
          }
        }

        // Get correct skill data based on position
        let multiplier = 1.0;
        let category = 2;

        if (position === "MV") {
          // Goalkeeper uses goalkeeper skills
          multiplier = teamSkills?.goalkeeper?.multiplier || 1.0;
          category = teamSkills?.goalkeeper?.category || 2;
        } else {
          // Field players use field skills
          multiplier = teamSkills?.field?.multiplier || 1.0;
          category = teamSkills?.field?.category || 2;
        }

        enrichedPlayers.push({
          id: playerId,
          playerId: playerId,
          name: (userData.displayName as string) || "Tuntematon",
          email: (userData.email as string) || "",
          phone: "",
          positions: playerPositions,
          isAdmin: false,
          role:
            (event.playerRoles?.[playerId] as
              | "member"
              | "admin"
              | "eventManager") || "member",
          teamIds: [selectedTeamId],
          teams: [],
          createdAt: new Date(),
          teamSkills: {},
          position,
          category,
          points: category, // Use category as points
          multiplier,
          assignedRole: undefined,
        });
      }

      steps[3].data = {
        totalPlayers: enrichedPlayers.length,
        goalkeepers: enrichedPlayers.filter((p) => p.position === "MV").length,
        defenders: enrichedPlayers.filter((p) => p.position === "P").length,
        attackers: enrichedPlayers.filter((p) => p.position === "H").length,
        hybrids: enrichedPlayers.filter((p) => p.position === "H/P").length,
      };
      setGenerationSteps([...steps]);

      // Step 5: Run TeamBalancer algorithm
      steps.push({
        step: 5,
        title: "Ajetaan TeamBalancer-algoritmi",
        description: `Kaytetaan ${distributionMethod === "skill-based" ? "taitopohjaista" : "pelipaikkapohjaista"} jakoa`,
      });
      setGenerationSteps([...steps]);

      // Capture console output
      const { logs, restore } = captureConsoleLog();

      const result = TeamBalancer.generateBalancedTeams(
        enrichedPlayers,
        {
          playersPerTeam: 20,
          goalkeepersPerTeam: 2,
          balanceMethod: "skillLevel",
          allowPartialTeams: true,
          distributionMethod,
        },
        team.teamAName || "Joukkue A",
        team.teamBName || "Joukkue B",
      );

      restore();
      setConsoleOutput(logs);

      // Parse pairings from logs and add multipliers from enriched players
      const parsedPairs = parsePairingsFromLogs(
        logs,
        team.teamAName || "Joukkue A",
        team.teamBName || "Joukkue B",
      );

      // Add multipliers to pairings from enrichedPlayers
      const playerMultiplierMap = new Map<string, number>();
      const playerPositionMap = new Map<string, string>();
      const playerCategoryMap = new Map<string, number>();
      enrichedPlayers.forEach((p) => {
        playerMultiplierMap.set(p.name, p.multiplier);
        playerPositionMap.set(p.name, p.position);
        playerCategoryMap.set(p.name, p.category);
      });

      // Calculate running averages for each team
      const teamAPlayers: number[] = [];
      const teamBPlayers: number[] = [];
      const teamAName = team.teamAName || "Joukkue A";

      parsedPairs.forEach((pair) => {
        const player1CleanName = pair.player1Name.replace(" [H/P]", "");
        const player2CleanName = pair.player2Name?.replace(" [H/P]", "") || "";

        // Add multiplier, position and category for player 1
        pair.player1Multiplier = playerMultiplierMap.get(player1CleanName) || 0;
        pair.player1Position = playerPositionMap.get(player1CleanName) || "H";
        pair.player1Category = playerCategoryMap.get(player1CleanName) || 2;

        // Add multiplier, position and category for player 2
        if (pair.player2Name) {
          pair.player2Multiplier =
            playerMultiplierMap.get(player2CleanName) || 0;
          pair.player2Position = playerPositionMap.get(player2CleanName) || "H";
          pair.player2Category = playerCategoryMap.get(player2CleanName) || 2;
        }

        // Determine which team each player is on and track running totals
        const isPlayer1TeamA =
          pair.player1Team === teamAName || pair.player1Team.includes("A");
        const isPlayer2TeamA =
          pair.player2Team === teamAName || pair.player2Team.includes("A");

        if (isPlayer1TeamA) {
          teamAPlayers.push(pair.player1Multiplier);
        } else {
          teamBPlayers.push(pair.player1Multiplier);
        }

        if (pair.player2Name) {
          if (isPlayer2TeamA) {
            teamAPlayers.push(pair.player2Multiplier);
          } else {
            teamBPlayers.push(pair.player2Multiplier);
          }
        }

        // Calculate running averages
        pair.avgA =
          teamAPlayers.length > 0
            ? teamAPlayers.reduce((a, b) => a + b, 0) / teamAPlayers.length
            : 0;
        pair.avgB =
          teamBPlayers.length > 0
            ? teamBPlayers.reduce((a, b) => a + b, 0) / teamBPlayers.length
            : 0;
      });

      setPairings(parsedPairs);

      // Calculate team averages
      const teamStats = result.teams.map((t) => {
        const totalMultiplier = t.players.reduce(
          (sum, p) => sum + p.multiplier,
          0,
        );
        const avgMultiplier =
          t.players.length > 0 ? totalMultiplier / t.players.length : 0;
        return {
          name: t.name,
          players: t.players.length,
          totalPoints: t.totalPoints,
          avgMultiplier: avgMultiplier.toFixed(3),
          cat1: t.players.filter((p) => p.category === 1).length,
          cat2: t.players.filter((p) => p.category === 2).length,
          cat3: t.players.filter((p) => p.category === 3).length,
        };
      });

      steps[4].data = {
        teamStats,
        balanceScore: result.balanceScore,
      };
      setGenerationSteps([...steps]);

      setGeneratedTeams({
        teams: result.teams.map((t) => ({
          name: t.name,
          players: t.players.map((p) => ({
            name: p.name,
            position: p.position,
            category: p.category,
            multiplier: p.multiplier,
            points: p.points || 0,
          })),
          totalPoints: t.totalPoints,
        })),
        balanceScore: result.balanceScore,
      });
    } catch (error) {
      console.error("Error running TeamBalancer:", error);
      steps.push({
        step: steps.length + 1,
        title: "Virhe",
        description:
          error instanceof Error ? error.message : "Tuntematon virhe",
      });
      setGenerationSteps([...steps]);
    } finally {
      setLoading(false);
    }
  };

  const copyConsoleOutput = () => {
    navigator.clipboard.writeText(consoleOutput.join("\n"));
    setSnackbarOpen(true);
  };

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
        TeamBalancer Testaus
      </Typography>

      {/* Selection Controls */}
      <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom>
          Valitse tapahtuma
        </Typography>

        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
          <FormControl sx={{ minWidth: 250 }}>
            <InputLabel>Joukkue</InputLabel>
            <Select
              value={selectedTeamId}
              label="Joukkue"
              onChange={(e) => setSelectedTeamId(e.target.value)}
            >
              {teams.map((team) => (
                <MenuItem key={team.id} value={team.id}>
                  {team.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedTeamId && (
            <>
              <ToggleButtonGroup
                value={eventFilter}
                exclusive
                onChange={(_, value) => value && setEventFilter(value)}
                size="small"
              >
                <ToggleButton value="all">
                  <Tooltip title="Kaikki tapahtumat">
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      Kaikki
                    </Box>
                  </Tooltip>
                </ToggleButton>
                <ToggleButton value="upcoming">
                  <Tooltip title="Tulevat tapahtumat">
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <UpcomingIcon fontSize="small" />
                      Tulevat
                    </Box>
                  </Tooltip>
                </ToggleButton>
                <ToggleButton value="past">
                  <Tooltip title="Menneet tapahtumat">
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <HistoryIcon fontSize="small" />
                      Menneet
                    </Box>
                  </Tooltip>
                </ToggleButton>
              </ToggleButtonGroup>

              <FormControl sx={{ minWidth: 350 }}>
                <InputLabel>Tapahtuma</InputLabel>
                <Select
                  value={selectedEventId}
                  label="Tapahtuma"
                  onChange={(e) => setSelectedEventId(e.target.value)}
                >
                  {filteredEvents.map((event) => (
                    <MenuItem key={event.id} value={event.id}>
                      {event.date.toLocaleDateString("fi-FI")} - {event.title} (
                      {event.registeredPlayers.length} pelaajaa)
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}

          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Jakotapa</InputLabel>
            <Select
              value={distributionMethod}
              label="Jakotapa"
              onChange={(e) =>
                setDistributionMethod(
                  e.target.value as "position-based" | "skill-based",
                )
              }
            >
              <MenuItem value="position-based">Pelipaikkapohjainen</MenuItem>
              <MenuItem value="skill-based">Taitopohjainen</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {selectedEvent && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Tapahtuma: {selectedEvent.title} |{" "}
            {selectedEvent.date.toLocaleDateString("fi-FI")} |{" "}
            {selectedEvent.registeredPlayers.length} ilmoittautunutta pelaajaa
          </Alert>
        )}

        <Box sx={{ display: "flex", gap: 2 }}>
          <Button
            variant="contained"
            startIcon={
              loading ? <CircularProgress size={20} /> : <PlayArrowIcon />
            }
            onClick={runTeamBalancer}
            disabled={!selectedEventId || loading}
          >
            {loading ? "Suoritetaan..." : "Aja TeamBalancer"}
          </Button>

          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => {
              setGenerationSteps([]);
              setGeneratedTeams(null);
              setConsoleOutput([]);
              setPairings([]);
            }}
            disabled={loading}
          >
            Tyhjenna
          </Button>
        </Box>
      </Paper>

      {/* Pairings Display */}
      {pairings.length > 0 && (
        <Paper sx={{ p: 3, mb: 3, borderRadius: 2, bgcolor: "#fafafa" }}>
          <Typography
            variant="h6"
            gutterBottom
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              color: "primary.main",
            }}
          >
            Arvotut pelaajat jarjestyksessa ({pairings.length} arvontaa)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Algoritmi jakaa pelaajat pareittain: ensin puolustajat (P), sitten
            hyokkaajat kategorioittain (Cat 1, Cat 2, Cat 3), ja lopuksi
            maalivahdit (MV). Parempi pelaaja (+) jaetaan heikommalle
            joukkueelle, heikompi pelaaja (-) vahvemmalle.
            <Box component="span" sx={{ display: "flex", gap: 2, mt: 1 }}>
              <Chip
                label="+ Parempi"
                size="small"
                sx={{ bgcolor: "#4caf50", color: "white", fontWeight: "bold" }}
              />
              <Chip
                label="- Heikompi"
                size="small"
                sx={{ bgcolor: "#f44336", color: "white", fontWeight: "bold" }}
              />
            </Box>
          </Typography>

          <TableContainer component={Paper} elevation={2}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      bgcolor: "#424242",
                      color: "white",
                      fontWeight: "bold",
                      width: 40,
                      textAlign: "center",
                    }}
                  >
                    #
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: "#424242",
                      color: "white",
                      fontWeight: "bold",
                      width: 35,
                      textAlign: "center",
                    }}
                    title="Arvottu (sama kerroin)"
                  >
                    🎲
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: "#424242",
                      color: "white",
                      fontWeight: "bold",
                      width: 70,
                      textAlign: "center",
                    }}
                  >
                    Tyyppi
                  </TableCell>
                  <TableCell
                    colSpan={5}
                    sx={{
                      bgcolor: "#1976d2",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    {generatedTeams?.teams[0]?.name || "Joukkue A"}
                  </TableCell>
                  <TableCell
                    colSpan={5}
                    sx={{
                      bgcolor: "#d32f2f",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    {generatedTeams?.teams[1]?.name || "Joukkue B"}
                  </TableCell>
                </TableRow>
                <TableRow sx={{ bgcolor: "#f5f5f5" }}>
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell sx={{ fontWeight: "bold", textAlign: "center" }}>
                    Pelaaja
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold", textAlign: "center", width: 40 }}
                  >
                    Pos
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold", textAlign: "center", width: 40 }}
                  >
                    Cat
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold", textAlign: "center", width: 55 }}
                  >
                    Kerroin
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold", textAlign: "center", width: 55 }}
                  >
                    Avg
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold", textAlign: "center" }}>
                    Pelaaja
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold", textAlign: "center", width: 40 }}
                  >
                    Pos
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold", textAlign: "center", width: 40 }}
                  >
                    Cat
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold", textAlign: "center", width: 55 }}
                  >
                    Kerroin
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: "bold", textAlign: "center", width: 55 }}
                  >
                    Avg
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pairings.map((pair, index) => {
                  // Determine team names
                  const teamAName =
                    generatedTeams?.teams[0]?.name || "Joukkue A";

                  // Check which player goes to Team A
                  const isPlayer1TeamA =
                    pair.player1Team === teamAName ||
                    pair.player1Team.includes("A");
                  const isPlayer2TeamA =
                    pair.player2Team === teamAName ||
                    pair.player2Team.includes("A");

                  // Determine which player goes to which column
                  const teamAPlayer = isPlayer1TeamA
                    ? {
                        name: pair.player1Name,
                        multiplier: pair.player1Multiplier,
                        position: pair.player1Position,
                        category: pair.player1Category,
                        isBetter: true,
                      }
                    : pair.player2Name && isPlayer2TeamA
                      ? {
                          name: pair.player2Name,
                          multiplier: pair.player2Multiplier,
                          position: pair.player2Position,
                          category: pair.player2Category,
                          isBetter: false,
                        }
                      : null;

                  const teamBPlayer = !isPlayer1TeamA
                    ? {
                        name: pair.player1Name,
                        multiplier: pair.player1Multiplier,
                        position: pair.player1Position,
                        category: pair.player1Category,
                        isBetter: true,
                      }
                    : pair.player2Name && !isPlayer2TeamA
                      ? {
                          name: pair.player2Name,
                          multiplier: pair.player2Multiplier,
                          position: pair.player2Position,
                          category: pair.player2Category,
                          isBetter: false,
                        }
                      : null;

                  // Check if this is the last defender row before categories start
                  const isDefender = pair.reason === "P";
                  const nextPair = pairings[index + 1];
                  const isLastDefender =
                    isDefender && nextPair && nextPair.category > 0;

                  // Check if this is the last category row before goalkeepers
                  const isCategory = pair.category > 0;
                  const isLastCategory =
                    isCategory && nextPair && nextPair.reason === "MV";

                  // Border style for separator rows
                  const separatorBorderStyle = isLastDefender
                    ? "4px solid #1976d2"
                    : isLastCategory
                      ? "4px solid #4caf50"
                      : undefined;

                  return (
                    <TableRow
                      key={index}
                      sx={{ "&:hover": { bgcolor: "#f5f5f5" } }}
                    >
                      <TableCell
                        sx={{
                          fontWeight: "bold",
                          borderBottom: separatorBorderStyle,
                          textAlign: "center",
                        }}
                      >
                        {pair.pairNumber}
                      </TableCell>
                      <TableCell
                        sx={{
                          borderBottom: separatorBorderStyle,
                          textAlign: "center",
                          fontSize: "16px",
                        }}
                        title={
                          pair.wasRandomized ? "Arvottu (sama kerroin)" : ""
                        }
                      >
                        {pair.wasRandomized ? "🎲" : ""}
                      </TableCell>
                      <TableCell
                        sx={{
                          borderBottom: separatorBorderStyle,
                          textAlign: "center",
                        }}
                      >
                        {pair.category > 0 ? (
                          <Chip label="H" size="small" color="primary" />
                        ) : (
                          <Chip
                            label={pair.reason}
                            size="small"
                            variant="outlined"
                          />
                        )}
                      </TableCell>
                      {/* Team A column */}
                      <TableCell
                        sx={{
                          bgcolor: "#e3f2fd",
                          borderLeft: "4px solid #1976d2",
                          borderBottom: separatorBorderStyle,
                        }}
                      >
                        {teamAPlayer ? (
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5,
                            }}
                          >
                            <Typography
                              component="span"
                              sx={{
                                fontWeight: "bold",
                                fontSize: "14px",
                                color: teamAPlayer.isBetter
                                  ? "#4caf50"
                                  : "#f44336",
                              }}
                            >
                              {teamAPlayer.isBetter ? "+" : "-"}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: teamAPlayer.isBetter ? 600 : 400,
                              }}
                            >
                              {teamAPlayer.name}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: "#e3f2fd",
                          borderBottom: separatorBorderStyle,
                          textAlign: "center",
                          fontSize: "11px",
                        }}
                      >
                        {teamAPlayer ? teamAPlayer.position : "-"}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: "#e3f2fd",
                          borderBottom: separatorBorderStyle,
                          textAlign: "center",
                          fontSize: "11px",
                        }}
                      >
                        {teamAPlayer ? teamAPlayer.category : "-"}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: "#e3f2fd",
                          borderBottom: separatorBorderStyle,
                          textAlign: "center",
                          fontFamily: "monospace",
                          fontSize: "11px",
                        }}
                      >
                        {teamAPlayer ? teamAPlayer.multiplier.toFixed(3) : "-"}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: "#e3f2fd",
                          borderBottom: separatorBorderStyle,
                          textAlign: "center",
                          fontFamily: "monospace",
                          fontSize: "11px",
                          fontWeight: "bold",
                        }}
                      >
                        {pair.avgA?.toFixed(3) || "-"}
                      </TableCell>
                      {/* Team B column */}
                      <TableCell
                        sx={{
                          bgcolor: "#ffebee",
                          borderLeft: "4px solid #d32f2f",
                          borderBottom: separatorBorderStyle,
                        }}
                      >
                        {teamBPlayer ? (
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5,
                            }}
                          >
                            <Typography
                              component="span"
                              sx={{
                                fontWeight: "bold",
                                fontSize: "14px",
                                color: teamBPlayer.isBetter
                                  ? "#4caf50"
                                  : "#f44336",
                              }}
                            >
                              {teamBPlayer.isBetter ? "+" : "-"}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: teamBPlayer.isBetter ? 600 : 400,
                              }}
                            >
                              {teamBPlayer.name}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: "#ffebee",
                          borderBottom: separatorBorderStyle,
                          textAlign: "center",
                          fontSize: "11px",
                        }}
                      >
                        {teamBPlayer ? teamBPlayer.position : "-"}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: "#ffebee",
                          borderBottom: separatorBorderStyle,
                          textAlign: "center",
                          fontSize: "11px",
                        }}
                      >
                        {teamBPlayer ? teamBPlayer.category : "-"}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: "#ffebee",
                          borderBottom: separatorBorderStyle,
                          textAlign: "center",
                          fontFamily: "monospace",
                          fontSize: "11px",
                        }}
                      >
                        {teamBPlayer ? teamBPlayer.multiplier.toFixed(3) : "-"}
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: "#ffebee",
                          borderBottom: separatorBorderStyle,
                          textAlign: "center",
                          fontFamily: "monospace",
                          fontSize: "11px",
                          fontWeight: "bold",
                        }}
                      >
                        {pair.avgB?.toFixed(3) || "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Generation Steps */}
      {generationSteps.length > 0 && (
        <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
          <Typography
            variant="h6"
            gutterBottom
            sx={{ display: "flex", alignItems: "center", gap: 1 }}
          >
            Algoritmin vaiheet
          </Typography>

          {generationSteps.map((step, index) => (
            <Accordion
              key={index}
              defaultExpanded={index === generationSteps.length - 1}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Chip
                    label={`Vaihe ${step.step}`}
                    color={
                      index === generationSteps.length - 1
                        ? "success"
                        : "primary"
                    }
                    size="small"
                  />
                  <Typography fontWeight="medium">{step.title}</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" color="text.secondary">
                  {step.description}
                </Typography>
                {step.data && (
                  <Box
                    sx={{
                      mt: 2,
                      p: 2,
                      bgcolor: "#f5f5f5",
                      borderRadius: 1,
                      fontFamily: "monospace",
                      fontSize: "12px",
                    }}
                  >
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                      {JSON.stringify(step.data, null, 2)}
                    </pre>
                  </Box>
                )}
              </AccordionDetails>
            </Accordion>
          ))}
        </Paper>
      )}

      {/* Generated Teams */}
      {generatedTeams && (
        <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
          <Typography variant="h6" gutterBottom>
            Luodut joukkueet
          </Typography>

          <Alert
            severity={generatedTeams.balanceScore >= 90 ? "success" : "warning"}
            sx={{ mb: 2 }}
          >
            Tasapainoindeksi: {generatedTeams.balanceScore}%
            {generatedTeams.balanceScore >= 95 && " - Erinomainen tasapaino!"}
            {generatedTeams.balanceScore >= 90 &&
              generatedTeams.balanceScore < 95 &&
              " - Hyva tasapaino"}
            {generatedTeams.balanceScore < 90 && " - Joukkueet epabalansissa"}
          </Alert>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 3,
            }}
          >
            {generatedTeams.teams.map((team, teamIndex) => (
              <Card
                key={teamIndex}
                elevation={3}
                sx={{
                  bgcolor: teamIndex === 0 ? "#e3f2fd" : "#ffebee",
                  borderTop: `4px solid ${teamIndex === 0 ? "#1976d2" : "#d32f2f"}`,
                }}
              >
                <CardContent>
                  <Typography
                    variant="h6"
                    gutterBottom
                    sx={{
                      color: teamIndex === 0 ? "#1976d2" : "#d32f2f",
                    }}
                  >
                    {team.name} ({team.players.length} pelaajaa)
                  </Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    Kokonaispisteet: {team.totalPoints.toFixed(2)}
                  </Typography>
                  <Divider sx={{ my: 1 }} />

                  {/* List all players sorted by multiplier, goalkeepers last */}
                  <Box
                    sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
                  >
                    {[...team.players]
                      .sort((a, b) => {
                        // Goalkeepers go last
                        if (a.position === "MV" && b.position !== "MV")
                          return 1;
                        if (a.position !== "MV" && b.position === "MV")
                          return -1;
                        // Then sort by multiplier (lowest first = best)
                        return a.multiplier - b.multiplier;
                      })
                      .map((player, idx) => (
                        <Box
                          key={idx}
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            py: 0.25,
                            borderBottom:
                              player.position === "MV" &&
                              idx ===
                                team.players.filter((p) => p.position !== "MV")
                                  .length
                                ? "1px dashed #ccc"
                                : "none",
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: player.category === 1 ? 600 : 400,
                              color:
                                player.position === "MV" ? "#666" : "inherit",
                            }}
                          >
                            {player.name}
                          </Typography>
                          <Box
                            sx={{
                              display: "flex",
                              gap: 1,
                              alignItems: "center",
                            }}
                          >
                            <Chip
                              label={`Cat ${player.category}`}
                              size="small"
                              color={
                                player.category === 1
                                  ? "error"
                                  : player.category === 2
                                    ? "warning"
                                    : "success"
                              }
                              sx={{
                                minWidth: 55,
                                height: 20,
                                fontSize: "11px",
                              }}
                            />
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: "monospace",
                                fontSize: "12px",
                                minWidth: 50,
                                textAlign: "right",
                              }}
                            >
                              {player.multiplier.toFixed(3)}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Paper>
      )}

      {/* Console Output */}
      {consoleOutput.length > 0 && (
        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 2,
            }}
          >
            <Typography variant="h6">Konsolitulosteet</Typography>
            <Tooltip title="Kopioi leikepoydale">
              <IconButton onClick={copyConsoleOutput}>
                <ContentCopyIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <Box
            sx={{
              bgcolor: "#1e1e1e",
              color: "#d4d4d4",
              p: 2,
              borderRadius: 1,
              maxHeight: 400,
              overflow: "auto",
              fontFamily: "monospace",
              fontSize: "12px",
            }}
          >
            {consoleOutput.map((line, idx) => (
              <Box
                key={idx}
                sx={{
                  py: 0.25,
                  color: line.includes("Error")
                    ? "#f48771"
                    : line.includes("->")
                      ? "#9cdcfe"
                      : line.includes("BALANCE")
                        ? "#4ec9b0"
                        : "#d4d4d4",
                }}
              >
                {line}
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2000}
        onClose={() => setSnackbarOpen(false)}
        message="Kopioitu leikepoydale"
      />
    </Box>
  );
}
