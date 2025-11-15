import { useState, useEffect } from "react";
import {
  Box,
  Button,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Chip,
  Tab,
  Tabs,
  List,
  ListItem,
  ListItemText,
  Paper,
  Alert,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  Replay as ReplayIcon,
  FileDownload as FileDownloadIcon,
  Add as AddIcon,
} from "@mui/icons-material";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../services/firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  arrayUnion,
} from "firebase/firestore";
import type { Event, Team, User } from "../types";
import ColumnSelector from "../components/ColumnSelector";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`event-tabpanel-${index}`}
      aria-labelledby={`event-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function EventsPage() {
  const { user: authUser, userData } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<"all" | "upcoming" | "past">(
    "all"
  );

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem("eventsPage-visibleColumns");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Add 'details' if it's not in the saved list (for existing users)
      if (!parsed.includes("details")) {
        // Insert 'details' before 'actions'
        const actionsIndex = parsed.indexOf("actions");
        if (actionsIndex !== -1) {
          parsed.splice(actionsIndex, 0, "details");
        } else {
          parsed.push("details");
        }
      }
      return parsed;
    }
    return [
      "date",
      "time",
      "title",
      "location",
      "teamName",
      "registeredCount",
      "reserveCount",
      "teamsGenerated",
      "details",
      "actions",
    ];
  });

  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem("eventsPage-columnOrder");
    if (saved) {
      return JSON.parse(saved);
    }
    return []; // Empty means use default order
  });

  // Modals
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [tabValue, setTabValue] = useState(0);

  // Edit form
  const [editForm, setEditForm] = useState({
    title: "",
    date: "",
    location: "",
    duration: 60,
    description: "",
    maxPlayers: 20,
    maxGoalkeepers: 2,
  });

  // Create form
  const [createForm, setCreateForm] = useState({
    title: "",
    teamId: "",
    date: "",
    time: "18:00",
    location: "",
    duration: 60,
    description: "",
    maxPlayers: 20,
    maxGoalkeepers: 2,
  });

  useEffect(() => {
    localStorage.setItem(
      "eventsPage-visibleColumns",
      JSON.stringify(visibleColumns)
    );
  }, [visibleColumns]);

  useEffect(() => {
    localStorage.setItem("eventsPage-columnOrder", JSON.stringify(columnOrder));
  }, [columnOrder]);

  useEffect(() => {
    fetchData();
  }, []);

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

      // Fetch events - filter based on user role
      let eventsQuery;
      if (userData?.isMasterAdmin) {
        // Master Admin sees all events
        eventsQuery = collection(db, "events");
      } else {
        // Regular admin sees only their team's events
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

  const isPastEvent = (dateString: string) => {
    return new Date(dateString) < new Date();
  };

  const filteredEvents = events.filter((event) => {
    // Team filter
    if (selectedTeam !== "all" && event.teamId !== selectedTeam) {
      return false;
    }

    // Date filter
    if (dateFilter === "upcoming" && isPastEvent(event.date)) {
      return false;
    }
    if (dateFilter === "past" && !isPastEvent(event.date)) {
      return false;
    }

    return true;
  });

  const columns: GridColDef[] = [
    {
      field: "date",
      headerName: "Päivä",
      width: 120,
      valueGetter: (_value, row) => formatDate(row.date),
    },
    {
      field: "time",
      headerName: "Aika",
      width: 80,
      valueGetter: (_value, row) => formatTime(row.date),
    },
    {
      field: "title",
      headerName: "Otsikko",
      width: 200,
    },
    {
      field: "location",
      headerName: "Paikka",
      width: 150,
    },
    {
      field: "teamName",
      headerName: "Joukkue",
      width: 150,
      valueGetter: (_value, row) => getTeamName(row.teamId),
    },
    {
      field: "registeredCount",
      headerName: "Ilmoittautuneita",
      width: 150,
      renderCell: (params) => {
        const count = params.row.registeredPlayers?.length || 0;
        const maxPlayers = params.row.maxPlayers || 0;
        const maxGoalkeepers = params.row.maxGoalkeepers || 0;
        const totalMax = maxPlayers + maxGoalkeepers;
        return (
          <Chip
            label={`${count}/${totalMax}`}
            size="small"
            color={
              count >= totalMax ? "success" : count > 0 ? "primary" : "default"
            }
          />
        );
      },
    },
    {
      field: "reserveCount",
      headerName: "Varalla",
      width: 100,
      renderCell: (params) => {
        const count = params.row.reservePlayers?.length || 0;
        return (
          <Chip
            label={count.toString()}
            size="small"
            color={count > 0 ? "warning" : "default"}
          />
        );
      },
    },
    {
      field: "teamsGenerated",
      headerName: "Joukkueet luotu",
      width: 150,
      renderCell: (params) => {
        const hasTeams = params.row.generatedTeams?.teams?.length > 0;
        return (
          <Chip
            label={hasTeams ? "Kyllä" : "Ei"}
            size="small"
            color={hasTeams ? "success" : "default"}
          />
        );
      },
    },
    {
      field: "details",
      headerName: "Tiedot",
      width: 120,
      sortable: false,
      renderCell: (params) => (
        <Button
          variant="outlined"
          size="small"
          startIcon={<InfoIcon />}
          onClick={() => handleOpenDetails(params.row)}
          sx={{ whiteSpace: "nowrap" }}
        >
          Avaa
        </Button>
      ),
    },
    {
      field: "actions",
      headerName: "Toiminnot",
      width: 120,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={() => handleOpenEdit(params.row)}
            title="Muokkaa"
          >
            <EditIcon />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleOpenDelete(params.row)}
            title="Poista"
            color="error"
          >
            <DeleteIcon />
          </IconButton>
        </Box>
      ),
    },
  ];

  const handleOpenDetails = (event: Event) => {
    setSelectedEvent(event);
    setTabValue(0);
    setDetailsOpen(true);
  };

  const handleOpenEdit = (event: Event) => {
    setSelectedEvent(event);
    setEditForm({
      title: event.title,
      date: event.date.slice(0, 16), // Format for datetime-local input
      location: event.location,
      duration: event.duration,
      description: event.description || "",
      maxPlayers: event.maxPlayers,
      maxGoalkeepers: event.maxGoalkeepers,
    });
    setEditOpen(true);
  };

  const handleOpenDelete = (event: Event) => {
    setSelectedEvent(event);
    setDeleteOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedEvent) return;

    try {
      await updateDoc(doc(db, "events", selectedEvent.id), {
        title: editForm.title,
        date: new Date(editForm.date).toISOString(),
        location: editForm.location,
        duration: editForm.duration,
        description: editForm.description,
        maxPlayers: editForm.maxPlayers,
        maxGoalkeepers: editForm.maxGoalkeepers,
      });
      setEditOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error updating event:", error);
    }
  };

  const handleDelete = async () => {
    if (!selectedEvent) return;

    try {
      await deleteDoc(doc(db, "events", selectedEvent.id));
      setDeleteOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error deleting event:", error);
    }
  };

  const handleRemovePlayer = async (playerId: string) => {
    if (!selectedEvent) return;

    try {
      // Check if player is in registered or reserve list
      const isInRegistered =
        selectedEvent.registeredPlayers?.includes(playerId);
      const isInReserve = selectedEvent.reservePlayers?.includes(playerId);

      if (isInRegistered) {
        const updatedPlayers = selectedEvent.registeredPlayers.filter(
          (id) => id !== playerId
        );
        await updateDoc(doc(db, "events", selectedEvent.id), {
          registeredPlayers: updatedPlayers,
        });
        setSelectedEvent({
          ...selectedEvent,
          registeredPlayers: updatedPlayers,
        });
      } else if (isInReserve) {
        const updatedReserves = (selectedEvent.reservePlayers || []).filter(
          (id) => id !== playerId
        );
        await updateDoc(doc(db, "events", selectedEvent.id), {
          reservePlayers: updatedReserves,
        });
        setSelectedEvent({
          ...selectedEvent,
          reservePlayers: updatedReserves,
        });
      }

      fetchData();
    } catch (error) {
      console.error("Error removing player:", error);
    }
  };

  const handleOpenAddPlayer = () => {
    setSelectedPlayers([]);
    setAddPlayerOpen(true);
  };

  const handleTogglePlayerSelection = (playerId: string) => {
    setSelectedPlayers((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  };

  const handleAddSelectedPlayers = async () => {
    if (!selectedEvent || selectedPlayers.length === 0) return;

    try {
      // Get team settings for guest registration hours
      const team = teams.find((t) => t.id === selectedEvent.teamId);
      const guestRegistrationHours = team?.guestRegistrationHours || 24;

      // Calculate hours until event
      const now = new Date();
      const eventDate = new Date(selectedEvent.date);
      const hoursUntilEvent =
        (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Process each selected player
      for (const playerId of selectedPlayers) {
        // Check if player is already registered
        if (
          selectedEvent.registeredPlayers?.includes(playerId) ||
          selectedEvent.reservePlayers?.includes(playerId)
        ) {
          continue;
        }

        // Get player info to check positions
        const player = users.find((u) => u.id === playerId);
        if (!player) continue;

        // Check if player is a team member
        const isTeamMember =
          player.teamMember?.[selectedEvent.teamId || ""] === true;

        // Check if player needs role selection (has MV + (H and/or P))
        const hasMV = player.positions.includes("MV");
        const hasH = player.positions.includes("H");
        const hasP = player.positions.includes("P");
        const needsRoleSelection = hasMV && (hasH || hasP);

        let selectedRole: string | undefined;

        if (needsRoleSelection) {
          // Show role selection dialog
          const roles = ["MV"];
          if (hasH) roles.push("H");
          if (hasP) roles.push("P");

          const role = window.prompt(
            `${player.name} voi pelata useammalla paikalla: ${roles.join(
              ", "
            )}.\n\nValitse rooli tälle tapahtumalle:`,
            "MV"
          );

          if (!role || !roles.includes(role.toUpperCase())) {
            continue; // Skip this player
          }

          selectedRole = role.toUpperCase();
        }

        // Determine if player is a goalkeeper for this event
        const isGoalkeeper =
          selectedRole === "MV" ||
          (!selectedRole && player.positions.includes("MV"));

        // Get current counts
        const currentRegistered = selectedEvent.registeredPlayers || [];

        // Count field players and goalkeepers (checking playerRoles if available)
        const fieldPlayerCount = currentRegistered.filter((id) => {
          const playerRole = selectedEvent.playerRoles?.[id];
          if (playerRole) {
            return ["H", "P"].includes(playerRole);
          }
          const p = users.find((u) => u.id === id);
          return p && !p.positions.includes("MV");
        }).length;

        const goalkeeperCount = currentRegistered.filter((id) => {
          const playerRole = selectedEvent.playerRoles?.[id];
          if (playerRole) {
            return playerRole === "MV";
          }
          const p = users.find((u) => u.id === id);
          return p && p.positions.includes("MV");
        }).length;

        // Check if event is full based on player position
        const isEventFull = isGoalkeeper
          ? selectedEvent.maxGoalkeepers &&
            goalkeeperCount >= selectedEvent.maxGoalkeepers
          : fieldPlayerCount >= selectedEvent.maxPlayers;

        // Determine if player should go to reserve list
        const shouldBeReserve =
          !isTeamMember && hoursUntilEvent > guestRegistrationHours;

        if (shouldBeReserve || isEventFull) {
          // Add to reserve list
          await updateDoc(doc(db, "events", selectedEvent.id), {
            reservePlayers: arrayUnion(playerId),
            ...(selectedRole && {
              [`playerRoles.${playerId}`]: selectedRole,
            }),
          });
        } else {
          // Add to main list
          await updateDoc(doc(db, "events", selectedEvent.id), {
            registeredPlayers: arrayUnion(playerId),
            ...(selectedRole && {
              [`playerRoles.${playerId}`]: selectedRole,
            }),
          });
        }
      }

      // Refresh data and update selectedEvent
      await fetchData();

      // Fetch updated event data to refresh the modal
      if (selectedEvent) {
        const eventDoc = await getDoc(doc(db, "events", selectedEvent.id));
        if (eventDoc.exists()) {
          setSelectedEvent({
            id: eventDoc.id,
            ...eventDoc.data(),
          } as Event);
        }
      }

      setAddPlayerOpen(false);
      setSelectedPlayers([]);
    } catch (error) {
      console.error("Error adding players:", error);
      alert("Pelaajien lisääminen epäonnistui");
    }
  };

  const handleRegenerateTeams = async () => {
    // TODO: Implement team regeneration logic
    alert("Joukkueiden uudelleenluonti tulossa pian!");
  };

  const handleExportTeams = () => {
    // TODO: Implement export logic
    alert("Export-toiminto tulossa pian!");
  };

  const handleOpenCreateModal = async () => {
    if (selectedTeam === "all" || !selectedTeam) {
      alert("Valitse joukkue ensin");
      return;
    }

    try {
      // Fetch team settings (document ID format: team-{teamId})
      const settingsDocId = `team-${selectedTeam}`;
      const settingsDoc = await getDoc(doc(db, "settings", settingsDocId));

      console.log("Fetching settings for team:", selectedTeam);
      console.log("Settings doc ID:", settingsDocId);
      console.log("Settings doc exists:", settingsDoc.exists());

      if (settingsDoc.exists()) {
        const settings = settingsDoc.data();
        console.log("Settings data:", settings);
        console.log("defaultTitle:", settings.defaultTitle);
        const today = new Date().toISOString().split("T")[0];

        // Pre-fill form with team defaults
        setCreateForm({
          title: settings.defaultTitle || "",
          teamId: selectedTeam,
          date: today,
          time: settings.defaultTime || "18:00",
          location: settings.defaultLocation || "",
          duration: settings.eventDuration || 60,
          description: "",
          maxPlayers: settings.maxPlayers || 20,
          maxGoalkeepers: settings.maxGoalkeepers || 2,
        });
      } else {
        // No settings found, use defaults
        const today = new Date().toISOString().split("T")[0];
        setCreateForm({
          title: "",
          teamId: selectedTeam,
          date: today,
          time: "18:00",
          location: "",
          duration: 60,
          description: "",
          maxPlayers: 20,
          maxGoalkeepers: 2,
        });
      }

      setCreateOpen(true);
    } catch (error) {
      console.error("Error fetching team settings:", error);
      // Still open modal with defaults
      const today = new Date().toISOString().split("T")[0];
      setCreateForm({
        title: "",
        teamId: selectedTeam,
        date: today,
        time: "18:00",
        location: "",
        duration: 60,
        description: "",
        maxPlayers: 20,
        maxGoalkeepers: 2,
      });
      setCreateOpen(true);
    }
  };

  const handleCreateEvent = async () => {
    if (
      !authUser ||
      !createForm.title ||
      !createForm.teamId ||
      !createForm.date
    ) {
      alert("Täytä pakolliset kentät (Nimi, Joukkue, Päivämäärä)");
      return;
    }

    try {
      // Combine date and time
      const [hours, minutes] = createForm.time.split(":");
      const eventDateTime = new Date(createForm.date);
      eventDateTime.setHours(parseInt(hours), parseInt(minutes));

      const eventData = {
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        location: createForm.location.trim(),
        date: eventDateTime.toISOString(),
        duration: createForm.duration,
        maxPlayers: createForm.maxPlayers,
        maxGoalkeepers: createForm.maxGoalkeepers,
        teamId: createForm.teamId,
        createdBy: authUser.uid,
        createdAt: new Date().toISOString(),
        registeredPlayers: [],
        reservePlayers: [],
      };

      await addDoc(collection(db, "events"), eventData);

      // Reset form
      setCreateForm({
        title: "",
        teamId: "",
        date: "",
        time: "18:00",
        location: "",
        duration: 60,
        description: "",
        maxPlayers: 20,
        maxGoalkeepers: 2,
      });

      setCreateOpen(false);
      fetchData();
      alert("Tapahtuma luotu onnistuneesti!");
    } catch (error) {
      console.error("Error creating event:", error);
      alert("Tapahtuman luominen epäonnistui");
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h4">Tapahtumat</Typography>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          {selectedTeam !== "all" && (
            <Button
              variant="contained"
              color="primary"
              onClick={handleOpenCreateModal}
            >
              Luo tapahtuma
            </Button>
          )}
          <FormControl size="small" sx={{ minWidth: 200 }}>
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

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Aikaväli</InputLabel>
            <Select
              value={dateFilter}
              label="Aikaväli"
              onChange={(e) => setDateFilter(e.target.value as any)}
            >
              <MenuItem value="all">Kaikki</MenuItem>
              <MenuItem value="upcoming">Tulevat</MenuItem>
              <MenuItem value="past">Menneet</MenuItem>
            </Select>
          </FormControl>

          <ColumnSelector
            columns={columns.map((col) => ({
              field: col.field,
              headerName: col.headerName || col.field,
            }))}
            visibleColumns={visibleColumns}
            columnOrder={columnOrder}
            onColumnVisibilityChange={(field, visible) => {
              if (visible) {
                setVisibleColumns([...visibleColumns, field]);
              } else {
                setVisibleColumns(visibleColumns.filter((f) => f !== field));
              }
            }}
            onColumnOrderChange={(newOrder) => setColumnOrder(newOrder)}
            onSelectAll={() =>
              setVisibleColumns(columns.map((col) => col.field))
            }
            onDeselectAll={() => setVisibleColumns(["actions"])}
          />

          <IconButton onClick={fetchData} title="Päivitä">
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      <DataGrid
        rows={filteredEvents}
        columns={
          // Order columns based on columnOrder state
          (columnOrder.length > 0
            ? columnOrder
                .map((field) => columns.find((col) => col.field === field))
                .filter(Boolean)
            : columns
          ).filter((col) => visibleColumns.includes(col!.field)) as GridColDef[]
        }
        loading={loading}
        pageSizeOptions={[25, 50, 100]}
        initialState={{
          pagination: { paginationModel: { pageSize: 25 } },
          columns: {
            columnVisibilityModel: visibleColumns.reduce(
              (acc, field) => ({ ...acc, [field]: true }),
              {}
            ),
          },
        }}
        disableRowSelectionOnClick
        autoHeight
        sx={{ height: "calc(100vh - 200px)" }}
      />

      {/* Details Modal */}
      <Dialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {selectedEvent?.title}
          <Typography variant="body2" color="text.secondary">
            {selectedEvent && formatDate(selectedEvent.date)} klo{" "}
            {selectedEvent && formatTime(selectedEvent.date)} |{" "}
            {selectedEvent?.location}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Tabs value={tabValue} onChange={(_e, v) => setTabValue(v)}>
            <Tab label="Ilmoittautuneet" />
            <Tab label="Joukkueet" />
            <Tab label="Export" />
          </Tabs>

          <TabPanel value={tabValue} index={0}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 2,
              }}
            >
              <Typography variant="h6">
                Ilmoittautuneet ({selectedEvent?.registeredPlayers?.length || 0}
                )
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleOpenAddPlayer}
                size="small"
              >
                Lisää pelaaja
              </Button>
            </Box>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 2,
              }}
            >
              {selectedEvent?.registeredPlayers.map((playerId) => {
                const playerUser = users.find((u) => u.id === playerId);
                // Get the role selected for THIS event from playerRoles, or fallback to user's positions
                const eventRole = selectedEvent.playerRoles?.[playerId];
                const userPositions = playerUser?.positions || [];

                // Determine role color and label
                // Colors: Maalivahti=Orange, Hyökkääjä=Blue, Puolustaja=Red, H+P=Green
                const getRoleInfo = () => {
                  // If event role is set, use it
                  if (eventRole === "MV") {
                    return { label: "MV", color: "warning" as const }; // Orange
                  } else if (eventRole === "H") {
                    return { label: "H", color: "primary" as const }; // Blue
                  } else if (eventRole === "P") {
                    return { label: "P", color: "error" as const }; // Red
                  }

                  // No event role set, check user's positions
                  const hasH = userPositions.includes("H");
                  const hasP = userPositions.includes("P");
                  const hasMV = userPositions.includes("MV");

                  if (hasMV) {
                    return { label: "MV", color: "warning" as const }; // Orange
                  } else if (hasH && hasP) {
                    return {
                      label: "H/P",
                      color: "success" as const,
                    }; // Green
                  } else if (hasH) {
                    return { label: "H", color: "primary" as const }; // Blue
                  } else if (hasP) {
                    return { label: "P", color: "error" as const }; // Red
                  }

                  return null;
                };

                const roleInfo = getRoleInfo();

                return (
                  <Paper
                    key={playerId}
                    sx={{
                      p: 2,
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      position: "relative",
                    }}
                    elevation={2}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {playerUser?.name || playerId}
                      </Typography>
                      <Box
                        sx={{ display: "flex", gap: 0.5, alignItems: "center" }}
                      >
                        {roleInfo && (
                          <Chip
                            label={roleInfo.label}
                            color={roleInfo.color}
                            size="small"
                          />
                        )}
                        <IconButton
                          size="small"
                          onClick={() => handleRemovePlayer(playerId)}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                    {playerUser?.email && (
                      <Typography variant="caption" color="text.secondary">
                        {playerUser.email}
                      </Typography>
                    )}
                  </Paper>
                );
              })}
            </Box>

            {selectedEvent?.reservePlayers &&
              selectedEvent.reservePlayers.length > 0 && (
                <>
                  <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
                    Varalla ({selectedEvent.reservePlayers.length})
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(280px, 1fr))",
                      gap: 2,
                    }}
                  >
                    {selectedEvent.reservePlayers.map((playerId) => {
                      const playerUser = users.find((u) => u.id === playerId);
                      const eventRole = selectedEvent.playerRoles?.[playerId];
                      const userPositions = playerUser?.positions || [];

                      // Same role logic as registered players
                      const getRoleInfo = () => {
                        if (eventRole === "MV") {
                          return { label: "MV", color: "warning" as const };
                        } else if (eventRole === "H") {
                          return { label: "H", color: "primary" as const };
                        } else if (eventRole === "P") {
                          return { label: "P", color: "error" as const };
                        }

                        const hasH = userPositions.includes("H");
                        const hasP = userPositions.includes("P");
                        const hasMV = userPositions.includes("MV");

                        if (hasMV) {
                          return { label: "MV", color: "warning" as const };
                        } else if (hasH && hasP) {
                          return { label: "H/P", color: "success" as const };
                        } else if (hasH) {
                          return { label: "H", color: "primary" as const };
                        } else if (hasP) {
                          return { label: "P", color: "error" as const };
                        }

                        return null;
                      };

                      const roleInfo = getRoleInfo();

                      return (
                        <Paper
                          key={playerId}
                          sx={{
                            p: 2,
                            display: "flex",
                            flexDirection: "column",
                            gap: 1,
                            bgcolor: "grey.50",
                          }}
                          elevation={1}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <Typography
                              variant="subtitle1"
                              sx={{ fontWeight: 600 }}
                            >
                              {playerUser?.name || playerId}
                            </Typography>
                            <Box
                              sx={{
                                display: "flex",
                                gap: 0.5,
                                alignItems: "center",
                              }}
                            >
                              {roleInfo && (
                                <Chip
                                  label={roleInfo.label}
                                  color={roleInfo.color}
                                  size="small"
                                />
                              )}
                              <IconButton
                                size="small"
                                onClick={() => handleRemovePlayer(playerId)}
                                color="error"
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </Box>
                          {playerUser?.email && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {playerUser.email}
                            </Typography>
                          )}
                        </Paper>
                      );
                    })}
                  </Box>
                </>
              )}
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            {selectedEvent?.generatedTeams?.teams ? (
              <Box>
                <Box
                  sx={{
                    mb: 2,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <Typography variant="body2">
                    Balance Score: {selectedEvent.generatedTeams.balanceScore}
                  </Typography>
                  <Button
                    startIcon={<ReplayIcon />}
                    onClick={handleRegenerateTeams}
                    variant="outlined"
                    size="small"
                  >
                    Luo uudelleen
                  </Button>
                </Box>
                <Box sx={{ display: "flex", gap: 2 }}>
                  {selectedEvent.generatedTeams.teams.map((team, idx) => (
                    <Box key={idx} sx={{ flex: 1 }}>
                      <Paper sx={{ p: 2, bgcolor: team.color + "22" }}>
                        <Typography
                          variant="h6"
                          sx={{ mb: 2, color: team.color }}
                        >
                          {team.name}
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          Pisteet: {team.totalPoints}
                        </Typography>
                        <List dense>
                          {team.players.map((player) => {
                            const playerUser = users.find(
                              (u) => u.id === player.id
                            );
                            // Check if player is a goalkeeper from their positions
                            const isGoalkeeper =
                              playerUser?.positions?.includes("MV");

                            return (
                              <ListItem key={player.id}>
                                <ListItemText
                                  primary={playerUser?.name || player.id}
                                  secondary={
                                    isGoalkeeper ? "Maalivahti" : undefined
                                  }
                                />
                              </ListItem>
                            );
                          })}
                        </List>
                      </Paper>
                    </Box>
                  ))}
                </Box>
              </Box>
            ) : (
              <Alert severity="info">Joukkueita ei ole vielä luotu</Alert>
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <Box sx={{ textAlign: "center", py: 3 }}>
              <Button
                startIcon={<FileDownloadIcon />}
                onClick={handleExportTeams}
                variant="contained"
                disabled={!selectedEvent?.generatedTeams?.teams}
              >
                Lataa joukkueet PDF
              </Button>
            </Box>
          </TabPanel>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)}>Sulje</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Modal */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Muokkaa tapahtumaa</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
            <TextField
              label="Otsikko"
              value={editForm.title}
              onChange={(e) =>
                setEditForm({ ...editForm, title: e.target.value })
              }
              fullWidth
            />
            <TextField
              label="Päivämäärä ja aika"
              type="datetime-local"
              value={editForm.date}
              onChange={(e) =>
                setEditForm({ ...editForm, date: e.target.value })
              }
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Paikka"
              value={editForm.location}
              onChange={(e) =>
                setEditForm({ ...editForm, location: e.target.value })
              }
              fullWidth
            />
            <TextField
              label="Kesto (min)"
              type="number"
              value={editForm.duration}
              onChange={(e) =>
                setEditForm({ ...editForm, duration: Number(e.target.value) })
              }
              fullWidth
            />
            <TextField
              label="Kuvaus"
              value={editForm.description}
              onChange={(e) =>
                setEditForm({ ...editForm, description: e.target.value })
              }
              multiline
              rows={3}
              fullWidth
            />
            <TextField
              label="Max pelaajat"
              type="number"
              value={editForm.maxPlayers}
              onChange={(e) =>
                setEditForm({ ...editForm, maxPlayers: Number(e.target.value) })
              }
              fullWidth
            />
            <TextField
              label="Max maalivahdit"
              type="number"
              value={editForm.maxGoalkeepers}
              onChange={(e) =>
                setEditForm({
                  ...editForm,
                  maxGoalkeepers: Number(e.target.value),
                })
              }
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Peruuta</Button>
          <Button onClick={handleSaveEdit} variant="contained">
            Tallenna
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Modal */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Luo uusi tapahtuma</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
            <TextField
              label="Tapahtuman nimi *"
              value={createForm.title}
              onChange={(e) =>
                setCreateForm({ ...createForm, title: e.target.value })
              }
              fullWidth
              required
            />
            <FormControl fullWidth required>
              <InputLabel>Joukkue *</InputLabel>
              <Select
                value={createForm.teamId}
                label="Joukkue *"
                onChange={(e) =>
                  setCreateForm({ ...createForm, teamId: e.target.value })
                }
              >
                {teams.map((team) => (
                  <MenuItem key={team.id} value={team.id}>
                    {team.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Päivämäärä *"
              type="date"
              value={createForm.date}
              onChange={(e) =>
                setCreateForm({ ...createForm, date: e.target.value })
              }
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Aika"
              type="time"
              value={createForm.time}
              onChange={(e) =>
                setCreateForm({ ...createForm, time: e.target.value })
              }
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Paikka"
              value={createForm.location}
              onChange={(e) =>
                setCreateForm({ ...createForm, location: e.target.value })
              }
              fullWidth
            />
            <TextField
              label="Kesto (min)"
              type="number"
              value={createForm.duration}
              onChange={(e) =>
                setCreateForm({
                  ...createForm,
                  duration: Number(e.target.value),
                })
              }
              fullWidth
            />
            <TextField
              label="Kuvaus"
              value={createForm.description}
              onChange={(e) =>
                setCreateForm({ ...createForm, description: e.target.value })
              }
              multiline
              rows={3}
              fullWidth
            />
            <TextField
              label="Max pelaajat"
              type="number"
              value={createForm.maxPlayers}
              onChange={(e) =>
                setCreateForm({
                  ...createForm,
                  maxPlayers: Number(e.target.value),
                })
              }
              fullWidth
            />
            <TextField
              label="Max maalivahdit"
              type="number"
              value={createForm.maxGoalkeepers}
              onChange={(e) =>
                setCreateForm({
                  ...createForm,
                  maxGoalkeepers: Number(e.target.value),
                })
              }
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Peruuta</Button>
          <Button
            onClick={handleCreateEvent}
            variant="contained"
            color="primary"
          >
            Luo tapahtuma
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Poista tapahtuma</DialogTitle>
        <DialogContent>
          <Typography>
            Haluatko varmasti poistaa tapahtuman "{selectedEvent?.title}"?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Peruuta</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Poista
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Player Modal */}
      <Dialog
        open={addPlayerOpen}
        onClose={() => {
          setAddPlayerOpen(false);
          setSelectedPlayers([]);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Lisää pelaaja tapahtumaan</span>
            {selectedPlayers.length > 0 && (
              <Chip
                label={`${selectedPlayers.length} valittu`}
                color="primary"
                size="small"
              />
            )}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
              gap: 2,
              mt: 1,
            }}
          >
            {users
              .filter(
                (user) =>
                  selectedEvent?.teamId &&
                  user.teamIds?.includes(selectedEvent.teamId)
              )
              .sort((a, b) => {
                // Sort: Already in event first, then vakiokävijät, then guests, all by last name
                const aInEvent =
                  selectedEvent?.registeredPlayers?.includes(a.id) ||
                  selectedEvent?.reservePlayers?.includes(a.id);
                const bInEvent =
                  selectedEvent?.registeredPlayers?.includes(b.id) ||
                  selectedEvent?.reservePlayers?.includes(b.id);

                // Already in event comes first
                if (aInEvent && !bInEvent) return -1;
                if (!aInEvent && bInEvent) return 1;

                // Then sort by team member status
                const aIsTeamMember =
                  a.teamMember?.[selectedEvent?.teamId || ""] === true;
                const bIsTeamMember =
                  b.teamMember?.[selectedEvent?.teamId || ""] === true;

                if (aIsTeamMember && !bIsTeamMember) return -1;
                if (!aIsTeamMember && bIsTeamMember) return 1;

                // Sort by last name (assume format "FirstName LastName")
                const aLastName = a.name.split(" ").pop() || a.name;
                const bLastName = b.name.split(" ").pop() || b.name;
                return aLastName.localeCompare(bLastName, "fi");
              })
              .map((user) => {
                const isTeamMember =
                  user.teamMember?.[selectedEvent?.teamId || ""] === true;
                const isSelected = selectedPlayers.includes(user.id);
                const isInEvent =
                  selectedEvent?.registeredPlayers?.includes(user.id) ||
                  selectedEvent?.reservePlayers?.includes(user.id);
                const isInRegistered =
                  selectedEvent?.registeredPlayers?.includes(user.id);
                const isInReserve = selectedEvent?.reservePlayers?.includes(
                  user.id
                );

                return (
                  <Paper
                    key={user.id}
                    onClick={() =>
                      !isInEvent && handleTogglePlayerSelection(user.id)
                    }
                    sx={{
                      p: 2,
                      cursor: isInEvent ? "default" : "pointer",
                      transition: "all 0.2s",
                      border: isInEvent
                        ? "2px solid #4caf50"
                        : isSelected
                        ? "2px solid #2196f3"
                        : isTeamMember
                        ? "2px solid #e0e0e0"
                        : "2px solid #ff9800",
                      backgroundColor: isInEvent
                        ? "#e8f5e9"
                        : isSelected
                        ? "#e3f2fd"
                        : isTeamMember
                        ? "#fff"
                        : "#fff3e0",
                      opacity: isInEvent ? 0.8 : 1,
                      "&:hover": isInEvent
                        ? {}
                        : {
                            transform: "translateY(-2px)",
                            boxShadow: 3,
                            borderColor: isSelected
                              ? "#1976d2"
                              : isTeamMember
                              ? "#1976d2"
                              : "#f57c00",
                          },
                    }}
                    elevation={isInEvent ? 2 : isSelected ? 3 : 1}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <Typography variant="subtitle1" fontWeight={600}>
                          {user.name}
                        </Typography>
                        {isInEvent ? (
                          <Chip
                            label={
                              isInRegistered
                                ? "Tapahtumassa"
                                : isInReserve
                                ? "Varalla"
                                : "Tapahtumassa"
                            }
                            size="small"
                            color="success"
                            sx={{ fontWeight: 600 }}
                          />
                        ) : isSelected ? (
                          <Chip
                            label="Valittu"
                            size="small"
                            color="primary"
                            sx={{ fontWeight: 600 }}
                          />
                        ) : (
                          !isTeamMember && (
                            <Chip
                              label="Vieras"
                              size="small"
                              color="warning"
                              sx={{ fontWeight: 600 }}
                            />
                          )
                        )}
                      </Box>
                      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                        {user.positions.map((pos) => {
                          const color =
                            pos === "MV"
                              ? "warning"
                              : pos === "H"
                              ? "primary"
                              : "error";
                          return (
                            <Chip
                              key={pos}
                              label={pos}
                              size="small"
                              color={color}
                            />
                          );
                        })}
                      </Box>
                      {user.email && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {user.email}
                        </Typography>
                      )}
                    </Box>
                  </Paper>
                );
              })}
          </Box>
          <Box
            sx={{
              mt: 2,
              pt: 2,
              borderTop: "1px solid #e0e0e0",
              display: "flex",
              gap: 2,
              flexWrap: "wrap",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  border: "2px solid #4caf50",
                  backgroundColor: "#e8f5e9",
                  borderRadius: 1,
                }}
              />
              <Typography variant="caption">Tapahtumassa</Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  border: "2px solid #2196f3",
                  backgroundColor: "#e3f2fd",
                  borderRadius: 1,
                }}
              />
              <Typography variant="caption">Valittu lisättäväksi</Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  border: "2px solid #e0e0e0",
                  backgroundColor: "#fff",
                  borderRadius: 1,
                }}
              />
              <Typography variant="caption">Vakiokävijä</Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  border: "2px solid #ff9800",
                  backgroundColor: "#fff3e0",
                  borderRadius: 1,
                }}
              />
              <Typography variant="caption">Vieras</Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setAddPlayerOpen(false);
              setSelectedPlayers([]);
            }}
          >
            Peruuta
          </Button>
          <Button
            onClick={handleAddSelectedPlayers}
            variant="contained"
            disabled={selectedPlayers.length === 0}
          >
            Lisää valitut ({selectedPlayers.length})
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
