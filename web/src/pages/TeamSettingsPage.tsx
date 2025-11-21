import { useEffect, useState } from "react";
import {
  Typography,
  Box,
  Button,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  TextField,
  Stack,
  Switch,
  FormControlLabel,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Refresh, Edit, Delete } from "@mui/icons-material";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import ColumnSelector from "../components/ColumnSelector";

interface TeamSettings {
  id: string;
  teamId: string;
  teamName: string;
  teamCode: string;
  teamColor: string;
  autoCreateTeams: boolean;
  defaultLocation: string;
  defaultTime: string;
  defaultTitle: string;
  eventDuration: number;
  maxGoalkeepers: number;
  maxPlayers: number;
  notificationEnabled: boolean;
  teamAName: string;
  teamBName: string;
  teamSize: number;
  guestRegistrationHours: number;
  teamAdminIds: string[];
  updatedAt?: string;
  updatedBy?: string;
}

export default function TeamSettingsPage() {
  const { userData } = useAuth();
  const [settings, setSettings] = useState<TeamSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedSettings, setSelectedSettings] = useState<TeamSettings | null>(
    null
  );
  const [editForm, setEditForm] = useState({
    teamName: "",
    teamCode: "",
    teamColor: "#38d219",
    autoCreateTeams: false,
    defaultLocation: "",
    defaultTime: "16:00",
    defaultTitle: "Jäävuoro",
    eventDuration: 50,
    maxGoalkeepers: 2,
    maxPlayers: 20,
    notificationEnabled: true,
    teamAName: "Joukkue Valkoinen",
    teamBName: "Joukkue Musta",
    guestRegistrationHours: 24,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load visible columns from localStorage or use defaults
  const defaultColumns = [
    "teamName",
    "teamColor",
    "autoCreateTeams",
    "defaultLocation",
    "defaultTime",
    "defaultTitle",
    "eventDuration",
    "maxPlayers",
    "maxGoalkeepers",
    "guestRegistrationHours",
    "notificationEnabled",
    "updatedAt",
    "actions",
  ];
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem("teamSettingsPage-visibleColumns");
    return saved ? JSON.parse(saved) : defaultColumns;
  });

  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem("teamSettingsPage-columnOrder");
    return saved ? JSON.parse(saved) : [];
  });

  // Save visible columns to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(
      "teamSettingsPage-visibleColumns",
      JSON.stringify(visibleColumns)
    );
  }, [visibleColumns]);

  useEffect(() => {
    localStorage.setItem(
      "teamSettingsPage-columnOrder",
      JSON.stringify(columnOrder)
    );
  }, [columnOrder]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const settingsSnapshot = await getDocs(collection(db, "settings"));
      const teamsSnapshot = await getDocs(collection(db, "teams"));

      // Create a map of team IDs to guestRegistrationHours from teams collection
      const teamGuestHoursMap: Record<string, number> = {};
      teamsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.guestRegistrationHours !== undefined) {
          teamGuestHoursMap[doc.id] = data.guestRegistrationHours;
        }
      });

      const settingsData = settingsSnapshot.docs
        .filter((doc) => {
          // Only include team-specific settings (team-{teamId})
          // Exclude 'global' and 'eventDefaults'
          const docId = doc.id;
          return (
            docId.startsWith("team-") &&
            docId !== "global" &&
            docId !== "eventDefaults"
          );
        })
        .map((doc) => {
          const data = doc.data();
          // Use guestRegistrationHours from teams collection if available, otherwise from settings
          const guestRegistrationHours =
            data.teamId && teamGuestHoursMap[data.teamId] !== undefined
              ? teamGuestHoursMap[data.teamId]
              : data.guestRegistrationHours || 24;

          return {
            id: doc.id,
            ...data,
            guestRegistrationHours,
            // Convert Firestore Timestamps to ISO strings
            updatedAt:
              data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
          };
        }) as TeamSettings[];

      setSettings(settingsData);
    } catch (error) {
      console.error("Error loading team settings:", error);
      setError("Virhe asetusten lataamisessa");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // Master Admin check
  if (!userData?.isMasterAdmin) {
    return (
      <Box>
        <Alert severity="error">
          <Typography variant="h6" gutterBottom>
            Ei käyttöoikeutta
          </Typography>
          <Typography variant="body2">
            Vain pääkäyttäjillä on oikeus hallita joukkueasetuksia.
          </Typography>
        </Alert>
      </Box>
    );
  }

  const handleEdit = (setting: TeamSettings) => {
    setSelectedSettings(setting);
    setEditForm({
      teamName: setting.teamName,
      teamCode: setting.teamCode,
      teamColor: setting.teamColor,
      autoCreateTeams: setting.autoCreateTeams,
      defaultLocation: setting.defaultLocation,
      defaultTime: setting.defaultTime,
      defaultTitle: setting.defaultTitle,
      eventDuration: setting.eventDuration,
      maxGoalkeepers: setting.maxGoalkeepers,
      maxPlayers: setting.maxPlayers,
      notificationEnabled: setting.notificationEnabled,
      teamAName: setting.teamAName,
      teamBName: setting.teamBName,
      guestRegistrationHours: setting.guestRegistrationHours || 24,
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedSettings) return;

    try {
      setError("");

      // Update settings collection (without guestRegistrationHours)
      await updateDoc(doc(db, "settings", selectedSettings.id), {
        teamName: editForm.teamName,
        teamCode: editForm.teamCode,
        autoCreateTeams: editForm.autoCreateTeams,
        defaultLocation: editForm.defaultLocation,
        defaultTime: editForm.defaultTime,
        defaultTitle: editForm.defaultTitle,
        eventDuration: editForm.eventDuration,
        maxGoalkeepers: editForm.maxGoalkeepers,
        maxPlayers: editForm.maxPlayers,
        notificationEnabled: editForm.notificationEnabled,
        teamAName: editForm.teamAName,
        teamBName: editForm.teamBName,
        updatedAt: new Date(),
      });

      // Update the teams collection - this is the source of truth for guestRegistrationHours
      const teamId = selectedSettings.teamId;
      console.log("Updating guestRegistrationHours for team ID:", teamId);
      console.log("New value:", editForm.guestRegistrationHours);
      console.log("Old value:", selectedSettings.guestRegistrationHours);

      if (teamId) {
        try {
          const teamRef = doc(db, "teams", teamId);
          const updateData = {
            guestRegistrationHours: editForm.guestRegistrationHours,
          };
          console.log("Update data:", JSON.stringify(updateData));

          await updateDoc(teamRef, updateData);
          console.log("Team updated successfully");

          // Verify the update by reading it back
          const updatedTeamDoc = await getDocs(collection(db, "teams"));
          const updatedTeam = updatedTeamDoc.docs.find((d) => d.id === teamId);
          if (updatedTeam) {
            console.log(
              "Verified guestRegistrationHours after update:",
              updatedTeam.data().guestRegistrationHours
            );
          }
        } catch (teamUpdateError) {
          console.error("Error updating team:", teamUpdateError);
          setError("Virhe joukkueen päivittämisessä");
          return;
        }
      } else {
        console.error("No team ID available");
        setError("Joukkue-ID puuttuu");
        return;
      }

      setSuccess("Asetukset päivitetty onnistuneesti!");
      setEditOpen(false);
      loadSettings();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error updating settings:", err);
      setError("Virhe asetusten päivittämisessä");
    }
  };

  const handleDelete = (setting: TeamSettings) => {
    setSelectedSettings(setting);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedSettings) return;

    try {
      setError("");
      await deleteDoc(doc(db, "settings", selectedSettings.id));
      setSuccess("Asetukset poistettu onnistuneesti!");
      setDeleteOpen(false);
      loadSettings();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error deleting settings:", err);
      setError("Virhe asetusten poistamisessa");
    }
  };

  const columns: GridColDef<TeamSettings>[] = [
    {
      field: "teamName",
      headerName: "Joukkue",
      width: 180,
    },
    {
      field: "teamColor",
      headerName: "Väri",
      width: 80,
      renderCell: (params) => (
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 1,
            bgcolor: params.value || "#38d219",
            border: "1.5px solid rgba(0,0,0,0.1)",
          }}
        />
      ),
    },
    {
      field: "autoCreateTeams",
      headerName: "Automaattiset joukkueet",
      width: 180,
      renderCell: (params) => (
        <Chip
          label={params.value ? "Päällä" : "Pois"}
          color={params.value ? "success" : "default"}
          size="small"
        />
      ),
    },
    {
      field: "defaultLocation",
      headerName: "Oletuspaikka",
      width: 150,
    },
    {
      field: "defaultTime",
      headerName: "Oletusaika",
      width: 120,
    },
    {
      field: "defaultTitle",
      headerName: "Oletusotsikko",
      width: 150,
    },
    {
      field: "eventDuration",
      headerName: "Kesto (min)",
      width: 110,
      type: "number",
    },
    {
      field: "maxPlayers",
      headerName: "Max pelaajat",
      width: 120,
      type: "number",
    },
    {
      field: "maxGoalkeepers",
      headerName: "Max maalivahdit",
      width: 140,
      type: "number",
    },
    {
      field: "guestRegistrationHours",
      headerName: "Vieraiden raja (h)",
      width: 150,
      type: "number",
      renderCell: (params) => <span>{params.value || 24}h</span>,
    },
    {
      field: "notificationEnabled",
      headerName: "Ilmoitukset",
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.value ? "Päällä" : "Pois"}
          color={params.value ? "success" : "default"}
          size="small"
        />
      ),
    },
    {
      field: "updatedAt",
      headerName: "Päivitetty",
      width: 130,
      renderCell: (params) => {
        if (!params.value) return "-";
        try {
          return new Date(params.value).toLocaleDateString("fi-FI");
        } catch {
          return "-";
        }
      },
    },
    {
      field: "actions",
      headerName: "Toiminnot",
      width: 120,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 1 }}>
          <IconButton
            size="small"
            color="primary"
            onClick={() => handleEdit(params.row)}
            title="Muokkaa"
          >
            <Edit fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={() => handleDelete(params.row)}
            title="Poista"
          >
            <Delete fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h4">Joukkueasetukset</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
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
            onSelectAll={() => {
              setVisibleColumns(columns.map((col) => col.field));
            }}
            onDeselectAll={() => {
              setVisibleColumns(["actions"]);
            }}
          />
          <Button startIcon={<Refresh />} onClick={loadSettings}>
            Päivitä
          </Button>
        </Box>
      </Box>

      {/* Success/Error Messages */}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper
        sx={{ height: 700, width: "100%", maxWidth: "100%", overflow: "auto" }}
      >
        <DataGrid
          rows={settings}
          columns={
            (columnOrder.length > 0
              ? columnOrder
                  .map((field) => columns.find((col) => col.field === field))
                  .filter(Boolean)
              : columns
            ).filter((col) =>
              visibleColumns.includes(col!.field)
            ) as GridColDef[]
          }
          loading={loading}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{
            pagination: {
              paginationModel: { pageSize: 25, page: 0 },
            },
          }}
          disableRowSelectionOnClick
          rowHeight={56}
          sx={{
            border: "none",
            "& .MuiDataGrid-main": {
              borderRadius: 0,
            },
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: "#f5f5f5",
              fontSize: "0.875rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              color: "#616161",
              borderBottom: "2px solid #e0e0e0",
            },
            "& .MuiDataGrid-columnHeaderTitle": {
              fontWeight: 600,
            },
            "& .MuiDataGrid-cell": {
              padding: "12px 16px",
              fontSize: "0.9rem",
              borderBottom: "1px solid #f0f0f0",
              display: "flex",
              alignItems: "center",
            },
            "& .MuiDataGrid-row": {
              "&:hover": {
                backgroundColor: "#fafafa",
              },
            },
            "& .MuiDataGrid-cell:focus": {
              outline: "none",
            },
            "& .MuiDataGrid-cell:focus-within": {
              outline: "none",
            },
            "& .MuiDataGrid-virtualScroller": {
              marginTop: "0 !important",
            },
          }}
        />
      </Paper>

      {/* Edit Dialog */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Muokkaa joukkueasetuksia</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Joukkueen nimi"
                value={editForm.teamName}
                onChange={(e) =>
                  setEditForm({ ...editForm, teamName: e.target.value })
                }
                fullWidth
              />
              <TextField
                label="Koodi"
                value={editForm.teamCode}
                onChange={(e) =>
                  setEditForm({ ...editForm, teamCode: e.target.value })
                }
                fullWidth
              />
            </Stack>

            <TextField
              label="Väri"
              type="color"
              value={editForm.teamColor}
              onChange={(e) =>
                setEditForm({ ...editForm, teamColor: e.target.value })
              }
              fullWidth
            />

            <Typography variant="h6" sx={{ mt: 2 }}>
              Tapahtumaoletuarvot
            </Typography>

            <Stack direction="row" spacing={2}>
              <TextField
                label="Oletuspaikka"
                value={editForm.defaultLocation}
                onChange={(e) =>
                  setEditForm({ ...editForm, defaultLocation: e.target.value })
                }
                fullWidth
              />
              <TextField
                label="Oletusaika"
                type="time"
                value={editForm.defaultTime}
                onChange={(e) =>
                  setEditForm({ ...editForm, defaultTime: e.target.value })
                }
                fullWidth
              />
            </Stack>

            <Stack direction="row" spacing={2}>
              <TextField
                label="Oletusotsikko"
                value={editForm.defaultTitle}
                onChange={(e) =>
                  setEditForm({ ...editForm, defaultTitle: e.target.value })
                }
                fullWidth
              />
              <TextField
                label="Kesto (minuuttia)"
                type="number"
                value={editForm.eventDuration}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    eventDuration: parseInt(e.target.value) || 50,
                  })
                }
                fullWidth
              />
            </Stack>

            <Typography variant="h6" sx={{ mt: 2 }}>
              Pelaaja-asetukset
            </Typography>

            <Stack direction="row" spacing={2}>
              <TextField
                label="Max pelaajat"
                type="number"
                value={editForm.maxPlayers}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    maxPlayers: parseInt(e.target.value) || 20,
                  })
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
                    maxGoalkeepers: parseInt(e.target.value) || 2,
                  })
                }
                fullWidth
              />
            </Stack>

            <Typography variant="h6" sx={{ mt: 2 }}>
              Joukkuenimet
            </Typography>

            <Stack direction="row" spacing={2}>
              <TextField
                label="Joukkue A nimi"
                value={editForm.teamAName}
                onChange={(e) =>
                  setEditForm({ ...editForm, teamAName: e.target.value })
                }
                fullWidth
              />
              <TextField
                label="Joukkue B nimi"
                value={editForm.teamBName}
                onChange={(e) =>
                  setEditForm({ ...editForm, teamBName: e.target.value })
                }
                fullWidth
              />
            </Stack>

            <Typography variant="h6" sx={{ mt: 2 }}>
              Muut asetukset
            </Typography>

            <TextField
              label="Vieraiden ilmoittautumisraja (tuntia ennen)"
              type="number"
              value={editForm.guestRegistrationHours}
              onChange={(e) => {
                const value = e.target.value;
                // Allow empty string during editing
                if (value === "") {
                  setEditForm({
                    ...editForm,
                    guestRegistrationHours: "" as any,
                  });
                } else if (!isNaN(Number(value))) {
                  setEditForm({
                    ...editForm,
                    guestRegistrationHours: parseInt(value),
                  });
                }
              }}
              onBlur={(e) => {
                // Ensure we have a valid number on blur
                const value = parseInt(e.target.value) || 24;
                setEditForm({
                  ...editForm,
                  guestRegistrationHours: value,
                });
              }}
              fullWidth
              helperText="Montako tuntia ennen tapahtumaa vieraat (ei-vakiokävijät) voivat ilmoittautua. Vakiokävijät voivat ilmoittautua aina."
            />

            <FormControlLabel
              control={
                <Switch
                  checked={editForm.autoCreateTeams}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      autoCreateTeams: e.target.checked,
                    })
                  }
                />
              }
              label="Automaattinen joukkueiden luonti"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={editForm.notificationEnabled}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      notificationEnabled: e.target.checked,
                    })
                  }
                />
              }
              label="Ilmoitukset käytössä"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Peruuta</Button>
          <Button onClick={handleSaveEdit} variant="contained">
            Tallenna
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Poista asetukset</DialogTitle>
        <DialogContent>
          <Typography>
            Haluatko varmasti poistaa joukkueen "{selectedSettings?.teamName}"
            asetukset?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Tätä toimintoa ei voi perua.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Peruuta</Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
          >
            Poista
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
