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
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Stack,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Add, Refresh, Edit, Delete } from "@mui/icons-material";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import app, { db } from "../services/firebase";
import type { Team, User } from "../types";
import ColumnSelector from "../components/ColumnSelector";

interface TeamWithCounts extends Team {
  memberCount: number;
  adminCount: number;
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<TeamWithCounts | null>(null);

  // Load visible columns from localStorage or use defaults
  const defaultColumns = [
    "name",
    "code",
    "color",
    "memberCount",
    "adminCount",
    "licenseStatus",
    "licenseType",
    "guestRegistrationHours",
    "createdAt",
    "actions",
  ];
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem("teamsPage-visibleColumns");
    return saved ? JSON.parse(saved) : defaultColumns;
  });

  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem("teamsPage-columnOrder");
    return saved ? JSON.parse(saved) : [];
  });

  // Save visible columns to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(
      "teamsPage-visibleColumns",
      JSON.stringify(visibleColumns)
    );
  }, [visibleColumns]);

  useEffect(() => {
    localStorage.setItem("teamsPage-columnOrder", JSON.stringify(columnOrder));
  }, [columnOrder]);

  const [editForm, setEditForm] = useState({
    name: "",
    code: "",
    description: "",
    color: "#1976d2",
    licenseStatus: "inactive" as "active" | "expired" | "inactive",
    licenseType: "monthly" as "monthly" | "yearly" | null,
    whatsappGroupName: "",
    whatsappGroupInviteLink: "",
    guestRegistrationHours: 24,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadTeams = async () => {
    setLoading(true);
    try {
      // Load teams
      const teamsSnapshot = await getDocs(collection(db, "teams"));
      const teamsData = teamsSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Convert Firestore Timestamps to ISO strings
          createdAt:
            data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt:
            data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
          licenseActivatedAt:
            data.licenseActivatedAt?.toDate?.()?.toISOString() ||
            data.licenseActivatedAt,
          licenseExpiresAt:
            data.licenseExpiresAt?.toDate?.()?.toISOString() ||
            data.licenseExpiresAt,
        };
      }) as Team[];

      // Load users to count members
      const usersSnapshot = await getDocs(collection(db, "users"));
      const usersData = usersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as User[];

      // Calculate member and admin counts for each team
      const teamsWithCounts: TeamWithCounts[] = teamsData.map((team) => {
        const teamMembers = usersData.filter((user) =>
          user.teamIds?.includes(team.id)
        );
        const adminCount = team.adminIds?.length || 0;

        return {
          ...team,
          memberCount: teamMembers.length,
          adminCount: adminCount,
        };
      });

      setTeams(teamsWithCounts);
      console.log("Loaded teams:", teamsWithCounts);
    } catch (error) {
      console.error("Error loading teams:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeams();
  }, []);

  const handleEdit = (team: TeamWithCounts) => {
    setSelectedTeam(team);
    setEditForm({
      name: team.name,
      code: team.code,
      description: team.description || "",
      color: team.color || "#1976d2",
      licenseStatus: team.licenseStatus || "inactive",
      licenseType: team.licenseType || null,
      whatsappGroupName: team.whatsappGroupName || "",
      whatsappGroupInviteLink: team.whatsappGroupInviteLink || "",
      guestRegistrationHours: team.guestRegistrationHours || 24,
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedTeam) return;

    try {
      setError("");
      const teamRef = doc(db, "teams", selectedTeam.id);
      await updateDoc(teamRef, {
        name: editForm.name,
        code: editForm.code,
        description: editForm.description,
        color: editForm.color,
        licenseStatus: editForm.licenseStatus,
        licenseType: editForm.licenseType,
        whatsappGroupName: editForm.whatsappGroupName,
        whatsappGroupInviteLink: editForm.whatsappGroupInviteLink,
        guestRegistrationHours: editForm.guestRegistrationHours,
        updatedAt: new Date(),
      });

      setSuccess("Joukkue päivitetty onnistuneesti!");
      setEditOpen(false);
      loadTeams();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error updating team:", err);
      setError("Virhe joukkueen päivittämisessä");
    }
  };

  const handleDelete = (team: TeamWithCounts) => {
    setSelectedTeam(team);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedTeam) return;

    try {
      setError("");
      const functions = getFunctions(app);
      const deleteTeamFn = httpsCallable(functions, "deleteTeam");
      await deleteTeamFn({ teamId: selectedTeam.id });
      setSuccess(
        "Joukkue poistettu onnistuneesti ja käyttäjien tiedot päivitetty!"
      );
      setDeleteOpen(false);
      loadTeams();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error deleting team via Cloud Function:", err);
      setError(
        "Virhe joukkueen poistamisessa. Tarkista oikeudet ja yritä uudelleen."
      );
    }
  };

  const columns: GridColDef<TeamWithCounts>[] = [
    {
      field: "color",
      headerName: "",
      width: 60,
      renderCell: (params) => (
        <Box
          sx={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            bgcolor: params.value || "#1976d2",
            border: "1.5px solid rgba(0,0,0,0.1)",
          }}
          title={params.row.name}
        />
      ),
      sortable: false,
      filterable: false,
    },
    {
      field: "name",
      headerName: "Tiimin nimi",
      width: 200,
    },
    {
      field: "code",
      headerName: "Koodi",
      width: 100,
      renderCell: (params) => (
        <Chip label={params.value} variant="outlined" size="small" />
      ),
    },
    {
      field: "description",
      headerName: "Kuvaus",
      width: 220,
      valueGetter: (value: string) => value || "-",
    },
    {
      field: "memberCount",
      headerName: "Jäseniä",
      width: 90,
      type: "number",
    },
    {
      field: "adminCount",
      headerName: "Admineja",
      width: 100,
      type: "number",
    },
    {
      field: "licenseStatus",
      headerName: "Lisenssi",
      width: 120,
      renderCell: (params) => {
        const status = params.value;
        let color: "success" | "warning" | "error" | "default" = "default";
        let label = "Ei lisenssiä";

        if (status === "active") {
          color = "success";
          label = "Aktiivinen";
        } else if (status === "expired") {
          color = "error";
          label = "Vanhentunut";
        } else if (status === "inactive") {
          color = "warning";
          label = "Ei aktiivinen";
        }

        return <Chip label={label} color={color} size="small" />;
      },
    },
    {
      field: "licenseType",
      headerName: "Tyyppi",
      width: 100,
      renderCell: (params) => {
        if (!params.value) return "-";
        return (
          <Chip
            label={params.value === "yearly" ? "Vuosi" : "Kuukausi"}
            variant="outlined"
            size="small"
          />
        );
      },
    },
    {
      field: "licenseExpiresAt",
      headerName: "Vanhenee",
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
      field: "createdAt",
      headerName: "Luotu",
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
          >
            <Edit fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={() => handleDelete(params.row)}
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
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Typography variant="h4">Joukkueet</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
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
          <Button startIcon={<Refresh />} onClick={loadTeams}>
            Päivitä
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => alert("Lisää joukkue -toiminto tulossa pian!")}
          >
            Lisää joukkue
          </Button>
        </Box>
      </Box>

      <Paper
        sx={{ height: 700, width: "100%", maxWidth: "100%", overflow: "auto" }}
      >
        <DataGrid
          rows={teams}
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

      {/* Success/Error Messages */}
      {success && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {/* Edit Dialog */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Muokkaa joukkuetta</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Joukkueen nimi"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                fullWidth
                required
              />
              <TextField
                label="Koodi"
                value={editForm.code}
                onChange={(e) =>
                  setEditForm({ ...editForm, code: e.target.value })
                }
                fullWidth
                required
              />
            </Stack>
            <TextField
              label="Kuvaus"
              value={editForm.description}
              onChange={(e) =>
                setEditForm({ ...editForm, description: e.target.value })
              }
              fullWidth
              multiline
              rows={2}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Väri"
                type="color"
                value={editForm.color}
                onChange={(e) =>
                  setEditForm({ ...editForm, color: e.target.value })
                }
                fullWidth
              />
              <TextField
                label="Vierasrekisteröinti (tuntia)"
                type="number"
                value={editForm.guestRegistrationHours}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    guestRegistrationHours: parseInt(e.target.value) || 24,
                  })
                }
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Lisenssin tila</InputLabel>
                <Select
                  value={editForm.licenseStatus}
                  label="Lisenssin tila"
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      licenseStatus: e.target.value as
                        | "active"
                        | "expired"
                        | "inactive",
                    })
                  }
                >
                  <MenuItem value="inactive">Ei aktiivinen</MenuItem>
                  <MenuItem value="active">Aktiivinen</MenuItem>
                  <MenuItem value="expired">Vanhentunut</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Lisenssin tyyppi</InputLabel>
                <Select
                  value={editForm.licenseType || ""}
                  label="Lisenssin tyyppi"
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      licenseType: e.target.value
                        ? (e.target.value as "monthly" | "yearly")
                        : null,
                    })
                  }
                >
                  <MenuItem value="">Ei lisenssiä</MenuItem>
                  <MenuItem value="monthly">Kuukausi</MenuItem>
                  <MenuItem value="yearly">Vuosi</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                label="WhatsApp-ryhmän nimi"
                value={editForm.whatsappGroupName}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    whatsappGroupName: e.target.value,
                  })
                }
                fullWidth
              />
              <TextField
                label="WhatsApp-kutsu linkki"
                value={editForm.whatsappGroupInviteLink}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    whatsappGroupInviteLink: e.target.value,
                  })
                }
                fullWidth
              />
            </Stack>
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
        <DialogTitle>Poista joukkue</DialogTitle>
        <DialogContent>
          <Typography>
            Haluatko varmasti poistaa joukkueen "{selectedTeam?.name}"?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Tätä toimintoa ei voi perua. Kaikki joukkueen tiedot poistetaan
            pysyvästi.
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
