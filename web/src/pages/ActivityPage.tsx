import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  Divider,
  Alert,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import {
  Info as InfoIcon,
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
} from "@mui/icons-material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { fi } from "date-fns/locale";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../services/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import type { Event, Team, User } from "../types";

interface PlayerActivity {
  id: string;
  userId: string;
  name: string;
  email: string;
  teamName: string;
  totalEvents: number;
  attendedEvents: Event[];
}

export default function ActivityPage() {
  const { user: authUser, userData } = useAuth();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activities, setActivities] = useState<PlayerActivity[]>([]);

  // Filters
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | null>(
    new Date(new Date().getFullYear(), 0, 1) // Start of current year
  );
  const [endDate, setEndDate] = useState<Date | null>(new Date());

  // Modal
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerActivity | null>(
    null
  );
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (events.length > 0 && users.length > 0) {
      calculateActivities();
    }
  }, [events, users, selectedTeam, startDate, endDate]);

  const fetchData = async () => {
    if (!authUser) return;

    setLoading(true);
    try {
      // Fetch teams
      const teamsSnapshot = await getDocs(collection(db, "teams"));
      const teamsData = teamsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Team[];
      setTeams(teamsData);

      // Fetch users
      const usersSnapshot = await getDocs(collection(db, "users"));
      const usersData = usersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as User[];
      setUsers(usersData);

      // Fetch events based on user role
      let eventsQuery;
      if (userData?.isMasterAdmin) {
        eventsQuery = collection(db, "events");
      } else {
        const userTeamIds = userData?.teamIds || [];
        if (userTeamIds.length === 0) {
          setEvents([]);
          setLoading(false);
          return;
        }
        eventsQuery = query(
          collection(db, "events"),
          where("teamId", "in", userTeamIds)
        );
      }

      const eventsSnapshot = await getDocs(eventsQuery);
      const eventsData = eventsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Event[];

      setEvents(eventsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateActivities = () => {
    // Filter events by team and date range
    let filteredEvents = events.filter((event) => {
      // Team filter
      if (selectedTeam !== "all" && event.teamId !== selectedTeam) {
        return false;
      }

      // Date filter
      const eventDate = new Date(event.date);
      if (startDate && eventDate < startDate) {
        return false;
      }
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        if (eventDate > endOfDay) {
          return false;
        }
      }

      return true;
    });

    // Calculate activity for each user
    const activityMap = new Map<string, PlayerActivity>();

    filteredEvents.forEach((event) => {
      const registeredPlayers = event.registeredPlayers || [];

      registeredPlayers.forEach((playerId) => {
        const user = users.find((u) => u.id === playerId);
        if (!user) return;

        // Filter by team if needed
        if (selectedTeam !== "all") {
          if (!user.teamIds?.includes(selectedTeam)) {
            return;
          }
        }

        if (!activityMap.has(playerId)) {
          const team = teams.find((t) => t.id === event.teamId);
          activityMap.set(playerId, {
            id: playerId,
            userId: playerId,
            name: user.name || "Nimetön",
            email: user.email || "",
            teamName: team?.name || "Tuntematon",
            totalEvents: 0,
            attendedEvents: [],
          });
        }

        const activity = activityMap.get(playerId)!;
        activity.totalEvents += 1;
        activity.attendedEvents.push(event);
      });
    });

    // Convert to array and sort by total events (descending)
    const activitiesArray = Array.from(activityMap.values()).sort(
      (a, b) => b.totalEvents - a.totalEvents
    );

    setActivities(activitiesArray);
  };

  const getTeamName = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    return team ? team.name : teamId;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("fi-FI");
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("fi-FI", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleViewDetails = (activity: PlayerActivity) => {
    setSelectedPlayer(activity);
    setDetailsOpen(true);
    setCopySuccess(false);
  };

  const handleCopyToClipboard = () => {
    if (!selectedPlayer) return;

    // Sort events by date
    const sortedEvents = [...selectedPlayer.attendedEvents].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Format data for billing
    const billingText = `Pelaaja: ${selectedPlayer.name}
Email: ${selectedPlayer.email}
Joukkue: ${selectedPlayer.teamName}
Yhteensä käyntejä: ${selectedPlayer.totalEvents}

Käynnit:
${sortedEvents
  .map(
    (event, index) =>
      `${index + 1}. ${formatDate(event.date)} ${formatTime(event.date)} - ${
        event.title
      } (${event.location || "Ei sijaintia"})`
  )
  .join("\n")}

Aikaväli: ${startDate ? formatDate(startDate.toISOString()) : "Alusta"} - ${
      endDate ? formatDate(endDate.toISOString()) : "Loppuun"
    }`;

    navigator.clipboard.writeText(billingText).then(
      () => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 3000);
      },
      (err) => {
        console.error("Kopiointi epäonnistui:", err);
      }
    );
  };

  const columns: GridColDef[] = [
    {
      field: "name",
      headerName: "Nimi",
      width: 200,
      sortable: true,
    },
    {
      field: "email",
      headerName: "Sähköposti",
      width: 250,
      sortable: true,
    },
    {
      field: "teamName",
      headerName: "Joukkue",
      width: 150,
      sortable: true,
    },
    {
      field: "totalEvents",
      headerName: "Käynnit",
      width: 120,
      sortable: true,
      type: "number",
    },
    {
      field: "actions",
      headerName: "Toiminnot",
      width: 100,
      sortable: false,
      renderCell: (params) => (
        <IconButton
          onClick={() => handleViewDetails(params.row as PlayerActivity)}
          title="Näytä tiedot"
        >
          <InfoIcon />
        </IconButton>
      ),
    },
  ];

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={fi}>
      <Box>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={3}
        >
          <Typography variant="h4">Aktiivisuus</Typography>
          <IconButton onClick={fetchData} title="Päivitä">
            <RefreshIcon />
          </IconButton>
        </Box>

        {/* Filters */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box display="flex" gap={2} flexWrap="wrap">
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Joukkue</InputLabel>
              <Select
                value={selectedTeam}
                label="Joukkue"
                onChange={(e) => setSelectedTeam(e.target.value)}
              >
                <MenuItem value="all">Kaikki joukkueet</MenuItem>
                {teams.map((team) => (
                  <MenuItem key={team.id} value={team.id}>
                    {team.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <DatePicker
              label="Alkupäivä"
              value={startDate}
              onChange={(newValue) => setStartDate(newValue)}
              slotProps={{
                textField: { sx: { minWidth: 200 } },
              }}
            />

            <DatePicker
              label="Loppupäivä"
              value={endDate}
              onChange={(newValue) => setEndDate(newValue)}
              slotProps={{
                textField: { sx: { minWidth: 200 } },
              }}
            />
          </Box>

          <Box mt={2}>
            <Typography variant="body2" color="text.secondary">
              Näytetään {activities.length} pelaajaa
            </Typography>
          </Box>
        </Paper>

        {/* Data Grid */}
        <DataGrid
          rows={activities}
          columns={columns}
          loading={loading}
          autoHeight
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
            sorting: {
              sortModel: [{ field: "totalEvents", sort: "desc" }],
            },
          }}
        />

        {/* Details Modal */}
        <Dialog
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            Käyntitiedot - {selectedPlayer?.name}
            {copySuccess && (
              <Alert severity="success" sx={{ mt: 2 }}>
                Kopioitu leikepöydälle!
              </Alert>
            )}
          </DialogTitle>
          <DialogContent>
            {selectedPlayer && (
              <>
                <Box mb={2}>
                  <Typography variant="body1">
                    <strong>Sähköposti:</strong> {selectedPlayer.email}
                  </Typography>
                  <Typography variant="body1">
                    <strong>Joukkue:</strong> {selectedPlayer.teamName}
                  </Typography>
                  <Typography variant="body1">
                    <strong>Yhteensä käyntejä:</strong>{" "}
                    {selectedPlayer.totalEvents}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" mt={1}>
                    Aikaväli:{" "}
                    {startDate ? formatDate(startDate.toISOString()) : "Alusta"}{" "}
                    - {endDate ? formatDate(endDate.toISOString()) : "Loppuun"}
                  </Typography>
                </Box>

                <Divider sx={{ my: 2 }} />

                <Typography variant="h6" gutterBottom>
                  Käynnit ({selectedPlayer.attendedEvents.length})
                </Typography>

                <List sx={{ maxHeight: 400, overflow: "auto" }}>
                  {[...selectedPlayer.attendedEvents]
                    .sort(
                      (a, b) =>
                        new Date(a.date).getTime() - new Date(b.date).getTime()
                    )
                    .map((event, index) => (
                      <ListItem key={event.id} divider>
                        <ListItemText
                          primary={`${index + 1}. ${event.title}`}
                          secondary={
                            <>
                              <Typography
                                component="span"
                                variant="body2"
                                color="text.primary"
                              >
                                {formatDate(event.date)}{" "}
                                {formatTime(event.date)}
                              </Typography>
                              {" — "}
                              {event.location || "Ei sijaintia"}
                              {" — "}
                              {getTeamName(event.teamId)}
                            </>
                          }
                        />
                      </ListItem>
                    ))}
                </List>
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              startIcon={<CopyIcon />}
              onClick={handleCopyToClipboard}
              variant="contained"
              color="primary"
            >
              Kopioi laskutusta varten
            </Button>
            <Button onClick={() => setDetailsOpen(false)}>Sulje</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
}
